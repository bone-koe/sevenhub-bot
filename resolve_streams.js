/**
 * resolve_streams.js (V9 - Master Playlist Parser Edition)
 * ─────────────────────────────────────────────────────────────────────────────
 * MABES ENTERPRISE - Playwright Stream Resolver
 * - Strategi Anti-Gagal: Membaca isi file playlist.m3u8 untuk mengekstrak 
 *   URL varian asli tanpa harus berurusan dengan klik iklan atau video player.
 * - Sesuai MOU: Cepat, stabil, tanpa tebakan.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { chromium } = require('playwright');
const fs  = require('fs');
const https = require('https');

const SOURCE_JSON_URL = 'https://raw.githubusercontent.com/srhady/data/refs/heads/main/live_sports_playlist.json';
const OUTPUT_FILE = 'resolved_streams.json';

const CDN_REGEX = /strmd\.st|vipstreams\.in|streamed\.su|lb\d+\./;
const PAGE_TIMEOUT_MS = 20000;
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
    
    return ((Date.now() - matchTime) / 3600000) <= 12; 
  } catch(e) { return true; }
}

// ─── FUNGSI CERDAS: Membaca isi playlist.m3u8 dan mengekstrak variannya ──────
function extractVariantUrl(masterUrl) {
  return new Promise((resolve) => {
    const urlObj = new URL(masterUrl);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://embed.st/',
        'Origin': 'https://embed.st'
      }
    };

    https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const lines = data.split('\n').map(l => l.trim()).filter(Boolean);
          let variant = null;
          
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
              const nextLine = lines[i+1];
              if (nextLine && !nextLine.startsWith('#')) {
                variant = nextLine;
                break; // Ambil varian pertama (tertinggi)
              }
            }
          }
          
          if (variant) {
            const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
            resolve(baseUrl + variant); // Mengembalikan .../1/high/mono.m3u8 dll
          } else {
            resolve(masterUrl); // Jika tidak ditemukan, kembalikan apa adanya
          }
        } catch (e) {
          resolve(masterUrl);
        }
      });
    }).on('error', () => resolve(masterUrl));
  });
}
// ─────────────────────────────────────────────────────────────────────────────

async function resolveEmbedUrl(browser, embedUrl, label) {
  if (!embedUrl) return null;

  let context, page;
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 800, height: 600 },
      extraHTTPHeaders: { 'Referer': 'https://embed.st/', 'Origin': 'https://embed.st' }
    });
    
    page = await context.newPage();
    context.on('page', newPage => { 
      if (newPage !== page) newPage.close().catch(()=>{}); 
    });
    
    await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}', route => {
      route.abort().catch(()=>{});
    });
  } catch (e) {
    console.log(`  ❌ Browser Error [${label}]: ${e.message}`);
    return null;
  }

  const m3u8Url = await new Promise(resolveP => {
    let done = false;
    
    // Fungsi penyelesaian yang membedah URL
    const finish = async (url) => { 
      if (done) return; 
      done = true; 
      clearTimeout(timer); 

      if (url && url.includes('playlist.m3u8')) {
        // Ekstrak variannya secara langsung!
        const finalUrl = await extractVariantUrl(url);
        console.log(`  ✅ [Parsed] ${label} → ${finalUrl.substring(0, 60)}...`);
        resolveP(finalUrl);
      } else {
        console.log(`  ✅ [Direct] ${label} → ${(url || '').substring(0, 60)}...`);
        resolveP(url); 
      }
    };

    const timer = setTimeout(() => { 
      console.log(`  ⏱️ Timeout: ${label}`); 
      finish(null); 
    }, PAGE_TIMEOUT_MS);

    // Tangkap dari respons otentikasi (Sangat Cepat)
    page.on('response', async response => {
      if (done) return;
      try {
        const url = response.url();
        if (url.includes('parklogic.com') || url.includes('router.')) {
          const text = await response.text().catch(() => '');
          if (text.startsWith('http') && CDN_REGEX.test(text)) {
            finish(text.trim());
          }
        }
      } catch {}
    });

    // Tangkap dari jaringan biasa
    page.on('request', request => {
      if (done) return;
      const url = request.url();
      if (url.includes('.m3u8') && CDN_REGEX.test(url)) {
        finish(url);
      }
    });

    page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS }).catch(() => {});
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
  console.log('🚀 Stream Resolver (Direct Parser Edition) starting...');
  const sourceData = await fetchJson(SOURCE_JSON_URL);
  
  let liveMatches = sourceData.filter(m => (m['Match Status'] || '').toLowerCase().includes('live') && Array.isArray(m['Streams']));
  liveMatches = liveMatches.filter(m => isMatchValid(m['Start Time']));
  console.log(`📋 Sisa Match diproses (Live & Valid): ${liveMatches.length}`);

  const tasks = [];
  liveMatches.forEach(m => m['Streams'].forEach(s => tasks.push({
    match: m, stream: s, embedUrl: s['Embed_URL'], label: `[${m['Match Title']}] ${s['Quality']||''}`
  })));

  const browser = await chromium.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] 
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
