/**
 * resolve_streams.js (V10 - Ultimate Browser Parser Edition)
 * ─────────────────────────────────────────────────────────────────────────────
 * MABES ENTERPRISE - Playwright Stream Resolver
 * - Strategi Anti-Bot: Mengekstrak varian m3u8 dari DALAM mesin browser
 *   agar tidak diblokir oleh CDN.
 * - Sesuai MOU: Full Script, Teliti, Tanpa Tebakan.
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

// ─── HELPER MENGAMBIL DATA SUMBER JSON ───────────────────────────────────────
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

// ─── HELPER FILTER WAKTU (MENGABAIKAN PERTANDINGAN KEDALUWARSA) ──────────────
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

// ─── FUNGSI UTAMA RESOLVER MENGGUNAKAN PLAYWRIGHT ────────────────────────────
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
    
    // Penjaga Tab Iklan (Otomatis Tutup Halaman Baru)
    context.on('page', newPage => { 
      if (newPage !== page) newPage.close().catch(()=>{}); 
    });
    
    // Blokir muatan berat (gambar, font, dll) agar loading super cepat
    await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}', route => {
      route.abort().catch(()=>{});
    });
  } catch (e) {
    console.log(`  ❌ Browser Error [${label}]: ${e.message}`);
    return null;
  }

  const m3u8Url = await new Promise(resolveP => {
    let done = false;
    
    // FUNGSI PENYELESAIAN (Mengekstrak Varian Langsung dari Browser)
    const finish = async (url) => { 
      if (done) return; 
      done = true; 
      clearTimeout(timer); 

      // Jika URL adalah Master Playlist, bongkar dan cari variannya
      if (url && url.includes('playlist.m3u8')) {
        try {
          // KUNCI SUKSES: Minta browser asli (yang lolos anti-bot) untuk mendownload isi file
          const m3u8Text = await page.evaluate(async (targetUrl) => {
            try {
              const res = await fetch(targetUrl);
              return await res.text();
            } catch(e) { return null; }
          }, url);

          if (m3u8Text) {
            const lines = m3u8Text.split('\n').map(l => l.trim()).filter(Boolean);
            let variant = null;
            
            // Cari baris yang menyimpan URL varian aslinya (berada di bawah #EXT-X-STREAM-INF)
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                const nextLine = lines[i+1];
                if (nextLine && !nextLine.startsWith('#')) {
                  variant = nextLine;
                  break; // Tangkap varian pertama (biasanya tertinggi)
                }
              }
            }
            
            if (variant) {
              const finalUrl = url.substring(0, url.lastIndexOf('/') + 1) + variant;
              console.log(`  ✅ [Parsed-Browser] ${label} → ${finalUrl.substring(0, 60)}...`);
              return resolveP(finalUrl);
            }
          }
        } catch(e) {
          console.log(`  ⚠️ [Parse Error] Gagal mengekstrak varian dari: ${label}`);
        }
      }
      
      // Jika gagal dibongkar atau memang bukan playlist.m3u8, kembalikan apa adanya
      console.log(`  ✅ [Direct] ${label} → ${(url || '').substring(0, 60)}...`);
      resolveP(url); 
    };

    // Batas Waktu 25 Detik
    const timer = setTimeout(() => { 
      console.log(`  ⏱️ Timeout: ${label}`); 
      finish(null); 
    }, PAGE_TIMEOUT_MS);

    // Tangkap dari respons Fast Auth (Sangat Cepat)
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

    // Tangkap dari jalur jaringan biasa
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

// ─── PROSES EKSEKUSI PARALEL ──────────────────────────────────────────────────
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

// ─── MAIN PROGRAM ─────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Stream Resolver (Ultimate Browser Parser Edition) starting...');
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
