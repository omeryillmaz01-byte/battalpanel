(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const satirlar = [];
  const goruldu = new Set();

  const topla = () => {
    document.querySelectorAll('tr[id^="row"]').forEach(row => {
      const oid = row.id.replace('row', '');
      if (goruldu.has(oid)) return;
      goruldu.add(oid);
      const tds = [...row.querySelectorAll(':scope > td')];
      const get = (i, title) => title
        ? (tds[i]?.getAttribute('title') || tds[i]?.innerText.trim() || '')
        : (tds[i]?.innerText.trim().replace(/\n/g,' ') || '');
      // NOT: OID'ler özel karakter içerebiliyor (£, ^ ...) → CSS seçici değil getElementById kullan
      const durum = (document.getElementById('durumTD' + oid)
        ?.innerText || '').trim().replace(/\n/g,' ');
      const sgkDurum = (tds[9]?.innerText || '').trim().replace(/\n/g, ' ');

      // Tahakkuk OID
      let thkOid = '';
      const thkM = ((document.getElementById('thkPDF' + oid)?.querySelector('img')
        ?.getAttribute('onclick')) || '').match(/tahakkukGoruntule\('[^']+','([^']+)'/);
      if (thkM) thkOid = thkM[1];

      // İHB var mı? — id="ihb{oid}" içinde <span> varsa İHB mevcut
      const ihbVar = !!(document.getElementById('ihb' + oid)?.querySelector('span'));

      satirlar.push([
        get(3, true), get(2), get(1), get(4), get(5),
        get(6), get(7), durum, sgkDurum, oid, thkOid, ihbVar ? 'VAR' : '', ''
      ]);
    });
  };

  const sonSayfaMi = () => {
    for (const el of document.querySelectorAll('td, b, font, span')) {
      const m = el.textContent.match(/(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)/);
      if (m) return parseInt(m[2]) >= parseInt(m[3]);
    }
    return false;
  };

  topla();
  console.log(`Sayfa 1: ${satirlar.length} satır`);
  let sayfa = 2;

  while (!sonSayfaMi()) {
    const oncekiSayi = satirlar.length;
    const btn = [...document.querySelectorAll('input[type=button]')]
      .find(b => b.value === '>>');
    if (!btn || btn.disabled) break;
    btn.click();
    // GIB rate limit ≥1sn: min 1.1sn bekle, sonra yeni satır gelene kadar kısa poll
    await wait(1100);
    let geldi = false;
    for (let p = 0; p < 8; p++) {
      topla();
      if (satirlar.length > oncekiSayi) { geldi = true; break; }
      await wait(300);
    }
    if (!geldi) break;  // yeni satır gelmedi → dur
    console.log(`Sayfa ${sayfa++}: ${satirlar.length} satır`);
  }

  const basliklar = ['Ad_Soyad','VK_No','Beyanname_Turu','Vergi_Dairesi',
    'Vergilendirme_Donemi','Sube_No','Yukleme_Zamani','Durum','SGK_Durum',
    'BynOID','ThkOID','IhbOID','Klasor'];

  const csv = [basliklar, ...satirlar]
    .map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';'))
    .join('\r\n');

  const ihbSayisi = satirlar.filter(r => r[11]).length;  // IhbOID sütunu (VAR olanlar)
  const indir = document.createElement('button');
  indir.textContent = `⬇ CSV İndir (${satirlar.length} satır, ${ihbSayisi} ihbarname)`;
  indir.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;padding:15px 30px;background:#28a745;color:white;font-size:18px;font-weight:bold;border:none;border-radius:10px;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.4)';
  indir.onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'}));
    a.download = 'beyannameler_yeni.csv';
    a.click();
    indir.textContent = '✅ İndirildi!';
    setTimeout(() => indir.remove(), 3000);
  };
  document.body.appendChild(indir);
  console.log(`✅ ${satirlar.length} satır hazır! İhbarname olan: ${ihbSayisi}`);
  return csv;   // panel (CDP) bu değeri yakalar
})();
