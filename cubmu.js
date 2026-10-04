const { chromium } = require('playwright');
const fs = require('fs');

// KAMUS PINTAR: Pemetaan Nama Channel -> Kode Slug Internal Cubmu
const slugMap = {
    "trans tv": "TransTV",
    "trans 7": "TRANS7-my",
    "cnn indonesia": "CNNi-my",
    "cnbc indonesia": "CNBC-Indonesia",
    "metrotv": "MetroTV",
    "metro tv": "MetroTV",
    "tvone": "TVONE",
    "sctv": "SCTV-my",
    "indosiar": "Indosiar",
    "rcti": "RCTI-Channel",
    "gtv": "GTV-CHANNEL",
    "jaktv": "Jak tv Channel",
    "jak tv": "Jak tv Channel",
    "btv": "BTV Channel",
    "kompas tv": "Kompas TV",
    "mdtv": "MDTV",
    "rtv": "rtv Chnl",
    "mnc tv": "MNCTV",
    "tvri": "TVRI",
    "antv": "ANTV",
    "jtv": "jtv-Channel",
    "berita satu": "Berita Satu",
    "garuda tv": "Garuda TV",
    "golf plus id": "Golf-Channel",
    "football tv": "Football TV",
    "sports tv": "Sports TV",
    "xtrem sports": "Xtrem Sports",
    "speed tv": "Speed TV",
    "fight tv premium": "Fight TV Premium",
    "psj tv": "PSJ TV",
    "hbo hd": "HBO-my",
    "hbo hits": "HBO Hits",
    "hbo signature": "HBO-Signature-my",
    "hbo family": "HBO-Family-my",
    "cinemax": "Cinemax",
    "warner tv hd": "Warner TV",
    "axn hd": "AXN-my",
    "tvn movies": "TVN Movies",
    "celestial movies": "Celestial Movies",
    "bioskop indonesia": "Bioskop Indonesia",
    "thrill": "Thrill",
    "movies news": "Movies News",
    "cartoon network hd": "Cartoon Network",
    "cartoonito hd": "Cartoonito",
    "cartoon tv premium": "Cartoon TV Premium",
    "cartoon tv": "Cartoon TV",
    "dunia anak": "Dunia Anak",
    "cartoon tv classic": "Cartoon TV Classics",
    "travel tv": "Travel TV",
    "eat n go": "Eat N Go",
    "fashion tv": "Fashion TV",
    "cooking tv": "Cooking TV",
    "gaming tv": "Gaming TV",
    "dens food channel": "DENS Food Channel",
    "dens play channel": "DENS Play Channel",
    "superyacht tv": "Superyacht TV",
    "dens show bizz": "DENS ShowBizz",
    "knowledge+": "Knowledge+",
    "cgtn documentary": "CGTN Documentary",
    "!nsert": "insert-ch-scte35",
    "tvri sport": "TVRI Sport"
};

// Fungsi untuk merapikan nama (Hapus "live-tv-" dan Kapitalisasi Huruf Pertama)
function cleanChannelName(rawName) {
    if (!rawName) return "";
    let clean = rawName.toLowerCase().replace(/^live-tv-/i, '').trim();
    // Ubah huruf pertama setiap kata menjadi kapital (Contoh: "cnn indonesia" -> "Cnn Indonesia")
    clean = clean.replace(/\b\w/g, char => char.toUpperCase());
    // Pengecualian khusus (karena CNN lebih bagus kapital semua)
    clean = clean.replace(/Cnn/g, 'CNN').replace(/Cnbc/g, 'CNBC').replace(/Tv/g, 'TV');
    return clean;
}

