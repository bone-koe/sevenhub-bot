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
  await page.goto('https://linklayarskortv.courses/', { waitUntil: 'networkidle', timeout: 60000 });

  // 1. Ambil semua elemen link pertandingan di beranda beserta Judul dan Liganya
  console.log('Mencari daftar jadwal pertandingan...');
  let matches = await page.$$eval('a[href^="/watch/rb-"]', nodes => {
    return nodes.map(n => {
      const url = n.href;
      let title = "";
      let league = "";

      // Mode 1: Coba cari dari atribut title (biasanya ada di menu sidebar)
      const titleSpan = n.querySelector('span[title]');
      if (titleSpan) {
        title = titleSpan.getAttribute('title');
        const leagueSpan = n.querySelector('.truncate');
        if (leagueSpan) league = leagueSpan.innerText.trim();
      } 
      // Mode 2: Cari dari Card Grid Utama
      else {
        const teamSpans = n.querySelectorAll('span.block.break-words.line-clamp-1');
        if (teamSpans.length >= 2) {
           title = `${teamSpans[0].innerText.trim()} vs ${teamSpans[1].innerText.trim()}`;
        }
        const leagueP = n.querySelector('div.border-t p');
        if (leagueP) league = leagueP.innerText.trim();
      }

      if (!title) title = 'Pertandingan Live';
      
      return { title, url, league, m3u8: null };
    });
  });

  // Hapus duplikat URL
  matches = [...new Map(matches.map(item => [item.url, item])).values()];
  console.log(`Ditemukan total ${matches.length} pertandingan di beranda.`);

  // -----------------------------------------------------------
  // FILTER SUPER KETAT: HANYA LIGA INDONESIA
  // -----------------------------------------------------------
  matches = matches.filter(match => {
    const searchString = (match.league + " " + match.title).toLowerCase();
    return searchString.includes('indonesi') || // Meng-cover "Indonesian Championship"
           searchString.includes('liga 1') || 
           searchString.includes('liga 2') ||
           searchString.includes('persib') ||
           searchString.includes('persija');
  });

  console.log(`====================================================`);
  console.log(`🎯 Mengerucut menjadi ${matches.length} pertandingan LIGA INDONESIA.`);
  console.log(`====================================================`);

  // 2. Buka satu per satu HANYA untuk pertandingan Indonesia yang terpilih
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    console.log(`\n[${i + 1}/${matches.length}] Membuka: ${match.title} (${match.league})`);
    
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
      
      // Tunggu 8 detik (diperpanjang sedikit agar aman menangkap m3u8)
      await page.waitForTimeout(8000); 
      page.off('request', requestHandler);

      if (match.m3u8) {
        console.log(`  ✅ Sukses! M3U8 ditangkap.`);
      } else {
        console.log(`  ❌ Gagal (Mungkin belum mulai / butuh play manual / tidak ada siaran).`);
      }
    } catch (e) {
      console.log(`  ⚠️ Error membuka halaman: ${e.message}`);
    }
  }

  await browser.close();

  // 3. Susun menjadi file M3U murni
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

  // Fallback jika kosong
  if (count === 0) {
      m3uContent += `#EXTINF:-1 group-title="Info",Tidak ada Siaran Liga Indonesia saat ini\n`;
      m3uContent += `https://raw.githubusercontent.com/tsender57-dotcom/offline/refs/heads/main/logo/offline.m3u8\n`;
  }

  // Tulis hasilnya menjadi file 'layarskor.m3u'
  fs.writeFileSync('layarskor.m3u', m3uContent);
  console.log(`\n🎉 Selesai! Berhasil menyimpan ${count} link M3U8 ke layarskor.m3u.`);
})();
