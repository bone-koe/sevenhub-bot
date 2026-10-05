/**
 * resolve_streams.js (V3.1 - Force Capture mono.m3u8)
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
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) return resolve(fetchJson(res.headers.location));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function resolveEmbedUrl(browser, embedUrl, label) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    extraHTTPHeaders: { 'Referer': 'https://embed.st/', 'Origin': 'https://embed.st' },
    serviceWorkers: 'block'
  });

  const page = await context.newPage();
  await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,css}', route => route.abort());

  const m3u8Url = await new Promise(resolveP => {
    let done = false;
    const finish = (url) => { if (!done) { done = true; clearTimeout(timer); resolveP(url); } };
    const timer = setTimeout(() => { console.log(`  ⏱️ Timeout: ${label}`); finish(null); }, PAGE_TIMEOUT_MS);

    page.on('request', request => {
      if (done) return;
      const url = request.url();
      // HANYA tangkap jika URL mengandung 'mono.m3u8' (resolusi akhir)
      if (url.includes('mono.m3u8') && CDN_REGEX.test(url)) {
        console.log(`  ✅ [mono] ${label} → ${url.substring(0, 60)}...`);
        finish(url);
      }
    });

    page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS }).catch(() => {});
  });

  await context.close();
  return m3u8Url;
}

async function processBatch(browser, tasks) {
  const results = new Array(tasks.length).fill(null);
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(t => resolveEmbedUrl(browser, t.embedUrl, t.label)));
    settled.forEach((r, idx) => { results[i + idx] = r.status === 'fulfilled' ? r.value : null; });
    if (i + CONCURRENCY < tasks.length) await new Promise(r => setTimeout(r, 1000));
  }
  return results;
}

async function main() {
  console.log('🚀 Stream Resolver (mono.m3u8 edition) starting...');
  const sourceData = await fetchJson(SOURCE_JSON_URL);
  const liveMatches = sourceData.filter(m => (m['Match Status'] || '').toLowerCase().includes('live') && m['Streams']);
  const tasks = [];
  liveMatches.forEach(m => m['Streams'].forEach(s => tasks.push({
    match: m, stream: s, embedUrl: s['Embed_URL'], label: `[${m['Match Title']}] ${s['Quality']}`
  })));

  // Tambahkan args agar video auto-play tanpa butuh interaksi user (supaya mono.m3u8 ter-load)
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio']
  });

  const startTime = Date.now();
  const resolvedUrls = await processBatch(browser, tasks);
  await browser.close();

  const resolvedMatches = [];
  let taskIdx = 0;
  for (const match of liveMatches) {
    const streams = [];
    for (const stream of match['Streams']) {
      const m3u8 = resolvedUrls[taskIdx++];
      streams.push({ ...stream, label: `${stream['Quality']} #${stream['Stream_No']}`, m3u8: m3u8 || null, q: stream['Quality'] });
    }
    if (streams.some(s => s.m3u8)) {
      resolvedMatches.push({ title: match['Match Title'], league: match['League'], poster: match['Match Poster'], start_time: match['Start Time'], streams });
    }
  }

  const output = {
    updated_at: new Date().toISOString(),
    total_streams: tasks.length,
    resolved_ok: resolvedUrls.filter(Boolean).length,
    matches: resolvedMatches
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`✅ Saved to ${OUTPUT_FILE}`);
}
main().catch(err => { console.error('💥 Fatal error:', err); process.exit(1); });
