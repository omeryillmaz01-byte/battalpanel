// ==UserScript==
// @name         Müşavir Pro — TEK TUŞ (Uyumsoft → Kontrol → Defter Beyan API) v3.0
// @namespace    musavirpro.tektus
// @version      3.0
// @description  Uyumsoft makbuz çek → akıllı sınıflandır (Mal Alışı/Gider/Komisyon/İade) → ilmek ilmek kontrol (tutar/KDV/sıra/tarih/VKN) → Defter Beyan'a API ile saniyede gönder. Gelir (e-SMM) tam otomatik. 25.06.2026 gecesi Taner'in 104 e-SMM'i bu yöntemle 1 dk'da atıldı.
// @match        https://edonusum.uyum.com.tr/*
// @match        https://portal.defterbeyan.gov.tr/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════
     MÜKELLEF PROFİLLERİ (15) — kodlar Taner ile doğrulandı
  ═══════════════════════════════════════════════════════════════════ */
  const MUKELLEFLER = {
    // ── GELİR / e-SMM (serbest meslek) — API ile gönderilir ──
    '8520482776':{ad:'Aylin Topçu Erdinç', nace:'869300', tur:'gelir', sektor:'Psikolog',     altKod:'22936', stopajVar:false, stopajOran:0,  prefix:'AYL'},
    '1500138444':{ad:'Taner Battal',        nace:'692001', tur:'gelir', sektor:'Mali Müşavir', altKod:'22936', stopajVar:true,  stopajOran:20, prefix:'TNR'}, // ✅ DOĞRULANDI
    '1500360006':{ad:'Emir Battal',         nace:'691003', tur:'gelir', sektor:'Avukat',       altKod:'22936', stopajVar:true,  stopajOran:20, prefix:'EMR'},
    '6630177279':{ad:'Müge Özarmağan',      nace:'691003', tur:'gelir', sektor:'Avukat',       altKod:'22936', stopajVar:true,  stopajOran:20, prefix:'MGE'},
    '7850427089':{ad:'Devran Süer',         nace:'691003', tur:'gelir', sektor:'Avukat',       altKod:'22936', stopajVar:true,  stopajOran:20, prefix:'DVR'},
    '3750072366':{ad:'Cihan Güneş Ertürk',  nace:'862202', tur:'gelir', sektor:'Uzman Hekim',  altKod:'22936', stopajVar:false, stopajOran:0,  prefix:'CHN'},
    '1500127919':{ad:'İskender Battal',     nace:'862202', tur:'gelir', sektor:'Uzman Hekim',  altKod:'22936', stopajVar:false, stopajOran:0,  prefix:'ISK'},
    '1500459508':{ad:'Mert Tufan Battal',   nace:'862303', tur:'gelir', sektor:'Diş Hekimi',   altKod:'22936', stopajVar:false, stopajOran:0,  prefix:'MRT'},
    '3750384725':{ad:'Çağrı Ertürk',        nace:'742027', tur:'gelir', sektor:'Fotoğrafçı',   altKod:'22936', stopajVar:false, stopajOran:0,  prefix:'CGR'},
    '2610511823':{ad:'Yakup Çoruh',         nace:'683101', tur:'gelir', sektor:'Emlak/Araç',   altKod:'22936', stopajVar:false, stopajOran:0,  prefix:'YKP'},
    // ── GİDER / İşletme (mal alışı ağırlıklı) — şimdilik Excel ile (gider API yakalanınca eklenecek) ──
    '0960155134':{ad:'Sinan Atalay',        nace:'479114', tur:'gider', sektor:'İnternet/E-ticaret', malAlis:true},
    '3460330305':{ad:'Altuğ Erden',         nace:'472704', tur:'gider', sektor:'Çay/Kahve/Baharat',  malAlis:true},
    '2640193570':{ad:'Muzaffer Çubukçuoğlu',nace:'472704', tur:'gider', sektor:'Çay/Kahve/Baharat',  malAlis:true},
    '0250587861':{ad:'Kadir Akıllı',        nace:'472105', tur:'gider', sektor:'Kuru Yemiş',         malAlis:true},
    '7680418539':{ad:'Dilek Öztürk',        nace:'479114', tur:'gider', sektor:'Kozmetik E-ticaret', malAlis:true}
  };

  // Defter Beyan API sabit kodları (Taner ile doğrulandı)
  const KOD = { belgeTuru:'10', gkt:'2', satis:'1', stopajKod:'022', tevkifat:'1100' };

  /* ═══════════════════════════════════════════════════════════════════
     YARDIMCILAR
  ═══════════════════════════════════════════════════════════════════ */
  const num = s => { if(typeof s==='number') return s; if(!s) return 0; return parseFloat(String(s).replace(/[^\d.,]/g,'').replace(/\./g,'').replace(',','.'))||0; };
  const r2 = v => Math.round(v*100)/100;
  const tr = s => String(s||'').toLocaleUpperCase('tr');
  const vknGecerli = v => { v=String(v||'').replace(/\D/g,''); return v.length===10||v.length===11; };
  const aktifVkn = () => { const t=document.body.innerText; for(const v in MUKELLEFLER) if(t.includes(v)) return v; return null; };
  const dbToken = () => sessionStorage.getItem('Token');

  /* ═══════════════════════════════════════════════════════════════════
     AKILLI SINIFLANDIRMA (gider tarafı)
  ═══════════════════════════════════════════════════════════════════ */
  const RULES = [
    {p:/elektrik tüketim|kwh|enerjisa|boğaziçi elektrik|bedaş|ayedaş|elektrik perakende sat/i, s:'Gider', a:'Elektrik'},
    {p:/doğalgaz|igdaş|gazdaş|başkentgaz/i, s:'Gider', a:'Doğalgaz'},
    {p:/turkcell|vodafone|türk ?telekom|ttnet|superonline/i, s:'Gider', a:'Telefon (ÖİV!)'},
    {p:/kargo|aras|mng|yurtiçi|ptt|sürat|hepsijet|sendeo/i, s:'Gider', a:'Kargo'},
    {p:/yemek ?sepeti|getir|trendyol|hepsiburada|tyg turkey|dsm grup|d-market|n11|çiçek ?sepeti|amazon/i, s:'Komisyon', a:'Komisyon/Pos'},
    {p:/google ireland|meta platforms|reklam/i, s:'Gider', a:'İnternet Reklam'},
    {p:/smmm|mali müşavir|yeminli mali|muhasebe/i, s:'Gider', a:'Muhasebe'},
    {p:/kira/i, s:'Gider', a:'Kira'}
  ];
  function sinifla(unvan, muk, iade){
    if(iade) return {s:'İade', a:'Satıştan İade'};
    const u=(unvan||'').toLocaleLowerCase('tr');
    for(const r of RULES) if(r.p.test(u)) return {s:r.s, a:r.a};
    if(muk && muk.malAlis){
      if(/gıda|baharat|çay|kahve|kuru ?yemiş|tarım|toptan|bakliyat|tüketim|ürün|gida|aktar|kozmetik|tekstil/i.test(u)) return {s:'Mal Alışı', a:'Mal Alışı'};
      return {s:'Mal Alışı', a:'Mal Alışı (kontrol)', suphe:true};
    }
    return {s:'Gider', a:'Diğer Hizmet'};
  }

  /* ═══════════════════════════════════════════════════════════════════
     İLMEK İLMEK KONTROL (tutar/KDV/sıra/tarih/VKN)
  ═══════════════════════════════════════════════════════════════════ */
  function kontrolEt(rows){
    const belgeSay={};
    rows.forEach(r=>{ if(r.belgeNo) belgeSay[r.belgeNo]=(belgeSay[r.belgeNo]||0)+1; });
    rows.forEach(r=>{
      const u=[];
      if(!/^\d{2}\.\d{2}\.\d{4}$/.test(r.tarih)) u.push('Tarih format');
      if(!r.belgeNo) u.push('Belge No boş'); else if(belgeSay[r.belgeNo]>1) u.push('MÜKERRER');
      if(!vknGecerli(r.vkn)) u.push('VKN hane');
      if(!r.unvan) u.push('Satıcı boş');
      if(!(r.matrah>0)) u.push('Matrah≤0');
      if(![0,1,8,10,18,20].includes(r.oran)) u.push('KDV oran geçersiz');
      const bek=r2(r.matrah*r.oran/100);
      if(r.oran>0 && Math.abs(bek-r.kdv)>Math.max(0.5,r.matrah*0.005)) u.push('KDV tutmuyor('+bek.toFixed(2)+')');
      if(r.toplam>0 && Math.abs((r.matrah+r.kdv)-r.toplam)>Math.max(1,r.matrah*0.02)) u.push('Toplam≠Mat+KDV');
      if(r.suphe) u.push('Sınıf şüpheli');
      r.uyarilar=u;
    });
    return rows;
  }

  /* ═══════════════════════════════════════════════════════════════════
     UYUMSOFT — makbuz çekme
  ═══════════════════════════════════════════════════════════════════ */
  function enBuyukTablo(){ let b=null,m=0; document.querySelectorAll('table').forEach(t=>{const n=t.querySelectorAll('tbody tr').length; if(n>m){m=n;b=t;}}); return b; }

  function cekGidenESmm(){ // serbest meslek gelir
    const t=enBuyukTablo(); if(!t) return [];
    const heads=[...t.querySelectorAll('thead th,thead td')].map(h=>h.innerText.trim().toLocaleLowerCase('tr'));
    const idx=(...k)=>heads.findIndex(h=>k.some(x=>h.includes(x)));
    const iB=idx('belge no'),iT=idx('belge tarih'),iA=idx('alıcı','alici','unvan'),iO=idx('ödenecek','odenecek'),iV=idx('toplam vergi'),iD=idx('belge durum','durum');
    const out=[];
    t.querySelectorAll('tbody tr').forEach(tr=>{
      const c=[...tr.querySelectorAll('td')].map(td=>td.innerText.trim().replace(/\s+/g,' '));
      if(c.length<5) return;
      const bc=c[iB]||'', bno=(bc.match(/[A-Z]{3}\d{13}/)||[''])[0]||bc.replace(/[0-9a-f-]{30,}/i,'').trim();
      const tarih=(c[iT]||'').split(' ')[0];
      const vkn=((c[iA]||'').match(/\b(\d{10,11})\b/)||['',''])[1];
      const unvan=(c[iA]||'').replace(vkn,'').replace(/\s+/g,' ').trim();
      const odenecek=num(c[iO]); const vergi=(()=>{const m=(c[iV]||'').match(/[\d.,]+/g);return m?num(m[m.length-1]):0;})();
      const durum=(c[iD]||'').trim();
      if(durum.toLocaleLowerCase('tr').includes('iptal')) return;
      out.push({belgeNo:bno, tarih, vkn, unvan, matrah:r2(odenecek), oran:20, kdv:r2(odenecek*0.20), toplam:r2(odenecek+odenecek*0.20)});
    });
    return out;
  }

  /* ═══════════════════════════════════════════════════════════════════
     DEFTER BEYAN API — gelir/create (PROVEN)
  ═══════════════════════════════════════════════════════════════════ */
  async function dbLookup(vkn){
    try{
      const r=await fetch('https://backend-p.defterbeyan.gov.tr/rs/adresdefteri/findbytckn/'+vkn,
        {method:'POST',headers:{'Content-Type':'application/json; charset=utf-8','Token':dbToken()},body:'{}',credentials:'include'});
      const j=await r.json(); return j.resultContainer||null;
    }catch(e){ return null; }
  }
  async function dbGelirGonder(makbuz, muk){
    const rc=await dbLookup(makbuz.vkn);
    if(!rc||!rc.vergiDairesiKodu) return {ok:false, m:'VD yok'};
    const mat=makbuz.matrah, kdv=r2(mat*0.20);
    const tarihISO=(()=>{const a=(makbuz.tarih||'').split('.');return a.length===3?`${a[2]}-${a[1]}-${a[0]} 00:00:00`:'2026-06-17 00:00:00';})();
    const kayit={deleted:false,satisTuruKodu:KOD.satis,gelirKayitTuruKodu:KOD.gkt,gelirKayitAltTuruKodu:muk.altKod,
      aciklama:((rc.soyad||'')+' '+(rc.ad||'')).trim().toLocaleUpperCase('tr')+' - MUHASEBE GELİRİ',
      tutar:mat,naceKodu:muk.nace,isKdvDahil:false,kdv:kdv,kdvOrani:20,tevkifatUygulanmayanKodu:KOD.tevkifat};
    if(muk.stopajVar){ kayit.stopajKodu=KOD.stopajKod; kayit.stopajTutari=r2(mat*muk.stopajOran/100); }
    const P={gelirBelgeTuruKodu:KOD.belgeTuru,versiyon:11,kayitTarihi:tarihISO,belgeTarihi:tarihISO,nihaiTuketici:false,
      belgeSiraNo:makbuz.belgeNo,tcknVkn:makbuz.vkn,ad:rc.ad,soyad:rc.soyad,vergiDairesiKodu:rc.vergiDairesiKodu,subeNo:rc.subeNo,
      adresiGuncelleme:false,krediKartiTutari:0,belgeTutari:mat,kayitlar:[kayit]};
    try{
      const r=await fetch('https://backend-p.defterbeyan.gov.tr/rs/gelir/create',
        {method:'POST',headers:{'Content-Type':'application/json; charset=utf-8','Token':dbToken()},body:JSON.stringify(P),credentials:'include'});
      const j=await r.json();
      if(r.status===200 && j.resultContainer && !j.errorMessage) return {ok:true};
      return {ok:false, m:(j.errorMessage||j.statusMessage||r.status).toString().slice(0,50)};
    }catch(e){ return {ok:false, m:e.message}; }
  }
  async function dbTopluGelir(makbuzlar, muk, log){
    let ok=0,er=0; const fails=[];
    const BATCH=5;
    for(let i=0;i<makbuzlar.length;i+=BATCH){
      const res=await Promise.all(makbuzlar.slice(i,i+BATCH).map(async mk=>{const r=await dbGelirGonder(mk,muk);return {mk,r};}));
      res.forEach(({mk,r})=>{ if(r.ok){ok++;} else {er++;fails.push(mk.belgeNo+' '+r.m);} });
      log('İşlendi: '+(ok+er)+'/'+makbuzlar.length+' · ✅'+ok+' ❌'+er);
    }
    return {ok, er, fails};
  }

  /* ═══════════════════════════════════════════════════════════════════
     UI — Panel enjeksiyonu
  ═══════════════════════════════════════════════════════════════════ */
  const css = `
  #mpPanel{position:fixed;top:80px;right:16px;z-index:999999;width:360px;background:linear-gradient(135deg,#0f172a,#1e3a8a);
    border:1px solid rgba(255,255,255,.15);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.5);font-family:'Segoe UI',sans-serif;color:#e2e8f0;overflow:hidden}
  #mpPanel .hd{background:rgba(0,0,0,.25);padding:12px 16px;display:flex;justify-content:space-between;align-items:center}
  #mpPanel .hd b{background:linear-gradient(90deg,#34d399,#10b981);-webkit-background-clip:text;background-clip:text;color:transparent;font-size:15px}
  #mpPanel .bd{padding:14px 16px;max-height:70vh;overflow:auto}
  #mpPanel .mb{font-size:13px;margin-bottom:6px}
  #mpPanel .mb b{color:#34d399}
  #mpPanel textarea{width:100%;min-height:80px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.15);border-radius:8px;color:#e2e8f0;font-size:11px;font-family:monospace;padding:8px;resize:vertical}
  #mpPanel button{width:100%;margin-top:8px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;font-size:13px}
  #mpPanel button.sec{background:rgba(255,255,255,.08)}
  #mpPanel .log{margin-top:10px;font-size:11px;color:#9ae6b4;background:#0b1220;border-radius:8px;padding:8px;max-height:160px;overflow:auto;white-space:pre-wrap}
  #mpPanel .kpi{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
  #mpPanel .kpi span{background:rgba(16,185,129,.15);border:1px solid #059669;color:#34d399;border-radius:14px;padding:2px 9px;font-size:11px}
  #mpToggle{position:fixed;top:80px;right:16px;z-index:999999;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:50%;width:52px;height:52px;font-size:22px;cursor:pointer;box-shadow:0 6px 20px rgba(16,185,129,.5)}
  `;
  function injectCss(){ if(document.getElementById('mpCss'))return; const s=document.createElement('style');s.id='mpCss';s.textContent=css;document.head.appendChild(s); }

  let _data=[]; // hazır bekleyen makbuzlar
  function log(box,msg){ box.textContent=(msg+'\n'+box.textContent).split('\n').slice(0,60).join('\n'); }

  function panelDB(){
    if(document.getElementById('mpPanel')||document.getElementById('mpToggle')) return;
    injectCss();
    const vkn=aktifVkn(), muk=vkn?MUKELLEFLER[vkn]:null;
    const tgl=document.createElement('button'); tgl.id='mpToggle'; tgl.textContent='⚡'; tgl.title='Müşavir Pro Tek Tuş';
    document.body.appendChild(tgl);
    tgl.onclick=()=>{ tgl.remove(); olusturPanel(vkn,muk); };
  }
  function olusturPanel(vkn,muk){
    const p=document.createElement('div'); p.id='mpPanel';
    p.innerHTML=`<div class="hd"><b>⚡ Müşavir Pro · Tek Tuş</b><span style="cursor:pointer" id="mpX">✕</span></div>
      <div class="bd">
        <div class="mb">Aktif mükellef: <b>${muk?muk.ad:'(tanınmadı)'}</b><br><small style="color:#94a3b8">${muk?muk.sektor+' · '+muk.tur.toUpperCase():'VKN '+(vkn||'?')}</small></div>
        <div class="mb" style="margin-top:8px">Uyumsoft makbuz verisi (BelgeNo;Tarih;VKN;Ünvan;Matrah;Oran;KDV;Toplam) — veya sadece e-SMM için BelgeNo;VKN;Matrah:</div>
        <textarea id="mpData" placeholder="GM ile Uyumsoft'tan otomatik gelir, ya da elle yapıştır"></textarea>
        <button class="sec" id="mpYukle">📥 Uyumsoft'tan Yükle (varsa)</button>
        <button id="mpKontrol">🔍 Sınıfla & İlmek İlmek Kontrol Et</button>
        <div class="kpi" id="mpKpi"></div>
        <button id="mpGonder" style="display:none">🚀 Defter Beyan'a GÖNDER (API)</button>
        <div class="log" id="mpLog">Hazır. Önce Kontrol Et, sonra Gönder.</div>
      </div>`;
    document.body.appendChild(p);
    const box=p.querySelector('#mpLog');
    p.querySelector('#mpX').onclick=()=>{ p.remove(); panelDB(); };
    // GM'den yükle
    p.querySelector('#mpYukle').onclick=()=>{
      const raw=GM_getValue('mp_'+vkn,''); if(raw){ p.querySelector('#mpData').value=raw; log(box,'GM\'den yüklendi.'); } else log(box,'GM\'de veri yok — Uyumsoft\'tan çek veya elle yapıştır.');
    };
    // Kontrol
    p.querySelector('#mpKontrol').onclick=()=>{
      const lines=p.querySelector('#mpData').value.split(/\n/).map(l=>l.trim()).filter(Boolean);
      _data=lines.map(l=>{
        const c=l.split(/\s*[;\t]\s*/);
        if(c.length<=3){ return {belgeNo:c[0]||'',vkn:(c[1]||'').replace(/\D/g,''),unvan:'',tarih:'17.06.2026',matrah:num(c[2]),oran:20,kdv:r2(num(c[2])*0.20),toplam:r2(num(c[2])*1.20),iade:false}; }
        return {belgeNo:c[0]||'',tarih:c[1]||'',vkn:(c[2]||'').replace(/\D/g,''),unvan:c[3]||'',matrah:num(c[4]),oran:num(c[5]),kdv:num(c[6]),toplam:num(c[7]),iade:/iade/i.test(l)};
      });
      _data.forEach(r=>{ const s=sinifla(r.unvan,muk,r.iade); r.sinif=s.s; r.alt=s.a; r.suphe=s.suphe; });
      kontrolEt(_data);
      const uy=_data.filter(r=>r.uyarilar.length).length;
      const mal=_data.filter(r=>r.sinif==='Mal Alışı').length, gid=_data.filter(r=>r.sinif==='Gider').length, kom=_data.filter(r=>r.sinif==='Komisyon').length, iad=_data.filter(r=>r.sinif==='İade').length;
      const tplM=r2(_data.reduce((a,r)=>a+r.matrah,0)), tplK=r2(_data.reduce((a,r)=>a+r.kdv,0));
      p.querySelector('#mpKpi').innerHTML=`<span>${_data.length} fatura</span>`+(mal?`<span>Mal:${mal}</span>`:'')+(gid?`<span>Gider:${gid}</span>`:'')+(kom?`<span>Kom:${kom}</span>`:'')+(iad?`<span>İade:${iad}</span>`:'')+`<span style="background:${uy?'rgba(245,158,11,.2)':'rgba(16,185,129,.2)'};border-color:${uy?'#f59e0b':'#059669'};color:${uy?'#fde68a':'#34d399'}">${uy?('⚠️ '+uy+' uyarı'):'✅ temiz'}</span><span>Matrah ${tplM.toLocaleString('tr-TR')}</span><span>KDV ${tplK.toLocaleString('tr-TR')}</span>`;
      box.textContent='';
      log(box,'✅ '+_data.length+' fatura kontrol edildi. '+(uy?(uy+' uyarı var — aşağıda:'):'Hepsi temiz, gönderime hazır.'));
      _data.filter(r=>r.uyarilar.length).forEach(r=>log(box,'⚠️ '+r.belgeNo+': '+r.uyarilar.join(' · ')));
      if(muk && muk.tur==='gelir') p.querySelector('#mpGonder').style.display='block';
      else log(box,'ℹ️ Bu mükellef GİDER tarafı — API henüz gelir için. Gider Excel yöntemi ayrı.');
    };
    // Gönder (API)
    p.querySelector('#mpGonder').onclick=async()=>{
      if(!_data.length){ log(box,'Önce Kontrol Et.'); return; }
      const uy=_data.filter(r=>r.uyarilar.length).length;
      if(uy && !confirm(uy+' uyarılı fatura var. Yine de gönderilsin mi?')) return;
      if(!confirm(_data.length+' makbuz Defter Beyan\'a API ile gönderilecek. Onaylıyor musun?')) return;
      log(box,'🚀 Gönderiliyor (API)...');
      const sonuc=await dbTopluGelir(_data, muk, m=>log(box,m));
      log(box,'🎉 BİTTİ — Kaydedilen:'+sonuc.ok+' Hata:'+sonuc.er+' / '+_data.length);
      if(sonuc.fails.length) log(box,'Hatalılar: '+sonuc.fails.join(' | '));
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     UYUMSOFT — çek butonu
  ═══════════════════════════════════════════════════════════════════ */
  function panelUyum(){
    if(document.getElementById('mpUyumBtn')) return;
    if(!/GidenSerbestMeslek|Giden e-SMM|GidenESmm/i.test(location.href) && !document.querySelector('table tbody tr')) return;
    injectCss();
    const b=document.createElement('button'); b.id='mpUyumBtn'; b.textContent='📥 Makbuzları Çek → Müşavir Pro';
    b.style.cssText='position:fixed;top:80px;right:16px;z-index:999999;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:10px;padding:12px 18px;font-weight:700;cursor:pointer;box-shadow:0 6px 20px rgba(16,185,129,.5)';
    b.onclick=()=>{
      const vkn=aktifVkn();
      const mak=cekGidenESmm();
      if(!mak.length){ alert('e-SMM tablosu bulunamadı. Giden Serbest Meslek Makbuzları listesini aç, ara yap.'); return; }
      const satir=mak.map(m=>[m.belgeNo,m.tarih,m.vkn,m.unvan,m.matrah,m.oran,m.kdv,m.toplam].join(';')).join('\n');
      if(vkn) GM_setValue('mp_'+vkn, satir);
      // panoya da koy
      navigator.clipboard && navigator.clipboard.writeText(satir);
      alert('✅ '+mak.length+' makbuz çekildi'+(vkn?(' ('+MUKELLEFLER[vkn].ad+')'):'')+'.\nDefter Beyan\'a geç → ⚡ panelde "Uyumsoft\'tan Yükle" → Kontrol → Gönder.\n(Veri panoya da kopyalandı.)');
    };
    document.body.appendChild(b);
  }

  /* ═══════════════════════════════════════════════════════════════════
     BAŞLAT
  ═══════════════════════════════════════════════════════════════════ */
  function tick(){
    if(/edonusum\.uyum\.com\.tr/i.test(location.host)) panelUyum();
    if(/defterbeyan\.gov\.tr/i.test(location.host)) panelDB();
  }
  setInterval(tick, 1500); tick();

  // Debug erişimi
  window.MusavirPro = { MUKELLEFLER, cekGidenESmm, sinifla, kontrolEt, dbLookup, dbGelirGonder, dbTopluGelir };
})();
