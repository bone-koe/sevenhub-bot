const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('Memulai Playwright untuk LayarSkor...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // 1. LANGSUNG MENUJU HALAMAN KOLEKSI LIGA INDONESIA
  const targetUrl = 'https://linklayarskortv.courses/collection/indonesian-super-league';
  console.log(`Mengunjungi halaman koleksi khusus: ${targetUrl}`);
  
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch(e) {
    console.log('Halaman utama agak lambat, tapi kita paksa lanjut...');
  }
  
  await page.waitForTimeout(3000);

  // 2. Ambil Semua Pertandingan di Halaman Tersebut
  console.log('Mencari daftar jadwal pertandingan...');
  let matches = await page.$$eval('a[href*="/watch/rb-"]', nodes => {
    return nodes.map(n => {
      const url = n.href;
      let title = "";
      
      const teamSpans = n.querySelectorAll('span.block.break-words.line-clamp-1, span.line-clamp-2');
      if (teamSpans.length >= 2) {
         title = `${teamSpans[0].innerText.trim()} vs ${teamSpans[1].innerText.trim()}`;
      } else {
         title = n.innerText.replace(/\n/g, ' ').substring(0, 50); // Fallback nama
      }
      return { title, url, m3u8: null };
    });
  });

  matches = [...new Map(matches.map(item => [item.url, item])).values()];
  console.log(`====================================================`);
  console.log(`🎯 Ditemukan ${matches.length} pertandingan LIGA INDONESIA.`);
  console.log(`====================================================`);

  // 3. Buka Halaman dan Cegat M3U8
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    console.log(`\n[${i + 1}/${matches.length}] Membuka: ${match.title}`);
    
    // Fungsi Pendeteksi M3U8
    const requestHandler = (request) => {
      const reqUrl = request.url();
      // Cegat m3u8 yang BUKAN merupakan video iklan/offline bawaan server
      if (reqUrl.includes('.m3u8') && !reqUrl.includes('offline') && !reqUrl.includes('videolx')) {
        match.m3u8 = reqUrl;
      }
    };
    
    page.on('request', requestHandler);
    
    try {
      // Menggunakan 'commit' agar tidak mudah timeout jika web streamingnya sedang berat
      await page.goto(match.url, { waitUntil: 'commit', timeout: 20000 });
    } catch (e) {
      console.log(`  ⏳ Info: Halaman berat/timeout, tapi kita coba paksa tangkap m3u8-nya...`);
    }

    await page.waitForTimeout(3000); 
    
    // AUTO CLICKER: Memancing video dengan klik paksa di area Iframe
    try {
      const iframe = await page.$('iframe');
      if (iframe) {
          const box = await iframe.boundingBox();
          if(box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
    } catch (e) {}

    // Tunggu selama 8 detik agar jaringan sempat memuat m3u8
    await page.waitForTimeout(8000); 
    page.off('request', requestHandler);

    if (match.m3u8) {
      console.log(`  ✅ Sukses! M3U8 ditangkap: ${match.m3u8}`);
    } else {
      console.log(`  ❌ Gagal (Pertandingan mungkin belum mulai atau tidak ada tombol play).`);
    }
  }

  await browser.close();

  // 4. Susun Menjadi File M3U
  console.log('\nMenyusun file M3U...');
  let m3uContent = "#EXTM3U\n";
  let count = 0;

  for (const match of matches) {
    if (match.m3u8) {
      m3uContent += `#EXTINF:-1 group-title="Liga Indonesia",${match.title}\n`;
      m3uContent += `#EXTVLCOPT:http-referrer=https://linklayarskortv.courses/\n`;
      m3uContent += `#EXTVLCOPT:http-origin=https://linklayarskortv.courses\n`;
      m3uContent += `${match.m3u8}\n`;
      count++;
    }
  }

  if (count === 0) {
      m3uContent += `#EXTINF:-1 group-title="Info",Tidak ada Siaran Liga Indonesia saat ini\n`;
      m3uContent += `https://raw.githubusercontent.com/tsender57-dotcom/offline/refs/heads/main/logo/offline.m3u8\n`;
  }

  fs.writeFileSync('layarskor.m3u', m3uContent);
  console.log(`\n🎉 Selesai! Berhasil menyimpan ${count} link M3U8.`);
})();
