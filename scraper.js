const { chromium } = require('playwright');

const sessionToken = process.env.SESSION_TOKEN;
const workerUrl = process.env.WORKER_URL; 
const secretKey = process.env.SECRET_KEY;

(async () => {
  if (!sessionToken || !workerUrl || !secretKey) {
    console.error("Gagal: Secret keys belum diset!");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  
  // Menyamar sebagai Chrome Windows
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  // Inject cookie untuk Trans 7 (Sevenhub)
  await context.addCookies([{
      name: '__Secure-next-auth.session-token',
      value: sessionToken,
      domain: 'sevenhub.id',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax'
  }]);

  // VARIABEL PENAMPUNG
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
    console.log('Timeout Sevenhub, lanjut...');
  }
  
  if (finalTrans7Url) console.log('✅ Trans 7 Tertangkap:', finalTrans7Url);
  await pageT7.close(); // Tutup tab Trans 7


  // ==========================================
  // TUGAS 2: SCRAPE TRANS TV (DETIK)
  // ==========================================
  console.log('\n--- Membuka Trans TV (Detik) ---');
  const pageTTV = await context.newPage();
  
  pageTTV.on('request', request => {
    const url = request.url();
    // Tangkap link m3u8 dari video.detik.com
    if (url.includes('.m3u8') && url.includes('video.detik.com')) {
      finalTransTvUrl = url;
    }
  });

  try {
    await pageTTV.goto('https://20.detik.com/live/trans-tv', { waitUntil: 'domcontentloaded', timeout: 40000 });
    await pageTTV.waitForTimeout(8000); // Tunggu video player Wowza loading
  } catch (err) {
    console.log('Timeout Detik, lanjut...');
  }

  // AMBIL COOKIES DARI BROWSER (Untuk Trans TV)
  const allCookies = await context.cookies();
  // Filter hanya cookie milik detik.com, lalu jadikan format string key=value;
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
