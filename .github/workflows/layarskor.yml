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

  // 1. Ambil semua pertandingan
  console.log('Mencari daftar jadwal pertandingan...');
  let matches = await page.$$eval('a[href^="/watch/rb-"]', nodes => {
    return nodes.map(n => {
      const url = n.href;
      let title = "";
      let league = "";

      const titleSpan = n.querySelector('span[title]');
      if (titleSpan) {
        title = titleSpan.getAttribute('title');
        const leagueSpan = n.querySelector('.truncate');
        if (leagueSpan) league = leagueSpan.innerText.trim();
      } else {
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

  matches = [...new Map(matches.map(item => [item.url, item])).values()];
  console.log(`Ditemukan total ${matches.length} pertandingan di beranda.`);

  // -----------------------------------------------------------
  // FILTER SUPER AKURAT: LIGA INDONESIA
  // -----------------------------------------------------------
  matches = matches.filter(match => {
    const searchString = (match.league + " " + match.title).toLowerCase();
    
    // Harus secara eksplisit menyebut Indonesia
    const isIndoLeague = searchString.includes('indonesi');
    
    // Atau nama Klub Liga 1 / Liga 2
    const isIndoClub = searchString.match(/persib|persija|persebaya|arema|psm makassar|bali united|persis|psis|borneo|bhayangkara|rans nusantara|dewa united|persita|persik|barito|madura|psms|sriwijaya/i);
    
    return isIndoLeague || isIndoClub;
  });

  console.log(`====================================================`);
  console.log(`🎯 Mengerucut menjadi ${matches.length} pertandingan LIGA INDONESIA.`);
  console.log(`====================================================`);

  // 2. Buka dan Cegat M3U8
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    console.log(`\n[${i + 1}/${matches.length}] Membuka: ${match.title} (${match.league})`);
    
    try {
      const requestHandler = (request) => {
        const reqUrl = request.url();
        if (reqUrl.includes('.m3u8')) {
          match.m3u8 = reqUrl;
        }
      };
      
      page.on('request', requestHandler);
      await page.goto(match.url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(3000); // Tunggu rangka web muncul
      
      // AUTO CLICKER: Mencari kotak Iframe video lalu mengklik tengah layarnya
      // Ini penting untuk "membangunkan" pemutar video bajakan yang butuh di-klik
      try {
        const iframe = await page.$('iframe');
        if (iframe) {
            console.log('  --> Iframe ditemukan, mencoba klik untuk memancing video...');
            const box = await iframe.boundingBox();
            if(box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
      } catch (e) {
        // Abaikan jika tidak ada iframe
      }

      // Tunggu sisa waktu loading untuk mencegat request
      await page.waitForTimeout(7000); 
      page.off('request', requestHandler);

      if (match.m3u8) {
        console.log(`  ✅ Sukses! M3U8 ditangkap.`);
      } else {
        console.log(`  ❌ Gagal (Pertandingan mungkin belum mulai / server mati).`);
      }
    } catch (e) {
      console.log(`  ⚠️ Error membuka halaman.`);
    }
  }

  await browser.close();

  // 3. Susun File
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
