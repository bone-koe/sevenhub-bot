const { chromium } = require('playwright');
const fs = require('fs');

const sessionToken = process.env.SESSION_TOKEN; // Jika Live TV Cubmu wajib login

const LOGO_TRANS7 = "https://raw.githubusercontent.com/apistech/project/refs/heads/main/logo/image_ch_trans7.png";
const LOGO_TRANSTV = "https://raw.githubusercontent.com/apistech/project/refs/heads/main/logo/image_ch_transtv.png";

(async () => {
  console.log('--- Memulai Scraping Cubmu (GitHub Actions) ---');
  const browser = await chromium.launch({ 
    headless: true, 
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-gpu'] 
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  await context.route('**/*', route => {
    const url = route.request().url();
    const adDomains = ['doubleclick.net', 'googlesyndication.com', 'google-analytics.com'];
    if (adDomains.some(domain => url.includes(domain))) route.abort(); 
    else route.continue(); 
  });

  // Jika butuh login cookie
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

  let trans7 = { mpd: null, clearkey: null };
  let transtv = { mpd: null, clearkey: null };
  let activeChannel = 'UNKNOWN';

  const page = await context.newPage();
  
  // 1. Penyadap MPD
  page.on('request', request => {
    const url = request.url();
    if (url.includes('.mpd')) {
        if (url.includes('VFJBTlM3') || url.toLowerCase().includes('trans7')) {
            trans7.mpd = url; activeChannel = 'TRANS7';
        } else if (url.includes('VFJBTlNUV') || url.includes('VFJBTlMgVFY')) {
            transtv.mpd = url; activeChannel = 'TRANSTV';
        }
    }
  });

  // 2. Penyadap ClearKey
  page.on('response', async response => {
      if (response.request().resourceType() === 'fetch' || response.request().resourceType() === 'xhr') {
          try {
              const body = await response.text();
              if (body.includes('"keys"') && body.includes('"kty"')) {
                  const data = JSON.parse(body);
                  if (data.keys && data.keys.length > 0) {
                      const kid = Buffer.from(data.keys[0].kid.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('hex');
                      const k = Buffer.from(data.keys[0].k.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('hex');
                      const finalKey = `${kid}:${k}`;
                      
                      if (activeChannel === 'TRANS7') trans7.clearkey = finalKey;
                      else if (activeChannel === 'TRANSTV') transtv.clearkey = finalKey;
                  }
              }
          } catch (e) {}
      }
  });

  await page.goto('https://www.cubmu.com/live-tv', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
  
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, 500)).catch(()=>{});
    await page.waitForTimeout(2500); 
    if ((trans7.mpd && trans7.clearkey) || (transtv.mpd && transtv.clearkey)) break; 
  }
  
  await page.close();
  await browser.close();

  // ==========================================
  // MENYIMPAN KE FILE .M3U LOKAL (cubmu.m3u)
  // ==========================================
  console.log('--- Membuat File cubmu.m3u ---');
  let m3uContent = '#EXTM3U url-tvg="https://github.com/apistech/project/raw/refs/heads/main/epgs/guide.xml.gz" refresh="3600"\n\n';

  if (trans7.mpd && trans7.clearkey) {
      m3uContent += `#EXTINF:-1 tvg-id="Trans7.id@SD" group-title="Nasional" tvg-logo="${LOGO_TRANS7}",Trans7\n`;
      m3uContent += `#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)&Origin=https://www.cubmu.com&Referer=https://www.cubmu.com/\n`;
      m3uContent += `#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey\n`;
      m3uContent += `#KODIPROP:inputstream.adaptive.license_key=${trans7.clearkey}\n`;
      m3uContent += `${trans7.mpd}\n\n`;
  }

  if (transtv.mpd && transtv.clearkey) {
      m3uContent += `#EXTINF:-1 tvg-id="TransTV.id@SD" group-title="Nasional" tvg-logo="${LOGO_TRANSTV}",TransTV\n`;
      m3uContent += `#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)&Origin=https://www.cubmu.com&Referer=https://www.cubmu.com/\n`;
      m3uContent += `#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey\n`;
      m3uContent += `#KODIPROP:inputstream.adaptive.license_key=${transtv.clearkey}\n`;
      m3uContent += `${transtv.mpd}\n\n`;
  }

  // File ini akan ditangkap oleh GitHub Actions dan di-push ke Repository Anda
  fs.writeFileSync('cubmu.m3u', m3uContent);
  console.log('✅ File cubmu.m3u berhasil dibuat!');
})();
