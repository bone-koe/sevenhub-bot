const { chromium } = require('playwright');
const fs = require('fs');

const sessionToken = process.env.SESSION_TOKEN; 

(async () => {
  console.log('--- Memulai Scraping Cepat (Pencurian Token CDN dari CNN) ---');
  const browser = await chromium.launch({ 
    headless: true, 
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-gpu', '--no-sandbox'] 
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  if (sessionToken) {
    await context.addCookies([{ name: '__Secure-next-auth.session-token', value: sessionToken, domain: 'cubmu.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  }

  const page = await context.newPage();
  let baseUrl = '';

  // Tangkap URL MPD
  page.on('request', request => {
    const url = request.url();
    if (url.includes('.mpd') && url.includes('/dash/')) {
        const match = url.match(/(https:\/\/[^\/]+\/riutx01-[^\/]+\/dash\/)/);
        if (match && !baseUrl) {
            baseUrl = match[1];
            console.log(`\n[+] BERHASIL MENDAPATKAN TOKEN CDN: ${baseUrl}`);
        }
    }
  });

  // Urutan Target: Tembak CNN Indonesia dulu, kalau web error lompat ke channel berita lain
  const fallbackUrls = [
      'https://www.cubmu.com/watch/live-tv/211-cnn-indonesia',
      'https://www.cubmu.com/watch/live-tv/213-cnbc-indonesia',
      'https://www.cubmu.com/watch/live-tv/211-metro-tv',
      'https://www.cubmu.com/watch/live-tv/363-tvone'
  ];

  for (let url of fallbackUrls) {
      console.log(`\nMencoba memancing token dari: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
      
      // Tunggu maksimal 15 detik per channel
      for(let i=0; i<15; i++){
          await page.waitForTimeout(1000);
          if(baseUrl) break;
      }
      
      if (baseUrl) break; // Token didapat, langsung keluar dari loop
      console.log(`[-] Gagal mendapatkan token dari ${url}, mencoba channel lain...`);
  }
  
  await page.close();
  await browser.close();

  if (!baseUrl) {
      console.error('❌ GAGAL FATAL: Server Cubmu tidak merespons atau sedang maintenance.');
      process.exit(1);
  }

  // ==========================================
  // DATABASE CHANNEL (Full 57 Channel)
  // ==========================================
  const channels = [
    // TV Nasional
    { name: "Trans TV", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/d5048b36-efb9-426f-b735-7a1ab9e3e7f4.jpg", code: "VHJhbnNUVg" },
    { name: "Trans 7", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/8ea35a10-0840-492e-8201-83daf40d8225.jpg", code: "VFJBTlM3LW15" },
    { name: "CNN Indonesia", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/df14d47b-e9d7-4265-8e2c-8ac28c29cb3f.jpg", code: "Q05OaS1teQ" },
    { name: "CNBC Indonesia", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/ea2f3817-add8-44b7-b222-664cacd221ca.jpg", code: "Q05CQy1JbmRvbmVzaWE" },
    { name: "MetroTV", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/cfc9d256-0421-447e-9aae-431db3de77c3.png", code: "TWV0cm9UVg" },
    { name: "TVOne", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/930c8097-dc6b-4161-b414-d7a70b0b8b98.png", code: "VFZPTkU" },
    { name: "SCTV", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/d9cafe05-1183-4b33-a315-51a1fb42b2bc.png", code: "U0NUVi1teQ" },
    { name: "Indosiar", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/f86ac7c8-ed6b-4d19-9be2-1d3fdf3e97a3.png", code: "SW5kb3NpYXI" },
    { name: "RCTI", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/cfe78d70-6bbe-47a4-8175-0e5f43fc9ef7.png", code: "UkNUSS1DaGFubmVs" },
    { name: "GTV", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/419ddbb6-dc83-4e1a-89e6-13c6c9422577.png", code: "R1RWLUNIQU5ORUw" },
    { name: "JakTV", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/912d53a1-8222-40e0-8e97-affb43129850.jpg", code: "SmFrIHR2IENoYW5uZWw" },
    { name: "BTV", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/240aa9e1-110f-450e-af68-9f202002b4e9.png", code: "QlRWIENoYW5uZWw" },
    { name: "Kompas TV", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/f0771c7b-d473-4fa4-ad0f-cdffd4bc0ac5.jpg", code: "S29tcGFzIFRW" },
    { name: "MDTV", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/d3167d38-bcc3-44e9-b658-057beda535c4.png", code: "TURUVg" },
    { name: "Rtv", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/f4bd6cd9-d8a5-4f42-8dce-7f332ec55940.jpg", code: "cnR2IENobmw" },
    { name: "MNC TV", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/788c4e9e-363d-47f7-9ef5-6ee1d9dd2619.png", code: "TU5DVFY" },
    { name: "TVRI", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/6e55c83f-b399-4884-8b57-273acb663344.png", code: "VFZSSQ" },
    { name: "ANTV", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/804a0414-edd9-4e16-bd7e-1fbb593525ec.png", code: "QU5UVg" },
    { name: "jtv", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/87b521be-283d-465d-b3af-8280eda34f0a.png", code: "anR2LUNoYW5uZWw" },
    { name: "Berita Satu", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/86edd2be-b5c2-4c9b-8ac9-1a6ee5c3b94e.png", code: "QmVyaXRhIFNhdHU" },
    { name: "Garuda TV", group: "TV Nasional", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/dc7d7072-39d4-4978-bc34-4e7654fe4469.jpg", code: "R2FydWRhIFRW" },

    // Olahraga
    { name: "Golf Plus ID", group: "Olahraga", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/e5009dc7-2cae-4c8a-aa38-36bc224f7b8b.jpg", code: "R29sZi1DaGFubmVs" },
    { name: "Football TV", group: "Olahraga", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/df2bdc3d-9bc6-43ca-a4e6-2002d47fdac1.jpg", code: "Rm9vdGJhbGwgVFY" },
    { name: "Sports TV", group: "Olahraga", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/f974ea07-54bf-4463-854a-fbbe51a70cc3.jpg", code: "U3BvcnRzIFRW" },
    { name: "Xtrem Sports", group: "Olahraga", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/17f217c6-7009-45de-a54e-e7b15fa5f061.jpg", code: "WHRyZW0gU3BvcnRz" },
    { name: "Speed TV", group: "Olahraga", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/8e4b7fc8-624a-4d99-ae7c-a75ed13ede9a.jpg", code: "U3BlZWQgVFY" },
    { name: "Fight TV Premium", group: "Olahraga", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/65030d16-c4fc-4c89-9b03-1b809797964f.jpg", code: "RmlnaHQgVFYgUHJlbWl1bQ" },
    { name: "PSJ TV", group: "Olahraga", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/71b87cc7-a431-4ceb-a819-21c84c07b295.jpg", code: "UFNKIFRW" },

    // Film
    { name: "HBO HD", group: "Film", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/82af014b-3c24-4ae7-9b3f-02922774fa39.png", code: "SEJPLW15" },
    { name: "HBO Hits", group: "Film", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/01789118-6828-410f-aae9-53d4a684bc64.png", code: "SEJPIEhpdHM" },
    { name: "HBO Signature", group: "Film", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/3e48d990-c181-4ef4-90a3-1e2c5709d465.png", code: "SEJPLVNpZ25hdHVyZS1teQ" },
    { name: "HBO Family", group: "Film", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/434873a2-10b6-4447-950e-f8e62fe2589f.png", code: "SEJPLUZhbWlseS1teQ" },
    { name: "Cinemax", group: "Film", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/09fd84f1-c869-4dec-8a07-2b5d99847b71.png", code: "Q2luZW1heA" },
    { name: "Warner TV HD", group: "Film", logo: "http://cdrs2-mediaott.sysln.id:8080/STBWEBVIEWADS/urlinfo/ui3/channel_logo_icon/114.png", code: "V2FybmVyIFRW" },
    { name: "AXN HD", group: "Film", logo: "http://cdrs2-mediaott.sysln.id:8080/STBWEBVIEWADS/urlinfo/ui3/channel_logo_icon/2.png", code: "QVhOLW15" },
    { name: "TVN Movies", group: "Film", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/1371ddca-87d4-4f9e-8cf7-c6e8ca9a444b.png", code: "VFZOIE1vdmllcw" },
    { name: "Celestial Movies", group: "Film", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/f124427a-931e-47d1-ab50-1b29a7a3e406.jpg", code: "Q2VsZXN0aWFsIE1vdmllcw" },
    { name: "Bioskop Indonesia", group: "Film", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/5613ec24-ed04-42e5-917b-dee0e0ec074a.png", code: "Qmlvc2tvcCBJbmRvbmVzaWE" },
    { name: "Thrill", group: "Film", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/6bec4b1b-262f-44e0-821f-a3897ce93251.jpg", code: "VGhyaWxs" },
    { name: "Movies News", group: "Film", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/8c6fb1a8-44f6-4d20-9093-fb4bb93bc5cd.jpg", code: "TW92aWVzIE5ld3M" },

    // Anak
    { name: "Cartoon Network HD", group: "Anak", logo: "http://cdrs2-mediaott.sysln.id:8080/STBWEBVIEWADS/urlinfo/ui3/channel_logo_icon/296.png", code: "Q2FydG9vbiBOZXR3b3Jr" },
    { name: "Cartoonito HD", group: "Anak", logo: "http://cdrs2-mediaott.sysln.id:8080/STBWEBVIEWADS/urlinfo/ui3/channel_logo_icon/321.png", code: "Q2FydG9vbml0bw" },
    { name: "Cartoon TV Premium", group: "Anak", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/6e735e2f-e7db-47ec-b13b-23d3a0342124.jpg", code: "Q2FydG9vbiBUViBQcmVtaXVt" },
    { name: "Cartoon TV", group: "Anak", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/9e422d53-5c00-49ea-8422-e2a3f1e03f70.jpg", code: "Q2FydG9vbiBUVg" },
    { name: "Dunia Anak", group: "Anak", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/76e39ba2-62b9-4f96-90ae-3de803edb400.png", code: "RHVuaWEgQW5haw" },
    { name: "Cartoon TV Classic", group: "Anak", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/87c43b67-b234-41a8-b188-ae6b498a40b4.jpg", code: "Q2FydG9vbiBUViBDbGFzc2ljcw" },

    // Gaya Hidup
    { name: "Travel TV", group: "Gaya Hidup", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/9a3142d7-c566-476f-b6f8-d0d7350b2733.jpg", code: "VHJhdmVsIFRW" },
    { name: "Eat N Go", group: "Gaya Hidup", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/2c888072-873a-4b67-b104-27f7ee5caa63.png", code: "RWF0IE4gR28" },
    { name: "Fashion TV", group: "Gaya Hidup", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/edc764c8-f879-4c80-aa9e-b7ba8bff73f7.jpg", code: "RmFzaGlvbiBUVg" },
    { name: "Cooking TV", group: "Gaya Hidup", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/ded16232-f41b-418d-a666-c0c2a502e348.jpg", code: "Q29va2luZyBUVg" },
    { name: "Gaming TV", group: "Gaya Hidup", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/dcbc4bc6-19c3-4719-9ee7-587aa3edffea.jpg", code: "R2FtaW5nIFRW" },
    { name: "DENS Food Channel", group: "Gaya Hidup", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/2dbb1a79-69ac-4b91-9e9a-1d42e79963b5.jpg", code: "REVOUyBGb29kIENoYW5uZWw" },
    { name: "DENS Play Channel", group: "Gaya Hidup", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/2e8b912a-015c-41c4-97bf-ea248c0b35e0.jpg", code: "REVOUyBQbGF5IENoYW5uZWw" },
    { name: "Superyacht TV", group: "Gaya Hidup", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/eaa4d0a4-af9f-4fc6-96a7-5d9427a9d41a.jpg", code: "U3VwZXJZYWNodCBUVg" },
    { name: "DENS Show Bizz", group: "Gaya Hidup", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/a06f0dd7-751f-442a-98bc-e6cad4b4f18d.jpg", code: "REVOUyBTaG93Qml6" },

    // Edukasi
    { name: "Knowledge+", group: "Edukasi", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/4dbae785-6fc6-4e6a-b3aa-7753cced105b.jpg", code: "S25vd2xlZGdlKw" },
    { name: "CGTN Documentary", group: "Edukasi", logo: "https://servicebuss.transvision.co.id/hospitality/v1/files/channel_image/f779de19-b7cd-4f39-b332-fbe9eb399ec6.jpg", code: "Q0dUTiBEb2N1bWVudGFyeQ" }
  ];

  console.log(`\n--- Merakit File cubmu.m3u (${channels.length} Channel) ---`);
  let m3uContent = '#EXTM3U\n\n';

  // Semuanya dipukul rata pakai URL Cubmu dan Headers Kodi
  for (const ch of channels) {
      m3uContent += `#EXTINF:-1 tvg-logo="${ch.logo}" group-title="${ch.group}", ${ch.name} [CUBMU]\n`;
      m3uContent += `#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)&Origin=https://www.cubmu.com&Referer=https://www.cubmu.com/\n`;
      m3uContent += `#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey\n`;
      m3uContent += `#KODIPROP:inputstream.adaptive.license_key=6ffb9c53af284fd590217ede1eba765e:4abf1fd26e8c45a5b6bae60cf6ffc2b9\n`;
      m3uContent += `${baseUrl}${ch.code}/manifest.mpd\n\n`;
  }

  fs.writeFileSync('cubmu.m3u', m3uContent);
  console.log(`✅ File cubmu.m3u berhasil dibuat dengan Token dari CNN!`);
})();
