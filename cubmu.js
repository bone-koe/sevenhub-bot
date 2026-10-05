const { chromium } = require('playwright');
const fs = require('fs');

// KAMUS PINTAR YANG SUDAH DISEMPURNAKAN 100%
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
    "knowledge+": "Knowledge+",
    "cgtn documentary": "CGTN Documentary",
    "!nsert": "insert-ch-scte35",
    "tvri sport": "TVRI Sport",

    // PERBAIKAN TOTAL HASIL TEMUAN:
    "al quran al kareem": "alquranalkareem",
    "k+": "kpluschannel",
    "cctv4": "CCTV 4",
    "superyacht tv": "SuperYacht TV",
    "dens show bizz": "DENS ShowBiz",
    "abc australia": "ABC Australia",
    "channel newsasia": "Channel NewsAsia",
    "cgtn": "CGTN Channel",
    "tvmu": "tv Mu Channel",
    "tv9": "TV9 Channel",
    "daystar": "Daystar Chnl",
    "daai tv": "DAAI TV",
    "spesial dunia lain": "Spesial Dunia Lain",
    "hope channel": "HopeChannel",

    // SPESIAL FOLDER /dashx/
    "tvn movies": { slug: "TVN Movies", path: "dashx" },
    "tvn": { slug: "tvNChannel", path: "dashx" },
    "nhk world premium": { slug: "NHK World Premium", path: "dashx" }
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
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    let allChannels = [];
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
        
        if ((url.includes('.mpd')) && (url.includes('dash/'))) {
            if (!tokenDitemukan) {
                console.log(`\n✅ TOKEN BARU DITEMUKAN: ${url}`);
                let tempUrl = url.replace(/\/dash\/[^\/]+\//, '/dash/BASE64_SLUG/');
                mpdTemplate = tempUrl.split('?')[0]; 
                console.log(`🧹 URL Bersih Tanpa Signature: ${mpdTemplate}`);
                tokenDitemukan = true;
            }
        }
    });

    console.log("Membuka halaman web utama Cubmu...");
    await page.goto('https://www.cubmu.com/live-tv', { waitUntil: 'networkidle', timeout: 30000 });

    for (let i = 0; i < 10; i++) {
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(500);
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

    console.log("Mencari tombol / gambar CNN Indonesia di layar untuk diklik...");
    try {
        const cnnLocator = page.locator('img[alt*="cnn" i]').first();
        if (await cnnLocator.count() > 0) {
            await cnnLocator.scrollIntoViewIfNeeded();
            await cnnLocator.click({ force: true });
            console.log("✅ Berhasil mengklik CNN Indonesia. Menunggu pemutar video merespons (10 detik)...");
            await page.waitForTimeout(10000); 
        } else {
            console.log("❌ Gambar CNN tidak ditemukan. Mencoba klik channel pertama secara acak...");
            const firstCh = page.locator('img[alt*="live-tv-" i]').first();
            await firstCh.scrollIntoViewIfNeeded();
            await firstCh.click({ force: true });
            await page.waitForTimeout(10000);
        }
    } catch (e) {
        console.log("   [Peringatan] Gagal melakukan klik: ", e.message);
    }

    if (!tokenDitemukan) {
        console.log("❌ GAGAL MENANGKAP TOKEN BARU. File tidak akan berubah secara signifikan.");
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

    // PERSIAPAN WAKTU WIB (Waktu Indonesia Barat)
    const now = new Date();
    const wibTime = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(now);

    let playlist = "#EXTM3U\n";
    playlist += `# LAST-UPDATED: ${wibTime} WIB\n\n`;

    const CLEAR_KEY = "6ffb9c53af284fd590217ede1eba765e:4abf1fd26e8c45a5b6bae60cf6ffc2b9";

    uniqueChannels.forEach(ch => {
        let streamSlug = slugMap[ch.rawSearchKey];
        let customPath = "dash"; // Bawaan standar

        // Jika channel memakai folder khusus (dashx)
        if (streamSlug && typeof streamSlug === 'object') {
            customPath = streamSlug.path;
            streamSlug = streamSlug.slug;
        } else if (!streamSlug) {
            streamSlug = ch.name;
        }

        const base64Slug = Buffer.from(streamSlug).toString('base64').replace(/=+$/, '');
        
        // Merakit URL akhir
        let finalUrl = mpdTemplate.replace('BASE64_SLUG', base64Slug);
        if (customPath === 'dashx') {
            finalUrl = finalUrl.replace('/dash/', '/dashx/');
        }

        playlist += `#EXTINF:-1 tvg-logo="${ch.logo}" group-title="${ch.group}", ${ch.name} [CUBMU]\n`;
        playlist += `#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)&Origin=https://www.cubmu.com&Referer=https://www.cubmu.com/\n`;
        playlist += `#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey\n`;
        playlist += `#KODIPROP:inputstream.adaptive.license_key=${CLEAR_KEY}\n`;
        playlist += `${finalUrl}\n\n`;
    });

    fs.writeFileSync('cubmu.m3u', playlist);
    console.log("🎉 SELESAI! cubmu.m3u berhasil diperbarui dan dipoles sempurna.");

    await browser.close();
})();
