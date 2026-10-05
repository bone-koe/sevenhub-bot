/**
 * resolve_streams.js
 * ─────────────────────────────────────────────────────────────────────────────
 * MABES ENTERPRISE - Playwright Stream Resolver (Ad-Killer & Time Filter)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { chromium } = require('playwright');
const fs  = require('fs');
const https = require('https');

const SOURCE_JSON_URL = 'https://raw.githubusercontent.com/srhady/data/refs/heads/main/live_sports_playlist.json';
const OUTPUT_FILE = 'resolved_streams.json';

const CDN_REGEX = /strmd\.st|vipstreams\.in|streamed\.su|lb\d+\./;
const PAGE_TIMEOUT_MS = 25_000; // Naikkan sedikit agar punya waktu untuk klik
const CONCURRENCY     = 4;

// ─── HELPER: Fetch JSON ──────────────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json'
      }
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) return resolve(fetchJson(res.headers.location));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

// ─── HELPER: Filter Waktu (Abaikan Match Kedaluwarsa) ───────────────────────
function isMatchValid(timeStr) {
  if (!timeStr) return true; // Jika tidak ada info waktu, tetap diproses
  try {
    const parts = timeStr.split('|');
    if (parts.length < 2) return true;
    
    const timePart = parts[0].trim(); // "02:45 PM"
    const datePart = parts[1].trim(); // "04-Oct"
    const year = new Date().getFullYear();
    
    // Format menjadi string tanggal yang valid: "04 Oct 2026 02:45 PM"
    const dateString = `${datePart.replace('-', ' ')} ${year} ${timePart}`;
    const matchTime = new Date(dateString).getTime();
    
    if (isNaN(matchTime)) return true;

    const now = Date.now();
    const ageHours = (now - matchTime) / (1000 * 60 * 60); // Selisih dalam Jam
    
    // Jika pertandingan sudah lewat lebih dari 6 jam, anggap sudah selesai (Abaikan)
    if (ageHours > 6) {
      return false;
    }
    return true;
  } catch(e) {
    return true;
  }
}

// ─── FUNGSI UTAMA RESOLVER ───────────────────────────────────────────────────
async function resolveEmbedUrl(browser, embedUrl, label) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 800, height: 600 }, // Tetapkan ukuran layar agar akurat saat klik
    extraHTTPHeaders: { 'Referer': 'https://embed.st/', 'Origin': 'https://embed.st' }
  });

  // ⚔️ SISTEM PEMBASMI IKLAN: Otomatis bunuh semua tab/jendela popup baru
  context.on('page', newPage => {
    newPage.close().catch(() => {});
  });

  const page = await context.newPage();
  
  // Blokir aset berat untuk mempercepat loading
  await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,css}', route => route.abort());

  const m3u8Url = await new Promise(resolveP => {
    let done = false;
    const finish = (url) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolveP(url || null);
    };

    const timer = setTimeout(() => {
      console.log(`  ⏱️  Timeout: ${label}`);
      finish(null);
    }, PAGE_TIMEOUT_MS);

    // Penangkap Jalur 1: Memantau File m3u8 yang dipanggil oleh player
    page.on('request', req => {
      if (done) return;
      const url = req.url();
      if (url.includes('.m3u8') && CDN_REGEX.test(url)) {
        console.log(`  ✅ [Request] ${label} → ${url.substring(0, 50)}...`);
        finish(url);
      }
    });

    // Penangkap Jalur 2: Memantau Auth Token parklogic (Jika website masih menggunakannya)
    page.on('response', async res => {
      if (done) return;
      try {
        const url = res.url();
        if (url.includes('parklogic.com') || url.includes('router.')) {
          const text = await res.text().catch(() => '');
          if (text.startsWith('http') && CDN_REGEX.test(text)) {
            console.log(`  ✅ [Auth] ${label} → ${text.substring(0, 50)}...`);
            finish(text.trim());
          }
        }
      } catch {}
    });

    // Eksekusi Buka Halaman & Serangan Klik
    (async () => {
      try {
        await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // ⚔️ KLIK MANDIRI: Klik tengah layar berulang kali untuk menembus iklan overlay
        for (let i = 0; i < 6; i++) {
          if (done) break;
          // Koordinat X: 400, Y: 300 (Tepat di tengah layar video)
          await page.mouse.click(400, 300);
          await page.waitForTimeout(1000); // Tunggu sedetik tiap klik
        }
      } catch (e) {
        if (!done) console.log(`  ⚠️  Error Navigasi: ${e.message}`);
      }
    })();
  });

  await context.close();
  return m3u8Url;
}

// ─── PEMROSESAN BATCH PARALEL ────────────────────────────────────────────────
async function processBatch(browser, tasks) {
  const results = new Array(tasks.length).fill(null);
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(task => resolveEmbedUrl(browser, task.embedUrl, task.label))
    );
    settled.forEach((result, idx) => {
      results[i + idx] = result.status === 'fulfilled' ? result.value : null;
    });
    if (i + CONCURRENCY < tasks.length) await new Promise(r => setTimeout(r, 1000));
  }
  return results;
}

// ─── START SCRIPT ────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Stream Resolver (Ad-Killer & Time Filter Edition) starting...');
  const sourceData = await fetchJson(SOURCE_JSON_URL);
  
  // Filter 1: Hanya status Live
  let liveMatches = sourceData.filter(m =>
    (m['Match Status'] || '').toLowerCase().includes('live') &&
    Array.isArray(m['Streams']) && m['Streams'].length > 0
  );

  console.log(`📋 Total Live Matches ditemukan: ${liveMatches.length}`);

  // Filter 2: Buang pertandingan yang sudah lewat > 6 jam
  liveMatches = liveMatches.filter(m => isMatchValid(m['Start Time']));
  
  console.log(`⏱️ Sisa Match setelah di-filter waktu: ${liveMatches.length}`);

  const tasks = [];
  for (const match of liveMatches) {
    for (const stream of match['Streams']) {
      tasks.push({
        match,
        stream,
        embedUrl: stream['Embed_URL'],
        label: `[${match['Match Title']}] ${stream['Quality'] || ''}`
      });
    }
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-gpu',
      '--autoplay-policy=no-user-gesture-required' // Paksa browser izinkan auto-play
    ]
  });

  const startTime = Date.now();
  const resolvedUrls = await processBatch(browser, tasks);
  await browser.close();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const resolvedMatches = [];
  let taskIdx = 0;

  for (const match of liveMatches) {
    const streams = [];
    for (const stream of match['Streams']) {
      const m3u8 = resolvedUrls[taskIdx++];
      if (m3u8) {
        streams.push({
          quality: stream['Quality'] || 'HD',
          language: stream['Language'] || 'English',
          embed_url: stream['Embed_URL'] || '',
          m3u8: m3u8
        });
      }
    }

    if (streams.length > 0) {
      resolvedMatches.push({
        title: match['Match Title'] || 'Unknown',
        league: match['League'] || match['Category'] || 'Sports',
        poster: match['Match Poster'] || '',
        start_time: match['Start Time'] || '',
        streams: streams
      });
    }
  }

  const output = {
    updated_at: new Date().toISOString(),
    elapsed_seconds: parseFloat(elapsed),
    total_streams: tasks.length,
    resolved_ok: resolvedUrls.filter(Boolean).length,
    matches: resolvedMatches
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`✅ Result saved to ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
