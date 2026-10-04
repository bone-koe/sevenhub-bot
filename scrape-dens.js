const { chromium } = require('playwright');
const fs = require('fs');

// Daftar kategori dari web Dens.TV
const categories = [
    { url: 'https://www.dens.tv/tv-local', group: 'Local Channels' },
    { url: 'https://www.dens.tv/tv-premium', group: 'Premium Channels' },
    { url: 'https://www.dens.tv/tv-international', group: 'International Channels' },
    { url: 'https://www.dens.tv/tv-free-streaming', group: 'Free Streaming Channels' }
];

(async () => {
    console.log("🚀 Memulai ekstraksi masal semua channel Dens.TV...\n");
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let playlist = "#EXTM3U\n\n";
    let allChannels = [];

    // TAHAP 1: Scraping daftar channel dari tiap halaman kategori
    for (const cat of categories) {
        console.log(`📂 Memindai kategori: ${cat.group}...`);
        await page.goto(cat.url, { waitUntil: 'domcontentloaded' });
        
        // Ambil semua elemen link yang mengarah ke halaman menonton
        const channels = await page.$$eval('a[href*="/watch/"]', (links, groupName) => {
            return links.map(a => {
                const href = a.href;
                // Ambil gambar logo jika ada
                const img = a.querySelector('img');
                const logo = img ? img.src : '';
                
                // Rapikan nama dari ujung URL (contoh: /watch/6/metro-tv -> Metro Tv)
                const slug = href.split('/').pop();
                const name = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                
                return { url: href, name, logo, group: groupName };
            });
        }, cat.group);

        // Filter duplikat agar tidak ada channel ganda
        const uniqueChannels = channels.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);
        console.log(`   Ditemukan ${uniqueChannels.length} channel.`);
        allChannels.push(...uniqueChannels);
    }

    console.log(`\nTotal keseluruhan channel yang akan diekstrak: ${allChannels.length}`);
    console.log("Mulai melakukan 'Fast Sniffing' m3u8...\n");

    // TAHAP 2: Buka satu per satu secara kilat untuk mendapatkan m3u8
    for (let i = 0; i < allChannels.length; i++) {
        const ch = allChannels[i];
        process.stdout.write(`[${i + 1}/${allChannels.length}] Menangkap ${ch.name}... `);

        const m3u8Url = await new Promise(async (resolve) => {
            let isFound = false;
            
            // Fungsi penjebak request jaringan
            const requestHandler = (request) => {
                const reqUrl = request.url();
                if (reqUrl.includes('.m3u8')) {
                    isFound = true;
                    page.removeListener('request', requestHandler); // Matikan sensor agar tidak spam
                    
                    // Paksa selalu menggunakan /index.m3u8 (kualitas adaptif)
                    const baseUrl = reqUrl.substring(0, reqUrl.lastIndexOf('/'));
                    resolve(baseUrl + '/index.m3u8');
                }
            };

            page.on('request', requestHandler);

            try {
                // Buka halaman secara asinkron tanpa menunggu aset visual selesai dimuat
                page.goto(ch.url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(()=>{});
                
                // Polling cepat: Cek setiap 500ms, maksimal tunggu 10 detik (20 * 500ms)
                // Jika sudah ketemu, langsung break agar bisa lompat ke channel berikutnya!
                for(let w = 0; w < 20; w++) { 
                    if(isFound) break;
                    await page.waitForTimeout(500);
                }
            } catch (e) { }

            if (!isFound) {
                page.removeListener('request', requestHandler);
                resolve(null);
            }
        });

        if (m3u8Url) {
            console.log("✅ Sukses");
            // Format M3U lengkap dengan logo dan kategori
            playlist += `#EXTINF:-1 tvg-logo="${ch.logo}" group-title="${ch.group}", ${ch.name} [DENS]\n`;
            playlist += `${m3u8Url}\n\n`;
        } else {
            console.log("❌ Gagal / DRM Blocked");
        }
    }

    // TAHAP 3: Simpan Hasil
    fs.writeFileSync('dens_all.m3u', playlist);
    console.log("\n🎉 SELESAI! Seluruh channel berhasil dibungkus di dalam file 'dens_all.m3u'");

    await browser.close();
})();
