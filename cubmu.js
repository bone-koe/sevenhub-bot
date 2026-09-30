const { chromium } = require('playwright');
const fs = require('fs');

const sessionToken = process.env.SESSION_TOKEN; 

(async () => {
  console.log('--- Memulai Scraping Dinamis Seluruh Channel Cubmu ---');
  const browser = await chromium.launch({ 
    headless: true, 
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-gpu', '--no-sandbox'] 
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  // Blokir iklan
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('doubleclick.net') || url.includes('google-analytics') || url.includes('googlesyndication')) {
        route.abort(); 
    } else {
        route.continue(); 
    }
  });

  if (sessionToken) {
    await context.addCookies([{
        name: '__Secure-next-auth.session-token',
        value: sessionToken,
        domain: 'cubmu.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax'
    }]);
  }

  const page = await context.newPage();
  const channelsData = {}; 
  let currentUrlBeingScraped = '';

  // 1. PENYADAP MPD
  page.on('request', request => {
    const url = request.url();
    if (url.includes('.mpd')) {
        if (!channelsData[currentUrlBeingScraped]) channelsData[currentUrlBeingScraped] = {};
        channelsData[currentUrlBeingScraped].mpd = url;
        console.log(`[+] MPD Ditemukan: ${url.split('?')[0]}`);
    }
  });

  // 2. PENYADAP CLEARKEY (Akan otomatis mengekstrak key yang berbeda-beda dari tiap respon jaringan)
  page.on('response', async response => {
      const resourceType = response.request().resourceType();
      if (resourceType === 'fetch' || resourceType === 'xhr') {
          try {
              const body = await response.text();
              // Membaca file JSON lisensi DRM yang dikirim server
              if (body.includes('"keys"') && body.includes('"kty"')) {
                  const data = JSON.parse(body);
                  if (data.keys && data.keys.length > 0) {
                      // Decode dari Base64URL menjadi HEX
                      const kid = Buffer.from(data.keys[0].kid.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('hex');
                      const k = Buffer.from(data.keys[0].k.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('hex');
                      const fullKey = `${kid}:${k}`;
                      
                      if (!channelsData[currentUrlBeingScraped]) channelsData[currentUrlBeingScraped] = {};
                      channelsData[currentUrlBeingScraped].clearkey = fullKey;
                      console.log(`[+] Kunci DRM Ditemukan: ${fullKey}`);
                  }
              }
          } catch (e) {}
      }
  });

  // Langkah 1: Buka halaman utama Live TV
  console.log('Membuka halaman Live TV Cubmu...');
  await page.goto('https://www.cubmu.com/live-tv', { waitUntil: 'networkidle', timeout: 60000 }).catch(()=>{});
  await page.waitForTimeout(5000); 
  
  // Langkah 2: Ekstrak semua URL channel dari halaman
  console.log('Mengekstrak daftar channel...');
  let hrefs = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.map(a => a.href).filter(href => href.includes('/watch/live-tv/'));
  });
  
  let uniqueChannels = [...new Set(hrefs)];

  // Langkah Cadangan
  if (uniqueChannels.length === 0) {
      console.log('Menggunakan fallback manual...');
      uniqueChannels = [
          'https://www.cubmu.com/watch/live-tv/201-trans-7',
          'https://www.cubmu.com/watch/live-tv/210-trans-tv'
      ];
  }

  // Langkah 3: Nonton setiap channel satu per satu
  for (let i = 0; i < uniqueChannels.length; i++) {
      currentUrlBeingScraped = uniqueChannels[i];
      let cleanName = currentUrlBeingScraped.split('/').pop().replace(/^\d+-/, '').replace(/-/g, ' ').toUpperCase();
      
      console.log(`\n[${i+1}/${uniqueChannels.length}] Menonton: ${cleanName}`);
      
      await page.goto(currentUrlBeingScraped, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
      
      // Tunggu 5 detik agar player Playwright memutar video, sehingga menyetrum MPD & Key muncul
      await page.waitForTimeout(5000); 
  }
  
  await page.close();
  await browser.close();

  // ==========================================
  // MENYUSUN M3U
  // ==========================================
  console.log('\n--- Menyusun File cubmu.m3u ---');
  let m3uContent = '#EXTM3U url-tvg="https://github.com/apistech/project/raw/refs/heads/main/epgs/guide.xml.gz" refresh="3600"\n\n';

  for (const [url, data] of Object.entries(channelsData)) {
      if (data.mpd && data.clearkey) {
          let rawName = url.split('/').pop();
          let channelName = rawName.replace(/^\d+-/, '').replace(/-/g, ' ').toUpperCase();

          m3uContent += `#EXTINF:-1 tvg-id="${channelName}.id@SD" group-title="Cubmu",${channelName}\n`;
          m3uContent += `#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)&Origin=https://www.cubmu.com&Referer=https://www.cubmu.com/\n`;
          m3uContent += `#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey\n`;
          // Menggunakan key dinamis dari server
          m3uContent += `#KODIPROP:inputstream.adaptive.license_key=${data.clearkey}\n`;
          m3uContent += `${data.mpd}\n\n`;
      }
  }

  fs.writeFileSync('cubmu.m3u', m3uContent);
  console.log(`✅ Selesai! File cubmu.m3u berhasil dibuat dengan ${Object.keys(channelsData).length} channel!`);
})();
