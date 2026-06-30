(async () => {
  // ============================================================
  // MUHTASAR (MUHSGK) CSV - SGK Tahakkuk OID'li
  // Her MUHSGK satiri icin SGK Bildirimleri penceresini acar,
  // sgkTahakkukOid'yi cekip CSV'ye 'SgkThkOID' sutunu olarak yazar.
  // ============================================================
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const kayitlar = [];
  const goruldu = new Set();

  const topla = () => {
    document.querySelectorAll('tr[id^="row"]').forEach(row => {
      if (row.closest('#tahakkukTable')) return;  // SGK pop-up satırı → atla
      const oid = row.id.replace('row', '');
      if (goruldu.has(oid)) return;
      goruldu.add(oid);
      const tds = [...row.querySelectorAll(':scope > td')];
      const get = (i, title) => title
        ? (tds[i]?.getAttribute('title') || tds[i]?.innerText.trim() || '')
        : (tds[i]?.innerText.trim().replace(/\n/g, ' ') || '');
      // NOT: OID'ler özel karakter içerebiliyor → CSS seçici değil getElementById kullan
      const durum = (document.getElementById('durumTD' + oid)
        ?.innerText || '').trim().replace(/\n/g, ' ');
      const sgkDurum = (tds[9]?.innerText || '').trim().replace(/\n/g, ' ');

      // Tahakkuk OID
      let thkOid = '';
      const thkM = ((document.getElementById('thkPDF' + oid)?.querySelector('img')
        ?.getAttribute('onclick')) || '').match(/tahakkukGoruntule\('[^']+','([^']+)'/);
      if (thkM) thkOid = thkM[1];

      // İHB var mı?
      const ihbVar = !!(document.getElementById('ihb' + oid)?.querySelector('span'));

      kayitlar.push({
        ad: get(3, true), vk: get(2), tur: get(1), vd: get(4), donem: get(5),
        sube: get(6), yukleme: get(7), durum, sgkDurum,
        oid, thkOid, sgkNormalOid: '', sgkEmekliOid: '', ihb: ihbVar ? 'VAR' : ''
      });
    });
  };

  const sonSayfaMi = () => {
    for (const el of document.querySelectorAll('td, b, font, span')) {
      const m = el.textContent.match(/(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)/);
      if (m) return parseInt(m[2]) >= parseInt(m[3]);
    }
    return false;
  };

  // ---- 1) Tüm sayfalardan satırları topla ----
  topla();
  console.log(`Sayfa 1: ${kayitlar.length} satır`);
  let sayfa = 2;
  while (!sonSayfaMi()) {
    const oncekiSayi = kayitlar.length;
    const btn = [...document.querySelectorAll('input[type=button]')].find(b => b.value === '>>');
    if (!btn || btn.disabled) break;
    btn.click();
    await wait(2000);
    topla();
    if (kayitlar.length === oncekiSayi) break;  // yeni satır gelmedi → sayfalama bitti/takıldı, dur
    console.log(`Sayfa ${sayfa++}: ${kayitlar.length} satır`);
  }
  console.log(`Toplam ${kayitlar.length} satır toplandı. Şimdi SGK OID'leri çekiliyor...`);

  // ---- 2) Her MUHSGK satırı için SGK bildirimlerini AJAX ile çek (modal YOK) ----
  // Bir beyanname için SGK satırlarını tarar:
  //   { normal: '<5510 sgkTahakkukOid>', emekli: '<SGDP sgkTahakkukOid>' }
  // Açıklama metnine göre tip: SGDP/emekli mi, normal mi?
  //   EMEKLİ : "SOS.GÜV.DES PRİM", "Sosyal Güvenlik Destek Primi", "SGDP", "destek primi"
  //   NORMAL : "TÜM SİG.KOLLARI", "Kanun türü yoktur" (SGDP değilse) ve diğer her şey
  const emekliMi = (acik) =>
    /sgdp|destek\s*prim|des\s*prim|sos\.?\s*g[üu]v|g[üu]v\.?\s*des|sosyal\s*g[üu]venlik\s*destek/i.test(acik);

  // Tüm farklı açıklama metinlerini biriktir (kural belirlemek için)
  const tumAciklamalar = new Map();   // açıklama -> kaç kez

  // TOKEN parametresini al (TOKEN=... şeklinde)
  const getTok = () => {
    try { if (typeof getParameterStringFromObjID === 'function') return getParameterStringFromObjID('TOKEN'); } catch (e) {}
    const el = document.getElementById('TOKEN'); if (el && el.value) return 'TOKEN=' + el.value;
    const m = location.href.match(/[?&]TOKEN=([^&]+)/); if (m) return 'TOKEN=' + m[1];
    return '';
  };

  // HIZLI YÖNTEM: SGK bildirimlerini AJAX ile çek (pencere/modal AÇMADAN).
  //   POST /dispatch  cmd=THKESASBILGISGKMESAJLARI&beyannameOid=...&TOKEN=...
  // Dönen HTML'de sgkTahakkukGoruntule('beyOid','sgkOid') + açıklama (2. td) var.
  const getSgkOids = async (oid) => {
    const oidEsc = oid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let html = '';
    try {
      const body = 'cmd=THKESASBILGISGKMESAJLARI&beyannameOid=' + oid + '&' + getTok();
      const resp = await fetch('dispatch', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                   'X-Requested-With': 'XMLHttpRequest' },
        body
      });
      if (!resp.ok) return { normals: [], emeklis: [], satirlar: [], yuklendi: false };
      html = await resp.text();
      // AJAX zarfı olabilir → HTMLCONTENT'i çıkar
      try {
        if (typeof resolveAJAXResult === 'function') {
          const r = resolveAJAXResult({ status: resp.status, responseText: html });
          if (r && (r.ERROR || r.SERVERERROR || r.EYEKSERROR))
            return { normals: [], emeklis: [], satirlar: [], yuklendi: false };
          if (r && r.HTMLCONTENT) html = r.HTMLCONTENT;
        }
      } catch (e) {}
    } catch (e) {
      return { normals: [], emeklis: [], satirlar: [], yuklendi: false };  // ağ/500 → sonraki tur
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const normals = [], emeklis = [], satirlar = [];
    const re = new RegExp("sgkTahakkukGoruntule\\('" + oidEsc + "','([^']+)'");
    doc.querySelectorAll('[onclick]').forEach(el => {
      const m = (el.getAttribute('onclick') || '').match(re);
      if (!m) return;
      const sgkOid = m[1];
      const tr = [...doc.querySelectorAll('tr')].find(r => r.id === 'row' + sgkOid) || el.closest('tr');
      const tds = tr ? [...tr.querySelectorAll(':scope > td')] : [];
      const acik = ((tds[1] && tds[1].textContent) || '').replace(/\s+/g, ' ').trim();
      satirlar.push({ sgkOid, acik });
      tumAciklamalar.set(acik, (tumAciklamalar.get(acik) || 0) + 1);
      if (emekliMi(acik)) { if (!emeklis.includes(sgkOid)) emeklis.push(sgkOid); }
      else               { if (!normals.includes(sgkOid)) normals.push(sgkOid); }
    });
    return { normals, emeklis, satirlar, yuklendi: true };
  };

  // GIB hata diyaloglarını (alert/confirm) geçici bastır — 500 dönerse
  // "Site geçersiz cevap döndü" uyarısı çıkıp tüm akışı durdurmasın.
  const _alert = window.alert, _confirm = window.confirm;
  window.alert = () => {};
  window.confirm = () => true;

  const muhRows = kayitlar.filter(r => /MUH/i.test(r.tur));
  const muhsgkSayisi = muhRows.length;

  // Çok turlu tarama: 500/çekilemeyen firmaları sonraki turda tekrar dene
  let kalan = muhRows.slice();
  let tur = 0;
  while (kalan.length && tur < 4) {
    tur++;
    const basarisiz = [];
    for (let k = 0; k < kalan.length; k++) {
      const r = kalan[k];
      await wait(100);                       // firmalar arası kısa bekleme (fetch hızlı)
      const s = await getSgkOids(r.oid);
      if (!s.yuklendi) { basarisiz.push(r); continue; }   // 500 → sonraki tur
      r.sgkNormalOid = s.normals.join('|');
      r.sgkEmekliOid = s.emeklis.join('|');
      r.sgkAciklama  = s.satirlar.map(x => x.acik).join(' || ');
      r._ok = true;
      if ((k + 1) % 10 === 0 || k === kalan.length - 1)
        console.log(`  [Tur ${tur}] ${k + 1}/${kalan.length} işlendi`);
    }
    kalan = basarisiz;
    if (kalan.length) {
      console.log(`Tur ${tur} bitti — ${kalan.length} firma çekilemedi (500). 6 sn bekleyip tekrar denenecek...`);
      await wait(6000);
    }
  }
  // Hata diyaloglarını geri aç
  window.alert = _alert;
  window.confirm = _confirm;

  // Sayımlar
  let normalSay = 0, emekliSay = 0, coklu = 0;
  const sgksizlar = [];
  const cekilemeyen = kalan.map(r => r.ad);   // sürekli 500 verenler
  for (const r of muhRows) {
    const nN = (r.sgkNormalOid || '').split('|').filter(Boolean).length;
    const nE = (r.sgkEmekliOid || '').split('|').filter(Boolean).length;
    if (nN) normalSay++;
    if (nE) emekliSay++;
    if (nN > 1 || nE > 1) coklu++;
    if (r._ok && !nN && !nE) sgksizlar.push(r.ad);   // yüklendi ama SGK yok = gerçekten yok
  }
  console.log(`SGK taraması bitti. MUHSGK:${muhsgkSayisi}  normal:${normalSay}  emekli:${emekliSay}  çoklu(2+):${coklu}`);
  if (sgksizlar.length) {
    console.log(`ℹ️ SGK satırı olmayan ${sgksizlar.length} firma (çalışanı yok / tasfiye olabilir):`);
    sgksizlar.forEach(a => console.log('   - ' + a));
  }
  if (cekilemeyen.length) {
    console.log(`⚠️ ${cekilemeyen.length} firma SÜREKLİ 500 verdi, ÇEKİLEMEDİ (sonra tekrar dene):`);
    cekilemeyen.forEach(a => console.log('   - ' + a));
  }
  // === TÜM FARKLI AÇIKLAMA TÜRLERİ (kural belirlemek için) ===
  console.log('\n========== FARKLI AÇIKLAMA TÜRLERİ ==========');
  const sirali = [...tumAciklamalar.entries()].sort((a, b) => b[1] - a[1]);
  sirali.forEach(([acik, adet]) => {
    const tip = emekliMi(acik) ? 'EMEKLİ' : 'NORMAL';
    console.log(`[${tip}] (${adet}x)  ${acik}`);
  });
  console.log('=============================================\n');

  // ---- 3) CSV oluştur ----
  const basliklar = ['Ad_Soyad', 'VK_No', 'Beyanname_Turu', 'Vergi_Dairesi',
    'Vergilendirme_Donemi', 'Sube_No', 'Yukleme_Zamani', 'Durum', 'SGK_Durum',
    'BynOID', 'ThkOID', 'SgkNormalOID', 'SgkEmekliOID', 'SgkAciklama', 'IhbOID', 'Klasor'];
  const satirlar = kayitlar.map(r => [
    r.ad, r.vk, r.tur, r.vd, r.donem, r.sube, r.yukleme, r.durum, r.sgkDurum,
    r.oid, r.thkOid, r.sgkNormalOid, r.sgkEmekliOid, (r.sgkAciklama || ''), r.ihb, ''
  ]);

  const csv = [basliklar, ...satirlar]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  const indir = document.createElement('button');
  indir.textContent = `⬇ Muhtasar CSV İndir (${satirlar.length} satır, N:${normalSay} E:${emekliSay})`;
  indir.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;padding:15px 30px;background:#28a745;color:white;font-size:18px;font-weight:bold;border:none;border-radius:10px;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.4)';
  indir.onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'muhtasar_sgk.csv';
    a.click();
    indir.textContent = '✅ İndirildi!';
    setTimeout(() => indir.remove(), 3000);
  };
  document.body.appendChild(indir);
  console.log(`✅ ${satirlar.length} satır hazır! normal(5510): ${normalSay}, emekli(SGDP): ${emekliSay}`);
  return csv;   // panel (CDP) bu değeri yakalar
})();
