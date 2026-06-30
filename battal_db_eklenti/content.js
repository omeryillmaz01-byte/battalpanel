/* ════════════════════════════════════════════════════════════
   BATTAL · Defter Beyan Gider Kontrol — Chrome Eklentisi
   Defter Beyan sayfasina otomatik "Gider Kontrol" butonu ekler.
   Salt-okuma: yalniz giderliste/search cagrilir, hicbir sey yazilmaz.
   ──────────────────────────────────────────────────────────── */
(function () {
  if (window.__battalDbGK) return;          // iki kez yuklenmesin
  window.__battalDbGK = true;

  const B = 'https://backend-p.defterbeyan.gov.tr/rs';

  /* Token'i sayfanin kendi oturumundan otomatik bul (JWT) */
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

  const fmt = n => (+n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* Tum giderleri sayfa sayfa cek */
  async function pull(bar) {
    const TK = tokenBul();
    const H = { 'Content-Type': 'application/json; charset=utf-8' };
    if (TK) H.Token = TK;
    const yil = new Date().getFullYear();
    const bas = yil + '-01-01 00:00:00', bit = yil + '-12-31 23:59:59';
    let page = 1, all = [], size = Infinity, T = {};
    while (all.length < size) {
      const r = await fetch(B + '/giderliste/search', {
        method: 'POST', headers: H, credentials: 'include',
        body: JSON.stringify({
          attributes: { baslangicTarihi: bas, bitisTarihi: bit },
          pagingContext: { page, limit: 200, orderContextMap: { 'date(kayit_tarihi)': 'DESC' } }
        })
      });
      const j = await r.json();
      const rc = j.resultContainer || {};
      const l = rc.resultList || [];
      size = rc.size || l.length;
      T = { g: rc.toplamGider, k: rc.toplamKdv, s: rc.toplamStopajTutari };
      all = all.concat(l);
      if (bar) bar.textContent = 'Cekiliyor… ' + all.length + '/' + size;
      if (!l.length) break;
      page++;
      if (page > 100) break;
    }
    return { all, T, token: !!TK };
  }

  /* Kontrol tablosunu ekranda goster */
  async function calistir() {
    let ov = document.getElementById('__gk');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = '__gk';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(8,12,24,.97);color:#e8edf5;font:13px Segoe UI,system-ui,sans-serif;overflow:auto;padding:20px';
    ov.innerHTML = '<div style="max-width:1280px;margin:0 auto"><div style="display:flex;align-items:center;gap:12px;margin-bottom:14px"><b style="font-size:18px;color:#d4af37">📊 Defter Beyan · Gider Kontrol</b><span id="__gkav" style="font-size:11px;color:#9aa6c0">ÖY · BATTAL MUHASEBE</span><button id="__gkx" style="margin-left:auto;background:#af0003;color:#fff;border:0;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:700">✕ Kapat</button></div><div id="__gkb">Yukleniyor…</div></div>';
    document.body.appendChild(ov);
    document.getElementById('__gkx').onclick = () => ov.remove();
    const bar = document.getElementById('__gkb');

    let R;
    try { R = await pull(bar); }
    catch (e) { bar.innerHTML = '<span style="color:#fca5a5">Hata: ' + e.message + '</span>'; return; }

    const all = R.all, T = R.T;

    /* ── kontroller ── */
    const seen = {}, dup = [];
    all.forEach(r => {
      const k = (r.tcknVkn || '') + '|' + (r.belgeSiraNo || '') + '|' + r.tutar;
      if (seen[k]) dup.push(r); else seen[k] = 1;
    });
    const kdvE = all.filter(r => {
      if (r.kdvsizIslem) return false;
      const b = Math.round(r.tutar * r.kdvOrani) / 100;
      return Math.abs(b - (r.kdv || 0)) > 0.05;
    });
    /* ÖİV tespiti: boş açıklamalı satır, aynı belge no'lu bir telefon/internet
       faturasının ÖİV kısmıysa hata degil, ÖİV olarak isaretle */
    const byBelge = {};
    all.forEach(r => {
      const k = (r.tcknVkn || '') + '|' + (r.belgeSiraNo || '');
      (byBelge[k] = byBelge[k] || []).push(r);
    });
    const oivRe = /iletişim|iletisim|turknet|telefon|haberleşme|haberlesme|internet|gsm|turkcell|vodafone|türk ?telekom|turk ?telekom|ttnet|superonline/i;
    const isOIV = r => {
      if (r.aciklama && r.aciklama.trim()) return false;
      const k = (r.tcknVkn || '') + '|' + (r.belgeSiraNo || '');
      return (byBelge[k] || []).some(x => oivRe.test(x.aciklama || ''));
    };
    const oiv = all.filter(isOIV);
    const bos = all.filter(r => (!r.aciklama || !r.aciklama.trim()) && !isOIV(r));

    const chip = (t, n, c) => '<span style="display:inline-block;background:' + c + ';padding:6px 12px;border-radius:20px;margin:0 8px 8px 0;font-weight:700">' + t + ': ' + n + '</span>';
    let h = '<div style="margin-bottom:12px">' +
      chip('Kayit', all.length, '#1f2937') +
      chip('Toplam Gider', '₺' + fmt(T.g), '#1e3a2f') +
      chip('Ind. KDV', '₺' + fmt(T.k), '#1e2f3a') +
      chip('Stopaj', '₺' + fmt(T.s), '#2f1e3a') +
      chip('Mukerrer', dup.length, dup.length ? '#5b1a1a' : '#1f2937') +
      chip('KDV Uyumsuz', kdvE.length, kdvE.length ? '#5b3a1a' : '#1f2937') +
      chip('ÖİV', oiv.length, oiv.length ? '#3a341a' : '#1f2937') +
      chip('Bos Aciklama', bos.length, bos.length ? '#5b3a1a' : '#1f2937') +
      '</div>';

    const flag = r => {
      if (isOIV(r)) return '<span style="color:#fcd34d;font-weight:700">ÖİV</span>';
      const a = [];
      if (dup.indexOf(r) >= 0) a.push('MUKERRER');
      if (kdvE.indexOf(r) >= 0) a.push('KDV?');
      if (bos.indexOf(r) >= 0) a.push('ACIKLAMA?');
      return a.length ? '<span style="color:#fca5a5;font-weight:700">' + a.join(' ') + '</span>' : '<span style="color:#6ee7b7">✓</span>';
    };

    const cols = ['Belge Tarihi', 'Belge No', 'VKN/TC', 'Aciklama', 'Matrah', 'KDV%', 'KDV', 'Stopaj', 'Kontrol'];
    h += '<div style="overflow:auto;border:1px solid #2a3550;border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#141c2e;text-align:left">' +
      cols.map(x => '<th style="padding:8px">' + x + '</th>').join('') + '</tr></thead><tbody>';
    all.forEach(r => {
      h += '<tr style="border-top:1px solid #1f2840">' +
        '<td style="padding:7px">' + (r.belgeTarihi || '').slice(0, 10) + '</td>' +
        '<td style="padding:7px">' + (r.belgeSiraNo || '') + '</td>' +
        '<td style="padding:7px">' + (r.tcknVkn || '') + '</td>' +
        '<td style="padding:7px">' + ((r.aciklama || '').slice(0, 60)) + '</td>' +
        '<td style="padding:7px;text-align:right">' + fmt(r.tutar) + '</td>' +
        '<td style="padding:7px;text-align:right">' + (r.kdvOrani || 0) + '</td>' +
        '<td style="padding:7px;text-align:right">' + fmt(r.kdv) + '</td>' +
        '<td style="padding:7px;text-align:right">' + fmt(r.stopajTutari) + '</td>' +
        '<td style="padding:7px">' + flag(r) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    bar.innerHTML = h;
  }

  /* ── Sayfaya yuzen buton ekle ── */
  function butonEkle() {
    if (document.getElementById('__gkBtn')) return;
    const btn = document.createElement('button');
    btn.id = '__gkBtn';
    btn.textContent = '📊 Gider Kontrol';
    btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483646;background:linear-gradient(135deg,#d4af37,#b8941f);color:#0b1224;border:0;padding:13px 20px;border-radius:30px;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 6px 20px rgba(212,175,55,.45);font-family:Segoe UI,system-ui,sans-serif';
    btn.onclick = calistir;
    document.body.appendChild(btn);
  }

  butonEkle();
  /* SPA gezinmelerinde buton silinirse tekrar koy */
  setInterval(butonEkle, 2000);
})();