(async () => {
    console.log("🚀 Memulai ekstraksi daftar channel Cubmu dengan Kamus Pintar...");
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    let allChannels = [];
    let cdnToken = "riutx01-a823b93f0d45cabb0fba0e57ca612f86";

    // Mencegat API Cubmu
    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('transvision.co.id/global/v')) {
            try {
                const json = await response.json();
                if (json && json.data && Array.isArray(json.data) && json.data.some(d => d.content_name)) {
                    allChannels.push(...json.data);
                }
            } catch (e) {}
        }
        if (url.includes('.mpd') && url.includes('riutx01')) {
            const match = url.match(/(riutx01-[^\/]+)/);
            if (match) {
                cdnToken = match[1];
            }
        }
    });

    console.log("Membuka halaman web utama Cubmu...");
    await page.goto('https://www.cubmu.com/live-tv', { waitUntil: 'networkidle', timeout: 30000 });

    for (let i = 0; i < 20; i++) {
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(1000);
    }

    // FALLBACK: Membaca gambar dari layar jika API diblokir Cloudflare GitHub Actions
    if (allChannels.length === 0) {
        console.log("⚠️ API Kosong. Membaca paksa nama channel dari layar HTML...");
        const domChannels = await page.$$eval('img', imgs => {
            return imgs.map(img => ({
                content_name: img.alt || '',
                content_image: img.src || '',
                genre_name: 'Live TV'
            })).filter(c => c.content_image.includes('channel_image') || c.content_image.includes('ott_image'));
        });
        allChannels.push(...domChannels);
    }

    console.log("Membuka CNN Indonesia untuk mengambil token sesi terbaru...");
    try {
        await page.goto('https://www.cubmu.com/live-tv/212/cnn-indonesia', { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(5000); 
    } catch (e) {
        console.log("   [Peringatan] Timeout saat memuat CNN, menggunakan token awal.");
    }

    // Bersihkan nama dari "live-tv-" dan hapus duplikat
    let uniqueChannels = [];
    let seen = new Set();

    allChannels.forEach(ch => {
        let rawName = ch.content_name || "";
        let cleanName = cleanChannelName(rawName);
        
        if (cleanName !== "" && !seen.has(cleanName)) {
            seen.add(cleanName);
            uniqueChannels.push({
                name: cleanName,
                logo: ch.content_image || ch.content_ott_image || "",
                group: ch.genre_name || "Live TV",
                rawSearchKey: rawName.toLowerCase().replace(/^live-tv-/i, '').trim()
            });
        }
    });

    console.log(`\n✅ Berhasil mendapatkan ${uniqueChannels.length} channel unik!`);

    if (uniqueChannels.length === 0) {
        console.log("❌ Gagal. Proses dibatalkan.");
        await browser.close();
        return;
    }

    let playlist = "#EXTM3U\n\n";
    const CLEAR_KEY = "6ffb9c53af284fd590217ede1eba765e:4abf1fd26e8c45a5b6bae60cf6ffc2b9";

    uniqueChannels.forEach(ch => {
        // 1. Cari kode rahasia di Kamus Pintar berdasarkan nama
        let streamSlug = slugMap[ch.rawSearchKey];
        
        // 2. Jika channel benar-benar BARU & tidak ada di kamus, kita coba gunakan namanya langsung
        if (!streamSlug) {
            streamSlug = ch.name;
        }

        // 3. Konversi ke Base64 (Karena format m3u8 Transvision mensyaratkan Base64)
        const base64Slug = Buffer.from(streamSlug).toString('base64').replace(/=+$/, '');

        playlist += `#EXTINF:-1 tvg-logo="${ch.logo}" group-title="${ch.group}", ${ch.name} [CUBMU]\n`;
        playlist += `#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)&Origin=https://www.cubmu.com&Referer=https://www.cubmu.com/\n`;
        playlist += `#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey\n`;
        playlist += `#KODIPROP:inputstream.adaptive.license_key=${CLEAR_KEY}\n`;
        playlist += `https://cdnjktcyber05.transvision.co.id/${cdnToken}/dash/${base64Slug}/manifest.mpd\n\n`;
    });

    fs.writeFileSync('cubmu.m3u', playlist);
    console.log("🎉 SELESAI! cubmu.m3u berhasil ditulis ulang dengan rapi dan akurat.");

    await browser.close();
})();
