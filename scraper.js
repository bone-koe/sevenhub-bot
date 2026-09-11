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
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
  let finalTrans7DetikUrl = null; // Penampung baru untuk Trans 7 Detik

  // ==========================================
  // TUGAS 1: SCRAPE TRANS 7 (SEVENHUB)
  // ==========================================
  console.log('--- Membuka Trans 7 (Sevenhub) ---');
  const pageT7 = await context.newPage();
  pageT7.on('request', request => {
    const url = request.url();
    if (url.includes('.m3u8') && url.includes('dmcdn.net')) {
      finalTrans7Url = url.replace(/live-\d+\.m3u8/, 'live-720.m3u8');
    }
  });

  try {
    await pageT7.goto('https://sevenhub.id/live', { waitUntil: 'domcontentloaded', timeout: 40000 });
    await pageT7.waitForTimeout(5000); 
  } catch (err) {
    console.log('Timeout Sevenhub, lanjut...');
  }
  if (finalTrans7Url) console.log('✅ Trans 7 (Sevenhub) Tertangkap');
  await pageT7.close();


  // ==========================================
  // TUGAS 2: SCRAPE TRANS TV (DETIK)
  // ==========================================
  console.log('\n--- Membuka Trans TV (Detik) ---');
  const pageTTV = await context.newPage();
  pageTTV.on('request', request => {
    const url = request.url();
    if (url.includes('.m3u8') && url.includes('video.detik.com') && url.includes('chunklist')) {
      finalTransTvUrl = url;
    }
  });

  try {
    await pageTTV.goto('https://20.detik.com/live/trans-tv', { waitUntil: 'domcontentloaded', timeout: 40000 });
    await pageTTV.evaluate(() => window.scrollBy(0, 500));
    await pageTTV.waitForTimeout(12000); 
  } catch (err) {
    console.log('Timeout Trans TV, lanjut...');
  }
  if (finalTransTvUrl) console.log('✅ Trans TV (Detik) Tertangkap');
  await pageTTV.close();


  // ==========================================
  // TUGAS 3: SCRAPE TRANS 7 (DETIK)
  // ==========================================
  console.log('\n--- Membuka Trans 7 (Detik) ---');
  const pageT7D = await context.newPage();
  pageT7D.on('request', request => {
    const url = request.url();
    if (url.includes('.m3u8') && url.includes('video.detik.com') && url.includes('chunklist')) {
      finalTrans7DetikUrl = url;
    }
  });

  try {
    await pageT7D.goto('https://20.detik.com/live/trans-7', { waitUntil: 'domcontentloaded', timeout: 40000 });
    await pageT7D.evaluate(() => window.scrollBy(0, 500));
    await pageT7D.waitForTimeout(12000); 
  } catch (err) {
    console.log('Timeout Trans 7 Detik, lanjut...');
  }
  if (finalTrans7DetikUrl) console.log('✅ Trans 7 (Detik) Tertangkap');
  await pageT7D.close();


  // ==========================================
  // AMBIL COOKIES & KIRIM KE WORKER 1
  // ==========================================
  const allCookies = await context.cookies();
  const detikCookies = allCookies
    .filter(c => c.domain.includes('detik.com'))
    .filter(c => c.value.length < 100) // Filter cookie sampah
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  console.log('\nMengirim data ke Cloudflare...');
  const payload = {
    trans7_url: finalTrans7Url,
    transtv_url: finalTransTvUrl,
    trans7_detik_url: finalTrans7DetikUrl, // Data baru!
    transtv_cookies: detikCookies 
  };

  const response = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-secret-key': secretKey },
    body: JSON.stringify(payload)
  });
  
  console.log('Status Worker:', response.status);
  await browser.close();
})();
