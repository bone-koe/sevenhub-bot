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
  
  // TAMBAHAN: Menyamar sebagai manusia menggunakan Google Chrome Windows sungguhan
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
      console.log('Tertangkap link M3U8:', url);
      m3u8Url = url;
    }
  });

  console.log('Membuka Sevenhub...');
  
  try {
    await page.goto('https://sevenhub.id/live', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(10000); 
    
    // PELACAKAN: Mari kita cek kita nyasar ke halaman mana
    console.log('================ DIAGNOSIS ================');
    console.log('URL Terakhir:', page.url());
    console.log('Judul Halaman:', await page.title());
    console.log('==========================================');

  } catch (err) {
    console.log('Halaman loading lambat.');
  }

  if (m3u8Url) {
    console.log('Mengirim link ke Cloudflare...');
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
