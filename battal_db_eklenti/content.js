/* ════════════════════════════════════════════════════════════
   BATTAL · Defter Beyan + Uyumsoft Kontrol — v3
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
      '1500138444': { ad: 'Taner Battal', tckn: '24679499156', vd: 'BAYRAMPAŞA', nace: '692001', adres: 'TERAZİDERE MAH. TAŞ SK. BATTAL AP NO: 5 İÇ KAPI NO: 2 BAYRAMPAŞA/ İSTANBUL', eskiAdres: ['KARTALTEPE MAH. ŞEHİTLER ER RIDVANSOK NO: 1 BAKIRKÖY/ İSTANBUL'] },
      '1500360006': { ad: 'Emir Battal', tckn: '27286976096', vd: 'BEŞİKTAŞ', nace: '691003', adres: 'ABBASAĞA MAH. KEŞŞAF SK. ŞATIROĞLU IS MERKEZI NO: 4 İÇ KAPI NO: 10 BEŞİKTAŞ/ İSTANBUL' },
      '6630177279': { ad: 'Müge Özarmağan', tckn: '47707497320', vd: 'MECİDİYEKÖY', nace: '691003', adres: 'MEŞRUTİYET MAH. VALİ KONAĞI CAD. POLAT APT NO: 99 İÇ KAPI NO: 10 YOK/ ŞİŞLİ/ İSTANBUL' },
      '1500459508': { ad: 'Mert Tufan Battal', tckn: '26929736554', vd: 'MECİDİYEKÖY', nace: '862303', adres: 'TEŞVİKİYE MAH. NİŞANTAŞI IHLAMUR YOLU SK. BELDE APT. NO: 1 İÇ KAPI NO: 5 ŞİŞLİ/ İSTANBUL' },
      '3750072366': { ad: 'Cihan Güneş Ertürk', tckn: '40402335348', vd: 'GÖZTEPE', nace: '862202', adres: 'GÖZTEPE MAH. TEPEGÖZ SK. IKAR IŞ MERKEZI NO: 1 İÇ KAPI NO: 7 KADIKÖY/ İSTANBUL', aracYok: true, estetik: true, esnekAdres: true, dogalgazDisla: true, dislaAdres: /zühtüpaşa|zuhtupasa|zuhtupas|zühtüp/i },
      '1500127919': { ad: 'İskender Mehmet Nuri Battal', tckn: '26968735242', vd: 'MECİDİYEKÖY', nace: '862202', adres: 'MEŞRUTİYET MAH VALİKONAĞI CAD NO: 83 İÇ KAPI NO: 5 ŞİŞLİ/ İSTANBUL', estetik: true },
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

    /* ═══ SINIFLANDIRMA KURALLARI (fatura açıklamasına/unvana göre gider alt türü) ═══ */
    const SINIF_KURALLAR = [
      {p:/i.?g.?d.?a.?ş|igdaş|gaz dağıt/i, sinif:'Doğalgaz', altKod:84, altAd:'Doğalgaz Giderleri (GVK 40/1)'},
      {p:/enerjisa|bedaş|ayedaş|boğaziçi elektrik|elektrik perakende|elektrik dağıt/i, sinif:'Elektrik', altKod:0, altAd:'Elektrik Giderleri (GVK 40/1)'},
      {p:/iski|aski|su dağıt|su şebek/i, sinif:'Su', altKod:83, altAd:'Su Giderleri (GVK 40/1)'},
      {p:/turkcell|vodafone|türk ?telekom|ttnet|superonline|millennium|net|telefon|tt ?mob[iı]l|andromeda|dijital platform|d.?smart|digiturk|turksat|kablonet|haberleşme|iletişim hizmet|çizgi telekom|çizgi telekomünikasyon|telekomünikasyon|telekomunikasyon/i, sinif:'Telefon+ÖİV', altKod:87, altAd:'Telefon Giderleri (GVK 40/1)', oiv:true},
      {p:/kargo|aras|mng|yurtiçi kargo|ptt kargo|sürat|hepsijet|sendeo|trendyol express/i, sinif:'Kargo', altKod:193, altAd:'Kargo Posta ve Kurye Giderleri (GVK 40/1)'},
      {p:/google ireland|meta platforms|facebook|instagram reklam/i, sinif:'İnternet Reklam', altKod:0, altAd:'İnternet Reklam Hizmet Alım Giderleri (GVK 40/1)'},
      {p:/dsm grup|d-market|hepsiburada komisyon|trendyol komisyon|n11|amazon komisyon|gittigid|pttavm|çiçek ?sepeti|pos komis/i, sinif:'Komisyon/POS', altKod:0, altAd:'Komisyon ve Pos Giderleri (GVK 40/1)'},
      {p:/kira gideri|kiraladığı|gayrimenkul kira|işyeri kira/i, sinif:'Kira', altKod:0, altAd:'Kira Gideri (GVK 40/1)'},
      {p:/enuygun|biletbank|biletall|seyahat|otobüs|uçak bileti|oto kiralama|taksi|uber|bitaksi|martı|hava yolu|airlines/i, sinif:'Ulaşım', altKod:0, altAd:'Seyahat ve Ulaşım Giderleri (GVK 40/4-5)'},
      {p:/muhasebe|mali müşavir|smmm|ymm|battal taner/i, sinif:'Muhasebe', altKod:0, altAd:'Muhasebe/Mali Müşavirlik Giderleri (GVK 40/1)', stopaj:20},
      {p:/avukat|hukuk büro|hukuk müşavir/i, sinif:'Avukatlık', altKod:0, altAd:'Avukatlık, Hukuk ve Müşavirlik Giderleri (GVK 40/1)', stopaj:20},
      {p:/teknik servis|bakım onarım|tamir|servis hizmet/i, sinif:'Bakım/Onarım', altKod:0, altAd:'Normal Bakım Onarım Giderleri (GVK 40/1)'},
      {p:/temizlik|hijyen/i, sinif:'Ofis (Temizlik)', altKod:0, altAd:'Ofis Giderleri (Çay, Kahve, Şeker, Temizlik vb.) (GVK 40/1)'},
      {p:/yemek sepeti|getir\b|personel yemeği|gıda|market\b|süpermarket|hipermarket|migros|carrefour|carrefoursa|bim\b|şok\b|a101|metro market|marmarabirlik|börek|pastane|fırın|kasap|manav|meyve|sebze|süt ürünleri|zincir market|makarna|un\b|şeker|tuz|çay|kahve|çikolata/i, sinif:'Yemek', altKod:90, altAd:'Yemek, Market vs. Gıda Harcamaları (GVK 40/1)'},
      {p:/iş yemeği|ağırlama|temsil/i, sinif:'Temsil ve Ağırlama Gideri', altKod:97, altAd:'Temsil ve Ağırlama Gideri (İş yemeği vb.) (GVK 40/1)'},
      {p:/iş güvenliği|iş sağlığı|isg|osgb|periyodik muayene çalışan/i, sinif:'İş Güvenliği', altKod:0, altAd:'İş Güvenliği ve İş Sağlığı Hizmet Alımları (GVK 40/1)'},
      {p:/yazılım|lisans|abonelik|software|saas|microsoft|adobe|windows/i, sinif:'Yazılım/Lisans', altKod:0, altAd:'Yazılım Lisans/Sözleşme Giderleri (GVK 40/1)'},
      {p:/otel|konaklama|pansiyon|rezervasyon|booking|apart otel|hostel/i, sinif:'Konaklama', altKod:0, altAd:'Konaklama, İkamet (Otel, Pansiyon, Vb.) (GVK 40/3)'},
      {p:/akaryakıt|benzin|motorin|opet|shell|petrol ofisi|po petrol|aytemiz/i, sinif:'Akaryakıt', altKod:0, altAd:'Taşıt Akaryakıt Giderleri (GVK 40/1-40/5)'}
    ];
    const SMM_TUR_KODU = '3';
    const SMM_GIDER_KOD = {
      'Elektrik': {altKod:2, altAd:'Elektrik Giderleri (GVK 68/1)'},
      'Telefon+ÖİV': {altKod:7, altAd:'Telefon, Faks, İnternet ve Diğer Haberleşme Giderleri (GVK 68/1)'},
      'Özel İletişim Vergisi': {altKod:218, turKod:'5', altAd:'Özel İletişim Vergisi'},
      'Doğalgaz': {altKod:30, altAd:'Yakıt, Doğalgaz ve Isı Giderleri (GVK 68/1)'},
      // SMM ek kategoriler (Cihan Güneş DB kayıtlarından):
      'Tedavi ve İlaç': {altKod:0, altAd:'Tedavi ve İlaç Giderleri (GVK 68/2)'},
      'Yemek': {altKod:0, altAd:'Yemek, Market vs. Gıda Harcamaları (GVK 68/1)'},
      'İş Güvenliği': {altKod:0, altAd:'İş Güvenliği ve İş Sağlığı Hizmet Alımları (GVK 68/1)'},
      'Yazılım/Lisans': {altKod:0, altAd:'Yazılım Lisans/Sözleşme Giderleri (GVK 68/1)'},
      'Konaklama': {altKod:0, altAd:'Konaklama, İkamet (Otel, Pansiyon, Vb.) (GVK 68/3)'},
      'Temsil ve Ağırlama Gideri': {altKod:0, altAd:'Temsil ve Ağırlama Gideri (İş yemeği vb.) (GVK 68/1)'},
      'Kira': {altKod:0, altAd:'Kira Giderleri (GVK 68/1)'},
      'Avukatlık': {altKod:0, altAd:'Avukatlık, Hukuk ve Müşavirlik Giderleri (GVK 68/1)'},
      'Muhasebe': {altKod:0, altAd:'Muhasebe/Mali Müşavirlik Giderleri (GVK 68/1)'},
      'Amortisman': {altKod:252, altAd:'Amortisman Giderleri (GVK 68/4)'},
      'İnternet Reklam': {altKod:0, altAd:'İlan ve Reklam Gideri (GVK 68/9)'},
      'Kargo': {altKod:0, altAd:'Kargo Posta ve Kurye Giderleri (GVK 68/1)'}
    };
    const TEDARIKCI_OZEL = {
      '3100018644': {sinif:'Mal Alışı', altKod:186, altAd:'Mal Alışı', turKod:'1'},
      '5820492073': {sinif:'Yemek', altKod:90, altAd:'Gıda ve Yemek Harcamaları (GVK 40/1-40/2)', turKod:'4'},
      // EDENRED / Ticket Restaurant / Multinet — yemek çeki firmaları → Temsil ve Ağırlama
      '9470043431': {sinif:'Temsil ve Ağırlama Gideri', altKod:97, altAd:'Temsil ve Ağırlama Gideri (İş yemeği vb.) (GVK 40/1)', turKod:'4'}
    };
    const ARAC_RE = /tüvturk|tuvturk|muayene istasyon|akaryakıt|akaryakit|petrol ofisi|opet|shell|aytemiz|benzin|motorin|oto ?lastik|oto ?yıkama|oto ?servis|kasko|trafik sigorta|otopark|otoyol|hgs|ogs|araç ?bakım/i;
    // Demirbaş adayları: elektronik/bilgisayar/donanım/mobilya/cihaz/ofis makinesi/ekipman.
    // 2026 için amortisman sınırı ~10.000 TL. Bu değerin üstünde bu ürünlerden alım
    // gider değil demirbaş (amortismana tabi) sayılır — direkt gider yazılamaz.
    const DEMIRBAS_RE = /elektronik|bilgisayar|laptop|notebook|monitör|monitor|yazıcı|printer|donanım|donanim|mobilya|masa\b|sandalye|koltuk|klima|kombi|buzdolabı|firın|fırın|iş ?makinesi|makina|makine|cihaz|ekipman|demirbaş|demirbas|tıbbi ?cihaz|dental ?ünit|röntgen|ultrason|tomografi|mri|otoklav|kettle|kettil|çelik kettle|çaydanlık|blender|mikser|tost makinesi|tost ?makinası|ekmek ?kızartma|kahve makinesi|espresso|barista|ütü\b|saç kurutma|elektrik süpürge|süpürge|mikrodalga|air ?fryer|kızartma makinası|kızartma makinesi|smeg|philips|samsung\b|apple\b|macbook|iphone|ipad|dyson|braun|arçelik|bosch|siemens|vestel|beko|profilo|led ?tv|smart ?tv|televizyon|projeksiyon|projektor|hoparlör|kulaklık|smartwatch|akıllı saat|tablet|smartphone|ev aletleri|elektrikli ev|beyaz eşya/i;
    const DEMIRBAS_ESIK = 12000;
    // 2026: 5.000-12.000 TL fiziki ürün → doğrudan gider yazılan küçük demirbaş.
    // <5.000 TL fiziki ürün → normal gider (yine de "Diğer Hizmet"e atmıyoruz — fiziki ürün, hizmet değil).
    const DEMIRBAS_ESIK_KUCUK = 5000;
    // Kişisel (indirilemez) harcamalar — herkes için.
    const KISISEL_RE_BASE = /alkol|içki|bira|şarap|votka|viski|rakı|sigara|tütün|kozmetik|parfüm|makyaj|kişisel bakım/i;
    // Sağlık/ilaç sadece SAĞLIK dışı mesleklerde kişisel; doktor/dişçi (NACE 86*) için MESLEKI gider.
    const KISISEL_RE_SAGLIK = /hastane|sağlık|tıp merkezi|poliklinik|muayenehane|diş polikliniği|göz merkezi|tıp mrkz|medikal|laboratuvar|eczane|ilaç/i;
    const KISISEL_RE = new RegExp(KISISEL_RE_BASE.source + '|' + KISISEL_RE_SAGLIK.source, 'i');

    function faturaSinifla(unvanVeAciklama, vkn, matrah, nace, mukellefRec, aciklamaAyri) {
      // İçerik (ürün açıklaması) satıcı ünvandan ÖNCE gelmeli — bir "Danışmanlık ve Elektronik"
      // firması Smeg su ısıtıcısı satabilir; sınıflandırma ürüne bakar, ünvana değil.
      const txt = (unvanVeAciklama || '').toLocaleLowerCase('tr');
      const icerikTxt = (aciklamaAyri || '').toLocaleLowerCase('tr');
      // Karar önceliği: eğer içerik metni verilmişse ve orada güçlü bir eşleşme varsa ONU kullan.
      const oncelikliTxt = icerikTxt || txt;
      const ozel = TEDARIKCI_OZEL[vkn];
      const aracYok = mukellefRec && mukellefRec.aracYok === true;
      const isSaglikMeslek = (nace || '').startsWith('86');
      const isEstetik = (mukellefRec && mukellefRec.estetik === true);
      const ILAC_TEDAVI_RE = /eczane|ilaç|ilac|tedavi|tıbbi|tibbi|medikal|serum|enjektör|enjektor|iğne|igne|kanül|kanul|gazlı bez|dikiş ipliği|dezenfektan|antiseptik|steril|kozmetik|dermokozmetik|filler|botoks|dolgu|mezoterapi|cilt bakım|estetik|aquashine|caregen|derma|hyaluronic|hyalüronik|hialüronik|jel\b|solüsyon|solusyon|krem|pomad|pomat|damla\b|şurup|surup|tablet ilaç|kapsül|kapsul|ampul|flakon/i;
      const KOZMETIK_ESTETIK_RE = /kozmetik|parfüm|makyaj|kişisel bakım|filler|botoks|dermokozmetik|cilt bakım/i;
      // 1️⃣ MESLEK ÖNCELİĞİ: doktor/dişçi için sağlık/ilaç/tedavi/kozmetik-estetik MESLEKI gider.
      //    Kişisel filtreden ÖNCE kontrol edilir ki alkol dışı sağlık ürünleri kişisel sayılmasın.
      if (isSaglikMeslek && (KISISEL_RE_SAGLIK.test(txt) || ILAC_TEDAVI_RE.test(txt))) {
        return { sinif: 'Tedavi ve İlaç', altKod: 0, altAd: 'Tedavi ve İlaç Giderleri (GVK 68/2) — elle kontrol', turKod: '3', otoGonder: false };
      }
      if (isEstetik && KOZMETIK_ESTETIK_RE.test(txt)) {
        return { sinif: 'Tedavi ve İlaç', altKod: 0, altAd: 'Estetik/Güzellik Doktoru — Tedavi Malzemesi (GVK 68/2)', turKod: '3', otoGonder: false };
      }
      // 2️⃣ Kişisel filtre — meslek özel kontrolleri geçtiyse artık gerçekten kişisel demektir.
      //    Sağlık mesleğinde BASE (alkol, sigara vs), diğerlerinde tam KISISEL_RE (sağlık dahil).
      const kisiselKontrol = isSaglikMeslek ? KISISEL_RE_BASE : KISISEL_RE;
      if (kisiselKontrol.test(txt)) return { sinif: '🔞 ÖZEL', altKod: 0, altAd: 'Elle kontrol', turKod: '4', otoGonder: false };
      if (ARAC_RE.test(txt)) {
        if (aracYok) return { sinif: '🔞 ÖZEL', altKod: 0, altAd: 'Kayıtlı aracı yok — kişisel harcama, işleme alınmaz', turKod: '4', otoGonder: false };
        return { sinif: '🚗 ARAÇ', altKod: 0, altAd: 'Araç gideri — elle kontrol', turKod: '4', otoGonder: false };
      }
      // Fiziki ürün / Demirbaş (İÇERİKTE ürün terimi geçiyor mu):
      // Ekmek kızartma, kettle, blender, buzdolabı, mobilya, elektronik cihaz — hepsi FİZİKİ ürün, hizmet değil.
      // Tutara göre 3 kategori:
      //   >= 12.000 TL: 🔧 DEMİRBAŞ (amortismana tabi)
      //   5.000 - 12.000 TL: 🔧 Doğrudan Gider Yazılan Demirbaş (küçük demirbaş)
      //   <  5.000 TL: 🛒 Küçük Alım / Mal Alışı (fiziki ürün, direkt gider — "Diğer Hizmet"e atma!)
      if (DEMIRBAS_RE.test(oncelikliTxt)) {
        if (matrah >= DEMIRBAS_ESIK) {
          return { sinif: '🔧 DEMİRBAŞ', altKod: 0, altAd: 'Demirbaş — amortismana tabi, elle kontrol (SMM 68/2 veya işletme mal alışı 191)', turKod: '4', otoGonder: false };
        }
        if (matrah >= DEMIRBAS_ESIK_KUCUK) {
          return { sinif: '🔧 Küçük Demirbaş', altKod: 0, altAd: 'Doğrudan Gider Yazılan Demirbaş (5.000-12.000 TL) — elle kontrol', turKod: '4', otoGonder: false };
        }
        return { sinif: '🛒 Fiziki Ürün', altKod: 0, altAd: 'Küçük tutarlı fiziki ürün alımı — Mal Alışı / Ofis Malzemesi (elle kontrol)', turKod: '4', otoGonder: false };
      }
      // Danışmanlık: sadece İÇERİKTE geçiyorsa (satıcı unvanı değil).
      // 'Danışmanlık hizmeti', 'danışmanlık ücreti', 'consulting fee' gibi.
      const DANISMANLIK_ICERIK_RE = /danışmanlık hizmet|danişmanlik hizmet|danışmanlık ücret|danismanlik ucret|advisory service|consulting fee|danışmanlık gideri|advisory hizmet/i;
      const isMuhasebeOnce = /muhasebe|mali ?müşavir|smmm|ymm/i.test(txt);
      if (icerikTxt && DANISMANLIK_ICERIK_RE.test(icerikTxt) && !isMuhasebeOnce) {
        return { sinif: '🤝 Danışmanlık', altKod: 0, altAd: 'Dışarıdan Sağlanan Fayda/Hizmet — Danışmanlık Gideri', turKod: (nace||'').startsWith('86')||(nace||'').startsWith('69') ? '3' : '4', otoGonder: false };
      }
      if (ozel) {
        if (ozel.turKod === '1') return { sinif: ozel.sinif, altKod: ozel.altKod, altAd: ozel.altAd, turKod: '1', otoGonder: true };
        return { sinif: ozel.sinif, altKod: ozel.altKod, altAd: ozel.altAd, turKod: ozel.turKod || '4', otoGonder: true };
      }
      for (const rule of SINIF_KURALLAR) {
        if (rule.p.test(txt)) {
          const isSMM = (nace || '').startsWith('69') || (nace || '').startsWith('86');
          let tK = '4', aK = rule.altKod, aAd = rule.altAd;
          if (isSMM) {
            const sk = SMM_GIDER_KOD[rule.sinif];
            tK = SMM_TUR_KODU;
            if (sk) { aK = sk.altKod; aAd = sk.altAd; }
            else { aK = 0; }
          }
          return { sinif: rule.sinif, altKod: aK, altAd: aAd, turKod: tK, oiv: !!rule.oiv, stopaj: rule.stopaj || 0, otoGonder: aK > 0 };
        }
      }
      // 🔎 FALLBACK: Hiçbir kural eşleşmedi. "Diğer Hizmet" ASLA otomatik atma — elle kontrol.
      // Doktor+estetik mükelleflerde tedarikçi tıbbi/estetik ürün satıcısı olma ihtimali yüksek
      // (SRC İÇ VE DIŞ TİCARET → Caregen Aquashine mezoterapi gibi). Bu ipucunu ver.
      if (isSaglikMeslek || isEstetik) {
        return { sinif: '❓ Elle Sınıflandır', altKod: 0, altAd: 'Sınıflandırılamadı — Tedavi/Malzeme mi? Elle kontrol et (fatura açıklamasına bak)', turKod: '3', otoGonder: false };
      }
      return { sinif: '❓ Elle Sınıflandır', altKod: 0, altAd: 'Sınıflandırılamadı — elle kontrol et (fatura açıklamasına bak)', turKod: '4', otoGonder: false };
    }

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
      [/\bIC\s*KAPI\b|\bDAIRE\b|\bDAIRESI\b|\bDS\b|\bDR\b|\bD\b(?=\s*:?\s*\d)/g, 'ICKAPI'],
      [/\bBLOK\b|\bBLK\b/g, 'BLOK'],
      [/\bISTANBUL\b|\bIST\b/g, 'ISTANBUL'],
      [/\bBAYRAMPASA\b|\bBAY\b/g, 'BAYRAMPASA'],
      [/\bBASINKOY\b/g, 'BASINKOYMAH'],
      [/\bKARTALTEPE\b/g, 'KARTALTEPEMAH']
    ];
    const DUR = new Set(['NO', 'ICKAPI', 'BLOK', 'A', 'B', 'C', 'D', 'YOK', 'VE', 'ISTANBUL']); // gürültü/az ayırt edici
    function adresNorm(a) {
      let s = trAscii(a).replace(/[@.,;:/\\()\-_"']/g, ' ').replace(/\s+/g, ' ').trim();
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
      const L = anlamliTokens(levhaAdres), FA = anlamliTokens(faturaAdres);
      const F = new Set(FA);
      if (!L.length || !F.size) return { skor: 0, eslesen: 0, toplam: L.length };
      let hit = 0;
      L.forEach(t => {
        if (F.has(t)) { hit++; return; }
        // Kısmi eşleşme: "BAYRAMPASA" ↔ "BAY" (token biri diğerinin başlangıcıysa)
        for (const ft of FA) {
          if ((t.length >= 3 && ft.startsWith(t)) || (ft.length >= 3 && t.startsWith(ft))) { hit += 0.8; return; }
        }
      });
      return { skor: hit / L.length, eslesen: Math.round(hit), toplam: L.length };
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
      if (skor >= 0.70) return { renk: '#10b981', bg: 'rgba(16,185,129,.12)', et: '✅ TUTUYOR', islenir: true };
      if (skor >= 0.45) return { renk: '#f59e0b', bg: 'rgba(245,158,11,.12)', et: '⚠️ ŞÜPHELİ — KONTROL ET', islenir: false };
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
          const isZ = /z.?raporu/i.test(JSON.stringify(cand.kayitlar || []) + ' ' + (cand.aciklama || ''));
          const kod0 = cand.kayitlar && cand.kayitlar[0] && String(cand.kayitlar[0].satisTuruKodu || '');
          // İstisna template: satisTuruKodu != "1" (normal) ise ayrı slot'a kaydet
          const isIstisna = !isZ && kod0 && kod0 !== '1';
          const key = isZ ? 'zTemplate' : (isIstisna ? 'istisnaTemplate' : 'satisTemplate');
          try {
            chrome.storage.local.set({ [key]: { req: cand, ts: Date.now() } });
            const kayitKods = (cand.kayitlar||[]).map(k=>'st:'+k.satisTuruKodu+' altKod:'+k.gelirKayitAltTuruKodu).join(' | ');
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:2147483647;background:#0f1830;border:2px solid #f59e0b;color:#e8edf5;padding:14px 18px;border-radius:12px;font:13px Segoe UI,sans-serif;max-width:520px;box-shadow:0 8px 30px rgba(0,0,0,.5)';
            toast.innerHTML = '<b style="color:#fcd34d;font-size:14px">🎯 ' + key.toUpperCase() + ' YAKALANDI</b><br><span style="font-size:11px;color:#9aa6c0">' + kayitKods + '</span><button style="margin-top:8px;background:#af0003;color:#fff;border:0;padding:5px 12px;border-radius:6px;cursor:pointer" onclick="this.parentNode.remove()">Kapat</button>';
            document.body.appendChild(toast);
            setTimeout(() => { try { toast.remove(); } catch (e) {} }, 12000);
          } catch (x) {}
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

    /* ── Eksik Giderleri Otomatik Gönder: Uyumsoft'ta "Fatura Detay + Sınıfla" ile
       kaydedilen veriyi okur, DB gider listesini çeker, eksik faturaları otomatik gönderir. */
    async function eksikGiderGonder() {
      const bar = overlayAc('🚀 Eksik Giderleri Otomatik Gönder');
      const kilit = await adresKilidi();
      if (!kilit.gecer) { kilitRed(bar, kilit.mesaj); return; }
      bar.textContent = 'Veriler okunuyor…';

      // 1) Uyumsoft'ta sınıflandırılmış faturaları oku
      let sinifData;
      try {
        const s = await chrome.storage.local.get('faturaSinif');
        sinifData = s && s.faturaSinif;
      } catch (e) {}
      if (!sinifData || !sinifData.list || !sinifData.list.length) {
        bar.innerHTML = '<div style="color:#fcd34d;line-height:1.8">⚠️ Sınıflandırılmış fatura verisi yok.<br><br>' +
          '<b>Yap:</b> Önce <b>Uyumsoft portal</b>ına geç → Gelen Fatura sayfasında <b>📦 Fatura Detay + Sınıfla</b> butonuna bas → ' +
          'sonra buraya dön ve tekrar bas.</div>';
        return;
      }
      const yas = Math.round((Date.now() - sinifData.ts) / 60000);
      // 🗓️ YIL FİLTRESİ — sadece cari yıl faturaları işlenir (varsayılan: içinde bulunulan yıl)
      // Tarih formatı "YYYY-MM-DD" veya "DD.MM.YYYY" olabilir; her ikisinden yıl çıkarılır.
      const yilCek = t => { const s = (t||'').toString(); const m = s.match(/(20\d{2})/); return m ? m[1] : ''; };
      const CARI_YIL = String(new Date().getFullYear());
      const tumFatura = sinifData.list.filter(r => !r.hata);
      const faturaListesi = tumFatura.filter(r => yilCek(r.tarih) === CARI_YIL);
      const eskiYilAdet = tumFatura.length - faturaListesi.length;

      // 2) Alıcı kontrol RED listesini oku
      let alkMap = {};
      try { const s = await chrome.storage.local.get('aliciKontrol'); alkMap = (s.aliciKontrol && s.aliciKontrol.map) || {}; } catch (e) {}

      // 3) Defter Beyan mevcut gider listesini çek
      bar.textContent = 'Defter Beyan gider listesi çekiliyor…';
      let R;
      try { R = await pullDB(bar); } catch (e) { bar.innerHTML = '<span style="color:#fca5a5">Defter Beyan gider listesi çekilemedi: ' + e.message + '</span>'; return; }
      const dbNos = new Set(R.all.map(r => norm(r.belgeSiraNo)).filter(Boolean));

      // 4) Eksik + gönderilebilir faturaları bul
      const eksik = [], zatenVar = [], redListe = [], elleKontrolListe = [];
      let atlanan = 0;
      faturaListesi.forEach(f => {
        const fnoNorm = norm((f.fno || '').replace(/[^0-9A-Za-z]/g, ''));
        if (!fnoNorm) return;
        if (dbNos.has(fnoNorm)) { zatenVar.push(f); return; }
        const alk = alkMap[fnoNorm];
        // Sessiz dışlama (araç, İGDAŞ vs) — hiçbir listeye girmez
        if (alk && alk.atla) { atlanan++; return; }
        if (alk && alk.uygun === false) { redListe.push(f); return; }
        if (!f.otoGonder) { elleKontrolListe.push(f); return; }
        eksik.push(f);
      });

      // Özet göster
      let h = '<div style="margin-bottom:12px">' +
        chip('Uyumsoft Fatura', faturaListesi.length, '#1e2f3a') +
        chip('Defterde Var', zatenVar.length, '#1e3a2f') +
        chip('EKSİK (gönderilebilir)', eksik.length, eksik.length ? '#1e3a2f' : '#1f2937') +
        chip('Alıcı RED', redListe.length, redListe.length ? '#5b1a1a' : '#1f2937') +
        chip('Elle Kontrol', elleKontrolListe.length, elleKontrolListe.length ? '#5b3a1a' : '#1f2937') +
        '</div>';
      h += '<div style="margin-bottom:6px;font-size:11.5px;color:#9aa6c0">Uyumsoft verisi ' + yas + ' dk önce alınmış · ' + sinifData.list.length + ' fatura · <b style="color:#fcd34d">Yıl filtresi: ' + CARI_YIL + '</b>' + (eskiYilAdet ? ' · <span style="color:#9aa6c0">' + eskiYilAdet + ' fatura eski yıl (atlandı)</span>' : '') + '</div>';

      if (!eksik.length) {
        h += '<div style="padding:16px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.4);border-radius:10px;color:#6ee7b7;font-size:15px;font-weight:700">' +
          '✅ Tüm gönderilebilir faturalar zaten deftere girilmiş — EKSİK YOK!</div>';
        if (elleKontrolListe.length) {
          h += '<div style="margin-top:12px;padding:10px 14px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;color:#fcd34d;font-size:12px">' +
            '⚠️ ' + elleKontrolListe.length + ' fatura elle kontrol gerektirir (🚗 araç / 🔞 özel / kod yok):<br>' +
            elleKontrolListe.slice(0, 15).map(f => f.fno + ' — ' + f.sinif + ' — ' + (f.saticiUnvan || '').slice(0, 30)).join('<br>') + '</div>';
        }
        bar.innerHTML = h;
        return;
      }

      // Eksik fatura tablosu + gönder butonu
      const topMatrah = eksik.reduce((a, r) => a + (r.matrah || 0), 0);
      const topKdv = eksik.reduce((a, r) => a + (r.kdv || 0), 0);
      h += '<div style="margin-bottom:12px">' + chip('Gönderilecek Matrah', '₺' + fmt(topMatrah), '#1e3a2f') + chip('Gönderilecek KDV', '₺' + fmt(topKdv), '#1e2f3a') + '</div>';

      const cols = ['Fatura No', 'Tarih', 'Satıcı', 'VKN/TC', 'Matrah', 'KDV', 'KDV%', 'ÖİV', 'Sınıf', 'Alt Tür'];
      h += '<div style="overflow:auto;max-height:300px;border:1px solid #2a3550;border-radius:8px;margin-bottom:12px"><table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="background:#141c2e;text-align:left;position:sticky;top:0">' + cols.map(x => '<th style="padding:7px">' + x + '</th>').join('') + '</tr></thead><tbody>';
      eksik.forEach(r => {
        h += '<tr style="border-top:1px solid #1f2840">' +
          '<td style="padding:6px">' + (r.fno || '') + '</td>' +
          '<td style="padding:6px">' + (r.tarih || '') + '</td>' +
          '<td style="padding:6px">' + ((r.saticiUnvan || '').slice(0, 35)) + '</td>' +
          '<td style="padding:6px">' + (r.saticiVkn || '') + '</td>' +
          '<td style="padding:6px;text-align:right">' + fmt(r.matrah) + '</td>' +
          '<td style="padding:6px;text-align:right">' + fmt(r.kdv) + '</td>' +
          '<td style="padding:6px;text-align:right">' + (r.kdvOran || 0) + '</td>' +
          '<td style="padding:6px;text-align:right;color:#fcd34d">' + (r.oivTutar > 0 ? fmt(r.oivTutar) : '—') + '</td>' +
          '<td style="padding:6px;font-weight:700;color:#d4af37">' + (r.sinif || '') + '</td>' +
          '<td style="padding:6px;font-size:10px">' + (r.altAd || '') + '</td></tr>';
      });
      h += '</tbody></table></div>';

      if (elleKontrolListe.length) {
        h += '<div style="margin-bottom:12px;padding:8px 12px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;color:#fcd34d;font-size:12px">' +
          '⚠️ ' + elleKontrolListe.length + ' fatura otomatik gönderilmeyecek (elle kontrol): ' +
          elleKontrolListe.slice(0, 10).map(f => f.fno + ' (' + f.sinif + ')').join(', ') + '</div>';
      }
      if (redListe.length) {
        h += '<div style="margin-bottom:12px;padding:8px 12px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.35);border-radius:8px;color:#fca5a5;font-size:12px">' +
          '⛔ ' + redListe.length + ' fatura alıcı kontrolü ile REDDEDİLDİ (LEVHA\'daki VKN/adres ile tutmadığı için):<br>' +
          redListe.slice(0, 20).map(f => {
            const alkNo = norm((f.fno || '').replace(/[^0-9A-Za-z]/g, ''));
            const alk = alkMap[alkNo] || {};
            return '<b>' + f.fno + '</b> — ' + (f.saticiUnvan || '').slice(0, 40) + ' — <i>' + (alk.sebep || 'sebep bilinmiyor') + '</i>';
          }).join('<br>') + '</div>';
      }

      // 📅 Tarih üzerine yaz — geçmiş dönem KDV'si beyan edildiyse henüz beyan edilmemiş
      // (bir önceki) döneme çekmek için. Varsayılan: bir önceki ayın 1'i.
      const bugun = new Date();
      const oncekiAy = new Date(bugun.getFullYear(), bugun.getMonth() - 1, 1);
      const cariAyIlk = oncekiAy.getFullYear() + '-' + ('0'+(oncekiAy.getMonth()+1)).slice(-2) + '-01';
      h += '<div style="margin-bottom:12px;padding:10px 14px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.3);border-radius:8px;color:#93c5fd;font-size:12.5px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">'+
        '<label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="__tarihEz" checked style="width:16px;height:16px;cursor:pointer"> Tüm fatura tarihlerini şu tarihle üzerine yaz:</label>'+
        '<input type="date" id="__tarihEzVal" value="'+cariAyIlk+'" style="background:#0b1020;color:#e8edf5;border:1px solid #3a3550;padding:6px 10px;border-radius:6px;font-size:13px">'+
        '<span style="font-size:11px;color:#9aa6c0">(geçmiş ay KDV beyan edildiyse cari döneme çekmek için)</span></div>';
      h += '<button id="__eksikStart" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:0;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 4px 15px rgba(16,185,129,.3)">🚀 ' + eksik.length + ' Eksik Faturayı Gönder</button>';
      h += '<div id="__eksikLog" style="margin-top:12px;font-family:Consolas,monospace;font-size:12px;max-height:340px;overflow:auto;background:#0b1020;padding:10px;border-radius:8px"></div>';
      bar.innerHTML = h;

      document.getElementById('__eksikStart').onclick = async () => {
        document.getElementById('__eksikStart').disabled = true;
        document.getElementById('__eksikStart').textContent = '⏳ Gönderiliyor…';
        const logEl = document.getElementById('__eksikLog');
        const elog = (t, c) => { const d = document.createElement('div'); d.style.color = c || '#9aa6c0'; d.textContent = t; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; };

        const TK = tokenBul();
        const H = { 'Content-Type': 'application/json; charset=utf-8' };
        if (TK) H.Token = TK;
        const iso = t => {
          if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10) + ' 00:00:00';
          const a = t.split(/[.\-\/]/); // DD.MM.YYYY veya YYYY-MM-DD
          if (a.length === 3) {
            if (a[0].length === 4) return a[0] + '-' + a[1] + '-' + a[2] + ' 00:00:00';
            return a[2] + '-' + a[1] + '-' + a[0] + ' 00:00:00';
          }
          return t;
        };

        let ok = 0, fail = 0, skip = 0;
        elog('🚀 ' + eksik.length + ' eksik fatura Defter Beyan\'a gönderiliyor…', '#10b981');

        // Tarih ezme ayarını oku — SADECE ezme tarihinden ÖNCE olan faturalara uygulanır.
        // Amaç: geçmiş KDV beyanı verilmiş dönemin faturalarını cari döneme çekmek.
        // Cari dönem içindeki (veya sonraki) faturalar KENDİ tarihinde kalır.
        const ezCb = document.getElementById('__tarihEz');
        const ezVal = document.getElementById('__tarihEzVal');
        const tarihEzme = ezCb && ezCb.checked ? (ezVal ? ezVal.value : '') : '';
        if (tarihEzme) elog('📅 Sadece ' + tarihEzme + ' TARİHİNDEN ÖNCE olan faturalar ' + tarihEzme + ' olarak gönderilecek; o tarihten sonrakiler kendi tarihinde kalır', '#93c5fd');
        // Fatura tarihini "YYYY-MM-DD" biçimine çevir (karşılaştırma için)
        const toISODate = t => {
          const s = ('' + (t || '')).trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
          const a = s.split(/[.\-\/]/);
          if (a.length===3) {
            if (a[0].length===4) return a[0]+'-'+a[1]+'-'+a[2];
            return a[2]+'-'+a[1]+'-'+a[0];
          }
          return '';
        };

        for (const f of eksik) {
          const belgeNo = (f.fno || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 16);
          try {
            // Tedarikçi adres defterinden bilgi çek
            const lj = await (await fetch(B + '/adresdefteri/findbytckn/' + f.saticiVkn, { method: 'POST', headers: H, body: '{}', credentials: 'include' })).json();
            const rc = lj.resultContainer;
            if (!rc) { elog('❌ ' + f.fno + ' — tedarikçi (' + f.saticiVkn + ') adres defterinde yok', '#ef4444'); fail++; continue; }

            const ad = ((rc.soyad || '') + ' ' + (rc.ad || '')).trim().toLocaleUpperCase('tr');
            // Ezme kararı: sadece faturanın kendi tarihi, ezme tarihinden ÖNCE ise ezilir.
            const faturaISO = toISODate(f.tarih);
            const uygulaEzme = tarihEzme && faturaISO && faturaISO < tarihEzme;
            const t = uygulaEzme ? (tarihEzme + ' 00:00:00') : iso(f.tarih);
            const turKod = f.turKod || '4';
            const ana = {
              deleted: false, alisTuruKodu: '1',
              giderKayitTuruKodu: turKod,
              giderKayitAltTuruKodu: String(f.altKod),
              aciklama: ad + ' - ' + f.altAd,
              naceKodu: sinifData.nace || '',
              tutar: f.matrah, isKdvDahil: false, kdvsizIslem: false,
              kdv: f.kdv, kdvOrani: f.kdvOran
            };
            if (turKod === '4') ana.donemsellik = false;
            const kayitlar = [ana];

            // ÖİV varsa ayrı satır (KDV'siz işlem, alt kod 218)
            if (f.oivTutar && f.oivTutar > 0) {
              kayitlar.push({
                deleted: false, alisTuruKodu: '1',
                giderKayitTuruKodu: '5',
                giderKayitAltTuruKodu: '218',
                aciklama: ad + ' - ÖZEL İLETİŞİM VERGİSİ',
                naceKodu: sinifData.nace || '',
                tutar: f.oivTutar,
                isKdvDahil: false,
                kdvsizIslem: true
              });
            }

            const P = {
              giderBelgeTuruKodu: '9', versiyon: 11,
              kayitTarihi: t, belgeTarihi: t,
              belgeSiraNo: belgeNo,
              tcknVkn: f.saticiVkn,
              ad: rc.ad, soyad: rc.soyad,
              vergiDairesiKodu: rc.vergiDairesiKodu,
              adresiGuncelleme: false,
              kayitlar
            };
            if (rc.subeNo) P.subeNo = rc.subeNo;

            const cr = await fetch(B + '/gider/create', { method: 'POST', headers: H, body: JSON.stringify(P), credentials: 'include' });
            const cj = await cr.json();
            if (cr.status === 200 && cj.resultContainer && !cj.errorMessage) {
              ok++; elog('✅ ' + f.fno + ' · ' + f.sinif + ' · ₺' + fmt(f.matrah) + ' + KDV ₺' + fmt(f.kdv), '#10b981');
            } else {
              const m = (cj.errorMessage || cj.statusMessage || cr.status).toString();
              if (/aynı|mükerrer|zaten/i.test(m)) { skip++; elog('⏭ ' + f.fno + ' zaten kayıtlı', '#9aa6c0'); }
              else { fail++; elog('❌ ' + f.fno + ' — ' + m.slice(0, 100), '#ef4444'); }
            }
          } catch (e) { fail++; elog('❌ ' + f.fno + ' — ' + e.message, '#ef4444'); }
        }
        elog('', '#000');
        elog('🎉 İŞLEM TAMAMLANDI', '#10b981');
        elog('   ✅ Gönderilen: ' + ok, '#10b981');
        if (skip) elog('   ⏭ Zaten kayıtlı: ' + skip, '#9aa6c0');
        if (fail) elog('   ❌ Hata: ' + fail, '#ef4444');
        if (elleKontrolListe.length) elog('   ⚠️ Elle kontrol bekleyen: ' + elleKontrolListe.length, '#fbbf24');
        document.getElementById('__eksikStart').textContent = '✅ Tamamlandı (' + ok + '/' + eksik.length + ')';
      };
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
        // Panelden gelen tutar KDV DAHİL kabul edilir (Excel'de "Tutar (KDV Dahil)" kolonu).
        // Şablonun isKdvDahil değerine göre DB'ye ya KDV DAHİL ya KDV HARİÇ gönderilir.
        // Ama DB'nin çift KDV hesaplamasını önlemek için: DB tutar alanı her zaman MATRAH (KDV HARİÇ) olur.
        const isKdvDahilField = kTmpl.isKdvDahil === true; // şablon KDV dahil kaydediyor mu?
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
              // Excel'de yazan tutar KDV DAHİL (Excel kolon başlığı "Tutar (KDV Dahil)")
              const dahil = s.tutar;
              const matrah = r2(dahil / (1 + oran / 100));
              const kdv = r2(dahil - matrah);
              // DB API "tutar" alanı KDV HARİÇ matrah + isKdvDahil:false + kdv ayrı bekliyor.
              // (gider/create'te de aynı yapı — çift KDV hesaplamasını önlemek için ZORUNLU.)
              k.tutar = matrah;
              k.isKdvDahil = false;
              k.kdvOrani = oran;
              k.kdv = kdv;
              k.aciklama = s.aciklama || (b.zno + ' NL. Z RAPORU Mal Satışı');
              // CREATE için: eski kaydın kimlik alanlarını temizle
              delete k.id; delete k.gelirBelgeId; delete k.key; delete k.gelirId;
              belgeToplam += dahil;
              return k;
            });
            P.belgeTutari = r2(belgeToplam);
            P[krediKey] = r2(b.kredi);
            if (nakitKey) P[nakitKey] = r2(b.nakit);
            // Aynı şekilde belge kimlik alanlarını temizle
            delete P.id; delete P.gelirBelgeId; delete P.key; delete P.gelirId;
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
      let tmpl = null, tmplIst = null, giden = null, panoPaket = null;
      try { const s = await chrome.storage.local.get(['satisTemplate', 'istisnaTemplate', 'uyumGiden']); tmpl = s.satisTemplate && s.satisTemplate.req; tmplIst = s.istisnaTemplate && s.istisnaTemplate.req; giden = s.uyumGiden && s.uyumGiden.list; } catch (e) {}
      // FALLBACK: Uyumsoft cache yoksa panodaki 'battal-esmm-gonder' paketini oku (Sinan/Trendyol gibi Uyumsoft-suz mükellefler)
      if (!giden || !giden.length) {
        try {
          const txt = await navigator.clipboard.readText();
          const p = JSON.parse(txt);
          if (p && p.tip === 'battal-esmm-gonder' && Array.isArray(p.items)) {
            panoPaket = p;
            // Package.items -> giden formatına dönüştür (no, tarih, vkn, unvan, matrah, kdv, tutar + satirlar)
            giden = p.items.map(it => ({
              no: it.belgeNo, tarih: it.tarih, vkn: it.vkn || '', unvan: it.unvan || ((it.ad || '') + ' ' + (it.soyad || '')).trim(),
              matrah: +it.matrah || 0, kdv: +it.kdv || 0, tutar: (+it.matrah || 0) + (+it.kdv || 0),
              ad: it.ad, soyad: it.soyad, krediKart: +it.krediKart || 0, nakit: +it.nakit || 0,
              satirlar: Array.isArray(it.satirlar) ? it.satirlar : null,
              status: 'aktif'
            }));
          }
        } catch (e) {}
      }
      if (!giden || !giden.length) { bar.innerHTML = '<div style="color:#fcd34d">📤 <b>Panoda paket YOK</b> veya <b>Uyumsoft</b> Giden faturaları çekilmedi.<br>· Panelden <b>Defter Beyan Scripti Üret + Kopyala</b> bas → pano dolar → tekrar bu butona bas.<br>· Ya da Uyumsoft Giden sayfasında "📤 Giden Faturaları Al" bas.</div>'; return; }
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
          // Karışık faturalar (kuyumcu): satirlar[] varsa oran kontrolü BYPASS — her satır kendi kdvOran'ıyla gider
          const hasSatirlar = Array.isArray(x.satirlar) && x.satirlar.length > 0;
          if (!hasSatirlar && [0, 1, 8, 10, 18, 20].indexOf(oran) < 0) { slog('⚠ ' + no + ' KDV oranı belirsiz (%' + oran + ') — ELLE gir', '#fbbf24'); atla++; continue; }
          try {
            const t = iso((x.tarih || '').slice(0, 10));
            const P = JSON.parse(JSON.stringify(tmpl));
            P.kayitTarihi = t; P.belgeTarihi = t; P.belgeSiraNo = no;
            P.adresiGuncelleme = false;
            // Alıcı bilgisi — VKN varsa adres defterinden, yoksa nihai (Trendyol)
            if (x.vkn) {
              try { const lj = await (await fetch(B + '/adresdefteri/findbytckn/' + x.vkn, { method: 'POST', headers: H, body: '{}', credentials: 'include' })).json(); const rc = lj.resultContainer; if (rc) { P.tcknVkn = x.vkn; P.ad = rc.ad; P.soyad = rc.soyad; P.vergiDairesiKodu = rc.vergiDairesiKodu; if (rc.subeNo) P.subeNo = rc.subeNo; P.nihaiTuketici = false; } } catch (e) {}
            } else if (panoPaket) {
              P.nihaiTuketici = true; P.ad = x.ad || 'MÜŞTERİ'; P.soyad = x.soyad || '';
              delete P.tcknVkn; delete P.vergiDairesiKodu; delete P.subeNo;
            }
            if (panoPaket) P.krediKartiTutari = r2(x.krediKart || 0);
            const acikBase = (x.unvan || ((x.ad || '') + ' ' + (x.soyad || ''))).toLocaleUpperCase('tr').trim();
            // Kayıt satırları — karışık ise satirlar[], değilse tek satır (whitelist alanlar)
            const satirlar = hasSatirlar ? x.satirlar : [{ matrah, kdv, kdvOran: oran }];
            let toplamM = 0, toplamK = 0;
            const kIstTmpl = (tmplIst && tmplIst.kayitlar && tmplIst.kayitlar[0]) || null;
            P.kayitlar = satirlar.map(s => {
              const mm = r2(+s.matrah || 0), kk = r2(+s.kdv || 0), oo = +s.kdvOran || 0;
              toplamM += mm; toplamK += kk;
              // İstisna satır (%0 KDV veya satisTuruKodu override): varsa istisnaTemplate kullan
              const useIst = kIstTmpl && (oo === 0 || (s.satisTuruKodu && s.satisTuruKodu !== '1'));
              const src = useIst ? kIstTmpl : kTmpl;
              // İstisna template varsa: TÜM alanları kopyala (bilinmeyen istisna field'ları için), sonra override
              const rec = useIst ? JSON.parse(JSON.stringify(src)) : {};
              rec.deleted = false;
              rec.satisTuruKodu = String(useIst ? (src.satisTuruKodu || '2') : (s.satisTuruKodu || src.satisTuruKodu || '1'));
              rec.gelirKayitTuruKodu = String(src.gelirKayitTuruKodu || '2');
              rec.gelirKayitAltTuruKodu = String(useIst ? (src.gelirKayitAltTuruKodu || '') : (s.altKod || (panoPaket && panoPaket.altKod) || src.gelirKayitAltTuruKodu || ''));
              rec.aciklama = acikBase + ' - ' + (s.altAd || (useIst ? '' : (panoPaket && panoPaket.altAd) || 'MAL SATIŞI')).trim();
              rec.tutar = mm;
              rec.naceKodu = String((panoPaket && panoPaket.nace) || src.naceKodu || '');
              rec.isKdvDahil = false;
              rec.kdv = kk;
              rec.kdvOrani = oo;
              rec.tevkifatUygulanmayanKodu = String(src.tevkifatUygulanmayanKodu || '1100');
              // Template-level id/key + geçersiz tevkifat/stopaj alanları sil
              delete rec.id; delete rec.gelirBelgeId; delete rec.key;
              // İstisna kayitlarda: TÜM template değerlerini KORU (0 dahi olsa, silme)
              // Sadece override edilen alanlar (tutar, kdv, aciklama vs) yukarıda set edildi
              return rec;
            });
            P.belgeTutari = r2(toplamM);
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

    /* ── PANODAN e-SMM GÖNDER: Panelde üretilen 'battal-esmm-gonder' paketini okur,
       satisTemplate casus şablonuyla her makbuzu /gelir/create'e POST atar.
       Nihai tüketici: ad/soyad paketten, tcknVkn/VD YOK. VKN'li: adres defterinden VD çekilir.
       POS ise krediKartiTutari brüt, nakit ise nakit alanı brüt. */
    async function panodanEsmmGonder() {
      const bar = overlayAc('📥 Panodan e-SMM Gönder');
      const kilit = await adresKilidi();
      if (!kilit.gecer) { kilitRed(bar, kilit.mesaj); return; }
      const D = document, r2 = v => Math.round(v * 100) / 100;
      const isoT = t => { const a = String(t).split('.'); return a.length === 3 ? a[2] + '-' + a[1] + '-' + a[0] + ' 00:00:00' : t; };
      let paket;
      try {
        const txt = await navigator.clipboard.readText();
        paket = JSON.parse(txt);
        if (paket.tip !== 'battal-esmm-gonder' || !Array.isArray(paket.items)) throw new Error('Panoda geçerli e-SMM paketi yok.');
      } catch (e) { bar.innerHTML = '<span style="color:#fca5a5">Hata: ' + e.message + '</span>'; return; }
      // Casus şablon
      let tmpl = null;
      try { const s = await chrome.storage.local.get('satisTemplate'); tmpl = s.satisTemplate && s.satisTemplate.req; } catch (e) {}
      if (!tmpl || !tmpl.gelirBelgeTuruKodu) {
        bar.innerHTML = '<div style="color:#fcd34d;font-size:14px;line-height:1.8"><b>🎯 Önce e-SMM şablonu öğrenilmeli (tek seferlik)</b><br>' +
          'Gelir Listele → kayıtlı bir <b>e-Serbest Meslek Makbuzu</b> satırına tıkla → <b>"Belgeyi Güncelle"</b> bas (değiştirme yok). Casus şablonu yakalar → tekrar bu butona bas.</div>' +
          '<div id="__esBek" style="margin-top:10px;color:#6ee7b7;font-size:12px">Durum: e-SMM belgesinin "Belgeyi Güncelle" ile kaydı bekleniyor…</div>';
        const iv = setInterval(async () => { try { const s = await chrome.storage.local.get('satisTemplate'); if (s && s.satisTemplate) { clearInterval(iv); const e = D.getElementById('__esBek'); if (e) e.innerHTML = '✅ Şablon yakalandı! Tekrar "📥 Panodan e-SMM Gönder" bas.'; } } catch (e) {} }, 1500);
        return;
      }
      const TK = tokenBul(); const H = { 'Content-Type': 'application/json; charset=utf-8' }; if (TK) H.Token = TK;
      const kTmpl = (tmpl.kayitlar && tmpl.kayitlar[0]) || {};
      // Mevcut belge nolar (mükerrer'i atla)
      const mevcut = new Set();
      try { const R = await pullGelirDB(null); R.all.forEach(r => { if (r.belgeSiraNo) mevcut.add(norm(r.belgeSiraNo)); }); } catch (e) {}

      bar.innerHTML = '<div style="margin-bottom:8px">📤 ' + paket.items.length + ' e-SMM makbuzu · Şablon türü <b>' + tmpl.gelirBelgeTuruKodu + '</b> · alt kod <b>' + (paket.altKod || '?') + '</b></div>' +
        '<label style="display:block;margin-bottom:10px"><input type="checkbox" id="__esTest" checked> 🧪 Test modu (sadece 1 makbuz, kaydetmeden sonuç göster)</label>' +
        '<button id="__esStart" style="background:#22c55e;color:#0b1224;border:0;padding:12px 22px;border-radius:8px;font-weight:800;cursor:pointer;font-size:14px">🚀 Gönder</button>' +
        '<div id="__esLog" style="margin-top:12px;font-family:Consolas,monospace;font-size:12px;max-height:340px;overflow:auto;background:#0b1020;padding:10px;border-radius:8px"></div>';
      const logEl = D.getElementById('__esLog');
      const eslog = (t, c) => { const d = document.createElement('div'); d.style.color = c || '#9aa6c0'; d.textContent = t; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; };

      D.getElementById('__esStart').onclick = async () => {
        const test = D.getElementById('__esTest').checked;
        D.getElementById('__esStart').disabled = true;
        let ok = 0, fail = 0, atla = 0;
        eslog('🚀 ' + paket.items.length + ' makbuz · Test: ' + (test ? 'AÇIK' : 'KAPALI'), '#22c55e');
        for (const it of paket.items) {
          const bno = String(it.belgeNo || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 16);
          if (mevcut.has(norm(bno))) { atla++; eslog('⏭ ' + bno + ' zaten kayıtlı', '#9aa6c0'); continue; }
          try {
            const t = isoT(it.tarih);
            const P = JSON.parse(JSON.stringify(tmpl));
            P.kayitTarihi = t; P.belgeTarihi = t; P.belgeSiraNo = bno;
            P.adresiGuncelleme = false;
            // Kimlik ayarı
            if (it.vkn) {
              try { const lj = await (await fetch(B + '/adresdefteri/findbytckn/' + it.vkn, { method: 'POST', headers: H, body: '{}', credentials: 'include' })).json(); const rc = lj.resultContainer; if (rc) { P.tcknVkn = it.vkn; P.ad = rc.ad; P.soyad = rc.soyad; P.vergiDairesiKodu = rc.vergiDairesiKodu; if (rc.subeNo) P.subeNo = rc.subeNo; P.nihaiTuketici = false; } else { P.nihaiTuketici = true; P.ad = it.ad || 'MÜŞTERİ'; P.soyad = it.soyad || ''; delete P.tcknVkn; delete P.vergiDairesiKodu; delete P.subeNo; } } catch (e) { P.nihaiTuketici = true; P.ad = it.ad || 'MÜŞTERİ'; P.soyad = it.soyad || ''; delete P.tcknVkn; delete P.vergiDairesiKodu; delete P.subeNo; }
            } else {
              P.nihaiTuketici = true; P.ad = it.ad || 'MÜŞTERİ'; P.soyad = it.soyad || '';
              delete P.tcknVkn; delete P.vergiDairesiKodu; delete P.subeNo;
            }
            // Karışık fatura (kuyumcu: aynı belgede %20 + özel matrah): it.satirlar array kullanılır.
            // Yoksa tek satırlı standart: it.matrah/kdv/kdvOran.
            const satirlar = Array.isArray(it.satirlar) && it.satirlar.length ? it.satirlar
              : [{ matrah: +it.matrah || 0, kdv: +it.kdv || 0, kdvOran: +it.kdvOran || 0 }];
            let toplamMatrah = 0, toplamKdv = 0;
            const adUst = (it.ad || '') + ' ' + (it.soyad || '');
            const acikBase = ((it.unvan || adUst).toLocaleUpperCase('tr')).trim();
            P.kayitlar = satirlar.map(s => {
              const mm = r2(+s.matrah || 0), kk = r2(+s.kdv || 0), oo = +s.kdvOran || 0;
              toplamMatrah += mm; toplamKdv += kk;
              // Whitelist: template'ten YALNIZCA temel/güvenli alanları al
              const k = {
                deleted: false,
                satisTuruKodu: String(s.satisTuruKodu || kTmpl.satisTuruKodu || '1'),
                gelirKayitTuruKodu: String(kTmpl.gelirKayitTuruKodu || '2'),
                gelirKayitAltTuruKodu: String(s.altKod || paket.altKod || kTmpl.gelirKayitAltTuruKodu || ''),
                aciklama: acikBase + ' - ' + (s.altAd || paket.altAd || 'HİZMET'),
                tutar: mm,
                naceKodu: String(paket.nace || kTmpl.naceKodu || ''),
                isKdvDahil: false,
                kdv: kk,
                kdvOrani: oo,
                tevkifatUygulanmayanKodu: String(s.tevkifatUygulanmayanKodu || kTmpl.tevkifatUygulanmayanKodu || '1100')
              };
              return k;
            });
            const matrah = r2(toplamMatrah), kdv = r2(toplamKdv), gross = r2(matrah + kdv);
            P.belgeTutari = matrah;
            P.krediKartiTutari = r2(+it.krediKart || 0);
            delete P.id; delete P.gelirBelgeId; delete P.key;
            if (test) { eslog('🧪 ' + bno + ' hazırlandı: matrah ' + matrah.toFixed(2) + ' + KDV ' + kdv.toFixed(2) + ' · ' + (P.nihaiTuketici ? 'nihai' : 'VKN ' + P.tcknVkn) + ' · ' + (it.krediKart > 0 ? 'KK ' + it.krediKart : 'Nakit ' + it.nakit) + ' — KAYDEDİLMEDİ', '#fbbf24'); ok++; break; }
            const cr = await fetch(B + '/gelir/create', { method: 'POST', headers: H, body: JSON.stringify(P), credentials: 'include' });
            const cj = await cr.json();
            if (cr.status === 200 && cj.resultContainer && !cj.errorMessage) { ok++; mevcut.add(norm(bno)); eslog('✅ ' + bno + ' (₺' + gross.toFixed(2) + ')', '#10b981'); }
            else { const m = (cj.errorMessage || cj.statusMessage || cr.status).toString(); if (/aynı|mükerrer|zaten/i.test(m)) { atla++; eslog('⏭ ' + bno + ' zaten var', '#9aa6c0'); } else { fail++; eslog('❌ ' + bno + ' — ' + m.slice(0, 100), '#ef4444'); } }
          } catch (e) { fail++; eslog('❌ ' + bno + ' — ' + e.message, '#ef4444'); }
        }
        eslog('🎉 Bitti — ✅ Yeni: ' + ok + ' · ⏭ Atlanan: ' + atla + (fail ? ' · ❌ Hata: ' + fail : ''), fail ? '#fbbf24' : '#10b981');
        if (test) eslog('🧪 Test bitti. Doğruysa test modunu kapatıp tekrar bas.', '#fbbf24');
        D.getElementById('__esStart').disabled = false;
      };
    }

    const kur = () => {
      sicilAdresYakala(); // Sicil sayfasındaysak hesap adresini yakala
      butonEkle('📊 Gider Kontrol', calistir, null, '__gkBtn', 20);
      butonEkle('📥 Panodan Gider Gönder', panodanGonder, 'linear-gradient(135deg,#3b82f6,#1d4ed8)', '__gonderBtn', 76);
      butonEkle('🚀 Eksik Giderleri Oto Gönder', eksikGiderGonder, 'linear-gradient(135deg,#f59e0b,#d97706)', '__eksikBtn', 132);
      butonEkle('📊 Gelir Kontrol', gelirKontrol, 'linear-gradient(135deg,#d4af37,#b8941f)', '__glBtn', 188);
      butonEkle('📤 Giden (Satış) Gönder', gidenGonder, 'linear-gradient(135deg,#60a5fa,#2563eb)', '__gdGonderBtn', 244);
      butonEkle('📊 Z Raporu Gönder', zRaporGonder, 'linear-gradient(135deg,#22c55e,#15803d)', '__zGonderBtn', 300);
      butonEkle('📥 Panodan e-SMM Gönder', panodanEsmmGonder, 'linear-gradient(135deg,#f97316,#c2410c)', '__panoEsmmBtn', 356);
      butonEkle('📋 e-SMM Eksik Bul', esmmEksik, 'linear-gradient(135deg,#34d399,#059669)', '__esmmBtn', 412);
      butonEkle('🔒 Kimlik/Adres Kontrol', kimlikKontrol, 'linear-gradient(135deg,#a78bfa,#7c3aed)', '__kimlikBtn', 468);
    };
    kur();
    setInterval(kur, 2000);

    // 🧙 SİHİRBAZ · Uyumsoft'ta sınıflama bitince buraya yönlendirilirse eksik özetini otomatik aç.
    (function sihirbazDBOto(){
      if (sessionStorage.getItem('__sihirbazDBRun')) return;
      const q = location.hash + location.search;
      const isSihirbaz = /sihirbaz=1/.test(q);
      chrome.storage.local.get('sihirbaz', s => {
        const flag = s && s.sihirbaz;
        const aktif = isSihirbaz || (flag && flag.asama === 'db' && (Date.now() - flag.ts < 10*60*1000));
        if (!aktif) return;
        // Sayfa hazır olsun, "📊 Gider Kontrol" listesi çekilebilir olsun diye kısa bekle
        let deneme = 0;
        const iv = setInterval(() => {
          deneme++;
          if (deneme > 30) { clearInterval(iv); return; }
          if (document.body && document.querySelector('.dbs-navbar__content, .navbar, header')) {
            clearInterval(iv);
            sessionStorage.setItem('__sihirbazDBRun', '1');
            chrome.storage.local.get('sihirbaz', ss => {
              const asama = (ss && ss.sihirbaz && ss.sihirbaz.tip) || 'alis';
              try { chrome.storage.local.set({ sihirbaz: { asama: 'ozet', ts: Date.now() } }); } catch(e){}
              if (asama === 'gelir') gelirKontrol();
              else eksikGiderGonder();
            });
          }
        }, 1000);
      });
    })();
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
      // Satıcı (fatura kesen) firma adı — İGDAŞ gibi tedarikçi bazlı dışlama için
      const saticiBlok = tagIc(t, 'AccountingSupplierParty');
      const saticiUnvan = (tagTxt(tagIc(saticiBlok, 'PartyName'), 'Name') || ((tagTxt(saticiBlok, 'FirstName') + ' ' + tagTxt(saticiBlok, 'FamilyName')).trim())) || '';
      return { tckn, vkn, ad, vd, adres, ettn, fno, saticiUnvan };
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
    // VD normalize: "GÖZTEPE V.D.", "GÖZTEPE VERGİ DAİRESİ", "GÖZTEPE VD MÜDÜRLÜĞÜ" → "GÖZTEPE"
    const vdNorm = s => trAscii(s || '').replace(/V\.?D\.?|VERGI ?DAIRESI|MUDURLUGU|MUD\.?/g, '').replace(/\s+/g, ' ').trim();
    // İki VD birbirini içeriyor mu? (token bazlı gevşek eşleşme)
    const vdEsit = (v1, v2) => {
      const a = vdNorm(v1), b = vdNorm(v2);
      if (!a || !b) return !a && !b;
      return a === b || a.includes(b) || b.includes(a);
    };
    function aliciKiyasla(a) {
      const kim = a.tckn || a.vkn;
      const rec = kim ? LEVHA_BY_ID[kim] : null;
      if (!kim) return { uygun: false, sebep: 'Faturada alıcı TCKN/VKN yok', detay: '' };
      if (!rec) return { uygun: false, sebep: 'Levhada kayıtlı değil: ' + kim, detay: '' };
      const saticiText = (a.satici||'') + ' ' + (a.saticiUnvan||'') + ' ' + (a.unvan||'');
      // 🚫 Mükellefin kayıtlı olmadığı doğalgaz aboneliği — SESSİZ dışla (RED listesinde görünmez)
      if (rec.dogalgazDisla && /igdaş|igdas|istanbul gaz|doğalgaz dağıt|dogalgaz dagit/i.test(saticiText)) {
        return { uygun: false, atla: true, sebep: 'İGDAŞ dışla', detay: '', rec };
      }
      // 🚫 Aracı olmayan mükellefte akaryakıt/petrol/kasko/HGS → SESSİZ dışla
      if (rec.aracYok && ARAC_RE.test(saticiText)) {
        return { uygun: false, atla: true, sebep: 'Araç faturası — aracı yok', detay: '', rec };
      }
      // 🚫 Eski adres dışla: fatura adresinde bu kelime geçerse (ör. Zühtüpaşa) → SESSİZ dışla
      // Mükellef o adreste artık oturmuyor; oradaki faturalar (Turkcell/TT/vb) dahil edilmemeli.
      if (rec.dislaAdres && a.adres && rec.dislaAdres.test(a.adres)) {
        return { uygun: false, atla: true, sebep: 'Eski adres — Zühtüpaşa/eski yerleşim', detay: '', rec };
      }
      const adL = trAscii(rec.ad).split(' ').filter(x => x.length > 1);
      const adF = trAscii(a.ad);
      const adHit = adL.filter(t => adF.includes(t)).length;
      const adOk = adL.length > 0 && adHit === adL.length;
      // Kısmi ad eşleşmesi (en az soyad tuttu): esnek modda kabul.
      const adKismiOk = adL.length > 0 && adHit >= 1;
      let adr = adresBenzer(rec.adres, a.adres);
      // Eski adresler varsa onlarla da kıyasla, en yüksek skoru al
      if (rec.eskiAdres && Array.isArray(rec.eskiAdres)) {
        rec.eskiAdres.forEach(ea => {
          const eak = adresBenzer(ea, a.adres);
          if (eak.skor > adr.skor) adr = eak;
        });
      }
      const karar = adresKarar(adr.skor);
      // 🔓 ESNEK MOD: TCKN/VKN eşleşiyorsa YETERLİ. VD/ad/adres bakılmaz.
      // (Turkcell/TT gibi büyük tedarikçiler fatura kesim yerine bakıyor, VD tutarsız olabilir.
      //  Zühtüpaşa/Kozyataği/vs adresli faturalar TCKN eşleştikçe geçer.)
      if (rec.esnekAdres) {
        return { uygun: true, sebep: '', detay: (a.tckn ? 'TCKN ✓' : 'VKN ✓') + ' · esnek mod', rec, yzd: Math.round(adr.skor*100) };
      }
      // VD normalize (V.D./Vergi Dairesi/Müd. ekleri kaldır) — normal mod için
      const vdBelirsiz = !a.vd || /^[\d\-\s]*$/.test(a.vd) || /tckimlikno|tcimlikno/i.test(a.vd);
      const vdGerek = !a.tckn && !!a.vkn;
      const vdOk = vdBelirsiz ? true : (vdGerek ? vdEsit(a.vd, rec.vd) : (!a.vd || vdEsit(a.vd, rec.vd)));
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

    // API tabanlı toplama: DataTables'ın kendi JSON endpoint'ine direkt istek atar,
    // sayfa DOM'una hiç dokunmaz. Sayfa gezmek yok, click yok, race condition yok.
    // Her satırdan uuid'yi çıkarır (JSON string'inde regex ile).
    // Dönem tercihi: {yil, ay} — chrome.storage.local'da 'donem' anahtarında.
    // Yoksa varsayılan: bir önceki ay (KDV beyan edilmemiş, cari işlenmesi gereken).
    async function donemCek() {
      try {
        const s = await chrome.storage.local.get('donem');
        if (s && s.donem && s.donem.yil) return s.donem;
      } catch(e){}
      const d = new Date(); const o = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      return { yil: o.getFullYear(), ay: o.getMonth() + 1 };
    }

    async function tumFaturalariToplaAPI(bar, donem) {
      const all = new Map();
      const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      const hedefYil = donem && donem.yil ? String(donem.yil) : '';
      const hedefAy = donem && donem.ay ? ('0' + donem.ay).slice(-2) : '';
      let start = 0, len = 250, total = Infinity, gecen = 0;
      while (start < total) {
        const body = 'sEcho=1&iColumns=11&iDisplayStart=' + start + '&iDisplayLength=' + len +
          '&mDataProp_1=InvoiceNumber&mDataProp_2=ExecutionDate&mDataProp_3=CreateDateUtc&mDataProp_4=Title&mDataProp_5=PayableAmount&mDataProp_6=TaxTotal&mDataProp_7=Type&mDataProp_8=Status&mDataProp_9=IsNew&mDataProp_10=InvoiceActions' +
          '&IsNewFilter=3&IsSeenFilter=None&ShowOlderThanOneYear=true&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1';
        const r = await fetch('/Invoicebox/GetInboxInvoiceJsonList', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'include', body
        });
        if (r.status !== 200) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        total = j.iTotalRecords || (j.aaData || []).length;
        (j.aaData || []).forEach(d => {
          gecen++;
          // Dönem filtresi — ExecutionDate "DD.MM.YYYY" veya "YYYY-MM-DD"
          if (hedefYil) {
            const ed = (d.ExecutionDate || '') + '';
            const m1 = ed.match(/(\d{4})-(\d{2})-\d{2}/); // ISO
            const m2 = ed.match(/(\d{2})\.(\d{2})\.(\d{4})/); // TR
            const y = m1 ? m1[1] : m2 ? m2[3] : '';
            const a = m1 ? m1[2] : m2 ? m2[2] : '';
            if (y !== hedefYil) return;
            if (hedefAy && a !== hedefAy) return;
          }
          const asMe = JSON.stringify(d);
          const um = asMe.match(uuidRe);
          if (!um) return;
          const uuid = um[0];
          if (!all.has(uuid.toLowerCase())) {
            all.set(uuid.toLowerCase(), { uuid, no: d.InvoiceNumber || '', satir: (d.Title || '').slice(0, 90), tarih: d.ExecutionDate || '' });
          }
        });
        if (bar) bar.textContent = '📄 Dönem taranıyor (' + (hedefAy || 'tüm ay') + '/' + hedefYil + ')… eşleşen: ' + all.size + ' · toplam bakılan: ' + gecen + '/' + total;
        if (!(j.aaData || []).length) break;
        start += len;
        if (start > 20000) break;
      }
      return [...all.values()];
    }

    // TAM OTOMATİK toplama: önce API (dönem filtreli) dener, olmazsa DOM'a düşer.
    async function tumFaturalariTopla(bar) {
      const donem = await donemCek();
      try {
        const apiRes = await tumFaturalariToplaAPI(bar, donem);
        if (apiRes.length) return apiRes;
      } catch (e) {
        if (bar) bar.textContent = '⚠️ API başarısız, DOM üzerinden gezilecek: ' + e.message;
        await bekle(800);
      }
      return await tumFaturalariToplaDOM(bar);
    }

    // Eski DOM tabanlı gezme (yedek).
    async function tumFaturalariToplaDOM(bar) {
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
      // 1.5) 1. sayfaya dön (kullanıcı geç sayfada kalmış olabilir — 2026 kayıtlarını kaçırmayalım)
      if (bar) bar.textContent = '📄 1. sayfaya dönülüyor…';
      let sifirlaGuard = 0;
      while (sifirlaGuard++ < 200) {
        const prev = document.querySelector('a.paginate_button.previous, li.previous a, a[title="Önceki" i], a[aria-label="Previous" i], .pagination .prev a');
        if (!prev) break;
        const kapali = /disabled/i.test((prev.className || '') + ' ' + ((prev.parentElement && prev.parentElement.className) || ''));
        if (kapali) break;
        const onceki = ilkUuid();
        prev.click();
        let t = 0; while (t++ < 40) { await bekle(200); if (ilkUuid() !== onceki) break; }
        if (ilkUuid() === onceki) break;
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
      async function xmlCek(uuid) {
        const ctrl = new AbortController();
        const tmr = setTimeout(() => ctrl.abort(), 20000);
        const r = await fetch('/Invoicebox/DownloadInboxInvoice?invoiceId=' + uuid, { credentials: 'include', signal: ctrl.signal });
        clearTimeout(tmr);
        if (r.status !== 200) throw new Error('HTTP ' + r.status);
        const blob = await r.blob();
        const txt = await blob.text();
        return aliciAyikla(txt);
      }

      async function tekKontrol(f) {
        try {
          const a = await xmlCek(f.uuid);
          if (!a || (!a.tckn && !a.vkn)) return { f, uygun: false, sebep: 'XML\'de alıcı TCKN/VKN bulunamadı', detay: '' };
          const k = aliciKiyasla(a);
          return { f, a, uygun: k.uygun, sebep: k.sebep, detay: k.detay, atla: k.atla };
        } catch (e) { return { f, uygun: false, sebep: 'Hata: ' + e.message, detay: '' }; }
      }
      const PAR_AK = 15;
      for (let i = 0; i < list.length; i += PAR_AK) {
        const res = await Promise.all(list.slice(i, i + PAR_AK).map(tekKontrol));
        res.forEach(r => sonuc.push(r));
        bitti = Math.min(i + PAR_AK, list.length);
        const d = document.getElementById('__akDurum');
        if (d) d.textContent = '🔎 Kontrol ediliyor… ' + bitti + '/' + list.length;
      }
      // atla:true olanlar sessiz dışlanır (araç/İGDAŞ vs) — listelenmez
      const aktifSonuc = sonuc.filter(r => !r.atla);
      const uygun = aktifSonuc.filter(r => r.uygun), red = aktifSonuc.filter(r => !r.uygun);
      // Sonuçları hafızaya yaz → Defter Beyan "Panodan Gider Gönder" red'leri göndermesin
      try {
        const st = await chrome.storage.local.get('aliciKontrol');
        const mapEski = (st.aliciKontrol && st.aliciKontrol.map) || {};
        sonuc.forEach(r => {
          const no = ((r.a && r.a.fno) || r.f.no || '').replace(/[^0-9A-Za-z]/g, '');
          if (no) mapEski[norm(no)] = { uygun: r.uygun, atla: !!r.atla, sebep: r.sebep || '', detay: r.detay || '', ts: Date.now() };
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

    // ═══ FATURA DETAY ÇEK + OTO SINIFLA ═══
    // Her gelen faturanın XML'ini indirir, matrah/KDV/tarih/açıklama/satıcı VKN+unvan çıkarır,
    // SINIF_KURALLAR ile otomatik gider alt türü atar, storage'a kaydeder.
    // Defter Beyan tarafı bu veriyi okuyup eksik faturaları otomatik gönderebilir.
    async function faturaDetayCekVeSinifla() {
      const bar = overlayAc('📦 Fatura Detay Çek + Otomatik Sınıfla');
      bar.textContent = '📄 Faturalar toplanıyor…';
      let list;
      try { list = await tumFaturalariTopla(bar); } catch (e) { list = faturalariTopla(); }
      if (!list.length) {
        bar.innerHTML = '<div style="color:#fcd34d;line-height:1.8">Bu sayfada gelen fatura bulunamadı.<br>Gelen Fatura → <b>Tümü</b> listesini aç.</div>';
        return;
      }
      bar.innerHTML = '<div id="__fdDurum">📦 ' + list.length + ' fatura XML indiriliyor + sınıflandırılıyor… 0/' + list.length + '</div><div id="__fdRows" style="margin-top:10px"></div>';

      // Aktif mükellefin NACE kodunu bul (SMM mi işletme mi belirlemek için)
      const am = aktifMukellef();
      const nace = (am && am.rec && am.rec.nace) || '';

      const sonuclar = [];
      let bitti = 0;

      async function detayCek(f) {
        try {
          const ctrl = new AbortController();
          const tmr = setTimeout(() => ctrl.abort(), 20000);
          const r = await fetch('/Invoicebox/DownloadInboxInvoice?invoiceId=' + f.uuid, { credentials: 'include', signal: ctrl.signal });
          clearTimeout(tmr);
          if (r.status !== 200) throw new Error('HTTP ' + r.status);
          const blob = await r.blob();
          let t = await blob.text();

          // Unescape if needed
          if (t.indexOf('AccountingSupplierParty') < 0) t = unesc(t);

          // Fatura no + ETTN
          const fno = (t.match(/<(?:\w+:)?ID(?:\s[^>]*)?>\s*([A-Z0-9]{3}20\d{11})\s*</) || ['', ''])[1] || f.no;
          const ettn = tagTxt(t, 'UUID') || f.uuid;

          // Tarih
          const tarih = tagTxt(t, 'IssueDate') || '';

          // Satıcı (AccountingSupplierParty)
          const saticiBlok = tagIc(t, 'AccountingSupplierParty');
          let saticiVkn = '', saticiTckn = '', saticiUnvan = '';
          if (saticiBlok) {
            const idRe2 = /<(?:\w+:)?ID\s[^>]*schemeID="(TCKN|VKN)"[^>]*>\s*(\d+)/g;
            let mm;
            while ((mm = idRe2.exec(saticiBlok))) { if (mm[1] === 'TCKN') saticiTckn = mm[2]; else saticiVkn = mm[2]; }
            saticiUnvan = tagTxt(tagIc(saticiBlok, 'PartyName'), 'Name') || ((tagTxt(saticiBlok, 'FirstName') + ' ' + tagTxt(saticiBlok, 'FamilyName')).trim());
          }

          // Tutarlar
          const say = s => { s = ('' + (s == null ? '' : s)).replace(/[^\d,.\-]/g, ''); if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.'); else if (s.includes(',')) s = s.replace(',', '.'); return parseFloat(s) || 0; };

          // LegalMonetaryTotal
          const lmt = tagIc(t, 'LegalMonetaryTotal');
          const toplam = say(tagTxt(lmt, 'PayableAmount') || tagTxt(lmt, 'TaxInclusiveAmount'));
          const matrahXml = say(tagTxt(lmt, 'TaxExclusiveAmount') || tagTxt(lmt, 'LineExtensionAmount'));

          // Vergi ayrıştırma STRICT: Sadece TaxTypeCode/scheme = 0015 (KDV) olanlar KDV.
          // Diğer tüm vergiler (ÖİV 4171, Konaklama 9015, Hazine Payı, Katkı Payı vb.)
          // "digerVergi" havuzunda toplanır → tek KDVsiz kayıt (alt kod 218) olarak gider.
          // Bu, telecom faturalarında KDV'yi doğru (matrah × %20) yapmak için kritik.
          const subTotals = (t.match(/<(?:\w+:)?TaxSubtotal[\s>][\s\S]*?<\/(?:\w+:)?TaxSubtotal>/g) || []);
          let kdvToplam = 0, kdvOran = 0, digerVergi = 0, oivOran = 0, kdvMatrahi = 0;
          const vergiKodu = st => {
            const cat = tagIc(st, 'TaxCategory');
            const scheme = tagIc(cat, 'TaxScheme');
            return (tagTxt(scheme, 'TaxTypeCode') || tagTxt(cat, 'TaxTypeCode') || tagTxt(cat, 'ID') || '').trim();
          };
          if (subTotals.length) {
            subTotals.forEach(st => {
              const ta = say(tagTxt(st, 'TaxableAmount'));
              const tx = say(tagTxt(st, 'TaxAmount'));
              const pc = say(tagTxt(st, 'Percent'));
              const kod = vergiKodu(st);
              if (kod === '0015') {
                // Gerçek KDV
                kdvToplam += tx; kdvMatrahi += ta;
                if (!kdvOran || pc > kdvOran) kdvOran = Math.round(pc);
              } else {
                // ÖİV + tüm diğer ek vergiler (Konaklama, Hazine Payı, Katkı Payı…)
                digerVergi += tx;
                if (kod === '4171' && !oivOran) oivOran = Math.round(pc);
              }
            });
            if (!kdvOran && kdvMatrahi > 0) kdvOran = Math.round(kdvToplam / kdvMatrahi * 100);
          } else {
            // Yedek: TaxTotal → TaxAmount (ayrım yok, muhtemelen basit fatura)
            const taxTotal = tagIc(t, 'TaxTotal');
            kdvToplam = say(tagTxt(taxTotal, 'TaxAmount'));
          }
          const oivToplam = digerVergi; // eski değişken adını koru
          const matrah = matrahXml > 0 ? matrahXml : (toplam - kdvToplam - oivToplam);

          // Açıklama (Note alanı + kalem açıklamaları)
          const notlar = [];
          (t.match(/<(?:\w+:)?Note[^>]*>([\s\S]*?)<\/(?:\w+:)?Note>/g) || []).forEach(m => {
            const ic = m.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
            if (ic && ic.length > 2 && !/UYUM|e-?Fatura|e-?Arsiv|UBL|uuid|Hash/i.test(ic)) notlar.push(ic);
          });
          // InvoiceLine açıklamaları + gecikme zammı tespiti (elektrik fat.)
          const lines = t.match(/<(?:\w+:)?InvoiceLine[\s>][\s\S]*?<\/(?:\w+:)?InvoiceLine>/g) || [];
          let gecikmeTutar = 0;
          lines.forEach(ln => {
            const desc = tagTxt(ln, 'Description') || tagTxt(tagIc(ln, 'Item'), 'Name') || '';
            if (desc && desc.length > 2) notlar.push(desc);
            // Elektrik faturalarında gecikme zammı/faizi ayrı satır olarak gelir.
            // Matrahtan düşürülmesi gerekir (user talimatı: gecikme zammı işleme alınmaz).
            if (/gecikme ?zamm|gecikme ?faiz/i.test(desc)) {
              const lineExt = say(tagTxt(ln, 'LineExtensionAmount'));
              gecikmeTutar += lineExt;
            }
          });
          const aciklama = notlar.join(' | ').slice(0, 300);
          const elektrikMi = /enerjisa|bedaş|ayedaş|boğaziçi elektrik|elektrik perakende|elektrik dağıt|elektrik/i.test(saticiUnvan + ' ' + aciklama);

          // Sınıfla
          const sinifBilgi = faturaSinifla(saticiUnvan + ' ' + aciklama, saticiVkn || saticiTckn, matrah, nace, am && am.rec, aciklama);
          // Elektrik faturasında gecikme zammı varsa: kullanıcı elle işlesin (matrah/KDV manuel)
          if (elektrikMi && gecikmeTutar > 0.01) {
            sinifBilgi.otoGonder = false;
            sinifBilgi.altAd = '⚠️ Gecikme zammı ' + gecikmeTutar.toFixed(2) + ' TL — elle düzelt (matrah gecikme zammı hariç, KDV Vergi/Fonlar altındaki değer)';
            sinifBilgi.sinif = '⚡ Elektrik (Gecikme Zammı)';
          }

          return {
            fno, ettn, tarih, saticiVkn: saticiVkn || saticiTckn, saticiUnvan,
            matrah: Math.round(matrah * 100) / 100,
            kdv: Math.round(kdvToplam * 100) / 100,
            oivTutar: Math.round(oivToplam * 100) / 100,
            oivOran,
            kdvOran, toplam: Math.round(toplam * 100) / 100,
            aciklama,
            sinif: sinifBilgi.sinif, altKod: sinifBilgi.altKod, altAd: sinifBilgi.altAd,
            turKod: sinifBilgi.turKod, oiv: sinifBilgi.oiv || false,
            stopaj: sinifBilgi.stopaj || 0, otoGonder: sinifBilgi.otoGonder
          };
        } catch (e) {
          return { fno: f.no || f.uuid.slice(0, 8), ettn: f.uuid, hata: e.message };
        }
      }

      // Paralel indirme: 2 → 10. Aynı origin'e 6 socket sınırı var ama modern Chrome
      // HTTP/2 üzerinden çok daha fazla eşzamanlı istek destekliyor.
      const PAR = 15;
      for (let i = 0; i < list.length; i += PAR) {
        const res = await Promise.all(list.slice(i, i + PAR).map(detayCek));
        res.forEach(r => sonuclar.push(r));
        bitti = sonuclar.length;
        const d = document.getElementById('__fdDurum');
        if (d) d.textContent = '📦 XML indiriliyor + sınıflandırılıyor… ' + bitti + '/' + list.length;
      }

      // Storage'a kaydet
      const mukVkn = am ? am.vkn : 'bilinmiyor';
      try {
        await chrome.storage.local.set({ faturaSinif: { ts: Date.now(), mukVkn, nace, list: sonuclar } });
      } catch (e) {}

      // Alıcı kontrol sonuçlarını da oku (RED olanları işaretlemek için)
      let alkMap = {};
      try { const s = await chrome.storage.local.get('aliciKontrol'); alkMap = (s.aliciKontrol && s.aliciKontrol.map) || {}; } catch (e) {}

      const basarili = sonuclar.filter(r => !r.hata);
      const hatali = sonuclar.filter(r => r.hata);
      const otoGonderilir = basarili.filter(r => {
        const alkNo = norm((r.fno || '').replace(/[^0-9A-Za-z]/g, ''));
        const alk = alkMap[alkNo];
        return r.otoGonder && !(alk && alk.uygun === false);
      });
      const elleKontrol = basarili.filter(r => !r.otoGonder);
      const redEdilen = basarili.filter(r => { const alkNo = norm((r.fno || '').replace(/[^0-9A-Za-z]/g, '')); const alk = alkMap[alkNo]; return alk && alk.uygun === false; });

      let h = '<div style="margin-bottom:12px">' +
        chip('Toplam Fatura', sonuclar.length, '#1e2f3a') +
        chip('Detay Okunan', basarili.length, '#1e3a2f') +
        chip('Oto Gönderilebilir', otoGonderilir.length, '#1e3a2f') +
        chip('Elle Kontrol', elleKontrol.length, elleKontrol.length ? '#5b3a1a' : '#1f2937') +
        chip('Alıcı RED', redEdilen.length, redEdilen.length ? '#5b1a1a' : '#1f2937') +
        chip('Hata', hatali.length, hatali.length ? '#5b1a1a' : '#1f2937') +
        '</div>';
      h += '<div style="margin:8px 0;padding:12px 14px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:10px;color:#6ee7b7;font-size:12.5px">' +
        '✅ <b>' + basarili.length + '</b> faturanın detayı ve sınıfı kaydedildi.<br>' +
        '→ Şimdi <b>Defter Beyan</b> sekmesine geç → <b>🚀 Eksik Giderleri Otomatik Gönder</b> butonuna bas.<br>' +
        '→ Motor eksik faturaları otomatik tespit edip doğru sınıfla Defter Beyan\'a gönderecek.</div>';

      // Toplam matrah/KDV
      const topMatrah = basarili.reduce((a, r) => a + (r.matrah || 0), 0);
      const topKdv = basarili.reduce((a, r) => a + (r.kdv || 0), 0);
      h += '<div style="margin-bottom:12px">' + chip('Toplam Matrah', '₺' + fmt(topMatrah), '#1e3a2f') + chip('Toplam KDV', '₺' + fmt(topKdv), '#1e2f3a') + '</div>';

      // Sınıf bazında özet
      const sinifSay = {};
      basarili.forEach(r => { const s = r.sinif || 'Bilinmiyor'; sinifSay[s] = (sinifSay[s] || 0) + 1; });
      h += '<div style="margin-bottom:12px">';
      Object.keys(sinifSay).sort().forEach(s => { h += chip(s, sinifSay[s], '#1f2937'); });
      h += '</div>';

      const cols = ['Fatura No', 'Tarih', 'Satıcı', 'VKN/TC', 'Matrah', 'KDV', 'KDV%', 'Sınıf', 'Alt Tür', 'Durum'];
      h += '<div style="overflow:auto;border:1px solid #2a3550;border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="background:#141c2e;text-align:left">' + cols.map(x => '<th style="padding:7px">' + x + '</th>').join('') + '</tr></thead><tbody>';
      basarili.forEach(r => {
        const alkNo = norm((r.fno || '').replace(/[^0-9A-Za-z]/g, ''));
        const alk = alkMap[alkNo];
        const red = alk && alk.uygun === false;
        const durum = red ? '<span style="color:#fca5a5">⛔ Alıcı RED</span>' :
          (r.otoGonder ? '<span style="color:#6ee7b7">✅ Oto</span>' : '<span style="color:#fcd34d">⚠️ Elle</span>');
        h += '<tr style="border-top:1px solid #1f2840;' + (red ? 'background:rgba(239,68,68,.06)' : '') + '">' +
          '<td style="padding:6px">' + (r.fno || '') + '</td>' +
          '<td style="padding:6px">' + (r.tarih || '') + '</td>' +
          '<td style="padding:6px">' + ((r.saticiUnvan || '').slice(0, 35)) + '</td>' +
          '<td style="padding:6px">' + (r.saticiVkn || '') + '</td>' +
          '<td style="padding:6px;text-align:right">' + fmt(r.matrah) + '</td>' +
          '<td style="padding:6px;text-align:right">' + fmt(r.kdv) + '</td>' +
          '<td style="padding:6px;text-align:right">' + (r.kdvOran || 0) + '</td>' +
          '<td style="padding:6px;font-weight:700;color:#d4af37">' + (r.sinif || '') + '</td>' +
          '<td style="padding:6px;font-size:10px">' + (r.altAd || '') + '</td>' +
          '<td style="padding:6px">' + durum + '</td></tr>';
      });
      hatali.forEach(r => {
        h += '<tr style="border-top:1px solid #1f2840;background:rgba(239,68,68,.06)"><td style="padding:6px;color:#fca5a5">' + (r.fno || '') + '</td><td colspan="9" style="padding:6px;color:#fca5a5">❌ ' + r.hata + '</td></tr>';
      });
      h += '</tbody></table></div>';
      bar.innerHTML = h;
    }

    // 🧙 SİHİRBAZ · Uyumsoft Portal: alıcı kontrol → detay+sınıflandırma → Defter Beyan aç
    async function sihirbazAlisPortal() {
      // Önce dönemi sor/onayla
      const donemMevcut = await donemCek();
      const bar = overlayAc('🧙 Tam Otomatik Alış Kontrol Sihirbazı');
      const aylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
      let ayOpt = ''; for (let i=1;i<=12;i++) ayOpt += '<option value="'+i+'"'+(i===donemMevcut.ay?' selected':'')+'>'+aylar[i-1]+'</option>';
      let yilOpt = ''; for (let y=2024;y<=2028;y++) yilOpt += '<option value="'+y+'"'+(y===donemMevcut.yil?' selected':'')+'>'+y+'</option>';
      bar.innerHTML =
        '<div style="font-size:14px;color:#e8edf5;margin-bottom:14px">📅 Hangi dönemi tarayalım?</div>'+
        '<div style="display:flex;gap:10px;align-items:center;margin-bottom:16px">'+
        '<select id="__donAy" style="background:#0b1020;color:#e8edf5;border:1px solid #3a3550;padding:8px 14px;border-radius:8px;font-size:14px">'+ayOpt+'</select>'+
        '<select id="__donYil" style="background:#0b1020;color:#e8edf5;border:1px solid #3a3550;padding:8px 14px;border-radius:8px;font-size:14px">'+yilOpt+'</select>'+
        '</div>'+
        '<button id="__donBasla" style="background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;border:0;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer">▶️ Başlat</button>';
      await new Promise(r => { document.getElementById('__donBasla').onclick = () => r(); });
      const donem = { yil: +document.getElementById('__donYil').value, ay: +document.getElementById('__donAy').value };
      try { await chrome.storage.local.set({ donem }); } catch(e){}
      bar.innerHTML = '<div style="font-size:13.5px;line-height:1.9;color:#a78bfa">📅 Dönem: <b>'+aylar[donem.ay-1]+' '+donem.yil+'</b><br><b>Alıcı Kontrol</b> + <b>Fatura Detay + Sınıflandırma</b> paralel çalışıyor…</div>';
      // İki bağımsız iş: farklı endpointler, farklı veri. Ardışık çalıştırmak yerine
      // aynı anda başlatıp bitmelerini bekliyoruz — süre yaklaşık yarıya iner.
      try {
        await Promise.all([
          aliciKontrol().catch(e => console.warn('aliciKontrol hata:', e)),
          faturaDetayCekVeSinifla().catch(e => console.warn('faturaDetay hata:', e))
        ]);
      } catch(e){ bar.innerHTML='<span style="color:#fca5a5">Hata: '+e.message+'</span>'; return; }
      const bar3 = overlayAc('🧙 Sihirbaz · Adım 3/3 · Defter Beyan');
      bar3.innerHTML =
        '<div style="padding:14px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.35);border-radius:10px;color:#6ee7b7;font-size:14px;font-weight:700;margin-bottom:14px">'+
        '✅ Uyumsoft tarafı hazır — faturalar sınıflandırıldı.</div>'+
        '<div style="font-size:13px;color:#e8edf5;line-height:1.7;margin-bottom:16px">Şimdi <b>Defter Beyan</b>\'a geçilecek. Orada eksik faturaların özeti otomatik açılacak — <b>Gönder</b> tuşuna sen basacaksın.</div>'+
        '<button id="__sihGoDB" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:0;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer">▶️ Defter Beyan\'ı Aç</button>'+
        ' <button id="__sihIptal" style="background:transparent;color:#9aa6c0;border:1px solid #3a3550;padding:14px 20px;border-radius:10px;font-size:13px;cursor:pointer;margin-left:8px">İptal</button>';
      document.getElementById('__sihGoDB').onclick = async () => {
        try { await chrome.storage.local.set({ sihirbaz: { asama:'db', ts:Date.now() } }); } catch(e){}
        window.open('https://portal.defterbeyan.gov.tr/#sihirbaz=1', '_blank');
      };
      document.getElementById('__sihIptal').onclick = () => { try{ chrome.storage.local.remove('sihirbaz'); }catch(e){}; bar3.remove(); };
    }

    // 🧙 GELİR SİHİRBAZI (portal.uyumsoft) — Giden faturalar bu portalda yok,
    // sadece kullanıcıyı doğru sayfaya yönlendirir + DB'ye geç.
    async function sihirbazGelirPortal() {
      const bar = overlayAc('🧙 Gelir Sihirbazı');
      bar.innerHTML =
        '<div style="padding:12px;background:rgba(252,211,77,.1);border:1px solid rgba(252,211,77,.3);border-radius:10px;color:#fcd34d;font-size:13px;line-height:1.7;margin-bottom:14px">'+
        'Giden faturalar bu portalda görüntülenmiyor. Uyumsoft <b>edonusum.uyum.com.tr</b> sayfasında <b>Giden Fatura</b> listesine geç, oradaki <b>🧙 Tam Otomatik (Gelir)</b> butonuna bas.<br><br>'+
        'Alternatif: Direkt Defter Beyan\'da Gelir Kontrol\'ü açabilirim.</div>'+
        '<button id="__sihGoDBGP" style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:0;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer">▶️ Defter Beyan · Gelir Kontrol</button>';
      document.getElementById('__sihGoDBGP').onclick = async () => {
        try { await chrome.storage.local.set({ sihirbaz: { asama:'db', tip:'gelir', ts:Date.now() } }); } catch(e){}
        window.open('https://portal.defterbeyan.gov.tr/#sihirbaz=gelir', '_blank');
      };
    }

    const kurPortal = () => {
      butonEkle('🧙 Tam Otomatik (Alış)', sihirbazAlisPortal, 'linear-gradient(135deg,#a855f7,#7c3aed)', '__sihPortalBtn', 20);
      butonEkle('🧙 Gelir Sihirbazı', sihirbazGelirPortal, 'linear-gradient(135deg,#3b82f6,#1d4ed8)', '__sihPortalGelBtn', 76);
      butonEkle('🔎 Alıcı Bilgi Kontrol', aliciKontrol, 'linear-gradient(135deg,#a78bfa,#7c3aed)', '__akBtn', 132);
      butonEkle('📦 Fatura Detay + Sınıfla', faturaDetayCekVeSinifla, 'linear-gradient(135deg,#f59e0b,#d97706)', '__fdBtn', 188);
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

    // 🧙 SİHİRBAZ · Alış faturaları için tam otomatik zincir:
    //  1) Alıcı bilgi kontrol (LEVHA vs fatura VKN/adres)
    //  2) Fatura detay + sınıflandırma (SINIF_KURALLAR + SMM modu)
    //  3) Defter Beyan'a otomatik geç → orada eksik özeti açılır (gönderim onayı elle)
    async function sihirbazAlis() {
      const donemMevcut = await donemCek();
      const bar = overlayAc('🧙 Tam Otomatik Alış Kontrol Sihirbazı');
      const aylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
      let ayOpt = ''; for (let i=1;i<=12;i++) ayOpt += '<option value="'+i+'"'+(i===donemMevcut.ay?' selected':'')+'>'+aylar[i-1]+'</option>';
      let yilOpt = ''; for (let y=2024;y<=2028;y++) yilOpt += '<option value="'+y+'"'+(y===donemMevcut.yil?' selected':'')+'>'+y+'</option>';
      bar.innerHTML =
        '<div style="font-size:14px;color:#e8edf5;margin-bottom:14px">📅 Hangi dönemi tarayalım?</div>'+
        '<div style="display:flex;gap:10px;align-items:center;margin-bottom:16px">'+
        '<select id="__donAy" style="background:#0b1020;color:#e8edf5;border:1px solid #3a3550;padding:8px 14px;border-radius:8px;font-size:14px">'+ayOpt+'</select>'+
        '<select id="__donYil" style="background:#0b1020;color:#e8edf5;border:1px solid #3a3550;padding:8px 14px;border-radius:8px;font-size:14px">'+yilOpt+'</select>'+
        '</div>'+
        '<button id="__donBasla" style="background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;border:0;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer">▶️ Başlat</button>';
      await new Promise(r => { document.getElementById('__donBasla').onclick = () => r(); });
      const donem = { yil: +document.getElementById('__donYil').value, ay: +document.getElementById('__donAy').value };
      try { await chrome.storage.local.set({ donem }); } catch(e){}
      bar.innerHTML = '<div style="font-size:13.5px;line-height:1.9;color:#6ee7b7">📅 Dönem: <b>'+aylar[donem.ay-1]+' '+donem.yil+'</b><br><b>Alıcı Kontrol</b> + <b>Fatura Detay + Sınıflandırma</b> paralel çalışıyor…</div>';
      try {
        await Promise.all([
          aliciKontrol().catch(e => console.warn('aliciKontrol hata:', e)),
          faturaDetayCekVeSinifla().catch(e => console.warn('faturaDetay hata:', e))
        ]);
      } catch(e){ bar.innerHTML='<span style="color:#fca5a5">Hata: '+e.message+'</span>'; return; }
      // Sınıflandırma bitti — kullanıcının onayıyla DB'ye geç
      const bar3 = overlayAc('🧙 Sihirbaz · Adım 3/3 · Defter Beyan');
      bar3.innerHTML =
        '<div style="padding:14px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.35);border-radius:10px;color:#6ee7b7;font-size:14px;font-weight:700;margin-bottom:14px">'+
        '✅ Uyumsoft tarafı hazır — faturalar sınıflandırıldı.</div>'+
        '<div style="font-size:13px;color:#e8edf5;line-height:1.7;margin-bottom:16px">Şimdi <b>Defter Beyan</b>\'a geçilecek. Orada eksik faturaların özeti otomatik açılacak — <b>Gönder</b> tuşuna sen basacaksın (yanlış kayıt riskine karşı).</div>'+
        '<button id="__sihGoDB" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:0;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer">▶️ Defter Beyan\'ı Aç</button>'+
        ' <button id="__sihIptal" style="background:transparent;color:#9aa6c0;border:1px solid #3a3550;padding:14px 20px;border-radius:10px;font-size:13px;cursor:pointer;margin-left:8px">İptal</button>';
      document.getElementById('__sihGoDB').onclick = async () => {
        try { await chrome.storage.local.set({ sihirbaz: { asama: 'db', ts: Date.now() } }); } catch(e){}
        window.open('https://portal.defterbeyan.gov.tr/#sihirbaz=1', '_blank');
      };
      document.getElementById('__sihIptal').onclick = () => { try{ chrome.storage.local.remove('sihirbaz'); }catch(e){}; bar3.remove(); };
    }

    // 🧙 GELİR SİHİRBAZI · Uyumsoft giden fatura sayfası için
    async function sihirbazGelir() {
      const bar = overlayAc('🧙 Tam Otomatik Gelir Kontrol Sihirbazı');
      bar.innerHTML = '<div style="font-size:13.5px;line-height:1.9;color:#93c5fd"><b>Adım 1/2:</b> Giden (satış) faturalar çekiliyor…</div>';
      try { await calistirGiden(); } catch(e){ bar.innerHTML='<span style="color:#fca5a5">Giden fatura çekilemedi: '+e.message+'</span>'; return; }
      const bar2 = overlayAc('🧙 Gelir Sihirbazı · Adım 2/2');
      bar2.innerHTML =
        '<div style="padding:14px;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.35);border-radius:10px;color:#93c5fd;font-size:14px;font-weight:700;margin-bottom:14px">'+
        '✅ Uyumsoft giden faturalar alındı.</div>'+
        '<div style="font-size:13px;color:#e8edf5;line-height:1.7;margin-bottom:16px">Şimdi <b>Defter Beyan</b>\'a geçilecek. Orada <b>Gelir Kontrol</b> paneli otomatik açılacak; Uyumsoft ↔ DB gelir karşılaştırması ve eksik satış faturaları görünecek.</div>'+
        '<button id="__sihGoDBG" style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:0;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer">▶️ Defter Beyan · Gelir Kontrol</button>'+
        ' <button id="__sihIptalG" style="background:transparent;color:#9aa6c0;border:1px solid #3a3550;padding:14px 20px;border-radius:10px;font-size:13px;cursor:pointer;margin-left:8px">İptal</button>';
      document.getElementById('__sihGoDBG').onclick = async () => {
        try { await chrome.storage.local.set({ sihirbaz: { asama:'db', tip:'gelir', ts:Date.now() } }); } catch(e){}
        window.open('https://portal.defterbeyan.gov.tr/#sihirbaz=gelir', '_blank');
      };
      document.getElementById('__sihIptalG').onclick = () => { try{ chrome.storage.local.remove('sihirbaz'); }catch(e){}; bar2.remove(); };
    }

    const kurUy = () => {
      butonEkle('🧙 Tam Otomatik (Alış)', sihirbazAlis, 'linear-gradient(135deg,#a855f7,#7c3aed)', '__uySihBtn', 20);
      butonEkle('🧙 Tam Otomatik (Gelir)', sihirbazGelir, 'linear-gradient(135deg,#3b82f6,#1d4ed8)', '__uySihGelBtn', 76);
      butonEkle('📥 Gelen Faturaları Al', calistir, 'linear-gradient(135deg,#6ee7b7,#10b981)', '__uyGelenBtn', 132);
      butonEkle('📤 Giden Faturaları Al', calistirGiden, 'linear-gradient(135deg,#60a5fa,#2563eb)', '__uyGidenBtn', 188);
      butonEkle('🔒 Kimlik/Adres Kontrol', kimlikKontrol, 'linear-gradient(135deg,#a78bfa,#7c3aed)', '__kimlikBtn', 244);
    };
    kurUy();
    setInterval(kurUy, 2000);
  }
})();
