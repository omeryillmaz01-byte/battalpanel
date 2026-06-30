// ==UserScript==
// @name         Müşavir Pro — Uyumsoft ➜ Defter Beyan Tek Tuş
// @namespace    musavirpro.tektus
// @version      1.0
// @description  Uyumsoft Gelen Faturalarını tek tuşla çek, akıllı sınıflandır (sektör/ÖİV/iade/karma KDV), vergi dairelerini otomatik bul, Defter Beyan toplu gidere hazırla.
// @match        https://edonusum.uyum.com.tr/*
// @match        https://portal.defterbeyan.gov.tr/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     0) MÜKELLEF TANIMLARI — NACE + sektör + mal-alışı ağırlığı
     (panelle aynı; gerekirse genişlet)
  ═══════════════════════════════════════════════════════════════ */
  const MUKELLEFLER = {
    '0960155134': {ad:'Sinan Atalay',        nace:'479114', malAlis:true,  sektor:'İnternet/E-ticaret'},
    '3460330305': {ad:'Altuğ Erden',         nace:'472704', malAlis:true,  sektor:'Çay/Kahve/Baharat'},
    '2640193570': {ad:'Muzaffer Çubukçuoğlu', nace:'472704', malAlis:true,  sektor:'Çay/Kahve/Baharat'},
    '0250587861': {ad:'Kadir Akıllı',        nace:'472105', malAlis:true,  sektor:'Kuru Yemiş'},
    '7680418539': {ad:'Dilek Öztürk',        nace:'479114', malAlis:true,  sektor:'Kozmetik E-ticaret'},
    '7850427089': {ad:'Devran Süer',         nace:'691003', malAlis:false, sektor:'Avukat'},
    '1500360006': {ad:'Emir Battal',         nace:'691003', malAlis:false, sektor:'Avukat'},
    '6630177279': {ad:'Müge Özarmağan',      nace:'691003', malAlis:false, sektor:'Avukat'},
    '3750072366': {ad:'Cihan Güneş Ertürk',  nace:'862202', malAlis:false, sektor:'Uzman Hekim'},
    '1500127919': {ad:'İskender Battal',     nace:'862202', malAlis:false, sektor:'Uzman Hekim'},
    '1500459508': {ad:'Mert Tufan Battal',   nace:'862303', malAlis:false, sektor:'Diş Hekimi'},
    '8520482776': {ad:'Aylin Topçu Erdinç',  nace:'869300', malAlis:false, sektor:'Psikolog'},
    '1500138444': {ad:'Taner Battal',        nace:'692001', malAlis:false, sektor:'Mali Müşavir'},
    '3750384725': {ad:'Çağrı Ertürk',        nace:'742027', malAlis:false, sektor:'Fotoğrafçı'},
    '2610511823': {ad:'Yakup Çoruh',         nace:'683101', malAlis:false, sektor:'Emlak/Araç'}
  };

  const num = s => { if(!s) return 0; const m=String(s).replace(/[^\d.,]/g,'').replace(/\./g,'').replace(',','.'); return parseFloat(m)||0; };

  /* ═══════════════════════════════════════════════════════════════
     1) AKILLI EŞLEŞTİRME (panelle aynı kurallar)
  ═══════════════════════════════════════════════════════════════ */
  const RULES = [
    {m:'desc', p:/elektrik tüketim|kwh|enerji bedeli/i,            k:4,a:82, l:'Elektrik Giderleri'},
    {m:'desc', p:/doğalgaz tüketim|m3 tüketim|gaz bedeli/i,        k:4,a:84, l:'Doğalgaz Giderleri'},
    {m:'desc', p:/su tüketim|su faturası|içme suyu/i,              k:4,a:83, l:'Su Giderleri'},
    {m:'desc', p:/hakediş|hakedis/i,                               k:4,a:188,l:'Komisyon Giderleri'},
    {m:'desc', p:/platform hizmet bedeli|teknolojik altyapı/i,     k:4,a:188,l:'Komisyon Giderleri'},
    {m:'desc', p:/kargo taşıma|gönderi başına/i,                   k:4,a:193,l:'Kargo Giderleri'},
    {m:'supplier', p:/enerjisa|boğaziçi elektrik|bedaş|ayedaş|başkent edaş|toroslar edaş|dicle edaş|uedaş|meram edaş|akedaş|ck enerji|aydem|gediz|sepaş|elektrik perakende sat/i, k:4,a:82, l:'Elektrik Giderleri'},
    {m:'supplier', p:/igdaş|gazdaş|başkentgaz|izgaz|enerya|bursagaz/i, k:4,a:84, l:'Doğalgaz Giderleri'},
    {m:'supplier', p:/iski|aski|eski|buski|izsu|koski|muski/i,      k:4,a:83, l:'Su Giderleri'},
    {m:'supplier', p:/turkcell|vodafone|türk ?telekom|ttnet|superonline|millenicom|netgsm|turknet|d-?smart/i, k:4,a:87, l:'Telefon Giderleri'},
    {m:'supplier', p:/ptt kargo|aras kargo|mng kargo|yurtiçi kargo|ups|fedex|dhl|sürat kargo|hepsijet|sendeo/i, k:4,a:193,l:'Kargo Giderleri'},
    {m:'supplier', p:/dsm grup|tyg turkey|trendyol/i,              k:4,a:188,l:'Komisyon Giderleri'},
    {m:'supplier', p:/d-market|hepsiburada/i,                       k:4,a:188,l:'Komisyon Giderleri'},
    {m:'supplier', p:/amazon|amzn/i,                                k:4,a:188,l:'Komisyon Giderleri'},
    {m:'supplier', p:/yemek ?sepeti|getir|çiçek ?sepeti|n11|migros/i, k:4,a:188,l:'Komisyon Giderleri'},
    {m:'supplier', p:/google ireland|meta platforms|facebook ireland/i, k:4,a:327,l:'İnternet Reklam Giderleri'},
    {m:'supplier', p:/smmm|yeminli mali|mali müşavir/i,             k:4,a:179,l:'Muhasebe/Mali Müşavirlik'},
  ];

  function smartMatch(inv, mukellef) {
    const desc = String(inv.aciklama||'').toLocaleLowerCase('tr');
    const supplier = String(inv.unvan||'').toLocaleLowerCase('tr');
    for (const r of RULES) {
      const text = r.m==='supplier' ? supplier : desc;
      if (r.p.test(text)) return {k:r.k, a:r.a, l:r.l, conf:'high', sebep:r.m==='supplier'?'Tedarikçi':'Açıklama'};
    }
    // Sektör bağlamı
    if (mukellef && mukellef.malAlis) {
      if (/yemek ?sepeti|getir|trendyol|hepsiburada|amazon|migros|n11|çiçek ?sepeti/i.test(supplier))
        return {k:4, a:188, l:'Komisyon Giderleri', conf:'medium', sebep:'Pazaryeri'};
      if (/gıda|baharat|çay|kahve|kuru ?yemiş|tarım|toptan|bakliyat|manav|tekstil|kozmetik|parfüm|ürün|et ?ürün|süt|aktar/i.test(supplier))
        return {k:1, a:186, l:'Mal Alışı', conf:'high', sebep:'Sektör+ürün'};
      if (/lojistik|kargo|nakliye|danışmanlık|hizmet|yazılım|reklam|muhasebe|müşavir|hukuk|avukat|sigorta|kira|emlak|temizlik|güvenlik|telekom|enerji|akaryakıt|petrol|turizm|eğitim|sağlık/i.test(supplier))
        return {k:4, a:195, l:'Diğer Hizmet Giderleri', conf:'low', sebep:'Hizmet'};
      return {k:1, a:186, l:'Mal Alışı', conf:'medium', sebep:'Mal alışı ağırlıklı (kontrol et)'};
    }
    return {k:4, a:195, l:'Diğer Hizmet Giderleri', conf:'low', sebep:'Eşleşme yok'};
  }

  /* ═══════════════════════════════════════════════════════════════
     2) UYUMSOFT TARAFI — Fatura tablosunu parse et + işle
  ═══════════════════════════════════════════════════════════════ */
  function parseUyumsoftTable() {
    const tables = [...document.querySelectorAll('table')];
    let best=null, max=0;
    tables.forEach(t=>{ const n=t.querySelectorAll('tbody tr').length; if(n>max){max=n;best=t;} });
    if (!best) return null;
    const out = [];
    best.querySelectorAll('tbody tr').forEach(tr=>{
      const c=[...tr.querySelectorAll('td')].map(td=>td.innerText.trim().replace(/\s+/g,' '));
      if (c.length<9) return;
      const ettnM=(c[1]||'').match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i);
      const ettn=ettnM?ettnM[0]:'';
      const faturaNo=(c[1]||'').replace(ettn,'').trim();
      const tarih=(c[2]||'').split(' ')[0];
      const vknM=(c[4]||'').match(/^(\d{10,11})\s+(.*)$/);
      const vkn=vknM?vknM[1]:'';
      let unvan=(vknM?vknM[2]:c[4]||'').replace(/urn:\S+/g,'').replace(/PK\(gb\)/i,'').trim();
      const tutar=c[5]||'';
      const vhttM=tutar.match(/VHTT:\s*([\d.,]+)/i);
      const matrah=vhttM?num(vhttM[1]):0;
      const genelToplam=num((tutar.split('VHTT')[0]||'').match(/[\d.,]+/)?.[0]||0);
      // KDV oran kırılımı
      const kdvCell=c[6]||'';
      const kdvDetay=[]; const reK=/%(\d+)\s*=\s*([\d.,]+)/g; let mk;
      while((mk=reK.exec(kdvCell))){ const orn=+mk[1]; const kv=num(mk[2]); if(orn>0&&kv>0) kdvDetay.push({oran:orn,kdv:kv,matrah:+(kv*100/orn).toFixed(2)}); }
      const oranli=kdvDetay.reduce((s,d)=>s+d.matrah,0);
      const sifir=+(matrah-oranli).toFixed(2);
      if(sifir>0.5) kdvDetay.push({oran:0,kdv:0,matrah:sifir});
      if(!kdvDetay.length) kdvDetay.push({oran:20,kdv:0,matrah:matrah});
      out.push({faturaNo, ettn, vkn, unvan, tarih, matrah, genelToplam, kdvDetay,
                durum:c[8]||'', faturaTipi:(c[7]||'').split(' ').slice(1).join(' ')});
    });
    return out;
  }

  function getAktifMukellefVkn() {
    // Uyumsoft sağ üstte kullanıcı/firma — VKN'yi bul
    const t = document.body.innerText;
    for (const vkn in MUKELLEFLER) if (t.includes(vkn)) return vkn;
    return null;
  }

  function islemFaturalar(faturalar, mukellef) {
    const satirlar = [];
    let elenen = 0;
    faturalar.forEach(f=>{
      const durum = f.durum.toLocaleLowerCase('tr');
      if (durum.includes('iptal')||durum.includes('red')||durum.includes('hata')) { elenen++; return; }
      const isIade = f.faturaTipi.toLocaleLowerCase('tr').includes('iade');
      const m = smartMatch({aciklama:'', unvan:f.unvan}, mukellef);
      // Telekom ÖİV
      const isTelekom = /turkcell|vodafone|türk ?telekom|ttnet|superonline|millenicom|netgsm|turknet|d-?smart/i.test(f.unvan);
      const kdvTop = f.kdvDetay.reduce((s,d)=>s+d.kdv,0);
      let oiv=0, oivSuphe=0;
      if (isTelekom) {
        const fark=+(f.genelToplam-f.matrah-kdvTop).toFixed(2);
        if (fark>=0.5 && fark<=f.matrah*0.25) oiv=fark;
        else if (fark>f.matrah*0.25) oivSuphe=fark;
      }
      f.kdvDetay.forEach((kd,ki)=>{
        const satirOiv = ki===0?oiv:0;
        satirlar.push({
          faturaNo:f.faturaNo, vkn:f.vkn, unvan:f.unvan, tarih:f.tarih,
          alisTuru: isIade?2:1,          // 2=Satıştan İade, 1=Normal
          kayitTuru: m.k, altKayit: m.a, label:m.l,
          oran: kd.oran,
          matrah: +(kd.matrah+satirOiv).toFixed(2),  // ÖİV gidere
          kdv: kd.kdv,
          faaliyetKodu: mukellef?mukellef.nace:'',
          conf: m.conf, sebep: m.sebep,
          oiv: satirOiv, oivSuphe: ki===0?oivSuphe:0,
          isIade, cokOran: f.kdvDetay.length>1, oranNo: ki+1, oranToplam: f.kdvDetay.length
        });
      });
    });
    return {satirlar, elenen, toplam:faturalar.length};
  }

  /* ═══════════════════════════════════════════════════════════════
     3) UYUMSOFT BUTONU
  ═══════════════════════════════════════════════════════════════ */
  function uyumsoftButonEkle() {
    if (document.getElementById('mpTekTusBtn')) return;
    if (!/\/Gelen/i.test(location.href) && !document.querySelector('table tbody tr')) return;
    const btn = document.createElement('button');
    btn.id = 'mpTekTusBtn';
    btn.textContent = '🔵 Defter Beyan\'a Aktar';
    btn.style.cssText = 'position:fixed;top:90px;right:20px;z-index:99999;background:#16a34a;color:#fff;border:none;border-radius:10px;padding:12px 20px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3)';
    btn.onclick = () => {
      const faturalar = parseUyumsoftTable();
      if (!faturalar || !faturalar.length) { alert('Fatura tablosu bulunamadı. Gelen Fatura listesini aç, Ara\'ya bas, "Sayfada 100 Kayıt" yap.'); return; }
      const vkn = getAktifMukellefVkn();
      const mukellef = vkn?MUKELLEFLER[vkn]:null;
      const {satirlar, elenen, toplam} = islemFaturalar(faturalar, mukellef);
      GM_setValue('mp_satirlar', JSON.stringify(satirlar));
      GM_setValue('mp_mukellef', JSON.stringify({vkn, ...(mukellef||{})}));
      GM_setValue('mp_zaman', Date.now());
      const malA = satirlar.filter(s=>s.kayitTuru===1).length;
      const karmaF = [...new Set(satirlar.filter(s=>s.cokOran).map(s=>s.faturaNo))].length;
      alert('✅ Hazırlandı!\n\n'+toplam+' fatura okundu\n'+elenen+' iptal/red/hata elendi\n'+satirlar.length+' satır (karma KDV bölünmüş: '+karmaF+' fatura)\nMal Alışı: '+malA+' satır\n\nŞimdi Defter Beyan → Muhasebe → Toplu Gider Belgesi Ekle sayfasını aç. Otomatik yüklenecek.');
    };
    document.body.appendChild(btn);
  }

  /* ═══════════════════════════════════════════════════════════════
     4) DEFTER BEYAN TARAFI — vergi dairesi çek, Excel üret, enjekte
  ═══════════════════════════════════════════════════════════════ */
  function dbToken() { return sessionStorage.getItem('Token'); }

  async function vergiDairesiBul(vkn) {
    try {
      const r = await fetch('https://backend-p.defterbeyan.gov.tr/rs/adresdefteri/findbytckn/'+vkn, {
        method:'POST',
        headers:{'Authorization':'Bearer '+dbToken(),'Content-Type':'application/json'},
        body:'{}', credentials:'include'
      });
      const d = await r.json();
      const rc = d.resultContainer || {};
      return { ad: rc.ad||'', soyad: rc.soyad||'', vdKod: rc.vergiDairesiKodu||rc.vergiDairesiKod||'' };
    } catch(e) { return { ad:'', soyad:'', vdKod:'' }; }
  }

  function dbButonEkle() {
    if (document.getElementById('mpDbBtn')) return;
    if (!/toplu-gider-ekle/i.test(location.href)) return;
    const raw = GM_getValue('mp_satirlar', '');
    if (!raw) return;
    const satirlar = JSON.parse(raw);
    const box = document.createElement('div');
    box.id = 'mpDbBtn';
    box.style.cssText = 'position:fixed;top:90px;right:20px;z-index:99999;background:#fff;border:2px solid #16a34a;border-radius:12px;padding:16px;width:320px;box-shadow:0 6px 20px rgba(0,0,0,.25);font-family:sans-serif';
    box.innerHTML = '<b style="font-size:14px">📥 '+satirlar.length+' satır hazır</b><br><small style="color:#666">Uyumsoft\'tan aktarıldı. Vergi daireleri çekilip Excel üretilecek, file alanına otomatik yüklenecek.</small><br><button id="mpYukle" style="margin-top:10px;background:#16a34a;color:#fff;border:none;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer;width:100%">⚙️ Hazırla ve Yükle</button><div id="mpLog" style="margin-top:8px;font-size:12px;color:#444"></div>';
    document.body.appendChild(box);
    document.getElementById('mpYukle').onclick = () => yukle(satirlar);
  }

  async function yukle(satirlar) {
    const log = document.getElementById('mpLog');
    log.textContent = 'Vergi daireleri çekiliyor…';
    // Benzersiz VKN'ler için vergi dairesi
    const vknler = [...new Set(satirlar.map(s=>s.vkn))];
    const vdMap = {};
    for (let i=0;i<vknler.length;i++){
      log.textContent = 'Vergi dairesi '+(i+1)+'/'+vknler.length+'…';
      vdMap[vknler[i]] = await vergiDairesiBul(vknler[i]);
    }
    log.textContent = 'Excel üretiliyor…';
    // Defter Beyan e-Fatura toplu gider — 28 kolon
    const HDR = ['Deftere Kayıt Tarihi','Belge Tarihi','Fatura No','TCKN/VKN','Soyadı/Unvan','Adı/Unvan Devamı','Vergi Dairesi/Ülke','Adres','Alış Türü','Gider Kayıt Türü','Gider Kayıt Alt Türü',"KDV'siz İşlem",'KDV Oranı','Faaliyet Kodu','Tutar (KDV Hariç)','Gerçek Değer','Dönemsellik İlkesi','Stopaj','Stopaj Tutarı','KDV Tevkifatı','109 Sorumlu Sıfatıyla Ödenen KDV','KDV Tevkifat Tutar (KDV2) Matrah','Sabit Kıymet Kodu','Sabit Kıymet Adı','Plaka No','Finansal Kiralama','Ödeme Türü','Açıklama'];
    const rows = [HDR];
    satirlar.forEach(s=>{
      const vd = vdMap[s.vkn]||{};
      rows.push([
        s.tarih, s.tarih, s.faturaNo, s.vkn,
        vd.soyad||s.unvan, vd.ad||'.', vd.vdKod||'', '',
        s.alisTuru, s.kayitTuru, s.altKayit,
        s.oran===0?'Vardır':'Yoktur', s.oran, s.faaliyetKodu, s.matrah,
        '','','','','','','','','','','','',
        s.unvan.toLocaleUpperCase('tr')+' - '+s.label+(s.cokOran?' [KDV %'+s.oran+']':'')
      ]);
    });
    // Tarihleri Date objesine çevir (Defter Beyan datetime bekliyor)
    rows.forEach((r,i)=>{ if(i===0) return; ['0','1'].forEach(ci=>{ const v=r[+ci]; const m=String(v).match(/(\d{2})\.(\d{2})\.(\d{4})/); if(m) r[+ci]=new Date(+m[3],+m[2]-1,+m[1]); }); });
    // SheetJS ile XLSX üret
    const ws = XLSX.utils.aoa_to_sheet(rows, {cellDates:true});
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Örnek Excel Şablonu');
    const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
    const file = new File([wbout], 'MusavirPro_Gider.xlsx', {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    // file input'a enjekte → Defter Beyan önizlemeyi açar
    const input = document.querySelector('input[type=file]');
    if (!input) { log.innerHTML='❌ Dosya alanı bulunamadı. "İşletme e-Fatura" formatı seçili mi?'; return; }
    const dt = new DataTransfer(); dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    const karma = [...new Set(satirlar.filter(s=>s.cokOran).map(s=>s.faturaNo))].length;
    const vdEksik = vknler.filter(v=>!vdMap[v].vdKod).length;
    log.innerHTML = '✅ <b>'+satirlar.length+' satır yüklendi!</b><br>Karma KDV bölünen: '+karma+' fatura<br>'+(vdEksik?('⚠️ '+vdEksik+' tedarikçinin vergi dairesi bulunamadı (kontrol et)<br>'):'')+'<br><b>Aşağıdaki önizlemeyi kontrol et → "Kaydet"e bas.</b> Veriyi indirmek istersen: <button id="mpDl" style="background:#2563eb;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer">⬇️ Excel indir</button>';
    document.getElementById('mpDl').onclick = ()=>{ const url=URL.createObjectURL(file); const a=document.createElement('a'); a.href=url; a.download='MusavirPro_Gider.xlsx'; a.click(); };
    // İşlem bitince bekleyen veriyi temizle
    GM_deleteValue('mp_satirlar');
  }

  /* ═══════════════════════════════════════════════════════════════
     5) BAŞLAT — sayfaya göre
  ═══════════════════════════════════════════════════════════════ */
  function tick() {
    if (/edonusum\.uyum\.com\.tr/i.test(location.host)) uyumsoftButonEkle();
    if (/defterbeyan\.gov\.tr/i.test(location.host)) dbButonEkle();
  }
  setInterval(tick, 1500);
  tick();
})();
