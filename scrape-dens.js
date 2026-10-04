// =====================================================================
//  Dens.TV M3U Generator (tanpa Playwright - langsung via API resmi web)
//  Output: dens_all.m3u
// =====================================================================
const fs = require('fs');

const BASE = 'https://www.dens.tv';
const OUTPUT = 'dens_all.m3u';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ID kategori diambil dari variabel "tvCategories" di halaman dens.tv/tv-local
const CATEGORIES = [
    { id: 1,  slug: 'local',          group: 'Local Channels' },
    { id: 2,  slug: 'premium',        group: 'Premium Channels' },
    { id: 3,  slug: 'international',  group: 'International Channels' },
    { id: 13, slug: 'free-streaming', group: 'Free Streaming Channels' }
];

const HEADERS = {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Referer': `${BASE}/tv-local`,
    'Origin': BASE
};

async function fetchWithTimeout(url, options = {}, ms = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Ambil semua channel dalam 1 kategori (ikut paginasi "linknext" bila ada)
async function getChannelsByCategory(cat) {
    const results = [];
    let url = `${BASE}/api/dens3/tv/TvChannels/listByCategory?id_category=${cat.id}`;
    let guard = 0;

    while (url && guard < 20) {
        guard++;
        let json = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const res = await fetchWithTimeout(url, { headers: HEADERS });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                json = await res.json();
                break;
            } catch (e) {
                console.log(`   ⚠️  Percobaan ${attempt}/3 gagal: ${e.message}`);
                if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
            }
        }

        if (!json || !json.success || !json.data) break;

        const contents = Array.isArray(json.data.contents) ? json.data.contents : [];
        for (const item of contents) {
            const meta = item.meta || {};
            const live = meta.videos && meta.videos.live;
            if (!live) continue;
            results.push({
                id: meta.id,
                name: (meta.title || meta.slug || 'Unknown').trim(),
                slug: meta.slug || '',
                logo: (meta.images && meta.images.default) || '',
                url: live,
                rights: item.rules ? item.rules.rights : null,
                group: cat.group
            });
        }

        const next = json.data.linknext;
        url = next ? (next.startsWith('http') ? next : new URL(next, BASE).toString()) : null;
    }

    return results;
}

// Cek apakah stream benar-benar hidup (harus membalas playlist #EXTM3U)
async function checkStream(url) {
    try {
        const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, 'Referer': `${BASE}/` } }, 10000);
        if (!res.ok) return false;
        const text = await res.text();
        return text.includes('#EXTM3U');
    } catch {
        return false;
    }
}

// Jalankan pengecekan paralel dengan batas jumlah koneksi
async function runPool(items, limit, worker) {
    const out = new Array(items.length);
    let idx = 0;
    const runners = Array.from({ length: limit }, async () => {
        while (idx < items.length) {
            const i = idx++;
            out[i] = await worker(items[i], i);
        }
    });
    await Promise.all(runners);
    return out;
}

(async () => {
    console.log('🚀 Mengambil daftar channel Dens.TV via API...\n');

    let all = [];
    for (const cat of CATEGORIES) {
        console.log(`📂 Kategori: ${cat.group} (id=${cat.id})`);
        const list = await getChannelsByCategory(cat);
        console.log(`   Ditemukan ${list.length} channel.`);
        all.push(...list);
    }

    // Buang duplikat berdasarkan URL stream
    all = all.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i);
    console.log(`\nTotal channel dari API: ${all.length}`);

    // Pengaman: jangan timpa playlist lama dengan file kosong
    if (all.length === 0) {
        console.log('❌ API tidak mengembalikan channel (kemungkinan diblokir/maintenance). File lama TIDAK ditimpa.');
        process.exit(1);
    }

    console.log('\n🔎 Mengecek status setiap stream...\n');
    const status = await runPool(all, 8, async (ch, i) => {
        const ok = await checkStream(ch.url);
        console.log(`[${String(i + 1).padStart(2, '0')}/${all.length}] ${ok ? '✅' : '❌'} ${ch.name}`);
        return ok;
    });

    const alive = all.filter((_, i) => status[i]);
    console.log(`\nStream hidup: ${alive.length}/${all.length}`);

    // Jika semua gagal dicek (misal server runner diblokir CDN), tetap tulis semua channel
    const finalList = alive.length > 0 ? alive : all;
    if (alive.length === 0) {
        console.log('⚠️  Semua cek stream gagal dari server ini, semua channel tetap dimasukkan.');
    }

    let m3u = '#EXTM3U\n\n';
    for (const ch of finalList) {
        m3u += `#EXTINF:-1 tvg-id="dens-${ch.id}" tvg-logo="${ch.logo}" group-title="${ch.group}", ${ch.name} [DENS]\n`;
        m3u += `#EXTVLCOPT:http-user-agent=${UA}\n`;
        m3u += `#EXTVLCOPT:http-referrer=${BASE}/\n`;
        m3u += `${ch.url}\n\n`;
    }

    fs.writeFileSync(OUTPUT, m3u);
    console.log(`\n🎉 SELESAI! ${finalList.length} channel disimpan ke '${OUTPUT}'`);
})();
