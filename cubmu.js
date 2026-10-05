const { chromium } = require('playwright');
const fs = require('fs');

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

function cleanChannelName(rawName) {
    if (!rawName) return "";
    let clean = rawName.toLowerCase().replace(/^live-tv-/i, '').trim();
    clean = clean.replace(/\b\w/g, char => char.toUpperCase());
    clean = clean.replace(/Cnn/g, 'CNN').replace(/Cnbc/g, 'CNBC').replace(/Tv/g, 'TV');
    return clean;
}

(async () => {
    console.log("🚀 Memulai ekstraksi daftar channel Cubmu dengan Autoplay Bypass...");
    
    const browser = await chromium.launch({ 
        headless: true,
        args: [
            '--autoplay-policy=no-user-gesture-required',
            '--mute-audio',
            '--disable-web-security'
        ]
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let allChannels = [];
    
    // Template Default yang sudah kadaluarsa (hanya sebagai cadangan jika sistem benar-benar gagal)
    let mpdTemplate = "https://cdnjktcyber05.transvision.co.id/riutx01-a823b93f0d45cabb0fba0e57ca612f86/dash/BASE64_SLUG/manifest.mpd";
    let tokenDitemukan = false;

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
        
        // Tangkap URL manifest.mpd ATAU live.mpd dari CDN Cubmu yang baru maupun lama
        if ((url.includes('.mpd')) && (url.includes('dash/'))) {
            if (!tokenDitemukan) {
                console.log(`\n✅ TOKEN BARU DITEMUKAN: ${url}`);
                // Ganti bagian slug unik di tengah dengan BASE64_SLUG agar bisa didaur ulang untuk semua channel
                mpdTemplate = url.replace(/\/dash\/[^\/]+\//, '/dash/BASE64_SLUG/');
                tokenDitemukan = true;
            }
        }
    });

    console.log("Membuka halaman web utama Cubmu...");
    await page.goto('https://www.cubmu.com/live-tv', { waitUntil: 'networkidle', timeout: 30000 });

    for (let i = 0; i < 20; i++) {
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(1000);
    }

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

    console.log("Membuka CNN Indonesia untuk mengambil token streaming...");
    try {
        await page.goto('https://www.cubmu.com/live-tv/212/cnn-indonesia', { waitUntil: 'networkidle', timeout: 30000 });
        // Tunggu 10 detik agar player sempat merespon file .mpd
        await page.waitForTimeout(10000); 
    } catch (e) {
        console.log("   [Peringatan] Timeout saat memuat CNN, token mungkin gagal ditangkap.");
    }

    if (!tokenDitemukan) {
        console.log("❌ GAGAL MENANGKAP TOKEN BARU. Playlist akan menggunakan template lama yang kadaluarsa.");
    }

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

    console.log(`\nMenulis ${uniqueChannels.length} channel ke file m3u...`);

    let playlist = "#EXTM3U\n\n";
    const CLEAR_KEY = "6ffb9c53af284fd590217ede1eba765e:4abf1fd26e8c45a5b6bae60cf6ffc2b9";

    uniqueChannels.forEach(ch => {
        let streamSlug = slugMap[ch.rawSearchKey];
        if (!streamSlug) {
            streamSlug = ch.name;
        }

        const base64Slug = Buffer.from(streamSlug).toString('base64').replace(/=+$/, '');
        // Pasang base64Slug ke template MPD yang kita tangkap
        const finalUrl = mpdTemplate.replace('BASE64_SLUG', base64Slug);

        playlist += `#EXTINF:-1 tvg-logo="${ch.logo}" group-title="${ch.group}", ${ch.name} [CUBMU]\n`;
        playlist += `#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)&Origin=https://www.cubmu.com&Referer=https://www.cubmu.com/\n`;
        playlist += `#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey\n`;
        playlist += `#KODIPROP:inputstream.adaptive.license_key=${CLEAR_KEY}\n`;
        playlist += `${finalUrl}\n\n`;
    });

    fs.writeFileSync('cubmu.m3u', playlist);
    console.log("🎉 SELESAI! cubmu.m3u berhasil diperbarui dengan token terbaru.");

    await browser.close();
})();
