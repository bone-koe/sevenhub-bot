/**
 * resolve_streams.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Playwright-based resolver untuk embed.st stream URLs.
 */

const { chromium } = require('playwright');
const fs  = require('fs');
const https = require('https');

const SOURCE_JSON_URL = 'https://raw.githubusercontent.com/srhady/data/refs/heads/main/live_sports_playlist.json';
const OUTPUT_FILE = 'resolved_streams.json';

const CDN_REGEX = /strmd\.st|vipstreams\.in|streamed\.su|lb\d+\./;
const PAGE_TIMEOUT_MS = 20_000;
const CONCURRENCY     = 4;

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

async function resolveEmbedUrl(browser, embedUrl, label) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Referer': 'https://embed.st/',
      'Origin': 'https://embed.st'
    },
    serviceWorkers: 'block'
  });

  const page = await context.newPage();
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
      console.log(`  ⏱️  Timeout (${PAGE_TIMEOUT_MS}ms): ${label}`);
      finish(null);
    }, PAGE_TIMEOUT_MS);

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

    page.on('request', request => {
      if (done) return;
      const url = request.url();
      if ((url.includes('.m3u8') || url.includes('mono.m3u8')) && CDN_REGEX.test(url)) {
        console.log(`  ✅ [request] ${label} → ${url.substring(0, 60)}...`);
        finish(url);
      }
    });

    page.on('framenavigated', frame => {
      if (done || frame !== page.mainFrame()) return;
      const url = frame.url();
      if (url !== embedUrl && (url.includes('.m3u8') || CDN_REGEX.test(url))) {
        console.log(`  ✅ [navigate] ${label} → ${url.substring(0, 60)}...`);
        finish(url);
      }
    });

    page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS })
      .catch(e => { if (!done) console.log(`  ⚠️  Navigation error: ${e.message}`); });
  });

  await context.close();
  return m3u8Url;
}

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

async function main() {
  console.log('🚀 Stream Resolver starting...');
  const sourceData = await fetchJson(SOURCE_JSON_URL);
  const now = new Date().toISOString();

  const liveMatches = sourceData.filter(m =>
    (m['Match Status'] || '').toLowerCase().includes('live') &&
    Array.isArray(m['Streams']) && m['Streams'].length > 0
  );

  const tasks = [];
  for (const match of liveMatches) {
    for (const stream of match['Streams']) {
      tasks.push({
        match, stream,
        embedUrl: stream['Embed_URL'],
        label: `[${match['Match Title']}] ${stream['Language'] || ''} ${stream['Quality'] || ''}`
      });
    }
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-zygote']
  });

  const startTime = Date.now();
  let resolvedUrls;
  try {
    resolvedUrls = await processBatch(browser, tasks);
  } finally {
    await browser.close();
  }
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const resolvedMatches = [];
  let taskIdx = 0;

  for (const match of liveMatches) {
    const streams = [];
    for (const stream of match['Streams']) {
      const m3u8 = resolvedUrls[taskIdx++];
      streams.push({
        label: `${stream['Quality'] || 'HD'} #${stream['Stream_No']} ${stream['Language'] || 'English'}`,
        quality: stream['Quality'] || 'HD',
        language: stream['Language'] || 'English',
        source: stream['Source'] || '',
        stream_no: stream['Stream_No'] || 1,
        embed_url: stream['Embed_URL'] || '',
        m3u8: m3u8 || null
      });
    }

    const hasResolved = streams.some(s => s.m3u8 !== null);
    resolvedMatches.push({
      title: match['Match Title'] || 'Unknown',
      league: match['League'] || match['Category'] || 'Sports',
      category: match['Category'] || 'Sports',
      poster: match['Match Poster'] || '',
      start_time: match['Start Time'] || '',
      status: match['Match Status'] || 'Live 🔴',
      has_stream: hasResolved,
      streams
    });
  }

  const totalResolved = resolvedUrls.filter(Boolean).length;
  const output = {
    updated_at: now,
    elapsed_seconds: parseFloat(elapsed),
    total_live: liveMatches.length,
    total_streams: tasks.length,
    resolved_ok: totalResolved,
    resolved_failed: resolvedUrls.length - totalResolved,
    matches: resolvedMatches
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`✅ Saved to ${OUTPUT_FILE}`);
}

main().catch(err => { console.error('💥 Fatal error:', err); process.exit(1); });
