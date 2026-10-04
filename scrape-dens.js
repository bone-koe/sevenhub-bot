const { chromium } = require('playwright');
const fs = require('fs');

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

    // TAHAP 1: Kumpulkan Daftar Channel
    for (const cat of categories) {
        console.log(`📂 Memindai kategori: ${cat.group}...`);
        
        // PERBAIKAN: Gunakan 'networkidle' agar bot menunggu JavaScript Dens.TV selesai memproses halaman
        await page.goto(cat.url, { waitUntil: 'networkidle', timeout: 30000 });
        
        // PERBAIKAN: Secara eksplisit perintahkan bot mencari elemen channel, tunggu maksimal 15 detik
        try {
            await page.waitForSelector('a[href*="/watch/"]', { timeout: 15000 });
            await page.waitForTimeout(2000); // Ekstra jeda 2 detik agar seluruh gambar logo ikut termuat
        } catch (e) {
            console.log("   [Peringatan] Loading halaman lambat atau kategori sedang kosong.");
        }
        
        const channels = await page.$$eval('a[href*="/watch/"]', (links, groupName) => {
            return links.map(a => {
                const href = a.href;
                const img = a.querySelector('img');
                const logo = img ? img.src : '';
                const slug = href.split('/').pop();
                const name = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                
                return { url: href, name, logo, group: groupName };
            });
        }, cat.group);

        const uniqueChannels = channels.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);
        console.log(`   Ditemukan ${uniqueChannels.length} channel.`);
        allChannels.push(...uniqueChannels);
    }

    console.log(`\nTotal keseluruhan channel yang akan diekstrak: ${allChannels.length}`);
    
    // Hentikan jika ternyata masih gagal mengambil channel
    if (allChannels.length === 0) {
        console.log("❌ Gagal merender daftar channel. Website mungkin mendeteksi bot, batalkan proses.");
        await browser.close();
        return;
    }

    console.log("Mulai melakukan 'Fast Sniffing' m3u8...\n");

    // TAHAP 2: Menangkap URL m3u8 satu per satu
    for (let i = 0; i < allChannels.length; i++) {
        const ch = allChannels[i];
        process.stdout.write(`[${i + 1}/${allChannels.length}] Menangkap ${ch.name}... `);

        const m3u8Url = await new Promise(async (resolve) => {
            let isFound = false;
            
            const requestHandler = (request) => {
                const reqUrl = request.url();
                if (reqUrl.includes('.m3u8')) {
                    isFound = true;
                    page.removeListener('request', requestHandler);
                    const baseUrl = reqUrl.substring(0, reqUrl.lastIndexOf('/'));
                    resolve(baseUrl + '/index.m3u8');
                }
            };

            page.on('request', requestHandler);

            try {
                // Gunakan mode load standard, jalankan asinkron
                page.goto(ch.url, { waitUntil: 'load', timeout: 15000 }).catch(()=>{});
                
                // Polling cek m3u8, maksimal tunggu 15 detik (30 x 500ms) per channel
                for(let w = 0; w < 30; w++) { 
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
            playlist += `#EXTINF:-1 tvg-logo="${ch.logo}" group-title="${ch.group}", ${ch.name} [DENS]\n`;
            playlist += `${m3u8Url}\n\n`;
        } else {
            console.log("❌ Gagal / Timeout");
        }
    }

    // TAHAP 3: Simpan Hasil
    fs.writeFileSync('dens_all.m3u', playlist);
    console.log("\n🎉 SELESAI! Seluruh channel berhasil dibungkus di dalam file 'dens_all.m3u'");

    await browser.close();
})();
