const { chromium } = require('playwright');

const sessionToken = process.env.SESSION_TOKEN;
const workerUrl = process.env.WORKER_URL; 
const secretKey = process.env.SECRET_KEY;

(async () => {
  if (!sessionToken || !workerUrl || !secretKey) {
    console.error("Gagal: Secret keys belum diset di GitHub Settings!");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  
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
    // Ganti networkidle menjadi domcontentloaded dan naikkan timeout jadi 60 detik
    await page.goto('https://sevenhub.id/live', { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Beri waktu 10 detik agar player video sempat loading dan mengirim link M3U8
    console.log('Menunggu 10 detik agar video player merespons...');
    await page.waitForTimeout(10000); 
  } catch (err) {
    console.log('Catatan: Halaman loading agak lama, tapi kita cek apakah M3U8 sudah tertangkap...');
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
    console.error('Gagal menemukan link m3u8. Token mungkin expired.');
  }

  await browser.close();
})();
