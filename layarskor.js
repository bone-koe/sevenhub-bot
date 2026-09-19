const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('Memulai Playwright untuk LayarSkor...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  console.log('Mengunjungi halaman utama LayarSkor...');
  await page.goto('https://linklayarskortv.courses/', { waitUntil: 'networkidle' });

  // 1. Ambil semua elemen link pertandingan di beranda
  console.log('Mencari daftar jadwal pertandingan...');
  let matches = await page.$$eval('a[href^="/watch/rb-"]', nodes => {
    return nodes.map(n => {
      const url = n.href;
      const titleSpan = n.querySelector('span[title]');
      const title = titleSpan ? titleSpan.getAttribute('title') : 'Pertandingan Live';
      return { title, url, m3u8: null };
    });
  });

  // Hapus duplikat pertandingan
  matches = [...new Map(matches.map(item => [item.url, item])).values()];
  console.log(`Ditemukan ${matches.length} pertandingan unik.`);

  // 2. Buka satu per satu untuk mendapatkan M3U8
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    console.log(`[${i + 1}/${matches.length}] Membuka: ${match.title}`);
    
    try {
      // Fungsi pendeteksi M3U8 dari lalu lintas jaringan
      const requestHandler = (request) => {
        const reqUrl = request.url();
        if (reqUrl.includes('.m3u8')) {
          match.m3u8 = reqUrl;
        }
      };
      
      page.on('request', requestHandler);
      await page.goto(match.url, { waitUntil: 'load', timeout: 30000 });
      
      // Tunggu 6 detik agar iframe ter-load otomatis dan request M3U8 terpancing
      await page.waitForTimeout(6000); 
      page.off('request', requestHandler);

      if (match.m3u8) {
        console.log(`  --> Sukses! M3U8 ditangkap.`);
      } else {
        console.log(`  --> Gagal (Belum mulai / butuh play manual).`);
      }
    } catch (e) {
      console.log(`  --> Error membuka halaman.`);
    }
  }

  await browser.close();

  // 3. Susun menjadi file M3U murni
  console.log('Menyusun file M3U...');
  let m3uContent = "#EXTM3U\n";
  let count = 0;

  for (const match of matches) {
    if (match.m3u8) {
      m3uContent += `#EXTINF:-1 group-title="Layarskor Live",${match.title}\n`;
      m3uContent += `#EXTVLCOPT:http-referrer=https://linklayarskortv.courses/\n`;
      m3uContent += `#EXTVLCOPT:http-origin=https://linklayarskortv.courses\n`;
      m3uContent += `${match.m3u8}\n`;
      count++;
    }
  }

  if (count === 0) {
      m3uContent += `#EXTINF:-1 group-title="Info",Tidak ada Siaran Live saat ini\n`;
      m3uContent += `https://raw.githubusercontent.com/tsender57-dotcom/offline/refs/heads/main/logo/offline.m3u8\n`;
  }

  // Tulis hasilnya dengan nama baru
  fs.writeFileSync('layarskor.m3u', m3uContent);
  console.log('Selesai! File layarskor.m3u berhasil dibuat/diperbarui.');
})();
