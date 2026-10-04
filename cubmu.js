const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    console.log("🚀 Memulai proses pembaruan otomatis daftar channel Cubmu...");
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    let allChannels = [];
    let cdnToken = "riutx01-a823b93f0d45cabb0fba0e57ca612f86"; // Token cadangan awal

    // 1. Menangkap data dari sistem internal (API) Cubmu di balik layar
    page.on('response', async (response) => {
        const url = response.url();
        
        // Menangkap data channel-channel baru dari API kategori
        if (url.includes('channel-in-section') || url.includes('channel-list')) {
            try {
                const json = await response.json();
                if (json && json.data && Array.isArray(json.data)) {
                    allChannels.push(...json.data);
                }
            } catch (e) {
                // Abaikan jika respons bukan JSON valid
            }
        }

        // Menangkap token sesi stream (riutx01) terbaru saat video berputar
        if (url.includes('.mpd') && url.includes('riutx01')) {
            const match = url.match(/(riutx01-[^\/]+)/);
            if (match) {
                cdnToken = match[1];
            }
        }
    });

    console.log("Membuka halaman utama Live TV untuk memindai channel...");
    await page.goto('https://www.cubmu.com/live-tv', { waitUntil: 'networkidle', timeout: 30000 });

    // Melakukan scroll ke bawah agar seluruh kategori channel ikut dimuat (Lazy-Loading)
    for (let i = 0; i < 15; i++) {
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(800);
    }

    console.log("Membuka CNN Indonesia sejenak untuk memancing kunci token stream...");
    try {
        // Membuka CNN untuk mengambil Token riutx01 secara dinamis
        await page.goto('https://www.cubmu.com/live-tv/212/cnn-indonesia', { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(5000); // Beri waktu sampai player meminta file .mpd
    } catch (e) {
        console.log("   [Peringatan] Timeout saat memuat CNN, menggunakan token cadangan.");
    }

    // Menghapus channel duplikat (karena 1 channel bisa muncul di kategori 'Populer' & 'Nasional')
    const uniqueChannels = allChannels.filter((v, i, a) => a.findIndex(t => (t.content_name === v.content_name)) === i);
    console.log(`\n✅ Berhasil mengekstrak ${uniqueChannels.length} channel unik dari sistem Cubmu!`);
    console.log(`🔑 Token CDN yang digunakan: ${cdnToken}\n`);

    if (uniqueChannels.length === 0) {
        console.log("❌ Gagal mendapatkan daftar channel dari web. Proses dibatalkan.");
        await browser.close();
        return;
    }

    // 2. Memproses Data Menjadi File M3U
    let playlist = "#EXTM3U\n\n";
    // ClearKey statis standar (Sesuai dengan riwayat skrip Anda)
    const CLEAR_KEY = "6ffb9c53af284fd590217ede1eba765e:4abf1fd26e8c45a5b6bae60cf6ffc2b9";

    uniqueChannels.forEach(ch => {
        // Otomatis mengubah nama channel jadi URL stream (Base64 tanpa padding '=' di akhir)
        // Contoh: "Dunia Anak" otomatis diubah jadi "RHVuaWEgQW5haw"
        const base64Slug = Buffer.from(ch.content_name).toString('base64').replace(/=+$/, '');
        
        const logo = ch.content_image || ch.content_ott_image || "";
        const group = ch.genre_name || "Lainnya";

        playlist += `#EXTINF:-1 tvg-logo="${logo}" group-title="${group}", ${ch.content_name} [CUBMU]\n`;
        playlist += `#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)&Origin=https://www.cubmu.com&Referer=https://www.cubmu.com/\n`;
        playlist += `#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey\n`;
        playlist += `#KODIPROP:inputstream.adaptive.license_key=${CLEAR_KEY}\n`;
        playlist += `https://cdnjktcyber05.transvision.co.id/${cdnToken}/dash/${base64Slug}/manifest.mpd\n\n`;
    });

    fs.writeFileSync('cubmu.m3u', playlist);
    console.log("🎉 SELESAI! cubmu.m3u berhasil ditulis dengan seluruh susunan channel terbaru.");

    await browser.close();
})();
