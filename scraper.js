const { chromium } = require('playwright');

const sessionToken = process.env.SESSION_TOKEN;
const workerUrl = process.env.WORKER_URL; 
const secretKey = process.env.SECRET_KEY;

(async () => {
  if (!sessionToken || !workerUrl || !secretKey) {
    console.error("Gagal: Secret keys belum diset!");
    process.exit(1);
  }

  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--disable-gpu',
      '--window-size=1280,720'
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });

  // ==========================================
  // SURGICAL AD-BLOCKER
  // ==========================================
  await context.route('**/*', route => {
    const url = route.request().url();
    const adDomains = ['doubleclick.net', 'googlesyndication.com', 'google-analytics.com', 'facebook.net', 'facebook.com', 'taboola.com', 'criteo.com', 'outbrain.com', 'tiktok.com'];
    
    if (adDomains.some(domain => url.includes(domain))) {
      route.abort(); 
    } else {
      route.continue(); 
    }
  });
  
  await context.addCookies([{
      name: '__Secure-next-auth.session-token',
      value: sessionToken,
      domain: 'sevenhub.id',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax'
  }]);

  let finalTrans7Url = null;
  let finalTransTvUrl = null;
  let finalTrans7DetikUrl = null; 
  let finalCnnUrl = null;
  let finalCnbcUrl = null;

  // ==========================================
  // FUNGSI HELPER: KLIK & SCROLL AGRESIF
  // ==========================================
  async function triggerVideo(page, getUrlValue) {
    // Klik sembarang di tengah layar memicu pemutar video yang tertidur
    try { await page.mouse.click(500, 500); } catch(e) {}
    for (let i = 0; i < 8; i++) {
        await page.evaluate(() => window.scrollBy(0, 400));
        try { await page.keyboard.press('PageDown'); } catch(e) {}
        await page.waitForTimeout(2500); 
        if (getUrlValue()) break; 
    }
  }

  // ==========================================
  // TUGAS 1: SCRAPE TRANS 7 (SEVENHUB)
  // ==========================================
  console.log('--- Membuka Trans 7 (Sevenhub) ---');
  const pageT7 = await context.newPage();
  pageT7.on('request', request => {
    if (request.url().includes('.m3u8') && request.url().includes('dmcdn.net')) {
      finalTrans7Url = request.url().replace(/live-\d+\.m3u8/, 'live-720.m3u8');
    }
  });
  try { await pageT7.goto('https://sevenhub.id/live', { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (err) {}
  await triggerVideo(pageT7, () => finalTrans7Url);
  
  if (finalTrans7Url) console.log('✅ Trans 7 (Sevenhub) Tertangkap:', finalTrans7Url);
  else console.log('❌ Gagal menangkap Trans 7 (Sevenhub)');
  await pageT7.close();


  // ==========================================
  // TUGAS 2: SCRAPE TRANS TV (DETIK)
  // ==========================================
  console.log('\n--- Membuka Trans TV (Detik) ---');
  const pageTTV = await context.newPage();
  pageTTV.on('request', request => {
    if (request.url().toLowerCase().includes('.m3u8') && request.url().toLowerCase().includes('transtv')) finalTransTvUrl = request.url();
  });
  try { await pageTTV.goto('https://20.detik.com/live/trans-tv', { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (err) {}
  await triggerVideo(pageTTV, () => finalTransTvUrl);

  if (finalTransTvUrl) console.log('✅ Trans TV (Detik) Tertangkap:', finalTransTvUrl);
  else console.log('❌ Gagal menangkap Trans TV (Detik)');
  await pageTTV.close();


  // ==========================================
  // TUGAS 3: SCRAPE TRANS 7 (DETIK)
  // ==========================================
  console.log('\n--- Membuka Trans 7 (Detik) ---');
  const pageT7Detik = await context.newPage();
  pageT7Detik.on('request', request => {
    if (request.url().toLowerCase().includes('.m3u8') && request.url().toLowerCase().includes('trans7')) finalTrans7DetikUrl = request.url();
  });
  try { await pageT7Detik.goto('https://20.detik.com/live/trans-7', { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (err) {}
  await triggerVideo(pageT7Detik, () => finalTrans7DetikUrl);

  if (finalTrans7DetikUrl) console.log('✅ Trans 7 (Detik) Tertangkap:', finalTrans7DetikUrl);
  else console.log('❌ Gagal menangkap Trans 7 (Detik)');
  await pageT7Detik.close();


  // ==========================================
  // TUGAS 4: SCRAPE CNN INDONESIA (URL ASLI)
  // ==========================================
  console.log('\n--- Membuka CNN Indonesia ---');
  const pageCNN = await context.newPage();
  pageCNN.on('request', request => {
    if (request.url().toLowerCase().includes('.m3u8') && request.url().toLowerCase().includes('cnn')) finalCnnUrl = request.url();
  });
  try { await pageCNN.goto('https://www.cnnindonesia.com/tv', { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (err) {}
  await triggerVideo(pageCNN, () => finalCnnUrl);

  if (finalCnnUrl) console.log('✅ CNN Indonesia Tertangkap:', finalCnnUrl);
  else console.log('❌ Gagal menangkap CNN Indonesia');
  await pageCNN.close();


  // ==========================================
  // TUGAS 5: SCRAPE CNBC INDONESIA (URL ASLI)
  // ==========================================
  console.log('\n--- Membuka CNBC Indonesia ---');
  const pageCNBC = await context.newPage();
  pageCNBC.on('request', request => {
    if (request.url().toLowerCase().includes('.m3u8') && request.url().toLowerCase().includes('cnbc')) finalCnbcUrl = request.url();
  });
  try { await pageCNBC.goto('https://www.cnbcindonesia.com/tv', { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (err) {}
  await triggerVideo(pageCNBC, () => finalCnbcUrl);

  if (finalCnbcUrl) console.log('✅ CNBC Indonesia Tertangkap:', finalCnbcUrl);
  else console.log('❌ Gagal menangkap CNBC Indonesia');
  await pageCNBC.close();


  // ==========================================
  // AMBIL COOKIES & KIRIM KE WORKER
  // ==========================================
  const allCookies = await context.cookies();
  const detikCookies = allCookies
    .filter(c => c.domain.includes('detik.com'))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  console.log('\nMengirim data ke Cloudflare...');
  
  const payload = {};
  if (finalTrans7Url) payload.trans7_url = finalTrans7Url;
  if (finalTransTvUrl) payload.transtv_url = finalTransTvUrl;
  if (finalTrans7DetikUrl) payload.trans7_detik_url = finalTrans7DetikUrl;
  if (finalCnnUrl) payload.cnn_url = finalCnnUrl;
  if (finalCnbcUrl) payload.cnbc_url = finalCnbcUrl;
  if (detikCookies) payload.transtv_cookies = detikCookies;

  if (Object.keys(payload).length > 1 || (Object.keys(payload).length === 1 && !payload.transtv_cookies)) {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': secretKey
      },
      body: JSON.stringify(payload)
    });
    console.log('Status Worker:', response.status, await response.text());
  } else {
    console.log('⚠️ SEMUA URL GAGAL DIJARING PADA SESI INI.');
    console.log('🛡️ MENGABAIKAN UPDATE: Data lama di KV Worker aman dan tetap dipertahankan.');
  }

  await browser.close();
})();
