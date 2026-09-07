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

  const page = await context.newPage();
  let m3u8Url = null;

  page.on('request', request => {
    const url = request.url();
    if (url.includes('.m3u8') && url.includes('dmcdn.net')) {
      // Manipulasi string: Paksa berapapun resolusi yang ditangkap menjadi 720p
      const hdUrl = url.replace(/live-\d+\.m3u8/, 'live-720.m3u8');
      console.log('Tertangkap link M3U8, memutakhirkan ke HD:', hdUrl);
      m3u8Url = hdUrl;
    }
  });

  console.log('Membuka Sevenhub...');
  
  try {
    await page.goto('https://sevenhub.id/live', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(10000); 
  } catch (err) {
    console.log('Halaman loading lambat, melanjutkan proses...');
  }

  if (m3u8Url) {
    console.log('Mengirim link HD ke Cloudflare...');
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': secretKey
      },
      body: JSON.stringify({ m3u8_url: m3u8Url })
    });
    console.log('Status Worker:', response.status, await response.text());
  } else {
    console.error('Gagal menemukan link m3u8.');
  }

  await browser.close();
})();
