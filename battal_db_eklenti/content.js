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

  /* ════════════════════ DEFTER BEYAN ════════════════════ */
  if (/defterbeyan\.gov\.tr/.test(host)) {
    const B = 'https://backend-p.defterbeyan.gov.tr/rs';

    /* CASUS (sayfa-dünyası): /gelir/create isteğini SAYFANIN kendi fetch'inden yakala.
       İçerik betiği izole dünyada olduğu için sayfanın fetch'ini göremez; bu yüzden
       sayfaya <script> enjekte ediyoruz. Yakalanan gerçek payload'ı (Z raporu şablonu)
       chrome.storage'a yazarız → sonra Z raporlarını AYNI yapıyla API ile göndeririz. */
    (function () {
      if (window.__zPageInjected) return; window.__zPageInjected = true;
      const code = '(' + function () {
        if (window.__zPageHook) return; window.__zPageHook = true;
        const isC = u => /\/gelir\//.test('' + u) && !/\/gelirliste\//.test('' + u);
        const emit = (req, status, res) => { let rq = null; try { rq = typeof req === 'string' ? JSON.parse(req) : req; } catch (e) {} let rs = null; try { rs = typeof res === 'string' ? JSON.parse(res) : res; } catch (e) {} window.postMessage({ __zcapReal: 1, req: rq, status: status, res: rs }, '*'); };
        // fetch hook
        const of = window.fetch;
        window.fetch = function (u, o) {
          const url = (u && u.url) || u || ''; const body = o && o.body;
          const p = of.apply(this, arguments);
          if (isC(url)) { p.then(r => { r.clone().text().then(t => emit(body, r.status, t)).catch(() => {}); }).catch(() => {}); }
          return p;
        };
        // XMLHttpRequest hook (Defter Beyan bunu kullanıyor olabilir)
        const oOpen = XMLHttpRequest.prototype.open, oSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (m, u) { this.__zurl = u; return oOpen.apply(this, arguments); };
        XMLHttpRequest.prototype.send = function (b) {
          if (isC(this.__zurl)) { this.addEventListener('load', function () { emit(b, this.status, this.responseText); }); }
          return oSend.apply(this, arguments);
        };
      } + ')();';
      const sc = document.createElement('script');
      sc.textContent = code;
      (document.head || document.documentElement).appendChild(sc);
      sc.remove();
      window.addEventListener('message', e => {
        const d = e.data;
        if (!d || !d.__zcapReal) return;
        window.__zLastCap = d;
        // İstek gövdesinden (create/update) VEYA cevaptan (detay görüntüleme) tam belgeyi yakala
        const belgeSec = o => (o && o.gelirBelgeTuruKodu && o.kayitlar && o.kayitlar.length) ? o : null;
        const cand = belgeSec(d.req) || belgeSec(d.res && (d.res.resultContainer || d.res.result)) || belgeSec(d.res);
        if (d.status === 200 && cand && /z.?raporu/i.test(JSON.stringify(cand).toLowerCase()) || (d.status === 200 && cand && cand.gelirBelgeTuruKodu)) {
          try { chrome.storage.local.set({ zTemplate: { req: cand, ts: Date.now() } }); } catch (x) {}
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
      async function islem(d) {
        try {
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
      let paket = null;
      // 1) Panodan otomatik oku
      try {
        const txt = (await navigator.clipboard.readText() || '').trim();
        if (txt) { const p = JSON.parse(txt); if (p.tip === 'battal-zrapor-gonder' && Array.isArray(p.firmalar)) paket = p; }
      } catch (e) {}
      // 2) Pano boş/geçersizse elle yapıştırma kutusu göster
      if (!paket) {
        bar.innerHTML = '<div style="color:#fca5a5;margin-bottom:8px">Panoda geçerli Z Raporu paketi bulunamadı.</div>' +
          '<div style="margin-bottom:8px;color:#9aa6c0">Panelde <b>"Z Raporlarını Panoya Kopyala"</b>ya bas, sonra buraya <b>Ctrl+V</b> yapıştır ve <b>Devam</b>a tıkla.</div>' +
          '<textarea id="__zPaste" style="width:100%;height:120px;background:#0b1020;color:#e8edf5;border:1px solid #2a3550;border-radius:8px;padding:8px;font-family:Consolas,monospace;font-size:11px" placeholder="JSON paketini buraya yapıştır…"></textarea>' +
          '<button id="__zGo" style="margin-top:8px;background:#7c3aed;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-weight:800;cursor:pointer">Devam ▶</button>';
        await new Promise(res => {
          document.getElementById('__zGo').onclick = () => {
            try { const p = JSON.parse((document.getElementById('__zPaste').value || '').trim()); if (p.tip === 'battal-zrapor-gonder' && Array.isArray(p.firmalar)) { paket = p; res(); } else alert('Geçersiz paket. Panelden kopyaladığın JSON\'u yapıştır.'); }
            catch (e) { alert('JSON okunamadı: ' + e.message); }
          };
        });
      }

      const D = document;
      const norm = s => (s || '').toString().trim().toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/[ĞÜŞÖÇ]/g, c => ({ Ğ: 'G', Ü: 'U', Ş: 'S', Ö: 'O', Ç: 'C' }[c]));
      const r2 = v => Math.round(v * 100) / 100;
      const iso = t => { const a = String(t).split('.'); return a.length === 3 ? a[2] + '-' + a[1] + '-' + a[0] + ' 00:00:00' : t; };

      // Aktif mükellef
      const banner = D.querySelector('.dbs-navbar__content span');
      if (!banner) { bar.innerHTML = '<span style="color:#fca5a5">❌ Defter Beyan açık değil. Giriş yapıp mükellefe gir.</span>'; return; }
      const aktif = banner.innerText.split('\n')[0].trim();
      const aktifN = norm(aktif);
      const firma = paket.firmalar.find(f => aktifN.includes(norm(f.ad).slice(0, 8)) || norm(f.ad).includes(aktifN.slice(0, 8)));
      const digerleri = paket.firmalar.filter(f => f !== firma).map(f => f.ad);
      if (!firma) {
        bar.innerHTML = '<div style="color:#fca5a5">⚠️ Aktif mükellef "<b>' + aktif + '</b>" paketteki firmalarla eşleşmedi.<br>Pakette: ' + paket.firmalar.map(f => f.ad).join(', ') + '</div>';
        return;
      }

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
            '<div style="color:#fcd34d;font-size:15px;margin-bottom:8px"><b>🎯 EN KOLAY: Gelir Listele\'de bir Z\'ye tıkla</b></div>' +
            '<div style="color:#e8edf5;font-size:13px;line-height:1.7">Detay endpoint\'ini bulamadım ama casus artık Defter Beyan\'ın <b>kendi çağrısını</b> dinliyor.<br>' +
            '<b>Yap (elle giriş DEĞİL, sadece bakma):</b><br>1. Sol menü → <b>Gelir Listele</b> → herhangi bir <b>Z Raporu</b> satırına / <b>"Tüm Belgeyi Görüntüle"</b>ye tıkla (belgeyi aç).<br>2. Belge açılınca casus şablonu otomatik yakalar.<br>3. Tekrar <b>📊 Z Raporu Gönder</b> → 🚀 Gönder.</div>' +
            '<div style="margin-top:10px;color:#6ee7b7;font-size:12px" id="__zBekle">Durum: bir Z belgesinin açılması bekleniyor…</div>' +
            '<div style="margin-top:10px;color:#64748b;font-size:11px">Teknik: ' + (learn.err || '?') + (learn.keys ? ' · alanlar: ' + learn.keys : '') + '</div>';
          const iv2 = setInterval(async () => { try { const st = await chrome.storage.local.get('zTemplate'); if (st && st.zTemplate) { clearInterval(iv2); const e = D.getElementById('__zBekle'); if (e) e.innerHTML = '✅ Şablon yakalandı! Pencereyi kapat, tekrar "Z Raporu Gönder" bas → 🚀 Gönder.'; } } catch (e) {} }, 1500);
          return;
        }
      }
      if (false) {
        bar.innerHTML =
          '<div style="color:#fcd34d;font-size:15px;margin-bottom:10px"><b>ℹ️ Önce Z Raporu şablonu öğrenilmeli (tek seferlik)</b></div>' +
          '<div style="color:#e8edf5;line-height:1.7">Güvenilir gönderim için Defter Beyan\'ın Z Raporu payload yapısını, senin <b>elle kaydettiğin bir Z raporundan</b> öğrenmem gerekiyor (kodlar sistemde gizli).<br><br>' +
          '<b>Yapman gereken (1 kez):</b><br>1. <b>Gelir Ekle</b> → Belge Türü <b>Z Raporu</b> → bir Z raporunu elle gir → <b>Kaydet</b>.<br>2. Kaydolunca casus payload\'ı otomatik yakalar ve saklar.<br>3. Sonra tekrar <b>"📊 Z Raporu Gönder"</b> bas — kalan tüm Z\'leri (tüm firmalar) API ile otomatik basar.<br><br>' +
          '<span style="color:#9aa6c0">Not: Bu şablon bir kez öğrenilince kalıcıdır; her ay/firma için tekrar gerekmez.</span></div>' +
          '<div style="margin-top:12px;padding:8px 12px;background:#0b1020;border-radius:8px;color:#6ee7b7;font-size:12px">Durum: elle 1 Z raporu kaydedilmesi bekleniyor…</div>';
        // Yakalanınca haber ver
        const iv = setInterval(async () => { try { const st = await chrome.storage.local.get('zTemplate'); if (st && st.zTemplate) { clearInterval(iv); const b2 = D.getElementById('__gkb'); if (b2) b2.querySelector('div:last-child').innerHTML = '✅ Şablon yakalandı! Şimdi bu pencereyi kapatıp tekrar "Z Raporu Gönder" bas.'; } } catch (e) {} }, 1500);
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

    butonEkle('📊 Gider Kontrol', calistir, null, '__gkBtn', 20);
    butonEkle('📥 Panodan Gider Gönder', panodanGonder, 'linear-gradient(135deg,#3b82f6,#1d4ed8)', '__gonderBtn', 76);
    butonEkle('📊 Z Raporu Gönder', zRaporGonder, 'linear-gradient(135deg,#7c3aed,#5b21b6)', '__zBtn', 132);
    setInterval(() => {
      butonEkle('📊 Gider Kontrol', calistir, null, '__gkBtn', 20);
      butonEkle('📥 Panodan Gider Gönder', panodanGonder, 'linear-gradient(135deg,#3b82f6,#1d4ed8)', '__gonderBtn', 76);
      butonEkle('📊 Z Raporu Gönder', zRaporGonder, 'linear-gradient(135deg,#7c3aed,#5b21b6)', '__zBtn', 132);
    }, 2000);
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

      let h = '<div style="margin-bottom:12px">' +
        chip('Gelen Fatura', all.length, '#1e3a2f') +
        '</div>';
      h += '<div style="margin:8px 0;padding:12px 14px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);border-radius:10px;color:#6ee7b7;font-size:12.5px">✓ ' + all.length + ' gelen fatura kaydedildi. Şimdi <b>Defter Beyan</b> sekmesine geç → 📊 Gider Kontrol\'e bas → hangileri deftere girilmemiş göreceksin.</div>';
      const cols = ['Fatura No', 'Tarih', 'Gönderen', 'VKN/TC', 'Durum'];
      h += '<div style="overflow:auto;border:1px solid #2a3550;border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#141c2e;text-align:left">' + cols.map(x => '<th style="padding:8px">' + x + '</th>').join('') + '</tr></thead><tbody>';
      all.forEach(x => {
        h += '<tr style="border-top:1px solid #1f2840"><td style="padding:7px">' + (x.no || '') + '</td><td style="padding:7px">' + (x.tarih || '').slice(0, 10) + '</td><td style="padding:7px">' + ((x.unvan || '').slice(0, 50)) + '</td><td style="padding:7px">' + (x.vkn || '') + '</td><td style="padding:7px">' + (x.status || '') + '</td></tr>';
      });
      h += '</tbody></table></div>';
      bar.innerHTML = h;
    }

    butonEkle('📥 Gelen Faturaları Al', calistir, 'linear-gradient(135deg,#6ee7b7,#10b981)');
    setInterval(() => butonEkle('📥 Gelen Faturaları Al', calistir, 'linear-gradient(135deg,#6ee7b7,#10b981)'), 2000);
  }
})();
