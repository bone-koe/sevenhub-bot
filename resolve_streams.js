/**
 * resolve_streams.js (V7 - Smart M3U8 Detection)
 * ─────────────────────────────────────────────────────────────────────────────
 * MABES ENTERPRISE - Playwright Stream Resolver
 * - Deteksi Cerdas: Menunggu URL m3u8 terakhir (varian asli) yang dipanggil player.
 * - Tidak kaku: Beradaptasi otomatis entah itu mono.m3u8, index.m3u8, dll.
 * - Time Filter: Abaikan match yang lewat > 12 jam.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { chromium } = require('playwright');
const fs  = require('fs');
const https = require('https');

const SOURCE_JSON_URL = 'https://raw.githubusercontent.com/srhady/data/refs/heads/main/live_sports_playlist.json';
const OUTPUT_FILE = 'resolved_streams.json';

const CDN_REGEX = /strmd\.st|vipstreams\.in|streamed\.su|lb\d+\./;
const PAGE_TIMEOUT_MS = 25000;
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
    return ageHours <= 12; 
  } catch(e) { return true; }
}

async function resolveEmbedUrl(browser, embedUrl, label) {
  if (!embedUrl) return null;

  let context, page;
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 800, height: 600 },
      extraHTTPHeaders: { 'Referer': 'https://embed.st/', 'Origin': 'https://embed.st' }
    });
    
    // Otomatis tutup popup iklan
    context.on('page', newPage => { newPage.close().catch(()=>{}); });
    
    page = await context.newPage();
    // Blokir aset berat kecuali JS/CSS yang mungkin dibutuhkan player
    await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}', route => route.abort());
  } catch (e) {
    console.log(`  ❌ Browser Error: ${label}`);
    return null;
  }

  const m3u8Url = await new Promise(resolveP => {
    let done = false;
    let bestUrl = null;
    let settleTimer = null;

    const finish = (url) => { 
      if (done) return; 
      done = true; 
      clearTimeout(timer); 
      clearTimeout(settleTimer);
      resolveP(url); 
    };

    // Timeout utama (25 detik)
    const timer = setTimeout(() => { 
      console.log(`  ⏱️ Timeout: ${label}`); 
      finish(bestUrl || null); // Jika kehabisan waktu, ambil URL terakhir yang sempat terekam
    }, PAGE_TIMEOUT_MS);

    // LOGIKA CERDAS: Pantau Jaringan
    page.on('request', request => {
      if (done) return;
      const url = request.url();
      
      if (url.includes('.m3u8') && CDN_REGEX.test(url)) {
        bestUrl = url; // Update kandidat URL terbaik
        
        // Reset timer 3 detik. Jika tidak ada m3u8 baru dalam 3 detik, 
        // kita anggap player sudah memanggil varian terakhirnya (ex: mono.m3u8).
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          console.log(`  ✅ [Smart-Detect] ${label} → ${bestUrl.substring(0, 60)}...`);
          finish(bestUrl);
        }, 3000);
      }
    });

    // Jalankan halaman
    page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS }).then(async () => {
      // Pancing player dengan simulasi klik tepat di tengah layar (aman, tidak menyebabkan crash)
      try {
        await page.mouse.click(400, 300);
      } catch(e) {}
    }).catch(() => {});
  });

  await context.close().catch(()=>{});
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
  console.log('🚀 Stream Resolver (Smart M3U8 Edition) starting...');
  const sourceData = await fetchJson(SOURCE_JSON_URL);
  
  let liveMatches = sourceData.filter(m => (m['Match Status'] || '').toLowerCase().includes('live') && Array.isArray(m['Streams']));
  liveMatches = liveMatches.filter(m => isMatchValid(m['Start Time']));
  console.log(`📋 Sisa Match diproses (Live & Valid): ${liveMatches.length}`);

  const tasks = [];
  liveMatches.forEach(m => m['Streams'].forEach(s => tasks.push({
    match: m, stream: s, embedUrl: s['Embed_URL'], label: `[${m['Match Title']}] ${s['Quality']||''}`
  })));

  // Argumen browser dibuat agar memaksakan Autoplay
  const browser = await chromium.launch({ 
    headless: true, 
    args: [
      '--no-sandbox', 
      '--disable-gpu',
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio'
    ] 
  });
  
  const startTime = Date.now();
  const resolvedUrls = await processBatch(browser, tasks);
  await browser.close().catch(()=>{});
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

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
