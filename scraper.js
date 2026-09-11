const { chromium } = require('playwright');

const sessionToken = process.env.SESSION_TOKEN;
const workerUrl = process.env.WORKER_URL; 
const secretKey = process.env.SECRET_KEY;

(async () => {
  if (!sessionToken || !workerUrl || !secretKey) {
    console.error("Gagal: Secret keys belum diset!");
    process.exit(1);
  }

  // TAMBAHAN: Mengizinkan Autoplay dan Mute Audio
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio'
    ]
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
    console.log('Halaman memuat lama, lanjut cek link...');
  }
  
  if (finalTrans7Url) console.log('✅ Trans 7 Tertangkap:', finalTrans7Url);
  await pageT7.close();


  // ==========================================
  // TUGAS 2: SCRAPE TRANS TV (DETIK)
  // ==========================================
  console.log('\n--- Membuka Trans TV (Detik) ---');
  const pageTTV = await context.newPage();
  
  pageTTV.on('request', request => {
    const url = request.url();
    if (url.includes('.m3u8') && url.includes('video.detik.com')) {
      finalTransTvUrl = url;
    }
  });

  try {
    await pageTTV.goto('https://20.detik.com/live/trans-tv', { waitUntil: 'domcontentloaded', timeout: 40000 });
    
    // TAMBAHAN: Scroll layar ke bawah (500 pixel) untuk memicu video player
    console.log('Scroll layar agar video player merespons...');
    await pageTTV.evaluate(() => window.scrollBy(0, 500));
    
    // Tunggu lebih lama agar Wowza Player memuat Token M3U8
    await pageTTV.waitForTimeout(12000); 
  } catch (err) {
    console.log('Halaman memuat lama, lanjut cek link...');
  }

  const allCookies = await context.cookies();
  const detikCookies = allCookies
    .filter(c => c.domain.includes('detik.com'))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  if (finalTransTvUrl) console.log('✅ Trans TV Tertangkap:', finalTransTvUrl);
  await pageTTV.close();


  // ==========================================
  // TUGAS 3: KIRIM SEMUANYA KE WORKER
  // ==========================================
  console.log('\nMengirim data ke Cloudflare...');
  const payload = {
    trans7_url: finalTrans7Url,
    transtv_url: finalTransTvUrl,
    transtv_cookies: detikCookies
  };

  const response = await fetch(workerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-secret-key': secretKey
    },
    body: JSON.stringify(payload)
  });
  
  console.log('Status Worker:', response.status, await response.text());

  await browser.close();
})();
