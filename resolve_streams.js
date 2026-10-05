/**
 * resolve_streams.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Playwright-based resolver untuk embed.st stream URLs.
 *
 * Alur kerja:
 * 1. Ambil JSON dari srhady/data GitHub → filter match "Live 🔴"
 * 2. Setiap stream punya Embed_URL → buka di Chromium headless
 * 3. Pantau network request → tangkap URL m3u8 dari CDN (strmd.st, vipstreams.in)
 * 4. Simpan hasil ke resolved_streams.json
 *
 * Cara embed.st me-resolve stream:
 *   Browser buka embed.st/embed/{source}/{id}/{no}
 *   → JS page solve SHA-256 PoW (otomatis di browser)
 *   → XHR POST ke router.parklogic.com
 *   → Response: URL strmd.st/vipstreams.in langsung (plain text)
 *   → window.location.replace(url) ATAU in-page HLS player
 *   → Playwright menangkap URL sebelum/saat request dibuat
 */

const { chromium } = require('playwright');
const fs  = require('fs');
const https = require('https');

// ─── KONFIGURASI ─────────────────────────────────────────────────────────────

const SOURCE_JSON_URL =
  'https://raw.githubusercontent.com/srhady/data/refs/heads/main/live_sports_playlist.json';
const OUTPUT_FILE = 'resolved_streams.json';

// Domain CDN yang stream m3u8-nya bisa diputar ExoPlayer
const CDN_REGEX = /strmd\.st|vipstreams\.in|streamed\.su|lb\d+\./;

const PAGE_TIMEOUT_MS = 20_000;   // 20 detik per stream
const CONCURRENCY     = 4;        // browser tab paralel

// ─── HELPER: HTTP fetch sederhana ────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StreamResolver/1.0)',
        'Accept': 'application/json'
      }
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(fetchJson(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

// ─── RESOLVE SATU EMBED URL → m3u8 URL ───────────────────────────────────────

async function resolveEmbedUrl(browser, embedUrl, label) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Referer': 'https://embed.st/',
      'Origin': 'https://embed.st'
    },
    // Blokir aset tidak perlu agar lebih cepat
    serviceWorkers: 'block'
  });

  const page = await context.newPage();

  // Blokir resource berat yang tidak perlu (percepat loading)
  await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,css}', route => route.abort());

  const m3u8Url = await new Promise(resolveP => {
    let done = false;

    const finish = (url) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolveP(url || null);
    };

    // Timeout
    const timer = setTimeout(() => {
      console.log(`  ⏱️  Timeout (${PAGE_TIMEOUT_MS}ms): ${label}`);
      finish(null);
    }, PAGE_TIMEOUT_MS);

    // ── STRATEGI 1: Tangkap respons dari router.parklogic.com ──────────────
    // Response body berupa plain text URL (misalnya "https://lb7.strmd.st/...")
    page.on('response', async response => {
      if (done) return;
      try {
        const url = response.url();
        if (url.includes('parklogic.com') || url.includes('router.')) {
          const text = await response.text().catch(() => '');
          if (text.startsWith('http') && (CDN_REGEX.test(text) || text.includes('.m3u8'))) {
            console.log(`  ✅ [parklogic] ${label} → ${text.substring(0, 60)}...`);
            finish(text.trim());
          }
        }
      } catch {}
    });

    // ── STRATEGI 2: Tangkap request langsung ke CDN m3u8 ──────────────────
    // Terjadi saat in-page HLS player mulai load stream
    page.on('request', request => {
      if (done) return;
      const url = request.url();
      if ((url.includes('.m3u8') || url.includes('mono.m3u8')) && CDN_REGEX.test(url)) {
        console.log(`  ✅ [request] ${label} → ${url.substring(0, 60)}...`);
        finish(url);
      }
    });

    // ── STRATEGI 3: Tangkap navigasi top-level ke m3u8 URL ────────────────
    // Terjadi saat window.location.replace(m3u8Url) dieksekusi
    page.on('framenavigated', frame => {
      if (done || frame !== page.mainFrame()) return;
      const url = frame.url();
      if (url !== embedUrl && (url.includes('.m3u8') || CDN_REGEX.test(url))) {
        console.log(`  ✅ [navigate] ${label} → ${url.substring(0, 60)}...`);
        finish(url);
      }
    });

    // Navigasi ke embed page
    page.goto(embedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS
    }).catch(e => {
      if (!done) console.log(`  ⚠️  Navigation error: ${e.message}`);
    });
  });

  await context.close();
  return m3u8Url;
}

