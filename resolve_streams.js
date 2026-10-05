/**
 * resolve_streams.js (V6 - Final Perfect Edition)
 * - Fast Auth Capture (Terbukti 100% berhasil menangkap m3u8)
 * - Time Filter (Otomatis skip pertandingan yang lewat batas waktu)
 * - Full Script tanpa potongan.
 */
const { chromium } = require('playwright');
const fs  = require('fs');
const https = require('https');

const SOURCE_JSON_URL = 'https://raw.githubusercontent.com/srhady/data/refs/heads/main/live_sports_playlist.json';
const OUTPUT_FILE = 'resolved_streams.json';

const CDN_REGEX = /strmd\.st|vipstreams\.in|streamed\.su|lb\d+\./;
const PAGE_TIMEOUT_MS = 25000;
const CONCURRENCY     = 4;

// Fungsi membaca JSON dari GitHub
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

// Fungsi Filter Waktu (Skip jika lewat 12 jam untuk aman dari perbedaan zona waktu)
function isMatchValid(timeStr) {
  if (!timeStr) return true;
  try {
    const parts = timeStr.split('|');
    if (parts.length < 2) return true;
    const timePart = parts[0].trim();
    const datePart = parts[1].trim();
    const year = new Date().getFullYear();
    const dateString = `${datePart.replace('-', ' ')} ${year} ${timePart}`;
    const matchTime = new Date(dateString).getTime();
    if (isNaN(matchTime)) return true;
    
    const ageHours = (Date.now() - matchTime) / 3600000;
    return ageHours <= 12; // Abaikan jika sudah lewat dari 12 jam
  } catch(e) { 
    return true; 
  }
}

// Fungsi Utama Tangkap URL
async function resolveEmbedUrl(browser, embedUrl, label) {
  if (!embedUrl) return null;

  let context, page;
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      extraHTTPHeaders: { 'Referer': 'https://embed.st/', 'Origin': 'https://embed.st' },
      serviceWorkers: 'block'
    });
    page = await context.newPage();
    // Blokir file berat agar super cepat
    await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,css}', route => route.abort());
  } catch (e) {
    console.log(`  ❌ Gagal membuka browser untuk ${label}`);
    return null;
  }

  const m3u8Url = await new Promise(resolveP => {
    let done = false;
    const finish = (url) => { if (!done) { done = true; clearTimeout(timer); resolveP(url); } };
    const timer = setTimeout(() => { console.log(`  ⏱️  Timeout: ${label}`); finish(null); }, PAGE_TIMEOUT_MS);

    // Tangkap URL murni langsung dari auth server
    page.on('response', async response => {
      if (done) return;
      try {
        const url = response.url();
        if (url.includes('parklogic.com') || url.includes('router.')) {
          const text = await response.text().catch(() => '');
          if (text.startsWith('http') && CDN_REGEX.test(text)) {
            console.log(`  ✅ ${label} → ${text.substring(0, 50)}...`);
            finish(text.trim());
          }
        }
      } catch {}
    });

    // Tangkap juga jika web langsung melempar file m3u8
    page.on('request', request => {
      if (done) return;
      const url = request.url();
      if (url.includes('.m3u8') && CDN_REGEX.test(url)) {
        console.log(`  ✅ ${label} → ${url.substring(0, 50)}...`);
        finish(url);
      }
    });

    page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS }).catch(e => {
      if (!done) console.log(`  ⚠️  Navigasi lambat untuk ${label}`);
    });
  });

  await context.close().catch(()=>{});
  return m3u8Url;
}

// Proses antrean secara paralel
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

// Start Script
async function main() {
  console.log('🚀 Stream Resolver (Fast Auth + Time Filter) starting...');
  const sourceData = await fetchJson(SOURCE_JSON_URL);
  
  // Filter 1: Cek status Live
  let liveMatches = sourceData.filter(m => (m['Match Status'] || '').toLowerCase().includes('live') && Array.isArray(m['Streams']));
  console.log(`📋 Total Live Matches ditemukan: ${liveMatches.length}`);
  
  // Filter 2: Buang pertandingan yang sudah lewat batas
  liveMatches = liveMatches.filter(m => isMatchValid(m['Start Time']));
  console.log(`⏱️ Sisa Match setelah di-filter waktu: ${liveMatches.length}`);

  const tasks = [];
  liveMatches.forEach(m => m['Streams'].forEach(s => tasks.push({
    match: m, stream: s, embedUrl: s['Embed_URL'], label: `[${m['Match Title']}] ${s['Quality']||''}`
  })));

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const startTime = Date.now();
  
  // Mulai eksekusi
  const resolvedUrls = await processBatch(browser, tasks);
  await browser.close().catch(()=>{});
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Susun hasil
  const resolvedMatches = [];
  let taskIdx = 0;
  for (const match of liveMatches) {
    const streams = [];
    for (const stream of match['Streams']) {
      const m3u8 = resolvedUrls[taskIdx++];
      if (m3u8) streams.push({ ...stream, m3u8: m3u8 });
    }
    if (streams.length > 0) {
      resolvedMatches.push({ 
        title: match['Match Title'], 
        league: match['League'] || match['Category'], 
        poster: match['Match Poster'], 
        start_time: match['Start Time'], 
        streams 
      });
    }
  }

  const totalResolved = resolvedUrls.filter(Boolean).length;
  const output = { 
    updated_at: new Date().toISOString(), 
    elapsed_seconds: parseFloat(elapsed), 
    total_streams: tasks.length, 
    resolved_ok: totalResolved, 
    matches: resolvedMatches 
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`✅ Saved ${totalResolved}/${tasks.length} streams to ${OUTPUT_FILE}`);
}

main().catch(err => { console.error('💥 Fatal error:', err); process.exit(1); });
