const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    console.log("🚀 Memulai proses pembaruan otomatis daftar channel Cubmu...");
    
    const browser = await chromium.launch({ headless: true });
    
    // 1. MENGAKALI DETEKSI BOT: Gunakan User-Agent asli PC
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    let allChannels = [];
    let cdnToken = "riutx01-a823b93f0d45cabb0fba0e57ca612f86";

    page.on('response', async (response) => {
        const url = response.url();
        
        // Jaring API diperlebar: Tangkap SEMUA JSON dari Transvision
        if (url.includes('transvision.co.id/global/v')) {
            try {
                const json = await response.json();
                if (json && json.data && Array.isArray(json.data)) {
                    // Pastikan yang ditangkap adalah data channel (ada atribut content_name)
                    const isChannelList = json.data.some(d => d.content_name);
                    if (isChannelList) {
                        allChannels.push(...json.data);
                    }
                }
            } catch (e) {}
        }

        // Tangkap token riutx01
        if (url.includes('.mpd') && url.includes('riutx01')) {
            const match = url.match(/(riutx01-[^\/]+)/);
            if (match) {
                cdnToken = match[1];
            }
        }
    });

    console.log("Membuka halaman utama Live TV untuk memindai channel...");
    await page.goto('https://www.cubmu.com/live-tv', { waitUntil: 'networkidle', timeout: 30000 });

    // Scroll ke bawah perlahan agar semua gambar channel dimuat penuh
    for (let i = 0; i < 20; i++) {
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(1000);
    }

    // 2. METODE FALLBACK (RENCANA B)
    // Jika API ternyata tetap kosong/diblokir, kita ambil nama dari gambar di layar
    if (allChannels.length === 0) {
        console.log("⚠️ API tidak merespons! Mengaktifkan metode Fallback (DOM Scraping)...");
        const domChannels = await page.$$eval('img', imgs => {
            return imgs.map(img => ({
                content_name: img.alt || '',
                content_image: img.src || '',
                genre_name: 'Live TV' // Kategori default untuk fallback
            })).filter(c => c.content_image.includes('channel_image') || c.content_image.includes('ott_image'));
        });
        allChannels.push(...domChannels);
    }

    console.log("Membuka CNN Indonesia sejenak untuk memancing kunci token stream...");
    try {
        await page.goto('https://www.cubmu.com/live-tv/212/cnn-indonesia', { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(5000); 
    } catch (e) {
        console.log("   [Peringatan] Timeout saat memuat CNN, menggunakan token cadangan.");
    }

    // Bersihkan data kosong dan hapus duplikat channel
    const uniqueChannels = allChannels.filter((v, i, a) => {
        if (!v.content_name || v.content_name.trim() === '') return false; // Buang data tanpa nama
        return a.findIndex(t => (t.content_name === v.content_name)) === i;
    });

    console.log(`\n✅ Berhasil mengekstrak ${uniqueChannels.length} channel unik dari sistem Cubmu!`);
    console.log(`🔑 Token CDN yang digunakan: ${cdnToken}\n`);

    if (uniqueChannels.length === 0) {
        console.log("❌ Gagal mendapatkan daftar channel dari web. Proses dibatalkan.");
        await browser.close();
        return;
    }

    let playlist = "#EXTM3U\n\n";
    const CLEAR_KEY = "6ffb9c53af284fd590217ede1eba765e:4abf1fd26e8c45a5b6bae60cf6ffc2b9";

    uniqueChannels.forEach(ch => {
        const base64Slug = Buffer.from(ch.content_name).toString('base64').replace(/=+$/, '');
        const logo = ch.content_image || ch.content_ott_image || "";
        const group = ch.genre_name || "Live TV";

        playlist += `#EXTINF:-1 tvg-logo="${logo}" group-title="${group}", ${ch.content_name} [CUBMU]\n`;
        playlist += `#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)&Origin=https://www.cubmu.com&Referer=https://www.cubmu.com/\n`;
        playlist += `#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey\n`;
        playlist += `#KODIPROP:inputstream.adaptive.license_key=${CLEAR_KEY}\n`;
        playlist += `https://cdnjktcyber05.transvision.co.id/${cdnToken}/dash/${base64Slug}/manifest.mpd\n\n`;
    });

    fs.writeFileSync('cubmu.m3u', playlist);
    console.log("🎉 SELESAI! cubmu.m3u berhasil ditulis.");

    await browser.close();
})();