// ─── PROSES BATCH DENGAN CONCURRENCY LIMIT ───────────────────────────────────

async function processBatch(browser, tasks) {
  const results = new Array(tasks.length).fill(null);

  // Bagi tasks ke dalam grup sebesar CONCURRENCY
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(task => resolveEmbedUrl(browser, task.embedUrl, task.label))
    );
    settled.forEach((result, idx) => {
      results[i + idx] = result.status === 'fulfilled' ? result.value : null;
    });
    // Jeda antar batch agar tidak membebani server
    if (i + CONCURRENCY < tasks.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return results;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Stream Resolver starting...');
  console.log(`📥 Fetching source JSON: ${SOURCE_JSON_URL}`);

  const sourceData = await fetchJson(SOURCE_JSON_URL);
  const now        = new Date().toISOString();

  // Filter hanya match LIVE
  const liveMatches = sourceData.filter(m =>
    (m['Match Status'] || '').toLowerCase().includes('live') &&
    Array.isArray(m['Streams']) && m['Streams'].length > 0
  );

  console.log(`📋 Live matches found: ${liveMatches.length}`);

  // Bangun task list: setiap stream = satu task
  const tasks = [];
  for (const match of liveMatches) {
    for (const stream of match['Streams']) {
      tasks.push({
        match,
        stream,
        embedUrl: stream['Embed_URL'],
        label: `[${match['Match Title']}] ${stream['Language'] || ''} ${stream['Quality'] || ''}`
      });
    }
  }

  console.log(`🔗 Total streams to resolve: ${tasks.length}`);
  console.log(`⚡ Concurrency: ${CONCURRENCY}, timeout per stream: ${PAGE_TIMEOUT_MS}ms`);
  console.log('─'.repeat(70));

  // Launch browser
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote'
    ]
  });

  const startTime = Date.now();

  let resolvedUrls;
  try {
    resolvedUrls = await processBatch(browser, tasks);
  } finally {
    await browser.close();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('─'.repeat(70));
  console.log(`⏱️  Total elapsed: ${elapsed}s`);

  // ── Bangun output JSON ──────────────────────────────────────────────────────

  const resolvedMatches = [];
  let taskIdx = 0;

  for (const match of liveMatches) {
    const streams = [];

    for (const stream of match['Streams']) {
      const m3u8 = resolvedUrls[taskIdx++];
      streams.push({
        label:    `${stream['Quality'] || 'HD'} #${stream['Stream_No']} ${stream['Language'] || 'English'}`,
        quality:  stream['Quality'] || 'HD',
        language: stream['Language'] || 'English',
        source:   stream['Source'] || '',
        stream_no: stream['Stream_No'] || 1,
        embed_url: stream['Embed_URL'] || '',
        m3u8:     m3u8 || null   // null jika gagal
      });
    }

    // Hanya tambahkan ke output jika minimal ada 1 stream berhasil
    const hasResolved = streams.some(s => s.m3u8 !== null);

    resolvedMatches.push({
      title:      match['Match Title']  || 'Unknown',
      league:     match['League']       || match['Category'] || 'Sports',
      category:   match['Category']    || 'Sports',
      poster:     match['Match Poster'] || '',
      start_time: match['Start Time']  || '',
      status:     match['Match Status'] || 'Live 🔴',
      has_stream: hasResolved,
      streams
    });
  }

  const totalResolved   = resolvedUrls.filter(Boolean).length;
  const totalFailed     = resolvedUrls.length - totalResolved;
  const matchesWithStream = resolvedMatches.filter(m => m.has_stream).length;

  const output = {
    updated_at:        now,
    elapsed_seconds:   parseFloat(elapsed),
    source:            SOURCE_JSON_URL,
    total_live:        liveMatches.length,
    total_streams:     tasks.length,
    resolved_ok:       totalResolved,
    resolved_failed:   totalFailed,
    matches_with_stream: matchesWithStream,
    matches:           resolvedMatches
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log(`\n📊 Results:`);
  console.log(`   Live matches : ${liveMatches.length}`);
  console.log(`   Total streams: ${tasks.length}`);
  console.log(`   ✅ Resolved  : ${totalResolved}`);
  console.log(`   ❌ Failed    : ${totalFailed}`);
  console.log(`   💾 Saved to  : ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
