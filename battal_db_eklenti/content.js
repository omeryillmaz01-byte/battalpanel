/* ════════════════════════════════════════════════════════════
   BATTAL · Defter Beyan + Uyumsoft Kontrol — v2
   - Defter Beyan: gider kontrol (mukerrer/KDV/OIV) + Uyumsoft capraz eslestirme
   - Uyumsoft: gelen faturalari cek, eklenti hafizasina kaydet
   Salt-okuma: hicbir kayit eklenmez/silinmez.
   ──────────────────────────────────────────────────────────── */
(function () {
  if (window.__battalGK) return;
  window.__battalGK = true;

  const host = location.hostname;
  const fmt = n => (+n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const norm = s => (s || '').toString().trim().toLocaleUpperCase('tr');

  /* Ortak: yuzen buton (id verilirse birden fazla buton yan yana durabilir) */
  function butonEkle(label, fn, renk, id, bottomPx) {
    id = id || '__gkBtn';
    if (document.getElementById(id)) return;
    const btn = document.createElement('button');
    btn.id = id;
    btn.textContent = label;
    btn.style.cssText = 'position:fixed;bottom:' + (bottomPx || 20) + 'px;right:20px;z-index:2147483646;background:' + (renk || 'linear-gradient(135deg,#d4af37,#b8941f)') + ';color:#0b1224;border:0;padding:13px 20px;border-radius:30px;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.4);font-family:Segoe UI,system-ui,sans-serif';
    btn.onclick = fn;
    document.body.appendChild(btn);
  }

  /* Ortak: tam ekran overlay ac, govde elemanini dondur */
  function overlayAc(baslik) {
    let ov = document.getElementById('__gk');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = '__gk';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(8,12,24,.97);color:#e8edf5;font:13px Segoe UI,system-ui,sans-serif;overflow:auto;padding:20px';
    ov.innerHTML = '<div style="max-width:1280px;margin:0 auto"><div style="display:flex;align-items:center;gap:12px;margin-bottom:14px"><b style="font-size:18px;color:#d4af37">' + baslik + '</b><span style="font-size:11px;color:#9aa6c0">ÖY · BATTAL MUHASEBE</span><button id="__gkx" style="margin-left:auto;background:#af0003;color:#fff;border:0;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:700">✕ Kapat</button></div><div id="__gkb">Yükleniyor…</div></div>';
    document.body.appendChild(ov);
    document.getElementById('__gkx').onclick = () => ov.remove();
    return document.getElementById('__gkb');
  }

  const chip = (t, n, c) => '<span style="display:inline-block;background:' + c + ';padding:6px 12px;border-radius:20px;margin:0 8px 8px 0;font-weight:700">' + t + ': ' + n + '</span>';

  /* ════════════════════════════════════════════════════════════
     LEVHA REGISTRY + ADRES/KİMLİK KARŞILAŞTIRMA MOTORU
     Vergi levhalarından okunan kayıtlı adres + VKN/TCKN.
     Amaç: çekilen faturanın kimlik/adresi levhayla tutmuyorsa UYAR,
     işleme sokma. "birebir tutmasın lazım — tutmayanları işlemeyeceğiz"
     ──────────────────────────────────────────────────────────── */
    const LEVHA = {
      '1500138444': { ad: 'Taner Battal', tckn: '24679499156', vd: 'BAYRAMPAŞA', nace: '692001', adres: 'TERAZİDERE MAH. TAŞ SK. BATTAL AP NO: 5 İÇ KAPI NO: 2 BAYRAMPAŞA/ İSTANBUL' },
      '1500360006': { ad: 'Emir Battal', tckn: '27286976096', vd: 'BEŞİKTAŞ', nace: '691003', adres: 'ABBASAĞA MAH. KEŞŞAF SK. ŞATIROĞLU IS MERKEZI NO: 4 İÇ KAPI NO: 10 BEŞİKTAŞ/ İSTANBUL' },
      '6630177279': { ad: 'Müge Özarmağan', tckn: '47707497320', vd: 'MECİDİYEKÖY', nace: '691003', adres: 'MEŞRUTİYET MAH. VALİ KONAĞI CAD. POLAT APT NO: 99 İÇ KAPI NO: 10 YOK/ ŞİŞLİ/ İSTANBUL' },
      '1500459508': { ad: 'Mert Tufan Battal', tckn: '26929736554', vd: 'MECİDİYEKÖY', nace: '862303', adres: 'TEŞVİKİYE MAH. NİŞANTAŞI IHLAMUR YOLU SK. BELDE APT. NO: 1 İÇ KAPI NO: 5 ŞİŞLİ/ İSTANBUL' },
      '3750072366': { ad: 'Cihan Güneş Ertürk', tckn: '40402335348', vd: 'GÖZTEPE', nace: '862202', adres: 'GÖZTEPE MAH. TEPEGÖZ SK. IKAR IŞ MERKEZI NO: 1 İÇ KAPI NO: 7 KADIKÖY/ İSTANBUL' },
      '1500127919': { ad: 'İskender Mehmet Nuri Battal', tckn: '26968735242', vd: 'MECİDİYEKÖY', nace: '862202', adres: 'MEŞRUTİYET MAH VALİKONAĞI CAD NO: 83 İÇ KAPI NO: 5 ŞİŞLİ/ İSTANBUL' },
      '8520482776': { ad: 'Aylin Topçu Erdinç', tckn: '11681662708', vd: 'BAKIRKÖY', nace: '869300', adres: 'KARTALTEPE MAH. ŞEHİT ER RIDVAN MERT SK. GURSESLI SITESI A1BLOK NO: 4/2 İÇ KAPI NO: 4 BAKIRKÖY/ İSTANBUL' },
      '32893788086': { ad: 'Serra Hekimoğlu', tckn: '32893788086', vd: 'MECİDİYEKÖY', nace: '862303', adres: 'TEŞVİKİYE MAH. NİŞANTAŞI IHLAMUR YOLU SK. BELDE APT. NO: 1 İÇ KAPI NO: 5 ŞİŞLİ/ İSTANBUL' },
      '32635597426': { ad: 'Suyum Bige Tilkici', tckn: '32635597426', vd: 'GÖZTEPE', nace: '691003', adres: 'GÖZTEPE MAH. TAŞMEKTEP SK. NUR NO: 21 İÇ KAPI NO: 17 KADIKÖY/ İSTANBUL' },
      '3750384725': { ad: 'Çağrı Ertürk', tckn: '40396335508', vd: 'GÖZTEPE', nace: '742027', adres: 'ZÜHTÜPAŞA MAH. KOLEJ SK. KISMET APT NO: 11 İÇ KAPI NO: 5 KADIKÖY/ İSTANBUL' },
      '2610511823': { ad: 'Yakup Çoruh', tckn: '37900621974', vd: 'MERTER', nace: '683101', adres: 'BAHÇELİEVLER MAH. RESSAM HALİM SK. KADİR HAS NO: 7 İÇ KAPI NO: 33 BAHÇELİEVLER/ İSTANBUL' },
      '3460330305': { ad: 'Altuğ Erden', tckn: '14558014020', vd: 'ÜSKÜDAR', nace: '472704', adres: 'İCADİYE MAH. CEMİL MERİÇ SK. KOC NO: 23 A ÜSKÜDAR/ İSTANBUL' },
      '2640193570': { ad: 'Muzaffer Murat Çubukçuoğlu', tckn: '41167543450', vd: 'ÜSKÜDAR', nace: '472704', adres: 'SELİMİYE MAH. HAREM İSKELESİ CAD. HERA APT. NO: 13 İÇ KAPI NO: 1 ÜSKÜDAR/ İSTANBUL' },
      '7680418539': { ad: 'Dilek Öztürk', tckn: '43684215698', vd: 'ÜSKÜDAR', nace: '479114', nace2: '731202', adres: 'ACIBADEM MAH. ÇEÇEN SK. B 10 BLOK NO: 19 H İÇ KAPI NO: 8 ÜSKÜDAR/ İSTANBUL' },
      '7850427089': { ad: 'Devran Süer', tckn: '59275233118', vd: 'KARTAL', nace: '691003', adres: 'ORHANTEPE MAH. SARAYLAR CAD. TUFANOĞLU PLAZA NO: 80 İÇ KAPI NO: 6 KARTAL/ İSTANBUL' },
      '0960155134': { ad: 'Sinan Atalay', tckn: '10097926060', vd: 'BEYLİKDÜZÜ', nace: '479114', adres: 'YAKUPLU MAH. KANUNİ CAD. MENEKŞE EVLERİ B BLOK NO: 16 A İÇ KAPI NO: 19 BEYLİKDÜZÜ/ İSTANBUL' },
      '0250587861': { ad: 'Kadir Akıllı', tckn: '34562272988', vd: 'KÜÇÜKKÖY', nace: '472105', adres: 'FEVZİ ÇAKMAK MAH. İSTANBUL CAD. NO: 61 A GAZİOSMANPAŞA/ İSTANBUL' }
    };
    // Kimlik (VKN veya TCKN) -> kayıt. Hem anahtar hem tckn üzerinden erişim.
    const LEVHA_BY_ID = {};
    Object.keys(LEVHA).forEach(k => { LEVHA_BY_ID[k] = LEVHA[k]; const t = LEVHA[k].tckn; if (t) LEVHA_BY_ID[t] = LEVHA[k]; });

    // Türkçe adres normalizasyonu: TR->ASCII, kısaltma açımı, noktalama temizliği.
    const trAscii = s => (s || '').toString()
      .toLocaleUpperCase('tr')
      .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C');
    const KIS = [
      [/\bMAHALLESI\b|\bMAH\b|\bMH\b/g, 'MAHALLE'],
      [/\bCADDESI\b|\bCAD\b|\bCD\b/g, 'CADDE'],
      [/\bSOKAK\b|\bSOKAGI\b|\bSOK\b|\bSK\b/g, 'SOKAK'],
      [/\bBULVARI\b|\bBULV\b|\bBLV\b/g, 'BULVAR'],
      [/\bAPARTMANI\b|\bAPARTMAN\b|\bAPT\b|\bAP\b/g, 'APARTMAN'],
      [/\bSITESI\b|\bSIT\b/g, 'SITE'],
      [/\bIS\s*MERKEZI\b|\bISMERKEZI\b|\bIS\s*MRK\b/g, 'ISMERKEZI'],
      [/\bNUMARA\b|\bNO\b/g, 'NO'],
      [/\bIC\s*KAPI\b|\bDAIRE\b|\bDAIRESI\b|\bDS\b|\bDR\b/g, 'ICKAPI'],
      [/\bBLOK\b|\bBLK\b/g, 'BLOK'],
      [/\bISTANBUL\b|\bIST\b/g, 'ISTANBUL']
    ];
    const DUR = new Set(['NO', 'ICKAPI', 'BLOK', 'A', 'B', 'C', 'D', 'YOK', 'VE', 'ISTANBUL']); // gürültü/az ayırt edici
    function adresNorm(a) {
      let s = trAscii(a).replace(/[.,;:/\\()\-]/g, ' ').replace(/\s+/g, ' ').trim();
      KIS.forEach(([re, to]) => { s = s.replace(re, to); });
      return s.replace(/\s+/g, ' ').trim();
    }
    // Anlamlı token kümesi (kısa/gürültü at, ama numaraları KORU — no/kapı önemli)
    function anlamliTokens(a) {
      const raw = adresNorm(a).split(' ').filter(Boolean);
      return raw.filter(t => (t.length > 1 && !DUR.has(t)) || /^\d/.test(t));
    }
    // İki adres benzerliği: 0..1 (levha token'larının faturada bulunma oranı, ağırlıklı).
    function adresBenzer(levhaAdres, faturaAdres) {
      const L = anlamliTokens(levhaAdres), F = new Set(anlamliTokens(faturaAdres));
      if (!L.length || !F.size) return { skor: 0, eslesen: 0, toplam: L.length };
      let hit = 0; L.forEach(t => { if (F.has(t)) hit++; });
      return { skor: hit / L.length, eslesen: hit, toplam: L.length };
    }
    // Sayfadaki metinden aktif mükellefi (banner/isim) tespit et.
    function aktifMukellef() {
      const alanlar = [];
      ['.dbs-navbar__content', '.navbar', 'header', '#header', '.user-info', '.top-bar', '.page-header'].forEach(sel => {
        document.querySelectorAll(sel).forEach(e => { const t = (e.innerText || '').trim(); if (t && t.length < 400) alanlar.push(t); });
      });
      alanlar.push((document.title || ''));
      const metin = trAscii(alanlar.join(' | '));
      // 1) Kimlik no eşleşmesi (en güvenilir)
      const idler = metin.match(/\b\d{10,11}\b/g) || [];
      for (const id of idler) { if (LEVHA_BY_ID[id]) return { vkn: id, rec: LEVHA_BY_ID[id], yol: 'kimlik-no' }; }
      // 2) İsim token eşleşmesi
      let best = null, bestSkor = 0;
      Object.keys(LEVHA).forEach(k => {
        const adT = trAscii(LEVHA[k].ad).split(' ').filter(x => x.length > 2);
        if (!adT.length) return;
        let hit = 0; adT.forEach(t => { if (metin.includes(t)) hit++; });
        const skor = hit / adT.length;
        if (skor > bestSkor) { bestSkor = skor; best = { vkn: k, rec: LEVHA[k], yol: 'isim', skor: skor }; }
      });
      return (best && bestSkor >= 0.6) ? best : null;
    }

    // Skoru renge/etikete çevir. birebir≈1, tolerans var ama düşükse RED.
    function adresKarar(skor) {
      if (skor >= 0.85) return { renk: '#10b981', bg: 'rgba(16,185,129,.12)', et: '✅ TUTUYOR', islenir: true };
      if (skor >= 0.6) return { renk: '#f59e0b', bg: 'rgba(245,158,11,.12)', et: '⚠️ ŞÜPHELİ — KONTROL ET', islenir: false };
      return { renk: '#ef4444', bg: 'rgba(239,68,68,.12)', et: '⛔ TUTMUYOR — İŞLEME', islenir: false };
    }

    // Defter Beyan hesabının KAYITLI adresini çek (adres defterinden kendi VKN'siyle).
    // Dönen: { adres, raw } veya null. Salt-okuma.
    // Sicil Bilgileri sayfasındaki "İş Yeri Adresi"ni oku, aktif mükellefin altına hafızaya al.
    // (Defter Beyan adres defteri API'si kendi adresini vermiyor; adres yalnız bu sayfada.)
    function sicilAdresYakala() {
      try {
        const body = document.body.innerText || '';
        if (!/mukellef\/sicil-bilgileri/.test(location.pathname) && !/İş Yeri Adresi/i.test(body)) return;
        // Etiket/değer ayrı sütunda olabildiği için adresi İÇERİĞİNDEN bul:
        // "... MAH ... (SK/CAD/SOKAK/CADDE/BULVAR) ..." içeren en uzun satır.
        const lines = body.split(/\n+/).map(s => s.trim()).filter(Boolean);
        let adres = '';
        lines.forEach(ln => {
          const u = trAscii(ln);
          const mahVar = /\bMAH\b|\bMAHALLE/.test(u);
          const yolVar = /\bSK\b|\bSOKAK\b|\bCAD\b|\bCADDE\b|\bBULV|\bBLOK\b|\bSITE\b|\bAPT\b|\bMERKEZI\b|\bNO\b/.test(u);
          if (mahVar && yolVar && ln.length > 15 && ln.length > adres.length && !/İŞ YERİ|TELEFON|E-?POSTA/i.test(ln)) adres = ln;
        });
        adres = adres.replace(/\s+/g, ' ').trim();
        if (adres.length < 12) return;
        const m = aktifMukellef();
        if (!m) return;
        chrome.storage.local.get('hesapAdres', s => {
          const h = (s && s.hesapAdres) || {};
          if (!h[m.vkn] || h[m.vkn].adres !== adres) { h[m.vkn] = { adres: adres, ts: Date.now() }; chrome.storage.local.set({ hesapAdres: h }); }
        });
      } catch (e) {}
    }

    // Aktif hesabın KAYITLI adresini getir: önce Sicil'den yakalanmış (storage), yoksa API.
    async function hesapAdresiCek(vkn) {
      try {
        const s = await chrome.storage.local.get('hesapAdres');
        const h = s && s.hesapAdres && s.hesapAdres[vkn];
        if (h && h.adres) return { adres: h.adres, kaynak: 'sicil' };
      } catch (e) {}
      return { yok: true };
    }

    // 🔒 SERT KİLİT: gönderimden önce hesap↔levha adresini doğrula.
    // Dönen: { gecer:bool, mesaj, m, skor }. gecer=false ise gönderim YAPILMAMALI.
    async function adresKilidi() {
      const m = aktifMukellef();
      if (!m) return { gecer: false, mesaj: '⛔ AKTİF HESAP TANINAMADI\n\nSayfadaki mükellef kayıtlı levhalardan biriyle eşleşmedi. Güvenlik için işlem durduruldu — bu hesabın levhasını ekletmeden gönderim yapılmaz.' };
      const ha = await hesapAdresiCek(m.vkn);
      if (!ha || !ha.adres) return { gecer: false, m: m, mesaj: '⚠️ HESAP ADRESİ DOĞRULANMADI: ' + m.rec.ad + '\n\nBu mükellefin Defter Beyan adresi henüz okunmadı. Önce sol menüden "Mükellef Bilgileri → Sicil Bilgileri" sayfasını AÇ (adres oradan otomatik alınır), sonra tekrar gönder.' };
      const s = adresBenzer(m.rec.adres, ha.adres);
      if (s.skor < 0.85) return { gecer: false, m: m, skor: s.skor, mesaj: '⛔ ADRES TUTMUYOR (%' + Math.round(s.skor * 100) + ') — ' + m.rec.ad + ' İŞLENMEYECEK\n\nHesap adresi: ' + ha.adres + '\nLevha adresi: ' + m.rec.adres + '\n\nGüvenlik kilidi: adres levhayla tutmadığı için gönderim durduruldu.' };
      return { gecer: true, m: m, skor: s.skor, hesapAdres: ha.adres };
    }
    // Kilit reddini overlay'de göster
    function kilitRed(bar, mesaj) {
      bar.innerHTML = '<div style="padding:18px;background:rgba(239,68,68,.12);border:2px solid #ef4444;border-radius:12px;color:#fca5a5;font-size:14px;white-space:pre-wrap;line-height:1.6">' + mesaj.replace(/</g, '&lt;') + '</div>';
    }

    // 🔒 Kimlik/Adres Kontrol ekranı (ortak — DB + Uyumsoft)
    function kimlikKontrol() {
      const bar = overlayAc('🔒 Kimlik / Adres Kontrol');
      const m = aktifMukellef();
      let h = '';
      if (!m) {
        h += '<div style="padding:14px;background:rgba(239,68,68,.12);border:1px solid #ef4444;border-radius:10px;color:#fca5a5;font-size:13px">' +
          '⛔ <b>Aktif hesap tanınamadı.</b> Sayfadaki isim/kimlik no kayıtlı 14 levhadan biriyle eşleşmedi. ' +
          'Bu hesap panelde yoksa <b>işlem yapma</b> — önce levhasını ekle.</div>';
      } else {
        const r = m.rec;
        h += '<div style="padding:14px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.4);border-radius:10px;margin-bottom:14px">' +
          '<div style="font-size:15px;color:#6ee7b7;font-weight:800;margin-bottom:8px">✅ TANINDI: ' + r.ad + '</div>' +
          '<div style="font-size:12.5px;color:#cbd5e1;line-height:1.8">' +
          '<b>VKN/Anahtar:</b> ' + m.vkn + ' &nbsp;·&nbsp; <b>TCKN:</b> ' + (r.tckn || '-') + '<br>' +
          '<b>Vergi Dairesi:</b> ' + r.vd + ' &nbsp;·&nbsp; <b>NACE:</b> ' + r.nace + '<br>' +
          '<b>Levha Adresi:</b> ' + r.adres + '<br>' +
          '<span style="color:#9aa6c0;font-size:11px">Tespit yolu: ' + m.yol + (m.skor ? ' (%' + Math.round(m.skor * 100) + ')' : '') + '</span>' +
          '</div></div>';
        // Hesap adresi vs Levha adresi (otomatik çekilir)
        h += '<div id="__hesapKarsi" style="padding:14px;background:#0f1830;border:1px solid #2a3550;border-radius:10px;margin-bottom:14px;font-size:12.5px;color:#9aa6c0">🏛️ Defter Beyan hesap adresi çekiliyor…</div>';
        // Adres test aracı — örnek fatura gelmeden normalizer'ı kalibre etmek için
        h += '<div style="padding:14px;background:#0f1830;border:1px solid #2a3550;border-radius:10px">' +
          '<div style="font-weight:700;color:#d4af37;margin-bottom:8px">🧪 Adres Karşılaştırma Testi</div>' +
          '<div style="font-size:12px;color:#9aa6c0;margin-bottom:8px">Faturadaki adresi buraya yapıştır → levha ile birebir tutuyor mu göreceksin.</div>' +
          '<textarea id="__adrTest" style="width:100%;height:70px;background:#0b1224;color:#e8edf5;border:1px solid #2a3550;border-radius:8px;padding:10px;font-size:12px;box-sizing:border-box" placeholder="Fatura adresini yapıştır…"></textarea>' +
          '<button id="__adrBtn" style="margin-top:8px;background:#d4af37;color:#0b1224;border:0;padding:9px 16px;border-radius:8px;font-weight:800;cursor:pointer">Karşılaştır</button>' +
          '<div id="__adrSonuc" style="margin-top:10px"></div></div>';
      }
      // Tüm registry özeti
      h += '<div style="margin-top:16px;overflow:auto;border:1px solid #2a3550;border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="background:#141c2e;text-align:left"><th style="padding:7px">Mükellef</th><th style="padding:7px">VKN/Anahtar</th><th style="padding:7px">TCKN</th><th style="padding:7px">VD</th><th style="padding:7px">Levha Adresi</th></tr></thead><tbody>';
      Object.keys(LEVHA).forEach(k => { const r = LEVHA[k]; const akt = m && m.vkn === k; h += '<tr style="border-top:1px solid #1f2840;' + (akt ? 'background:rgba(16,185,129,.08)' : '') + '"><td style="padding:6px">' + (akt ? '▶ ' : '') + r.ad + '</td><td style="padding:6px">' + k + '</td><td style="padding:6px">' + (r.tckn || '-') + '</td><td style="padding:6px">' + r.vd + '</td><td style="padding:6px;color:#9aa6c0">' + r.adres + '</td></tr>'; });
      h += '</tbody></table></div>';
      bar.innerHTML = h;
      // Hesap adresini çek → levhayla karşılaştır (salt-okuma, henüz bloklamaz)
      if (m && /defterbeyan\.gov\.tr/.test(location.hostname)) {
        hesapAdresiCek(m.vkn).then(ha => {
          const box = document.getElementById('__hesapKarsi'); if (!box) return;
          if (!ha || !ha.adres) {
            box.style.borderColor = '#f59e0b'; box.style.color = '#fcd34d';
            box.innerHTML = '⚠️ <b>Hesap adresi henüz hafızada yok.</b> Bu mükellefin adresini okumak için ' +
              '<b>Mükellef Bilgileri → Sicil Bilgileri</b> sayfasını bir kez aç (adres oradan otomatik alınır), sonra buraya dön.';
            return;
          }
          const s = adresBenzer(m.rec.adres, ha.adres);
          const kr = adresKarar(s.skor);
          box.style.borderColor = kr.renk; box.style.background = kr.bg;
          box.innerHTML = '<div style="font-size:15px;font-weight:800;color:' + kr.renk + '">🏛️ HESAP ↔ LEVHA: ' + kr.et + ' (%' + Math.round(s.skor * 100) + ')</div>' +
            '<div style="margin-top:8px;color:#cbd5e1;font-size:12px"><b>Hesap adresi:</b> ' + ha.adres + '<br><b>Levha adresi:</b> ' + m.rec.adres + '</div>' +
            '<div style="margin-top:6px;font-size:11px;color:#9aa6c0">Eşleşen: ' + s.eslesen + '/' + s.toplam + ' kelime · ' + (kr.islenir ? 'Bu mükellef İŞLENEBİLİR' : '⛔ Adres tutmuyor — İŞLENMEMELİ') + '</div>';
        });
      }
      const btn = document.getElementById('__adrBtn');
      if (btn && m) btn.onclick = () => {
        const val = document.getElementById('__adrTest').value;
        if (/^\s*[\[{]/.test(val)) {
          document.getElementById('__adrSonuc').innerHTML = '<div style="padding:12px;background:rgba(245,158,11,.12);border:1px solid #f59e0b;border-radius:8px;color:#fcd34d">⚠️ Bu bir <b>adres</b> değil, JSON paketi yapıştırmışsın. Buraya sadece <b>faturadaki açık adres metnini</b> yapıştır (örn: "İCADİYE MAH. CEMİL MERİÇ SK. ...").</div>';
          return;
        }
        const s = adresBenzer(m.rec.adres, val);
        const kr = adresKarar(s.skor);
        document.getElementById('__adrSonuc').innerHTML =
          '<div style="padding:12px;background:' + kr.bg + ';border:1px solid ' + kr.renk + ';border-radius:8px">' +
          '<div style="font-size:15px;font-weight:800;color:' + kr.renk + '">' + kr.et + ' &nbsp; (%' + Math.round(s.skor * 100) + ')</div>' +
          '<div style="font-size:11.5px;color:#9aa6c0;margin-top:6px">Eşleşen: ' + s.eslesen + '/' + s.toplam + ' anlamlı kelime<br>' +
          'Levha (norm): ' + adresNorm(m.rec.adres) + '<br>Fatura (norm): ' + adresNorm(val) + '</div></div>';
      };
    }

  /* ════════════════════ DEFTER BEYAN ════════════════════ */
  if (/defterbeyan\.gov\.tr/.test(host)) {
    const B = 'https://backend-p.defterbeyan.gov.tr/rs';

    /* CASUS (sayfa-dünyası): /gelir/create isteğini SAYFANIN kendi fetch'inden yakala.
       İçerik betiği izole dünyada olduğu için sayfanın fetch'ini göremez; bu yüzden
       sayfaya <script> enjekte ediyoruz. Yakalanan gerçek payload'ı (Z raporu şablonu)
       chrome.storage'a yazarız → sonra Z raporlarını AYNI yapıyla API ile göndeririz. */
    (function () {
      if (window.__zPageInjected) return; window.__zPageInjected = true;
      // CSP inline script'i engelliyor → hook'u ayrı dosyadan (web_accessible_resources) yükle.
      const sc = document.createElement('script');
      sc.src = chrome.runtime.getURL('injected.js');
      sc.onload = function () { this.remove(); };
      (document.head || document.documentElement).appendChild(sc);
      window.addEventListener('message', e => {
        const d = e.data;
        if (!d || !d.__zcapReal) return;
        window.__zLastCap = d;
        // İstek gövdesinden (create/update) VEYA cevaptan (detay görüntüleme) tam belgeyi yakala
        const belgeSec = o => (o && o.gelirBelgeTuruKodu && o.kayitlar && o.kayitlar.length) ? o : null;
        const cand = belgeSec(d.req) || belgeSec(d.res && (d.res.resultContainer || d.res.result)) || belgeSec(d.res);
        if (d.status === 200 && cand && cand.gelirBelgeTuruKodu) {
          // Z Raporu mu, satış e-Fatura/e-Arşiv mi ayır (belge türü koduna göre)
          const isZ = /z.?raporu/i.test(JSON.stringify(cand.kayitlar || []) + ' ' + (cand.aciklama || ''));
          const key = isZ ? 'zTemplate' : 'satisTemplate';
          try { chrome.storage.local.set({ [key]: { req: cand, ts: Date.now() } }); } catch (x) {}
        }
        // ── GİDER kodu yakala: elle girilen gider kaydından alt tür kodunu öğren ──
        const gsec = o => (o && o.giderBelgeTuruKodu && Array.isArray(o.kayitlar) && o.kayitlar.length) ? o : null;
        const gcand = gsec(d.req) || gsec(d.res && (d.res.resultContainer || d.res.result)) || gsec(d.res);
        if (d.status === 200 && gcand) {
          const yakalanan = [];
          gcand.kayitlar.forEach(k => {
            const kod = k.giderKayitAltTuruKodu, ad = (k.aciklama || '').trim();
            if (kod != null && kod !== '') yakalanan.push({ kod: String(kod), ad: ad, tur: String(k.giderKayitTuruKodu || '') });
          });
          if (yakalanan.length) {
            chrome.storage.local.get('giderKodYakala', s => {
              const harita = (s && s.giderKodYakala) || {};
              yakalanan.forEach(y => { harita[y.kod] = { ad: y.ad, tur: y.tur, ts: Date.now() }; });
              chrome.storage.local.set({ giderKodYakala: harita });
            });
            // Ekranda görünür bildirim
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:2147483647;background:#0f1830;border:2px solid #10b981;color:#e8edf5;padding:14px 18px;border-radius:12px;font:13px Segoe UI,sans-serif;max-width:420px;box-shadow:0 8px 30px rgba(0,0,0,.5)';
            toast.innerHTML = '<b style="color:#6ee7b7;font-size:14px">✅ GİDER KODU YAKALANDI</b><br>' +
              yakalanan.map(y => '<span style="color:#d4af37;font-weight:800;font-size:16px">Kod: ' + y.kod + '</span> — ' + (y.ad || '(açıklama yok)') + ' <span style="color:#9aa6c0">[tür ' + y.tur + ']</span>').join('<br>') +
              '<br><span style="color:#9aa6c0;font-size:11px">Bu kodu Ömer\'e söyle → panele sabitlensin.</span>' +
              '<button style="margin-top:8px;background:#af0003;color:#fff;border:0;padding:5px 12px;border-radius:6px;cursor:pointer" onclick="this.parentNode.remove()">Kapat</button>';
            document.body.appendChild(toast);
            setTimeout(() => { try { toast.remove(); } catch (e) {} }, 30000);
          }
        }
      });
    })();

    function tokenBul() {
      for (const S of [window.sessionStorage, window.localStorage]) {
        try {
          for (let i = 0; i < S.length; i++) {
            const v = S.getItem(S.key(i));
            if (v && /^ey[\w-]+\.[\w-]+\./.test(v)) return v;
          }
        } catch (e) {}
      }
      return '';
    }

    /* ── Panodan Gider Gönder: BATTAL_MUHASEBE_DB_PRO.html'de "Kopyala" ile üretilen
       JSON paketini okur, her satırı gerçek Defter Beyan API'sine POST eder.
       Kodlar (altKod/turKod) panelde API'den doğrulanmış olarak gelir — burada tahmin yok. */
    async function panodanGonder() {
      const bar = overlayAc('📥 Panodan Gider Gönder');
      // 🔒 SERT KİLİT — adres tutmuyorsa gönderim başlamaz
      const kilit = await adresKilidi();
      if (!kilit.gecer) { kilitRed(bar, kilit.mesaj); return; }
      let paket;
      try {
        const txt = await navigator.clipboard.readText();
        paket = JSON.parse(txt);
        if (paket.tip !== 'battal-gider-gonder' || !Array.isArray(paket.items)) throw new Error('Panoda geçerli bir BATTAL gider paketi yok. Önce panelde "Scripti Üret + Kopyala" butonuna bas.');
      } catch (e) {
        bar.innerHTML = '<span style="color:#fca5a5">Hata: ' + e.message + '</span>';
        return;
      }
      const TK = tokenBul();
      const H = { 'Content-Type': 'application/json; charset=utf-8' };
      if (TK) H.Token = TK;
      const iso = t => { const a = t.split('.'); return a[2] + '-' + a[1] + '-' + a[0] + ' 00:00:00'; };
      // 🔎 Alıcı Bilgi Kontrol sonuçları (Uyumsoft portalında çalıştırıldıysa):
      // "UYGUN DEĞİL" işaretli fatura no'ları gider gönderimine SOKULMAZ.
      let alkMap = {};
      try { const s = await chrome.storage.local.get('aliciKontrol'); alkMap = (s.aliciKontrol && s.aliciKontrol.map) || {}; } catch (e) {}
      async function islem(d) {
        try {
          const alkNo = norm((d.bno || '').toString().replace(/[^0-9A-Za-z]/g, ''));
          const alk = alkMap[alkNo];
          if (alk && alk.uygun === false) return { bno: d.bno, s: '❌', m: '🔎 Alıcı kontrol RED — ' + (alk.sebep || 'alıcı bilgisi levhayla tutmuyor') };
          const lj = await (await fetch(B + '/adresdefteri/findbytckn/' + d.vkn, { method: 'POST', headers: H, body: '{}', credentials: 'include' })).json();
          const rc = lj.resultContainer;
          if (!rc) return { bno: d.bno, s: '❌', m: 'Tedarikçi sorgu boş' };
          const t = iso(d.tarih);
          const ad = ((rc.soyad || '') + ' ' + (rc.ad || '')).trim().toLocaleUpperCase('tr');
          const turKod = d.turKod || '4';
          const ana = { deleted: false, alisTuruKodu: '1', giderKayitTuruKodu: turKod, giderKayitAltTuruKodu: String(d.altKod), aciklama: ad + ' - ' + d.altAd, naceKodu: paket.nace, tutar: d.matrah, isKdvDahil: false, kdvsizIslem: false, kdv: d.kdv, kdvOrani: d.oran };
          // Dönemsellik ilkesi: normal indirilecek giderde (turKod 4) seçim ZORUNLU (gerçek API ile
          // doğrulandı: donemsellik:false). Mal Alışı (1) ve ÖİV (5) bu alanı istemez/kabul etmez.
          if (turKod === '4') ana.donemsellik = false;
          const kayitlar = [ana];
          if (d.oiv > 0) {
            kayitlar.push({ deleted: false, alisTuruKodu: '1', giderKayitTuruKodu: '5', giderKayitAltTuruKodu: '218', aciklama: ad + ' - ÖZEL İLETİŞİM VERGİSİ', naceKodu: paket.nace, tutar: d.oiv, isKdvDahil: false, kdvsizIslem: true });
          }
          // Fatura no: sadece harf/rakam bırak (Excel'den gelen apostrof/boşluk vb. temizlenir), en çok 16 karakter
          const belgeNo = (d.bno || '').toString().replace(/[^0-9A-Za-z]/g, '').slice(0, 16);
          const P = { giderBelgeTuruKodu: '9', versiyon: 11, kayitTarihi: t, belgeTarihi: t, belgeSiraNo: belgeNo, tcknVkn: d.vkn, ad: rc.ad, soyad: rc.soyad, vergiDairesiKodu: rc.vergiDairesiKodu, adresiGuncelleme: false, kayitlar };
          if (rc.subeNo) P.subeNo = rc.subeNo;
          const cr = await fetch(B + '/gider/create', { method: 'POST', headers: H, body: JSON.stringify(P), credentials: 'include' });
          const cj = await cr.json();
          if (cr.status === 200 && cj.resultContainer && !cj.errorMessage) return { bno: d.bno, s: '✅' };
          return { bno: d.bno, s: '❌', m: (cj.errorMessage || cj.statusMessage || cr.status).toString().slice(0, 80) };
        } catch (e) { return { bno: d.bno, s: '❌', m: e.message }; }
      }
      let ok = 0, er = 0; const rows = [];
      bar.innerHTML = '<div id="__gonderStatus">Gönderiliyor… 0/' + paket.items.length + '</div><div id="__gonderRows" style="margin-top:10px"></div>';
      for (let i = 0; i < paket.items.length; i += 5) {
        const res = await Promise.all(paket.items.slice(i, i + 5).map(islem));
        res.forEach(r => { if (r.s === '✅') ok++; else er++; rows.push(r); });
        document.getElementById('__gonderStatus').textContent = 'Gönderiliyor… ' + (ok + er) + '/' + paket.items.length + ' (✅' + ok + ' ❌' + er + ')';
      }
      const rowsHtml = rows.map(r => '<div style="padding:5px 0;border-top:1px solid #1f2840">' + (r.s === '✅' ? '<span style="color:#6ee7b7">✅</span>' : '<span style="color:#fca5a5">❌</span>') + ' ' + r.bno + (r.m ? ' — <span style="color:#fca5a5">' + r.m + '</span>' : '') + '</div>').join('');
      document.getElementById('__gonderStatus').innerHTML = '<b style="font-size:16px;color:' + (er ? '#fca5a5' : '#6ee7b7') + '">🎉 ' + paket.mukellefAdi + ' — Tamamlandı: ' + ok + '/' + paket.items.length + (er ? ' (' + er + ' hata)' : '') + '</b>';
      document.getElementById('__gonderRows').innerHTML = rowsHtml;
    }

    /* ── Panodan Z Raporu Gönder: BATTAL_MUHASEBE_DB_PRO.html'de üretilen
       'battal-zrapor-gonder' paketini okur, aktif mükellefin Z raporlarını
       Gelir Ekle → Belge Türü "Z Raporu" formuna DOM ile otomatik girer.
       (MUSAVIR_PRO_PANEL'deki test edilmiş akış — artık DB sayfasına doğrudan
       enjekte oldugu icin iframe/window.parent gerekmez.) */
    async function zRaporGonder() {
      let __v = ''; try { __v = chrome.runtime.getManifest().version; } catch (e) {}
      const bar = overlayAc('📊 Z Raporu Gönder (API) · v' + __v);
      const D = document;
      const norm = s => (s || '').toString().trim().toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/[ĞÜŞÖÇ]/g, c => ({ Ğ: 'G', Ü: 'U', Ş: 'S', Ö: 'O', Ç: 'C' }[c]));
      const r2 = v => Math.round(v * 100) / 100;
      const iso = t => { const a = String(t).split('.'); return a.length === 3 ? a[2] + '-' + a[1] + '-' + a[0] + ' 00:00:00' : t; };

      // Aktif mükellef
      const banner = D.querySelector('.dbs-navbar__content span');
      if (!banner) { bar.innerHTML = '<span style="color:#fca5a5">❌ Defter Beyan açık değil. Giriş yapıp mükellefe gir.</span>'; return; }
      const aktif = banner.innerText.split('\n')[0].trim();
      const aktifN = norm(aktif);
      let paket = null, firma = null, digerleri = [];

      // Z Raporu şablonu — önce hafızadan, yoksa API'den (mevcut kayıtlı Z'den) otomatik öğren
      let tmpl = null;
      try { const st = await chrome.storage.local.get('zTemplate'); tmpl = st && st.zTemplate && st.zTemplate.req; } catch (e) {}
      if (!tmpl) {
        bar.innerHTML = '<div style="color:#fcd34d">🔎 Şablon aranıyor — kayıtlı bir Z raporundan API ile öğreniliyor…</div>';
        const learn = await (async () => {
          const TK = tokenBul(); const H = { 'Content-Type': 'application/json; charset=utf-8' }; if (TK) H.Token = TK;
          const yil = new Date().getFullYear();
          let list = [];
          try {
            const sr = await fetch(B + '/gelirliste/search', { method: 'POST', headers: H, credentials: 'include', body: JSON.stringify({ attributes: { baslangicTarihi: yil + '-01-01 00:00:00', bitisTarihi: yil + '-12-31 23:59:59' }, pagingContext: { page: 1, limit: 100, orderContextMap: { 'date(kayit_tarihi)': 'DESC' } } }) });
            const sj = await sr.json(); list = (sj.resultContainer && (sj.resultContainer.resultList || sj.resultContainer.list)) || [];
          } catch (e) { return { err: 'liste-hata: ' + e.message }; }
          if (!list.length) return { err: 'gelir listesi boş' };
          // Z raporu kaydını bul
          // Eğer liste kaydı zaten tam belge ise (kayitlar+kod) direkt kullan
          const zBelge = list.find(r => r && r.gelirBelgeTuruKodu && r.kayitlar && r.kayitlar.length && /z.?raporu/i.test(JSON.stringify(r)))
            || list.find(r => r && r.gelirBelgeTuruKodu && r.kayitlar && r.kayitlar.length);
          if (zBelge) return { tmpl: zBelge, ep: 'liste' };
          const zrec = list.find(r => /z\s*raporu/i.test(JSON.stringify(r))) || list[0];
          const rawId = zrec.id || zrec.belgeId || zrec.gelirBelgeId || zrec.gelirId || zrec.belgeSiraId || zrec.key || zrec.gelirBelgeKey;
          let decId = rawId; try { decId = atob(rawId); } catch (e) {}
          const ids = [rawId, decId].filter(Boolean);
          for (const ep of ['/gelir/get', '/gelir/detay', '/gelir/getById', '/gelir/getbyid', '/gelir/read', '/gelir/getGelir', '/gelir/getGelirBelge', '/gelirbelge/get', '/gelir/belgeDetay', '/gelir/find']) {
            for (const idv of ids) {
              for (const bodyObj of [{ id: idv }, { belgeId: idv }, { gelirBelgeId: idv }, { key: idv }, idv]) {
                try {
                  const dr = await fetch(B + ep, { method: 'POST', headers: H, credentials: 'include', body: JSON.stringify(bodyObj) });
                  if (dr.status !== 200) continue;
                  const dj = await dr.json();
                  const belge = dj.resultContainer || dj.result || dj;
                  if (belge && belge.kayitlar && belge.kayitlar.length) return { tmpl: belge, ep };
                } catch (e) {}
              }
            }
          }
          return { err: 'detay endpoint bulunamadı', id: rawId, keys: Object.keys(zrec).join(', '), ornek: JSON.stringify(zrec).slice(0, 300) };
        })();
        if (learn.tmpl) {
          tmpl = learn.tmpl;
          try { chrome.storage.local.set({ zTemplate: { req: tmpl, ts: Date.now(), kaynak: 'api:' + learn.ep } }); } catch (e) {}
        } else {
          bar.innerHTML =
            '<div style="color:#fcd34d;font-size:15px;margin-bottom:8px"><b>🎯 Şablonu yakalamak için: bir Z belgesini "Belgeyi Güncelle" ile kaydet</b></div>' +
            '<div style="color:#e8edf5;font-size:13px;line-height:1.8">Casus, Defter Beyan\'ın <b>kendi kaydetme çağrısını</b> dinliyor. Kayıtlı bir Z belgesini hiç değiştirmeden tekrar kaydettirmen yeter (mükerrer olmaz):<br>' +
            '<b>1.</b> Sol menü → <b>Gelir Listele</b> → bir <b>Z Raporu</b> satırına tıkla (Gelir Güncelle açılır).<br>' +
            '<b>2.</b> Sağ alttaki mavi <b>"Belgeyi Güncelle"</b> butonuna bas. (Hiçbir şey değiştirme.)<br>' +
            '<b>3.</b> Kaydolunca casus şablonu <b>otomatik</b> yakalar → bu pencere "✅" der.<br>' +
            '<b>4.</b> Sonra tekrar <b>📊 Z Raporu Gönder</b> → paketi yapıştır → 🚀 Gönder.</div>' +
            '<div style="margin-top:12px;padding:8px 12px;background:#0b1020;border-radius:8px;color:#6ee7b7;font-size:13px" id="__zBekle">Durum: bir Z belgesinin "Belgeyi Güncelle" ile kaydedilmesi bekleniyor…</div>' +
            '<div style="margin-top:8px;color:#64748b;font-size:11px">Teknik: ' + (learn.err || '?') + (learn.keys ? ' · alanlar: ' + learn.keys : '') + '</div>';
          const iv2 = setInterval(async () => { try { const st = await chrome.storage.local.get('zTemplate'); if (st && st.zTemplate) { clearInterval(iv2); const e = D.getElementById('__zBekle'); if (e) e.innerHTML = '✅ Şablon yakalandı! Pencereyi kapat, tekrar "Z Raporu Gönder" bas → 🚀 Gönder.'; } } catch (e) {} }, 1500);
          return;
        }
      }
      // ── Şablon hazır. Şimdi paketi oku (pano veya elle yapıştır) ──
      try {
        const txt = (await navigator.clipboard.readText() || '').trim();
        if (txt) { const p = JSON.parse(txt); if (p.tip === 'battal-zrapor-gonder' && Array.isArray(p.firmalar)) paket = p; }
      } catch (e) {}
      if (!paket) {
        bar.innerHTML = '<div style="color:#6ee7b7;margin-bottom:8px">✅ Şablon hazır (Belge Türü kodu ' + tmpl.gelirBelgeTuruKodu + ').</div>' +
          '<div style="color:#fca5a5;margin-bottom:8px">Panoda Z Raporu paketi yok.</div>' +
          '<div style="margin-bottom:8px;color:#9aa6c0">Panelde <b>"Z Raporlarını Panoya Kopyala"</b>ya bas, buraya <b>Ctrl+V</b> yapıştır ve <b>Devam</b>a tıkla.</div>' +
          '<textarea id="__zPaste" style="width:100%;height:120px;background:#0b1020;color:#e8edf5;border:1px solid #2a3550;border-radius:8px;padding:8px;font-family:Consolas,monospace;font-size:11px" placeholder="JSON paketini buraya yapıştır…"></textarea>' +
          '<button id="__zGo" style="margin-top:8px;background:#7c3aed;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-weight:800;cursor:pointer">Devam ▶</button>';
        await new Promise(res => {
          D.getElementById('__zGo').onclick = () => {
            try { const p = JSON.parse((D.getElementById('__zPaste').value || '').trim()); if (p.tip === 'battal-zrapor-gonder' && Array.isArray(p.firmalar)) { paket = p; res(); } else alert('Geçersiz paket. Panelden kopyaladığın JSON\'u yapıştır.'); }
            catch (e) { alert('JSON okunamadı: ' + e.message); }
          };
        });
      }
      firma = paket.firmalar.find(f => aktifN.includes(norm(f.ad).slice(0, 8)) || norm(f.ad).includes(aktifN.slice(0, 8)));
      digerleri = paket.firmalar.filter(f => f !== firma).map(f => f.ad);
      if (!firma) {
        bar.innerHTML = '<div style="color:#fca5a5">⚠️ Aktif mükellef "<b>' + aktif + '</b>" paketteki firmalarla eşleşmedi.<br>Pakette: ' + paket.firmalar.map(f => f.ad).join(', ') + '</div>';
        return;
      }

      const belgeler = firma.belgeler;
      bar.innerHTML =
        '<div style="margin-bottom:8px">Aktif mükellef: <b style="color:#6ee7b7">' + aktif + '</b> · <b>' + belgeler.length + '</b> Z raporu · API ile gönderilecek' + (digerleri.length ? ' · diğer firmalar: ' + digerleri.join(', ') : '') + '</div>' +
        '<div style="margin-bottom:8px;color:#9aa6c0;font-size:12px">Şablon: Belge Türü kodu <b>' + tmpl.gelirBelgeTuruKodu + '</b> · Kayıt Türü <b>' + ((tmpl.kayitlar && tmpl.kayitlar[0] && tmpl.kayitlar[0].gelirKayitTuruKodu) || '?') + '</b> · Alt Tür <b>' + ((tmpl.kayitlar && tmpl.kayitlar[0] && tmpl.kayitlar[0].gelirKayitAltTuruKodu) || '?') + '</b></div>' +
        '<button id="__zStart" style="background:#7c3aed;color:#fff;border:0;padding:11px 20px;border-radius:8px;font-weight:800;cursor:pointer">🚀 Gönder</button>' +
        '<div id="__zLog" style="margin-top:12px;font-family:Consolas,monospace;font-size:12px;max-height:340px;overflow:auto;background:#0b1020;padding:10px;border-radius:8px"></div>';
      const logEl = D.getElementById('__zLog');
      const zlog = (t, c) => { const d = document.createElement('div'); d.style.color = c || '#9aa6c0'; d.textContent = t; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; };

      D.getElementById('__zStart').onclick = async () => {
        D.getElementById('__zStart').disabled = true;
        const TK = tokenBul();
        const H = { 'Content-Type': 'application/json; charset=utf-8' };
        if (TK) H.Token = TK;
        // Şablon kayıt kaleminin KDV dahil mi olduğunu tespit et
        const kTmpl = (tmpl.kayitlar && tmpl.kayitlar[0]) || {};
        const kdvDahil = kTmpl.isKdvDahil !== false; // Z raporu: genelde true
        const nakitKey = Object.keys(tmpl).find(k => /nakit/i.test(k));
        const krediKey = Object.keys(tmpl).find(k => /krediKarti/i.test(k)) || 'krediKartiTutari';
        zlog('🚀 ' + firma.ad + ' — ' + belgeler.length + ' Z raporu API ile gönderiliyor…', '#7c3aed');

        let ok = 0, fail = 0;
        for (let i = 0; i < belgeler.length; i++) {
          const b = belgeler[i];
          try {
            const t = iso(b.tarih);
            const P = JSON.parse(JSON.stringify(tmpl));
            P.kayitTarihi = t; P.belgeTarihi = t;
            P.belgeSiraNo = String(b.zno);
            let belgeToplam = 0;
            P.kayitlar = b.satirlar.map(s => {
              const k = JSON.parse(JSON.stringify(kTmpl));
              const oran = s.oran || 0;
              let matrah, kdv, dahil;
              if (kdvDahil) { dahil = s.tutar; matrah = r2(dahil / (1 + oran / 100)); kdv = r2(dahil - matrah); k.tutar = dahil; }
              else { matrah = s.tutar; kdv = r2(matrah * oran / 100); k.tutar = matrah; dahil = r2(matrah + kdv); }
              k.kdvOrani = oran;
              if ('kdv' in k) k.kdv = kdv;
              k.aciklama = s.aciklama || (b.zno + ' NL. Z RAPORU Mal Satışı');
              belgeToplam += dahil;
              return k;
            });
            P.belgeTutari = r2(belgeToplam);
            P[krediKey] = r2(b.kredi);
            if (nakitKey) P[nakitKey] = r2(b.nakit);
            const cr = await fetch(B + '/gelir/create', { method: 'POST', headers: H, body: JSON.stringify(P), credentials: 'include' });
            const cj = await cr.json();
            if (cr.status === 200 && cj.resultContainer && !cj.errorMessage) { zlog('  ✅ Z ' + b.zno + ' (' + belgeToplam.toFixed(2) + ' TL' + (b.satirlar.length > 1 ? ', ' + b.satirlar.length + ' satır' : '') + ')', '#10b981'); ok++; }
            else { const m = (cj.errorMessage || cj.statusMessage || cr.status).toString(); if (/aynı|mükerrer|zaten/i.test(m)) { zlog('  ⏭ Z ' + b.zno + ' zaten kayıtlı', '#9aa6c0'); ok++; } else { zlog('  ❌ Z ' + b.zno + ' — ' + m.slice(0, 120), '#ef4444'); fail++; } }
          } catch (err) { zlog('  ❌ Z ' + b.zno + ' — ' + err.message, '#ef4444'); fail++; }
        }
        zlog('🎉 ' + firma.ad + ' bitti — ✅ ' + ok + (fail ? ' · ❌ ' + fail : ''), fail ? '#fbbf24' : '#10b981');
        if (digerleri.length) zlog('👉 Diğer firmalar (' + digerleri.join(', ') + ') için o mükellefe geçip tekrar bas.', '#fcd34d');
        D.getElementById('__zStart').disabled = false;
      };
    }

    async function pullDB(bar) {
      const TK = tokenBul();
      const H = { 'Content-Type': 'application/json; charset=utf-8' };
      if (TK) H.Token = TK;
      const yil = new Date().getFullYear();
      const bas = yil + '-01-01 00:00:00', bit = yil + '-12-31 23:59:59';
      let page = 1, all = [], size = Infinity, T = {};
      while (all.length < size) {
        const r = await fetch(B + '/giderliste/search', {
          method: 'POST', headers: H, credentials: 'include',
          body: JSON.stringify({ attributes: { baslangicTarihi: bas, bitisTarihi: bit }, pagingContext: { page, limit: 200, orderContextMap: { 'date(kayit_tarihi)': 'DESC' } } })
        });
        const j = await r.json();
        const rc = j.resultContainer || {};
        const l = rc.resultList || [];
        size = rc.size || l.length;
        T = { g: rc.toplamGider, k: rc.toplamKdv, s: rc.toplamStopajTutari };
        all = all.concat(l);
        if (bar) bar.textContent = 'Defter Beyan çekiliyor… ' + all.length + '/' + size;
        if (!l.length) break;
        page++;
        if (page > 100) break;
      }
      return { all, T };
    }

    async function pullGelirDB(bar) {
      const TK = tokenBul();
      const H = { 'Content-Type': 'application/json; charset=utf-8' };
      if (TK) H.Token = TK;
      const yil = new Date().getFullYear();
      const bas = yil + '-01-01 00:00:00', bit = yil + '-12-31 23:59:59';
      let page = 1, all = [], size = Infinity, T = {};
      while (all.length < size) {
        const r = await fetch(B + '/gelirliste/search', {
          method: 'POST', headers: H, credentials: 'include',
          body: JSON.stringify({ attributes: { baslangicTarihi: bas, bitisTarihi: bit }, pagingContext: { page, limit: 200, orderContextMap: { 'date(kayit_tarihi)': 'DESC' } } })
        });
        const j = await r.json();
        const rc = j.resultContainer || {};
        const l = rc.resultList || rc.list || [];
        size = rc.size || l.length;
        T = { g: rc.toplamGelir, k: rc.toplamKdv || rc.toplamHesaplananKdv, s: rc.toplamStopajTutari };
        all = all.concat(l);
        if (bar) bar.textContent = 'Defter Beyan gelir çekiliyor… ' + all.length + '/' + size;
        if (!l.length) break;
        page++;
        if (page > 100) break;
      }
      return { all, T };
    }

    async function gelirKontrol() {
      const bar = overlayAc('📊 Defter Beyan · Gelir Kontrol');
      let R;
      try { R = await pullGelirDB(bar); }
      catch (e) { bar.innerHTML = '<span style="color:#fca5a5">Hata: ' + e.message + '</span>'; return; }
      const all = R.all, T = R.T;
      const num = v => +v || 0;
      const belgeNo = r => norm(r.belgeSiraNo || r.faturaNo || '');
      const isoAy = r => { const t = (r.belgeTarihi || r.kayitTarihi || '') + ''; if (/^\d{4}-\d{2}/.test(t)) return t.slice(5, 7); const p = t.split('.'); return p[1] || '00'; };
      // Mükerrer: aynı belge no + tarih + tutar
      const seen = {}, dup = [];
      all.forEach(r => { const k = belgeNo(r) + '|' + (r.belgeTarihi || '') + '|' + num(r.tutar); if (seen[k]) dup.push(r); else seen[k] = 1; });
      // KDV tutarlılık
      const kdvE = all.filter(r => { const b = Math.round(num(r.tutar) * num(r.kdvOrani)) / 100; return Math.abs(b - num(r.kdv)) > 0.05; });
      const toplamMatrah = all.reduce((a, r) => a + num(r.tutar), 0);
      const toplamKdv = all.reduce((a, r) => a + num(r.kdv), 0);

      const adlar = { '01': 'Oca', '02': 'Şub', '03': 'Mar', '04': 'Nis', '05': 'May', '06': 'Haz', '07': 'Tem', '08': 'Ağu', '09': 'Eyl', '10': 'Eki', '11': 'Kas', '12': 'Ara' };
      const mevcutAylar = [...new Set(all.map(isoAy))].sort();
      const buAy = ('0' + (new Date().getMonth() + 1)).slice(-2);
      const aktifAy = mevcutAylar.indexOf(buAy) >= 0 ? buAy : 'tum';

      let h = '<div style="margin-bottom:12px">' +
        chip('Kayıt', all.length, '#1f2937') +
        chip('Toplam Gelir (matrah)', '₺' + fmt(T.g || toplamMatrah), '#1e3a2f') +
        chip('Hes. KDV', '₺' + fmt(T.k || toplamKdv), '#1e2f3a') +
        chip('Mükerrer', dup.length, dup.length ? '#5b1a1a' : '#1f2937') +
        chip('KDV Uyumsuz', kdvE.length, kdvE.length ? '#5b3a1a' : '#1f2937') +
        '</div>';
      // Uyumsoft GİDEN çapraz kontrol (varsa)
      try {
        const store = await chrome.storage.local.get('uyumGiden');
        const u = store && store.uyumGiden;
        if (u && u.list && u.list.length) {
          const yil = String(new Date().getFullYear());
          const dbNos = new Set(all.map(belgeNo).filter(Boolean));
          const buYil = u.list.filter(x => (x.tarih || '').indexOf(yil) >= 0);
          const eksik = buYil.filter(x => { const n = norm(x.no); return n && !dbNos.has(n); });
          h += '<div style="margin:6px 0 12px">' + chip('Uyumsoft Giden', buYil.length, '#1f2937') + chip('Deftere Girilmiş', buYil.length - eksik.length, '#1e3a2f') + chip('EKSİK', eksik.length, eksik.length ? '#5b1a1a' : '#1e3a2f') + '</div>';
          if (eksik.length) { h += '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;color:#fca5a5;font-size:12px">⚠️ ' + eksik.length + ' giden (satış) fatura deftere girilmemiş: ' + eksik.slice(0, 20).map(x => x.no).join(', ') + (eksik.length > 20 ? '…' : '') + '</div>'; }
        }
      } catch (e) {}

      // Ay sekmeleri
      h += '<div id="__glAy" style="margin:6px 0 10px;display:flex;flex-wrap:wrap;gap:6px">';
      h += '<button class="glb" data-ay="tum" style="padding:6px 12px;border-radius:8px;border:1px solid #3a3550;background:' + (aktifAy === 'tum' ? '#d4af37' : 'transparent') + ';color:' + (aktifAy === 'tum' ? '#0b1224' : '#e8edf5') + ';font-weight:700;cursor:pointer">Tümü (' + all.length + ')</button>';
      mevcutAylar.forEach(a => { const say = all.filter(r => isoAy(r) === a).length; h += '<button class="glb" data-ay="' + a + '" style="padding:6px 12px;border-radius:8px;border:1px solid #3a3550;background:' + (aktifAy === a ? '#d4af37' : 'transparent') + ';color:' + (aktifAy === a ? '#0b1224' : '#e8edf5') + ';font-weight:700;cursor:pointer">' + (adlar[a] || a) + ' (' + say + ')</button>'; });
      h += '</div>';
      const flag = r => { const a = []; if (dup.indexOf(r) >= 0) a.push('MÜKERRER'); if (kdvE.indexOf(r) >= 0) a.push('KDV?'); return a.length ? '<span style="color:#fca5a5;font-weight:700">' + a.join(' ') + '</span>' : '<span style="color:#6ee7b7">✓</span>'; };
      const cols = ['Belge Tarihi', 'Belge No', 'Açıklama', 'Matrah', 'KDV%', 'KDV', 'Kontrol'];
      h += '<div style="margin:6px 0"><b style="font-size:14px">📒 Deftere Kayıtlı Gelirler</b>' + (aktifAy !== 'tum' ? ' <span style="font-size:11px;color:#9aa6c0">(seçili ay)</span>' : '') + '</div>';
      h += '<div style="overflow:auto;border:1px solid #2a3550;border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#141c2e;text-align:left">' + cols.map(x => '<th style="padding:8px">' + x + '</th>').join('') + '</tr></thead><tbody>';
      all.forEach(r => { const a = isoAy(r); const gizli = (aktifAy !== 'tum' && a !== aktifAy); h += '<tr class="glRow" data-ay="' + a + '" style="border-top:1px solid #1f2840;' + (gizli ? 'display:none' : '') + '"><td style="padding:7px">' + ((r.belgeTarihi || '') + '').slice(0, 10) + '</td><td style="padding:7px">' + (r.belgeSiraNo || '') + '</td><td style="padding:7px">' + ((r.aciklama || '').slice(0, 55)) + '</td><td style="padding:7px;text-align:right">' + fmt(r.tutar) + '</td><td style="padding:7px;text-align:right">' + (r.kdvOrani || 0) + '</td><td style="padding:7px;text-align:right">' + fmt(r.kdv) + '</td><td style="padding:7px">' + flag(r) + '</td></tr>'; });
      h += '</tbody></table></div>';
      bar.innerHTML = h;
      const ayBar = document.getElementById('__glAy');
      if (ayBar) ayBar.querySelectorAll('.glb').forEach(b => { b.onclick = () => { const sec = b.getAttribute('data-ay'); ayBar.querySelectorAll('.glb').forEach(x => { x.style.background = 'transparent'; x.style.color = '#e8edf5'; }); b.style.background = '#d4af37'; b.style.color = '#0b1224'; document.querySelectorAll('.glRow').forEach(tr => { tr.style.display = (sec === 'tum' || tr.getAttribute('data-ay') === sec) ? '' : 'none'; }); }; });
    }

    // ── Giden (satış e-Fatura/e-Arşiv) Gönder: Uyumsoft giden verisi + casus-öğrenimli e-Arşiv şablonu → /gelir/create
    async function gidenGonder() {
      const bar = overlayAc('📤 Giden (Satış) Fatura Gönder');
      // 🔒 SERT KİLİT — adres tutmuyorsa gönderim başlamaz
      const kilitG = await adresKilidi();
      if (!kilitG.gecer) { kilitRed(bar, kilitG.mesaj); return; }
      const D = document, r2 = v => Math.round(v * 100) / 100;
      const iso = t => { const a = String(t).split('.'); return a.length === 3 ? a[2] + '-' + a[1] + '-' + a[0] + ' 00:00:00' : t; };
      let tmpl = null, giden = null;
      try { const s = await chrome.storage.local.get(['satisTemplate', 'uyumGiden']); tmpl = s.satisTemplate && s.satisTemplate.req; giden = s.uyumGiden && s.uyumGiden.list; } catch (e) {}
      if (!giden || !giden.length) { bar.innerHTML = '<div style="color:#fcd34d">📤 Önce <b>Uyumsoft</b> Giden sayfasında <b>"📤 Giden Faturaları Al"</b>a bas (satış faturaları çekilsin), sonra buraya dön.</div>'; return; }
      if (!tmpl || !tmpl.gelirBelgeTuruKodu) {
        bar.innerHTML = '<div style="color:#fcd34d;font-size:15px;margin-bottom:8px"><b>🎯 Önce satış şablonu öğrenilmeli (tek seferlik)</b></div>' +
          '<div style="color:#e8edf5;font-size:13px;line-height:1.8">Gelir Listele → kayıtlı bir <b>satış e-Fatura/e-Arşiv</b> (ör. RESUL ÇEVİK) satırına tıkla → <b>"Belgeyi Güncelle"</b> bas (değiştirme yok). Casus e-Arşiv şablonunu yakalar → tekrar bu butona bas.</div>' +
          '<div id="__stBek" style="margin-top:10px;color:#6ee7b7;font-size:12px">Durum: satış belgesinin "Belgeyi Güncelle" ile kaydı bekleniyor…</div>';
        const iv = setInterval(async () => { try { const s = await chrome.storage.local.get('satisTemplate'); if (s && s.satisTemplate) { clearInterval(iv); const e = D.getElementById('__stBek'); if (e) e.innerHTML = '✅ Şablon yakalandı! Pencereyi kapat, tekrar "Giden Gönder" bas.'; } } catch (e) {} }, 1500);
        return;
      }
      const TK = tokenBul(); const H = { 'Content-Type': 'application/json; charset=utf-8' }; if (TK) H.Token = TK;
      // İptal/red hariç + sadece bu yıl
      const yil = String(new Date().getFullYear());
      const gec = giden.filter(x => (x.tarih || '').indexOf(yil) >= 0 && !/iptal|red/i.test(x.status || '') && x.tutar > 0);
      // Mevcut gelir belge nolar (mükerrer)
      const mevcut = new Set();
      try { const R = await pullGelirDB(null); R.all.forEach(r => { if (r.belgeSiraNo) mevcut.add(norm(r.belgeSiraNo)); }); } catch (e) {}
      const kTmpl = (tmpl.kayitlar && tmpl.kayitlar[0]) || {};

      bar.innerHTML = '<div style="margin-bottom:8px">' + gec.length + ' satış faturası · Şablon belge türü <b>' + tmpl.gelirBelgeTuruKodu + '</b></div>' +
        '<label style="display:block;margin-bottom:10px"><input type="checkbox" id="__stTest" checked> 🧪 Test modu (sadece 1 fatura, kaydetmeden sonuç göster)</label>' +
        '<button id="__stStart" style="background:#2563eb;color:#fff;border:0;padding:11px 20px;border-radius:8px;font-weight:800;cursor:pointer">🚀 Gönder</button>' +
        '<div id="__stLog" style="margin-top:12px;font-family:Consolas,monospace;font-size:12px;max-height:340px;overflow:auto;background:#0b1020;padding:10px;border-radius:8px"></div>';
      const logEl = D.getElementById('__stLog');
      const slog = (t, c) => { const d = document.createElement('div'); d.style.color = c || '#9aa6c0'; d.textContent = t; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; };

      D.getElementById('__stStart').onclick = async () => {
        const test = D.getElementById('__stTest').checked;
        D.getElementById('__stStart').disabled = true;
        let ok = 0, f = 0, atla = 0;
        slog('🚀 ' + gec.length + ' satış faturası · Test: ' + (test ? 'AÇIK' : 'KAPALI'), '#2563eb');
        for (const x of gec) {
          const no = (x.no || '').toString();
          if (mevcut.has(norm(no))) { atla++; slog('⏭ ' + no + ' zaten kayıtlı', '#9aa6c0'); continue; }
          const tutar = x.tutar, kdv = x.kdv, matrah = r2(tutar - kdv);
          const oran = matrah > 0 ? Math.round(kdv / matrah * 100) : 0;
          if ([0, 1, 8, 10, 18, 20].indexOf(oran) < 0) { slog('⚠ ' + no + ' KDV oranı belirsiz (%' + oran + ') — karışık oranlı olabilir, ELLE gir', '#fbbf24'); atla++; continue; }
          try {
            const t = iso((x.tarih || '').slice(0, 10));
            const P = JSON.parse(JSON.stringify(tmpl));
            P.kayitTarihi = t; P.belgeTarihi = t; P.belgeSiraNo = no;
            // Alıcı bilgisi
            if (x.vkn) {
              try { const lj = await (await fetch(B + '/adresdefteri/findbytckn/' + x.vkn, { method: 'POST', headers: H, body: '{}', credentials: 'include' })).json(); const rc = lj.resultContainer; if (rc) { P.tcknVkn = x.vkn; P.ad = rc.ad; P.soyad = rc.soyad; P.vergiDairesiKodu = rc.vergiDairesiKodu; if (rc.subeNo) P.subeNo = rc.subeNo; P.nihaiTuketici = false; } } catch (e) {}
            }
            const k = JSON.parse(JSON.stringify(kTmpl));
            k.tutar = matrah; k.isKdvDahil = false; if ('kdv' in k) k.kdv = kdv; k.kdvOrani = oran;
            k.aciklama = (x.unvan || '').toLocaleUpperCase('tr') + ' - MAL SATIŞI';
            delete k.id; delete k.gelirBelgeId; delete k.key;
            P.kayitlar = [k]; P.belgeTutari = r2(tutar);
            delete P.id; delete P.gelirBelgeId; delete P.key;
            if (test) { slog('🧪 ' + no + ' hazırlandı: matrah ' + matrah.toFixed(2) + ' · KDV ' + kdv.toFixed(2) + ' (%' + oran + ') · alıcı ' + (x.vkn || 'nihai') + ' — KAYDEDİLMEDİ', '#fbbf24'); ok++; break; }
            const cr = await fetch(B + '/gelir/create', { method: 'POST', headers: H, body: JSON.stringify(P), credentials: 'include' });
            const cj = await cr.json();
            if (cr.status === 200 && cj.resultContainer && !cj.errorMessage) { ok++; mevcut.add(norm(no)); slog('✅ ' + no + ' (' + tutar.toFixed(2) + ')', '#10b981'); }
            else { const m = (cj.errorMessage || cj.statusMessage || cr.status).toString(); if (/aynı|mükerrer|zaten/i.test(m)) { atla++; slog('⏭ ' + no + ' zaten var', '#9aa6c0'); } else { f++; slog('❌ ' + no + ' — ' + m.slice(0, 100), '#ef4444'); } }
          } catch (e) { f++; slog('❌ ' + no + ' — ' + e.message, '#ef4444'); }
        }
        slog('🎉 Bitti — ✅ Yeni: ' + ok + ' · ⏭ Atlanan: ' + atla + (f ? ' · ❌ Hata: ' + f : ''), f ? '#fbbf24' : '#10b981');
        if (test) slog('🧪 Test bitti. Doğruysa test modunu kapatıp tekrar bas.', '#fbbf24');
        D.getElementById('__stStart').disabled = false;
      };
    }

    // ── e-SM Makbuzu (Verilen) ↔ Gelir · Eksik Bul (GİB kesilen makbuz tablosunu kazır, gelirle karşılaştırır)
    async function esmmEksik() {
      const bar = overlayAc('📋 e-SM Makbuzu (Verilen) ↔ Gelir · Eksik Kontrol');
      let tbl = null;
      document.querySelectorAll('table').forEach(t => { const h = t.querySelector('thead'); if (!tbl && h && /fatura no/i.test(h.innerText) && /(net tahsil|alıcı|brüt)/i.test(h.innerText)) tbl = t; });
      if (!tbl) { bar.innerHTML = '<div style="color:#fcd34d;line-height:1.8">Bu sayfada makbuz tablosu yok.<br><b>Yap:</b> Sol menü → <b>Mali Bilgilerim → e-SM Makbuzu (Verilen)</b> → tarih aralığını <b>01.06.2026 – 30.06.2026</b> seç → <b>Görüntüle</b> → sonra bu butona tekrar bas.</div>'; return; }
      const makbuz = [];
      tbl.querySelectorAll('tbody tr').forEach(tr => { const td = tr.querySelectorAll('td'); if (td.length >= 5) { const no = (td[0].textContent || '').trim(); if (/^[A-Z]{2,4}\d/.test(no)) makbuz.push({ no, alici: (td[2] ? td[2].textContent : '').trim(), tarih: (td[4] ? td[4].textContent : '').trim(), brut: (td[5] ? td[5].textContent : '').trim() }); } });
      if (!makbuz.length) { bar.innerHTML = '<div style="color:#fcd34d">Tabloda makbuz satırı okunamadı. Tarih aralığını seçip Görüntüle\'ye bastığından emin ol.</div>'; return; }
      bar.textContent = 'Defter Beyan gelir kayıtları çekiliyor…';
      let R; try { R = await pullGelirDB(bar); } catch (e) { bar.innerHTML = '<span style="color:#fca5a5">Hata: ' + e.message + '</span>'; return; }
      const dbNos = new Set(R.all.map(r => norm(r.belgeSiraNo)).filter(Boolean));
      const eksik = makbuz.filter(m => !dbNos.has(norm(m.no)));
      let h = '<div style="margin-bottom:12px">' + chip('Kesilen Makbuz', makbuz.length, '#1e3a2f') + chip('Deftere Girilmiş', makbuz.length - eksik.length, '#1e2f3a') + chip('EKSİK', eksik.length, eksik.length ? '#5b1a1a' : '#1e3a2f') + '</div>';
      if (!eksik.length) { h += '<div style="color:#6ee7b7;font-size:16px;padding:12px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);border-radius:10px">✅ Tüm kesilen makbuzlar deftere girilmiş — <b>EKSİK YOK.</b></div>'; }
      else {
        h += '<div style="margin-bottom:8px;color:#fca5a5;font-weight:700">⚠️ ' + eksik.length + ' makbuz kesilmiş ama deftere GİRİLMEMİŞ:</div>';
        h += '<div style="overflow:auto;border:1px solid #5b1a1a;border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#2a1414;text-align:left">' + ['Fatura No', 'Alıcı', 'Tarih', 'Brüt (KDV Hariç)'].map(x => '<th style="padding:8px">' + x + '</th>').join('') + '</tr></thead><tbody>';
        eksik.forEach(m => { h += '<tr style="border-top:1px solid #3a1a1a"><td style="padding:7px;color:#fca5a5;font-weight:700">' + m.no + '</td><td style="padding:7px">' + m.alici.slice(0, 45) + '</td><td style="padding:7px">' + m.tarih + '</td><td style="padding:7px;text-align:right">' + m.brut + '</td></tr>'; });
        h += '</tbody></table></div>';
      }
      bar.innerHTML = h;
    }

    async function calistir() {
      const bar = overlayAc('📊 Defter Beyan · Gider Kontrol');
      let R;
      try { R = await pullDB(bar); }
      catch (e) { bar.innerHTML = '<span style="color:#fca5a5">Hata: ' + e.message + '</span>'; return; }
      const all = R.all, T = R.T;

      /* kontroller */
      const seen = {}, dup = [];
      all.forEach(r => { const k = norm(r.tcknVkn) + '|' + norm(r.belgeSiraNo) + '|' + r.tutar; if (seen[k]) dup.push(r); else seen[k] = 1; });
      const kdvE = all.filter(r => { if (r.kdvsizIslem) return false; const b = Math.round(r.tutar * r.kdvOrani) / 100; return Math.abs(b - (r.kdv || 0)) > 0.05; });
      const byBelge = {};
      all.forEach(r => { const k = norm(r.tcknVkn) + '|' + norm(r.belgeSiraNo); (byBelge[k] = byBelge[k] || []).push(r); });
      const oivRe = /iletişim|iletisim|turknet|telefon|haberleşme|haberlesme|internet|gsm|turkcell|vodafone|türk ?telekom|turk ?telekom|ttnet|superonline/i;
      const isOIV = r => { if (r.aciklama && r.aciklama.trim()) return false; const k = norm(r.tcknVkn) + '|' + norm(r.belgeSiraNo); return (byBelge[k] || []).some(x => oivRe.test(x.aciklama || '')); };
      const oiv = all.filter(isOIV);
      const bos = all.filter(r => (!r.aciklama || !r.aciklama.trim()) && !isOIV(r));

      /* Uyumsoft capraz kontrol (eklenti hafizasindan) */
      let uyumBox = '';
      let aktifAy = 'tum';  /* secili ay — hem EKSIK hem Deftere Kayitli tablosunu filtreler */
      try {
        const store = await chrome.storage.local.get('uyumGelen');
        const u = store && store.uyumGelen;
        if (u && u.list && u.list.length) {
          const dbNos = new Set(all.map(r => norm(r.belgeSiraNo)).filter(Boolean));
          const yil = String(new Date().getFullYear());
          const yilOf = x => { const m = (x.tarih || '').match(/\d{4}/g); return m ? m[m.length - 1] : ''; };
          const buYil = u.list.filter(x => yilOf(x) === yil);
          const eksik = buYil.filter(x => { const n = norm(x.no); return n && !dbNos.has(n); });
          const yas = Math.round((Date.now() - u.ts) / 60000);
          uyumBox = '<div style="margin:18px 0 8px"><b style="font-size:15px;color:#fcd34d">🔗 Uyumsoft Çapraz Kontrol · ' + yil + '</b> <span style="font-size:11px;color:#9aa6c0">(' + u.list.length + ' gelen fatura alındı · ' + buYil.length + ' tanesi ' + yil + ' · ' + yas + ' dk önce)</span></div>';
          uyumBox += '<div style="margin-bottom:10px">' + chip(yil + ' Gelen', buYil.length, '#1f2937') + chip('Deftere Girilmiş', buYil.length - eksik.length, '#1e3a2f') + chip('EKSİK (girilmemiş)', eksik.length, eksik.length ? '#5b1a1a' : '#1e3a2f') + '</div>';
          uyumBox += '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(252,211,77,.08);border:1px solid rgba(252,211,77,.25);border-radius:8px;color:#fcd34d;font-size:11.5px">⚠️ Not: Aşağıdaki bazı kayıtlar (Migros, ŞOK, Getir, marketler) şahsi/indirilemez harcama olabilir — deftere girilmemesi normaldir. İşletmeyle ilgili olanları (mal alışı, tedarikçi, gider) sen seç.</div>';
          if (eksik.length) {
            const ayOf = x => { const p = (x.tarih || '').split('.'); return p[1] || '00'; };
            const adlar = { '01': 'Oca', '02': 'Şub', '03': 'Mar', '04': 'Nis', '05': 'May', '06': 'Haz', '07': 'Tem', '08': 'Ağu', '09': 'Eyl', '10': 'Eki', '11': 'Kas', '12': 'Ara' };
            const mevcutAylar = [...new Set(eksik.map(ayOf))].sort();
            const buAy = ('0' + (new Date().getMonth() + 1)).slice(-2);
            aktifAy = mevcutAylar.indexOf(buAy) >= 0 ? buAy : 'tum';
            let btns = '<div id="__eksikAy" style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px">';
            btns += '<button class="ayb" data-ay="tum" style="padding:6px 12px;border-radius:8px;border:1px solid #3a3550;background:' + (aktifAy === 'tum' ? '#d4af37' : 'transparent') + ';color:' + (aktifAy === 'tum' ? '#0b1224' : '#e8edf5') + ';font-weight:700;cursor:pointer">Tümü (' + eksik.length + ')</button>';
            mevcutAylar.forEach(a => {
              const say = eksik.filter(x => ayOf(x) === a).length;
              btns += '<button class="ayb" data-ay="' + a + '" style="padding:6px 12px;border-radius:8px;border:1px solid #3a3550;background:' + (aktifAy === a ? '#d4af37' : 'transparent') + ';color:' + (aktifAy === a ? '#0b1224' : '#e8edf5') + ';font-weight:700;cursor:pointer">' + (adlar[a] || a) + ' (' + say + ')</button>';
            });
            btns += '</div>';
            uyumBox += btns;
            /* Araç gideri tespiti — kısıtlamaya tabi, otomatik işlenmez, uyarılır */
            const aracRe = /tüvturk|tuvturk|muayene istasyon|akaryakıt|akaryakit|petrol ofisi|opet|shell|aytemiz|total ?energ|bp ?petrol|benzin|motorin|lpg|oto ?lastik|lastik|oto ?yıkama|oto ?servis|oto ?kiralama|rent ?a ?car|kasko|trafik sigorta|zorunlu mali|otopark|otoyol|hgs|ogs|köprü geçiş|araç ?bakım|yedek parça|galeri|otomotiv|motorlu taşıt/i;
            const isArac = x => aracRe.test((x.unvan || '') + ' ' + (x.no || ''));
            const aracSay = eksik.filter(isArac).length;
            if (aracSay) {
              uyumBox += '<div style="margin-bottom:10px;padding:9px 13px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);border-radius:8px;color:#fca5a5;font-size:12.5px"><b>🚗 ' + aracSay + ' araç faturası tespit edildi.</b> Araç giderleri (akaryakıt, muayene, kasko, lastik, bakım) <b>özel kısıtlamaya</b> tabidir — binek otoda gider/KDV kısıtı uygulanır. Bunlar <b>otomatik işlenmez</b>, aşağıda 🚗 işaretli; lütfen elle kontrol edip uygun türde gir.</div>';
            }
            uyumBox += '<div style="overflow:auto;border:1px solid #5b1a1a;border-radius:8px;margin-bottom:18px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#2a1414;text-align:left">' + ['Fatura No', 'Tarih', 'Gönderen', 'VKN/TC', 'Durum', 'Tür'].map(x => '<th style="padding:8px">' + x + '</th>').join('') + '</tr></thead><tbody id="__eksikBody">';
            eksik.forEach(x => { const a = ayOf(x); const gizli = (aktifAy !== 'tum' && a !== aktifAy); const arac = isArac(x); const tur = arac ? '<span style="color:#fca5a5;font-weight:700">🚗 ARAÇ</span>' : '<span style="color:#9aa6c0">—</span>'; uyumBox += '<tr class="eksikRow" data-ay="' + a + '" style="border-top:1px solid #3a1a1a;' + (arac ? 'background:rgba(239,68,68,.06);' : '') + (gizli ? 'display:none' : '') + '"><td style="padding:7px;color:#fca5a5;font-weight:700">' + (x.no || '') + '</td><td style="padding:7px">' + (x.tarih || '').slice(0, 10) + '</td><td style="padding:7px">' + (x.unvan || '').slice(0, 50) + '</td><td style="padding:7px">' + (x.vkn || '') + '</td><td style="padding:7px">' + (x.status || '') + '</td><td style="padding:7px">' + tur + '</td></tr>'; });
            uyumBox += '</tbody></table></div>';
          } else {
            uyumBox += '<div style="color:#6ee7b7;margin-bottom:18px">✓ Uyumsoft\'taki tüm gelen faturalar deftere girilmiş.</div>';
          }
        } else {
          uyumBox = '<div style="margin:16px 0;padding:12px 14px;background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.3);border-radius:10px;color:#fcd34d;font-size:12.5px">🔗 Uyumsoft karşılaştırması için: önce Uyumsoft Gelen sayfasında <b>📥 Gelen Faturaları Al</b> butonuna bas, sonra buraya dön.</div>';
        }
      } catch (e) {}

      let h = '<div style="margin-bottom:12px">' +
        chip('Kayıt', all.length, '#1f2937') +
        chip('Toplam Gider', '₺' + fmt(T.g), '#1e3a2f') +
        chip('İnd. KDV', '₺' + fmt(T.k), '#1e2f3a') +
        chip('Stopaj', '₺' + fmt(T.s), '#2f1e3a') +
        chip('Mükerrer', dup.length, dup.length ? '#5b1a1a' : '#1f2937') +
        chip('KDV Uyumsuz', kdvE.length, kdvE.length ? '#5b3a1a' : '#1f2937') +
        chip('ÖİV', oiv.length, oiv.length ? '#3a341a' : '#1f2937') +
        chip('Boş Açıklama', bos.length, bos.length ? '#5b3a1a' : '#1f2937') +
        '</div>';
      h += uyumBox;

      const flag = r => {
        if (isOIV(r)) return '<span style="color:#fcd34d;font-weight:700">ÖİV</span>';
        const a = [];
        if (dup.indexOf(r) >= 0) a.push('MÜKERRER');
        if (kdvE.indexOf(r) >= 0) a.push('KDV?');
        if (bos.indexOf(r) >= 0) a.push('AÇIKLAMA?');
        return a.length ? '<span style="color:#fca5a5;font-weight:700">' + a.join(' ') + '</span>' : '<span style="color:#6ee7b7">✓</span>';
      };
      const cols = ['Belge Tarihi', 'Belge No', 'VKN/TC', 'Açıklama', 'Matrah', 'KDV%', 'KDV', 'Stopaj', 'Kontrol'];
      h += '<div style="margin:10px 0 6px"><b style="font-size:14px">📒 Deftere Kayıtlı Giderler</b>' + (aktifAy !== 'tum' ? ' <span style="font-size:11px;color:#9aa6c0">(yukarıdaki ay seçimine göre filtreli — "Tümü" ile hepsini gör)</span>' : '') + '</div>';
      h += '<div style="overflow:auto;border:1px solid #2a3550;border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#141c2e;text-align:left">' + cols.map(x => '<th style="padding:8px">' + x + '</th>').join('') + '</tr></thead><tbody>';
      const ayGid = r => { const t = (r.belgeTarihi || ''); if (/^\d{4}-\d{2}/.test(t)) return t.slice(5, 7); const p = t.split('.'); return p[1] || '00'; };
      all.forEach(r => {
        const a = ayGid(r); const gizli = (aktifAy !== 'tum' && a !== aktifAy);
        h += '<tr class="giderRow" data-ay="' + a + '" style="border-top:1px solid #1f2840;' + (gizli ? 'display:none' : '') + '"><td style="padding:7px">' + (r.belgeTarihi || '').slice(0, 10) + '</td><td style="padding:7px">' + (r.belgeSiraNo || '') + '</td><td style="padding:7px">' + (r.tcknVkn || '') + '</td><td style="padding:7px">' + ((r.aciklama || '').slice(0, 60)) + '</td><td style="padding:7px;text-align:right">' + fmt(r.tutar) + '</td><td style="padding:7px;text-align:right">' + (r.kdvOrani || 0) + '</td><td style="padding:7px;text-align:right">' + fmt(r.kdv) + '</td><td style="padding:7px;text-align:right">' + fmt(r.stopajTutari) + '</td><td style="padding:7px">' + flag(r) + '</td></tr>';
      });
      h += '</tbody></table></div>';
      bar.innerHTML = h;

      /* Ay filtre butonlarini bagla */
      const ayBar = document.getElementById('__eksikAy');
      if (ayBar) {
        ayBar.querySelectorAll('.ayb').forEach(b => {
          b.onclick = () => {
            const sec = b.getAttribute('data-ay');
            ayBar.querySelectorAll('.ayb').forEach(x => { x.style.background = 'transparent'; x.style.color = '#e8edf5'; });
            b.style.background = '#d4af37'; b.style.color = '#0b1224';
            document.querySelectorAll('#__eksikBody .eksikRow').forEach(tr => {
              tr.style.display = (sec === 'tum' || tr.getAttribute('data-ay') === sec) ? '' : 'none';
            });
            document.querySelectorAll('.giderRow').forEach(tr => {
              tr.style.display = (sec === 'tum' || tr.getAttribute('data-ay') === sec) ? '' : 'none';
            });
          };
        });
      }
    }

    const kur = () => {
      sicilAdresYakala(); // Sicil sayfasındaysak hesap adresini yakala
      butonEkle('📊 Gider Kontrol', calistir, null, '__gkBtn', 20);
      butonEkle('📥 Panodan Gider Gönder', panodanGonder, 'linear-gradient(135deg,#3b82f6,#1d4ed8)', '__gonderBtn', 76);
      butonEkle('📊 Gelir Kontrol', gelirKontrol, 'linear-gradient(135deg,#d4af37,#b8941f)', '__glBtn', 132);
      butonEkle('📤 Giden (Satış) Gönder', gidenGonder, 'linear-gradient(135deg,#60a5fa,#2563eb)', '__gdGonderBtn', 188);
      butonEkle('📋 e-SMM Eksik Bul', esmmEksik, 'linear-gradient(135deg,#34d399,#059669)', '__esmmBtn', 244);
      butonEkle('🔒 Kimlik/Adres Kontrol', kimlikKontrol, 'linear-gradient(135deg,#a78bfa,#7c3aed)', '__kimlikBtn', 300);
    };
    kur();
    setInterval(kur, 2000);
  }

  /* ════════════════ UYUMSOFT PORTAL (portal.uyumsoft.com.tr) ════════════════
     🔎 Alıcı Bilgi Kontrol motoru:
     Gelen Fatura listesindeki her fatura için /GelenFaturaGoruntule/{uuid}/false
     sayfasını çeker, gömülü UBL XML'den AccountingCustomerParty (alıcı) bloğunu
     ayıklar ve LEVHA kaydıyla kıyaslar (TCKN/VKN + Ad + Adres; VD yalnız VKN'de —
     TCKN'li şahıs faturasında alıcı VD'nin boş olması GİB standardında normaldir).
     Tutmayanlar storage'a yazılır → Defter Beyan "Panodan Gider Gönder" bunları
     gönderime SOKMAZ. Salt-okuma. */
  else if (/uyumsoft\.com\.tr/.test(host)) {
    const unesc = s => (s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    // Ad-alanı önekli (cac:/cbc:) etiketin iç XML'i / düz metni
    const tagIc = (txt, tag) => { const m = (txt || '').match(new RegExp('<(?:\\w+:)?' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?' + tag + '>')); return m ? m[1] : ''; };
    const tagTxt = (txt, tag) => tagIc(txt, tag).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

    // Fatura görüntüleme HTML'inden alıcı (AccountingCustomerParty) bilgisi ayıkla.
    // XML sayfada ham veya HTML-escape'li (&lt;cac:...&gt;) gömülü olabilir; ikisini de dener.
    function aliciAyikla(html) {
      let t = html || '';
      let blok = tagIc(t, 'AccountingCustomerParty');
      if (!blok) { t = unesc(t); blok = tagIc(t, 'AccountingCustomerParty'); }
      if (!blok) return null;
      let tckn = '', vkn = '', m;
      const idRe = /<(?:\w+:)?ID\s[^>]*schemeID="(TCKN|VKN)"[^>]*>\s*(\d+)/g;
      while ((m = idRe.exec(blok))) { if (m[1] === 'TCKN') tckn = m[2]; else vkn = m[2]; }
      const ad = ((tagTxt(blok, 'FirstName') + ' ' + tagTxt(blok, 'FamilyName')).trim()) || tagTxt(tagIc(blok, 'PartyName'), 'Name');
      const vd = tagTxt(tagIc(blok, 'PartyTaxScheme'), 'Name');
      const pa = tagIc(blok, 'PostalAddress');
      const adres = ['StreetName', 'BuildingName', 'BuildingNumber', 'Room', 'District', 'CitySubdivisionName', 'CityName']
        .map(k => tagTxt(pa, k)).filter(Boolean).join(' ');
      const ettn = tagTxt(t, 'UUID');
      const fno = (t.match(/<(?:\w+:)?ID(?:\s[^>]*)?>\s*([A-Z0-9]{3}20\d{11})\s*</) || ['', ''])[1];
      return { tckn, vkn, ad, vd, adres, ettn, fno };
    }

    // Ekrandaki Gelen Fatura tablosundan UUID'leri topla (satırlarda gizli invoiceId inputları var)
    function faturalariTopla() {
      const map = new Map();
      document.querySelectorAll('tr').forEach(tr => {
        let uuid = '';
        const inp = tr.querySelector('input[name="invoiceId"], input.invoiceId, input[id*="invoiceId" i]');
        if (inp && /^[0-9a-f-]{36}$/i.test(inp.value)) uuid = inp.value;
        if (!uuid) { const mm = (tr.innerHTML || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i); if (mm) uuid = mm[0]; }
        if (!uuid || map.has(uuid.toLowerCase())) return;
        const metin = (tr.innerText || '').replace(/\s+/g, ' ').trim();
        const no = (metin.match(/[A-Z0-9]{3}20\d{11}/) || [''])[0];
        map.set(uuid.toLowerCase(), { uuid, no, satir: metin.slice(0, 90) });
      });
      return [...map.values()];
    }

    // Alıcıyı levhayla kıyasla → { uygun, sebep, detay }
    function aliciKiyasla(a) {
      const kim = a.tckn || a.vkn;
      const rec = kim ? LEVHA_BY_ID[kim] : null;
      if (!kim) return { uygun: false, sebep: 'Faturada alıcı TCKN/VKN yok', detay: '' };
      if (!rec) return { uygun: false, sebep: 'Levhada kayıtlı değil: ' + kim, detay: '' };
      const adL = trAscii(rec.ad).split(' ').filter(x => x.length > 1);
      const adF = trAscii(a.ad);
      const adHit = adL.filter(t => adF.includes(t)).length;
      const adOk = adL.length > 0 && adHit === adL.length;
      const adr = adresBenzer(rec.adres, a.adres);
      const karar = adresKarar(adr.skor);
      // VD kuralı: TCKN'li şahısta faturada VD boş olabilir (normal). VKN tüzelde VD karşılaştırılır.
      const vdGerek = !a.tckn && !!a.vkn;
      const vdOk = vdGerek ? (!!a.vd && trAscii(a.vd) === trAscii(rec.vd || '')) : (!a.vd || trAscii(a.vd) === trAscii(rec.vd || ''));
      const uygun = adOk && vdOk && karar.islenir;
      const yzd = Math.round(adr.skor * 100);
      const detay = (a.tckn ? 'TCKN ✓' : 'VKN ✓') + ' · Ad ' + (adOk ? '✓' : '✗') + ' · Adres %' + yzd + ' ' + (karar.islenir ? '✓' : '✗') +
        (vdGerek ? ' · VD ' + (vdOk ? '✓' : '✗') : (a.vd ? ' · VD ' + (vdOk ? '✓' : '✗') : ' · VD boş (şahıs, normal)'));
      let sebep = '';
      if (!adOk) sebep = 'Ad tutmuyor: fatura "' + (a.ad || '—') + '" / levha "' + rec.ad + '"';
      else if (!karar.islenir) sebep = 'Adres tutmuyor (%' + yzd + '): fatura "' + (a.adres || '—').slice(0, 70) + '"';
      else if (!vdOk) sebep = 'VD tutmuyor: fatura "' + (a.vd || '—') + '" / levha "' + (rec.vd || '—') + '"';
      return { uygun, sebep, detay, rec, yzd };
    }

    const bekle = ms => new Promise(r => setTimeout(r, ms));
    const ilkUuid = () => { const l = faturalariTopla(); return l.length ? l[0].uuid : ''; };

    // TAM OTOMATİK toplama: sayfa boyutunu en büyüğe (250) kendisi çeker,
    // "Sonraki" ile TÜM sayfaları kendisi gezer, bütün faturaları toplar.
    async function tumFaturalariTopla(bar) {
      const hepsi = new Map();
      // 1) Sayfa boyutu → mevcut en büyük seçenek
      const sel = document.querySelector('select[name$="_length"], .dataTables_length select, select.pageSize, select[onchange*="length" i]');
      if (sel && sel.options && sel.options.length) {
        const enB = Math.max(...[...sel.options].map(o => +o.value).filter(v => v > 0));
        if (enB > (+sel.value || 0)) {
          sel.value = String(enB);
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          if (bar) bar.textContent = '📄 Sayfa boyutu ' + enB + ' yapıldı, tablo yenileniyor…';
          await bekle(3000);
        }
      }
      // 2) Tüm sayfaları gez
      let guard = 0;
      while (guard++ < 300) {
        faturalariTopla().forEach(f => hepsi.set(f.uuid.toLowerCase(), f));
        if (bar) bar.textContent = '📄 Sayfalar geziliyor… toplanan fatura: ' + hepsi.size;
        const next = document.querySelector('a.paginate_button.next, li.next a, a[title="Sonraki" i], a[aria-label="Next" i], .pagination .next a');
        const kapali = !next || /disabled/i.test((next.className || '') + ' ' + ((next.parentElement && next.parentElement.className) || ''));
        if (kapali) break;
        const onceki = ilkUuid();
        next.click();
        let t = 0; while (t++ < 40) { await bekle(300); if (ilkUuid() !== onceki) break; }
        if (ilkUuid() === onceki) break; // sayfa değişmedi → son sayfa
      }
      return [...hepsi.values()];
    }

    async function aliciKontrol() {
      const bar = overlayAc('🔎 Alıcı Bilgi Kontrol · Gelen Fatura ↔ Levha (otomatik)');
      bar.textContent = '📄 Faturalar toplanıyor…';
      let list;
      try { list = await tumFaturalariTopla(bar); } catch (e) { list = faturalariTopla(); }
      if (!list.length) {
        bar.innerHTML = '<div style="color:#fcd34d;line-height:1.8">Bu sayfada gelen fatura satırı bulunamadı.<br>Gelen Fatura → <b>Tümü</b> listesini aç — motor gerisini kendisi yapar (sayfa boyutu + tüm sayfalar otomatik).</div>';
        return;
      }
      bar.innerHTML = '<div id="__akDurum">🔎 ' + list.length + ' fatura kontrol ediliyor… 0/' + list.length + '</div><div id="__akRows" style="margin-top:10px"></div>';
      const sonuc = [];
      let bitti = 0;
      async function tekKontrol(f) {
        try {
          const r = await fetch('/GelenFaturaGoruntule/' + f.uuid + '/false', { credentials: 'include' });
          if (r.status !== 200) throw new Error('HTTP ' + r.status);
          const a = aliciAyikla(await r.text());
          if (!a) return { f, uygun: false, sebep: 'XML/alıcı bloğu okunamadı', detay: '' };
          const k = aliciKiyasla(a);
          return { f, a, uygun: k.uygun, sebep: k.sebep, detay: k.detay };
        } catch (e) { return { f, uygun: false, sebep: 'Hata: ' + e.message, detay: '' }; }
      }
      for (let i = 0; i < list.length; i += 4) {
        const res = await Promise.all(list.slice(i, i + 4).map(tekKontrol));
        res.forEach(r => sonuc.push(r));
        bitti = Math.min(i + 4, list.length);
        const d = document.getElementById('__akDurum');
        if (d) d.textContent = '🔎 Kontrol ediliyor… ' + bitti + '/' + list.length;
      }
      const uygun = sonuc.filter(r => r.uygun), red = sonuc.filter(r => !r.uygun);
      // Sonuçları hafızaya yaz → Defter Beyan "Panodan Gider Gönder" red'leri göndermesin
      try {
        const st = await chrome.storage.local.get('aliciKontrol');
        const mapEski = (st.aliciKontrol && st.aliciKontrol.map) || {};
        sonuc.forEach(r => {
          const no = ((r.a && r.a.fno) || r.f.no || '').replace(/[^0-9A-Za-z]/g, '');
          if (no) mapEski[norm(no)] = { uygun: r.uygun, sebep: r.sebep || '', detay: r.detay || '', ts: Date.now() };
        });
        await chrome.storage.local.set({ aliciKontrol: { ts: Date.now(), map: mapEski } });
      } catch (e) {}
      let h = '<div style="margin-bottom:12px">' + chip('Kontrol Edilen', sonuc.length, '#1e2f3a') + chip('UYGUN', uygun.length, '#1e3a2f') + chip('UYGUN DEĞİL', red.length, red.length ? '#5b1a1a' : '#1e3a2f') + '</div>';
      h += '<div style="margin-bottom:10px;padding:10px 12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:8px;color:#6ee7b7;font-size:12px">Sonuçlar kaydedildi — Defter Beyan\'da <b>📥 Panodan Gider Gönder</b> artık "UYGUN DEĞİL" faturaları otomatik atlar.</div>';
      const satirHtml = r => {
        const no = (r.a && r.a.fno) || r.f.no || r.f.uuid.slice(0, 8);
        return '<tr style="border-top:1px solid #1f2840"><td style="padding:7px;font-weight:700;color:' + (r.uygun ? '#6ee7b7' : '#fca5a5') + '">' + (r.uygun ? '✅' : '⛔') + ' ' + no + '</td>' +
          '<td style="padding:7px">' + ((r.a && r.a.ad) || r.f.satir.slice(0, 40)) + '</td>' +
          '<td style="padding:7px">' + (r.detay || '') + '</td>' +
          '<td style="padding:7px;color:#fca5a5">' + (r.sebep || '') + '</td></tr>';
      };
      h += '<div style="overflow:auto;border:1px solid #2a3550;border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#141c2e;text-align:left">' + ['Fatura', 'Alıcı (faturadaki)', 'Kontrol', 'Sebep'].map(x => '<th style="padding:8px">' + x + '</th>').join('') + '</tr></thead><tbody>';
      red.forEach(r => { h += satirHtml(r); });
      uygun.forEach(r => { h += satirHtml(r); });
      h += '</tbody></table></div>';
      bar.innerHTML = h;
    }

    const kurPortal = () => {
      butonEkle('🔎 Alıcı Bilgi Kontrol', aliciKontrol, 'linear-gradient(135deg,#a78bfa,#7c3aed)', '__akBtn', 20);
    };
    kurPortal();
    setInterval(kurPortal, 2000);

    // ⚡ TAM OTOMATİK BAŞLATMA: Gelen Fatura listesi açılınca (satırlar yüklenince)
    // kontrol kendiliğinden başlar — hiçbir tıklama gerekmez. Sekme başına 1 kez;
    // yeniden çalıştırmak istersen butona basman yeter.
    (function otoBaslat() {
      if (sessionStorage.getItem('__akOto')) return;
      let deneme = 0;
      const iv = setInterval(() => {
        deneme++;
        if (sessionStorage.getItem('__akOto')) { clearInterval(iv); return; }
        if (/gelen/i.test(location.pathname + location.search) && faturalariTopla().length) {
          clearInterval(iv);
          sessionStorage.setItem('__akOto', '1');
          aliciKontrol();
        }
        if (deneme > 60) clearInterval(iv); // ~2 dk içinde liste gelmediyse bekleme
      }, 2000);
    })();
  }

  /* ════════════════════ UYUMSOFT ════════════════════ */
  else if (/uyum\.com\.tr/.test(host)) {
    async function pullUyum(bar) {
      let start = 0, len = 100, total = Infinity, all = [];
      while (start < total) {
        const body = 'sEcho=1&iColumns=11&iDisplayStart=' + start + '&iDisplayLength=' + len +
          '&mDataProp_1=InvoiceNumber&mDataProp_2=ExecutionDate&mDataProp_3=CreateDateUtc&mDataProp_4=Title&mDataProp_5=PayableAmount&mDataProp_6=TaxTotal&mDataProp_7=Type&mDataProp_8=Status&mDataProp_9=IsNew&mDataProp_10=InvoiceActions' +
          '&IsNewFilter=3&IsSeenFilter=None&ShowOlderThanOneYear=true&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1';
        const r = await fetch('/Invoicebox/GetInboxInvoiceJsonList', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'include', body
        });
        const j = await r.json();
        total = j.iTotalRecords || (j.aaData || []).length;
        (j.aaData || []).forEach(d => all.push({
          no: d.InvoiceNumber, tarih: d.ExecutionDate, vkn: d.TargetVknTckn,
          unvan: d.Title, status: d.Status, type: d.Type
        }));
        if (bar) bar.textContent = 'Uyumsoft gelen faturalar çekiliyor… ' + all.length + '/' + total;
        if (!(j.aaData || []).length) break;
        start += len;
        if (start > 50000) break;
      }
      return all;
    }

    async function calistir() {
      const bar = overlayAc('📥 Uyumsoft · Gelen Faturalar');
      let all;
      try { all = await pullUyum(bar); }
      catch (e) { bar.innerHTML = '<span style="color:#fca5a5">Hata: ' + e.message + '</span>'; return; }

      try { await chrome.storage.local.set({ uyumGelen: { ts: Date.now(), list: all } }); } catch (e) {}

      const ayOf = x => { const p = (x.tarih || '').split('.'); return p[1] || '00'; };
      const adlar = { '01': 'Oca', '02': 'Şub', '03': 'Mar', '04': 'Nis', '05': 'May', '06': 'Haz', '07': 'Tem', '08': 'Ağu', '09': 'Eyl', '10': 'Eki', '11': 'Kas', '12': 'Ara' };
      const mevcutAylar = [...new Set(all.map(ayOf))].sort();
      const buAy = ('0' + (new Date().getMonth() + 1)).slice(-2);
      const aktifAy = mevcutAylar.indexOf(buAy) >= 0 ? buAy : 'tum';

      let h = '<div style="margin-bottom:12px">' + chip('Gelen Fatura', all.length, '#1e3a2f') + '</div>';
      h += '<div style="margin:8px 0;padding:12px 14px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);border-radius:10px;color:#6ee7b7;font-size:12.5px">✓ ' + all.length + ' gelen fatura kaydedildi. Şimdi <b>Defter Beyan</b> sekmesine geç → 📊 Gider Kontrol\'e bas → hangileri deftere girilmemiş göreceksin.</div>';
      // Ay sekmeleri
      h += '<div id="__uyAy" style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px">';
      h += '<button class="uyb" data-ay="tum" style="padding:6px 12px;border-radius:8px;border:1px solid #3a3550;background:' + (aktifAy === 'tum' ? '#10b981' : 'transparent') + ';color:' + (aktifAy === 'tum' ? '#04140d' : '#e8edf5') + ';font-weight:700;cursor:pointer">Tümü (' + all.length + ')</button>';
      mevcutAylar.forEach(a => { const say = all.filter(x => ayOf(x) === a).length; h += '<button class="uyb" data-ay="' + a + '" style="padding:6px 12px;border-radius:8px;border:1px solid #3a3550;background:' + (aktifAy === a ? '#10b981' : 'transparent') + ';color:' + (aktifAy === a ? '#04140d' : '#e8edf5') + ';font-weight:700;cursor:pointer">' + (adlar[a] || a) + ' (' + say + ')</button>'; });
      h += '</div>';
      const cols = ['Fatura No', 'Tarih', 'Gönderen', 'VKN/TC', 'Durum'];
      h += '<div style="overflow:auto;border:1px solid #2a3550;border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#141c2e;text-align:left">' + cols.map(x => '<th style="padding:8px">' + x + '</th>').join('') + '</tr></thead><tbody id="__uyBody">';
      all.forEach(x => { const a = ayOf(x); const gizli = (aktifAy !== 'tum' && a !== aktifAy); h += '<tr class="uyRow" data-ay="' + a + '" style="border-top:1px solid #1f2840;' + (gizli ? 'display:none' : '') + '"><td style="padding:7px">' + (x.no || '') + '</td><td style="padding:7px">' + (x.tarih || '').slice(0, 10) + '</td><td style="padding:7px">' + ((x.unvan || '').slice(0, 50)) + '</td><td style="padding:7px">' + (x.vkn || '') + '</td><td style="padding:7px">' + (x.status || '') + '</td></tr>'; });
      h += '</tbody></table></div>';
      bar.innerHTML = h;
      const ayBar = document.getElementById('__uyAy');
      if (ayBar) ayBar.querySelectorAll('.uyb').forEach(b => { b.onclick = () => { const sec = b.getAttribute('data-ay'); ayBar.querySelectorAll('.uyb').forEach(x => { x.style.background = 'transparent'; x.style.color = '#e8edf5'; }); b.style.background = '#10b981'; b.style.color = '#04140d'; document.querySelectorAll('#__uyBody .uyRow').forEach(tr => { tr.style.display = (sec === 'tum' || tr.getAttribute('data-ay') === sec) ? '' : 'none'; }); }; });
    }

    // ── GİDEN (satış / e-Arşiv) faturaları çek ──
    async function pullUyumGiden(bar) {
      let start = 0, len = 100, total = Infinity, all = [];
      const epler = ['/Invoicebox/GetOutboxInvoiceJsonList', '/Outbox/GetOutboxInvoiceJsonList', '/Invoicebox/GetOutgoingInvoiceJsonList'];
      let ep = null;
      while (start < total) {
        const body = 'sEcho=1&iColumns=11&iDisplayStart=' + start + '&iDisplayLength=' + len +
          '&mDataProp_1=InvoiceNumber&mDataProp_2=ExecutionDate&mDataProp_3=CreateDateUtc&mDataProp_4=Title&mDataProp_5=PayableAmount&mDataProp_6=TaxTotal&mDataProp_7=Type&mDataProp_8=Status&mDataProp_9=IsNew&mDataProp_10=InvoiceActions' +
          '&IsNewFilter=3&IsSeenFilter=None&ShowOlderThanOneYear=true&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1';
        let j = null;
        if (ep === null) {
          for (const e of epler) { try { const r = await fetch(e, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include', body }); if (r.status === 200) { const jj = await r.json(); if (jj && (jj.aaData || jj.iTotalRecords != null)) { ep = e; j = jj; break; } } } catch (x) {} }
          if (!ep) throw new Error('Giden fatura endpoint bulunamadı (Uyumsoft Giden sayfasında olduğundan emin ol). Denenen: ' + epler.join(', '));
        } else {
          const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include', body });
          j = await r.json();
        }
        total = j.iTotalRecords || (j.aaData || []).length;
        const say = s => { s = ('' + (s == null ? '' : s)).replace(/[^\d,.\-]/g, ''); if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.'); else if (s.includes(',')) s = s.replace(',', '.'); return parseFloat(s) || 0; };
        (j.aaData || []).forEach(d => all.push({ no: d.InvoiceNumber, tarih: d.ExecutionDate, vkn: d.TargetVknTckn || d.ReceiverVknTckn || d.VknTckn, unvan: d.Title, status: d.Status, type: d.Type, tutar: say(d.PayableAmount), kdv: say(d.TaxTotal) }));
        if (bar) bar.textContent = 'Uyumsoft giden faturalar çekiliyor… ' + all.length + '/' + total;
        if (!(j.aaData || []).length) break;
        start += len;
        if (start > 50000) break;
      }
      return all;
    }

    async function calistirGiden() {
      const bar = overlayAc('📤 Uyumsoft · Giden (Satış) Faturalar');
      let all;
      try { all = await pullUyumGiden(bar); }
      catch (e) { bar.innerHTML = '<span style="color:#fca5a5">' + e.message + '</span>'; return; }
      try { await chrome.storage.local.set({ uyumGiden: { ts: Date.now(), list: all } }); } catch (e) {}
      const ayOf = x => { const p = (x.tarih || '').split('.'); return p[1] || '00'; };
      const adlar = { '01': 'Oca', '02': 'Şub', '03': 'Mar', '04': 'Nis', '05': 'May', '06': 'Haz', '07': 'Tem', '08': 'Ağu', '09': 'Eyl', '10': 'Eki', '11': 'Kas', '12': 'Ara' };
      const mevcutAylar = [...new Set(all.map(ayOf))].sort();
      const buAy = ('0' + (new Date().getMonth() + 1)).slice(-2);
      const aktifAy = mevcutAylar.indexOf(buAy) >= 0 ? buAy : 'tum';
      let h = '<div style="margin-bottom:12px">' + chip('Giden Fatura', all.length, '#1e2f3a') + '</div>';
      h += '<div style="margin:8px 0;padding:12px 14px;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);border-radius:10px;color:#93c5fd;font-size:12.5px">✓ ' + all.length + ' giden (satış) fatura kaydedildi. <b>Defter Beyan</b> → 📊 Gelir Kontrol\'e bas → hangileri deftere girilmemiş göreceksin.</div>';
      h += '<div id="__gdAy" style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px">';
      h += '<button class="gdb" data-ay="tum" style="padding:6px 12px;border-radius:8px;border:1px solid #3a3550;background:' + (aktifAy === 'tum' ? '#3b82f6' : 'transparent') + ';color:' + (aktifAy === 'tum' ? '#fff' : '#e8edf5') + ';font-weight:700;cursor:pointer">Tümü (' + all.length + ')</button>';
      mevcutAylar.forEach(a => { const say = all.filter(x => ayOf(x) === a).length; h += '<button class="gdb" data-ay="' + a + '" style="padding:6px 12px;border-radius:8px;border:1px solid #3a3550;background:' + (aktifAy === a ? '#3b82f6' : 'transparent') + ';color:' + (aktifAy === a ? '#fff' : '#e8edf5') + ';font-weight:700;cursor:pointer">' + (adlar[a] || a) + ' (' + say + ')</button>'; });
      h += '</div>';
      const cols = ['Fatura No', 'Tarih', 'Alıcı', 'VKN/TC', 'Durum'];
      h += '<div style="overflow:auto;border:1px solid #2a3550;border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#141c2e;text-align:left">' + cols.map(x => '<th style="padding:8px">' + x + '</th>').join('') + '</tr></thead><tbody id="__gdBody">';
      all.forEach(x => { const a = ayOf(x); const gizli = (aktifAy !== 'tum' && a !== aktifAy); h += '<tr class="gdRow" data-ay="' + a + '" style="border-top:1px solid #1f2840;' + (gizli ? 'display:none' : '') + '"><td style="padding:7px">' + (x.no || '') + '</td><td style="padding:7px">' + (x.tarih || '').slice(0, 10) + '</td><td style="padding:7px">' + ((x.unvan || '').slice(0, 50)) + '</td><td style="padding:7px">' + (x.vkn || '') + '</td><td style="padding:7px">' + (x.status || '') + '</td></tr>'; });
      h += '</tbody></table></div>';
      bar.innerHTML = h;
      const ayBar = document.getElementById('__gdAy');
      if (ayBar) ayBar.querySelectorAll('.gdb').forEach(b => { b.onclick = () => { const sec = b.getAttribute('data-ay'); ayBar.querySelectorAll('.gdb').forEach(x => { x.style.background = 'transparent'; x.style.color = '#e8edf5'; }); b.style.background = '#3b82f6'; b.style.color = '#fff'; document.querySelectorAll('#__gdBody .gdRow').forEach(tr => { tr.style.display = (sec === 'tum' || tr.getAttribute('data-ay') === sec) ? '' : 'none'; }); }; });
    }

    const kurUy = () => {
      butonEkle('📥 Gelen Faturaları Al', calistir, 'linear-gradient(135deg,#6ee7b7,#10b981)', '__uyGelenBtn', 20);
      butonEkle('📤 Giden Faturaları Al', calistirGiden, 'linear-gradient(135deg,#60a5fa,#2563eb)', '__uyGidenBtn', 76);
      butonEkle('🔒 Kimlik/Adres Kontrol', kimlikKontrol, 'linear-gradient(135deg,#a78bfa,#7c3aed)', '__kimlikBtn', 132);
    };
    kurUy();
    setInterval(kurUy, 2000);
  }
})();
