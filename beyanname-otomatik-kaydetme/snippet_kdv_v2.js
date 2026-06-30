(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const satirlar = [];
  const goruldu = new Set();

  // Paginasyon scope'unu bul: tr[id^=row] içeren EN GÜNCEL (görünür) tablonun container'ı
  const tabloRow = () => document.querySelectorAll('tr[id^="row"]');

  const paginasyonScope = () => {
    // tr[id^=row] içeren tablonun en yakın "window" veya "containerBody" parent'ı
    const rowlar = tabloRow();
    if (!rowlar.length) return document;
    let p = rowlar[0];
    for (let i = 0; i < 10 && p; i++) {
      if (p.tagName === 'BODY' || (p.id && p.id.includes('Window')) || p.className?.includes('window')) return p;
      p = p.parentElement;
    }
    return rowlar[0].closest('div, td, body') || document;
  };

  const topla = () => {
    tabloRow().forEach(row => {
      const oid = row.id.replace('row', '');
      if (goruldu.has(oid)) return;
      goruldu.add(oid);
      const tds = [...row.querySelectorAll(':scope > td')];
      const get = (i, title) => title
        ? (tds[i]?.getAttribute('title') || tds[i]?.innerText.trim() || '')
        : (tds[i]?.innerText.trim().replace(/\n/g,' ') || '');
      const durum = (document.getElementById('durumTD' + oid)?.innerText || '').trim().replace(/\n/g,' ');
      const sgkDurum = (tds[9]?.innerText || '').trim().replace(/\n/g, ' ');
      let thkOid = '';
      const thkM = ((document.getElementById('thkPDF' + oid)?.querySelector('img')
        ?.getAttribute('onclick')) || '').match(/tahakkukGoruntule\('[^']+','([^']+)'/);
      if (thkM) thkOid = thkM[1];
      const ihbVar = !!(document.getElementById('ihb' + oid)?.querySelector('span'));
      satirlar.push([
        get(3, true), get(2), get(1), get(4), get(5),
        get(6), get(7), durum, sgkDurum, oid, thkOid, ihbVar ? 'VAR' : '', ''
      ]);
    });
  };

  // Paginasyon bilgisi: "26 - 50 / 363" formatında
  const sayfaBilgisi = () => {
    const scope = paginasyonScope();
    const texts = scope.querySelectorAll ? scope.querySelectorAll('*') : [];
    for (const el of texts) {
      const t = el.textContent || '';
      const m = t.match(/(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)/);
      if (m && t.length < 40) {  // sadece kısa text (paginasyon row'u)
        return { bas: +m[1], bit: +m[2], toplam: +m[3] };
      }
    }
    return null;
  };

  // Doğru >> butonunu bul: paginasyon row'undaki, tr[id^=row] tablosunun ALTINDAKİ
  const ileriBtn = () => {
    const rowlar = tabloRow();
    if (!rowlar.length) return null;
    const tablo = rowlar[0].closest('table');
    if (!tablo) return null;
    // Tablonun parent'ı içinde >> ara (paginasyon genelde tablonun hemen altında)
    const cont = tablo.parentElement?.parentElement || tablo.parentElement;
    if (!cont) return null;
    const btns = cont.querySelectorAll('input[type=button], button');
    for (const b of btns) {
      if (b.value === '>>' || b.innerText === '>>') return b;
    }
    return null;
  };

  topla();
  let bilgi = sayfaBilgisi();
  console.log(`Sayfa 1: ${satirlar.length} satır`, bilgi);

  let sayfa = 2;
  let beklemeMs = 3000;
  while (true) {
    bilgi = sayfaBilgisi();
    if (bilgi && bilgi.bit >= bilgi.toplam) {
      console.log(`Son sayfa: ${bilgi.bas}-${bilgi.bit}/${bilgi.toplam}`); break;
    }
    const btn = ileriBtn();
    if (!btn || btn.disabled) { console.log("İleri buton yok/disabled"); break; }
    const onceki = satirlar.length;
    await wait(1200);  // GIB rate limit: istekler arası min 1 sn
    btn.click();
    // Yeni sayfa yüklenmesini akıllı bekle
    let yuklendi = false;
    for (let bekle = 0; bekle < 30; bekle++) {
      await wait(600);
      topla();
      const yeniBilgi = sayfaBilgisi();
      if (satirlar.length > onceki || (yeniBilgi && bilgi && yeniBilgi.bas > bilgi.bas)) {
        yuklendi = true; break;
      }
    }
    if (!yuklendi) { console.log("Sayfa yüklenmedi, dur"); break; }
    bilgi = sayfaBilgisi();
    console.log(`Sayfa ${sayfa++}: toplam ${satirlar.length} satır`, bilgi);
    if (sayfa > 100) { console.log("Max sayfa limiti"); break; }  // güvenlik
  }

  const basliklar = ['Ad_Soyad','VK_No','Beyanname_Turu','Vergi_Dairesi',
    'Vergilendirme_Donemi','Sube_No','Yukleme_Zamani','Durum','SGK_Durum',
    'BynOID','ThkOID','IhbOID','Klasor'];
  const csv = [basliklar, ...satirlar]
    .map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';'))
    .join('\r\n');
  console.log(`✅ Toplam ${satirlar.length} satır`);
  return csv;
})();
