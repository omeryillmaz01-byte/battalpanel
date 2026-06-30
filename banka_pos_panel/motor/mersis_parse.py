# -*- coding: utf-8 -*-
"""
MERSİS "Firma Sorgu" sayfasının HTML'ini (veya kopyalanan metnini) okuyup
firma künye bilgisini çıkarır ve doğru firma klasörüne kaydeder.

Kullanıcı MERSİS'te firmayı arar (captcha'yı kendisi çözer), sonuç sayfasını
kopyalar; panel bu metni buraya verir, biz okuyup kaydederiz.

Fonksiyonlar:
    parse(html) -> dict           # firma bilgilerini sözlük olarak çıkarır
    vkn_kod_haritasi() -> dict     # {vkn: firma_kodu}
    html_kaydet(html) -> (kod, bilgi, durum)
"""
from __future__ import annotations
import re, html as _html
try:  # paket olarak (panelden) ya da doğrudan (motor/ içinden) çalışabilsin
    from firma_bilgi import bilgi_kaydet, bilgi_oku, tum_bilgiler, ozet_excel_yaz
except ImportError:
    from motor.firma_bilgi import bilgi_kaydet, bilgi_oku, tum_bilgiler, ozet_excel_yaz


def _temizle(s: str) -> str:
    """HTML etiketlerini at, &amp; gibi kaçışları çöz, boşlukları sadeleştir."""
    s = re.sub(r"<[^>]+>", " ", s)
    s = _html.unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _alan(region: str, etiket: str) -> str:
    """Verilen etiket metnine ait <label>...</label><br> VALUE </div> değerini döndürür."""
    kal = re.search(
        r'for="[^"]*">\s*' + re.escape(etiket) + r'\s*</label>\s*<br\s*/?>(.*?)</div>',
        region, re.DOTALL | re.IGNORECASE)
    if not kal:
        # bazı sürümlerde for="" olmayabilir
        kal = re.search(
            r'>\s*' + re.escape(etiket) + r'\s*</label>\s*<br\s*/?>(.*?)</div>',
            region, re.DOTALL | re.IGNORECASE)
    return _temizle(kal.group(1)) if kal else ""


# Etiket -> alan eşlemesi (hem HTML hem düz metin için)
_ETIKETLER = [
    ("Unvan", "unvan"),
    ("Kuruluş Tarihi", "kurulus_tarihi"),
    ("Firma Durumu", "_durum"),
    ("MERSİS No", "mersis_no"),
    ("Vergi Dairesi / No", "_vergi"),
    ("Ticaret Sicil No / Dosya No", "ticaret_sicil_no"),
    ("Firma Türü", "_firma_turu"),
    ("Ticaret Sicili Müdürlüğü", "_tsm"),
    ("Şehir", "il_ilce"),
    ("Toplam Sermaye", "sermaye"),
    ("Firma Adres Bilgisi", "adres"),
    ("Elektronik Tebligat Adresi", "kep_adresi"),
]
_SINIR = ("Yönetim Kurulu", "Yetkili Bilgileri", "Ticari Temsilci", "Konkordato",
          "İç Yönerge", "Firma Bilgileri", "Sınırlı Yetkili", "Kısıtlama")


def parse(text: str) -> dict:
    """MERSİS firma sorgu HTML'i VEYA kopyalanmış düz metninden künye çıkarır."""
    if 'id="divFirmaDetay"' in text or "<label" in text or "</div>" in text:
        return _parse_html(text)
    return _parse_metin(text)


def _toparla(out: dict) -> dict:
    """Ham alanları (_durum, _vergi...) nihai künye sözlüğüne dönüştürür."""
    son: dict = {}
    for k in ("unvan", "kurulus_tarihi", "mersis_no", "ticaret_sicil_no",
              "sermaye", "adres", "kep_adresi", "il_ilce"):
        if out.get(k):
            son[k] = out[k]
    vd = out.get("_vergi", "")
    if vd:
        if "/" in vd:
            daire, vkn = vd.rsplit("/", 1)
            son["vergi_dairesi"] = daire.strip()
            son["vkn"] = re.sub(r"\D", "", vkn)
        else:
            son["vergi_dairesi"] = vd.strip()
    if out.get("ortaklar"):
        son["ortaklar"] = out["ortaklar"]
    notlar = []
    if out.get("_firma_turu"):
        notlar.append(f"Firma Türü: {out['_firma_turu']}")
    if out.get("_tsm"):
        notlar.append(f"TSM: {out['_tsm']}")
    if out.get("_durum"):
        notlar.append(f"Durum: {out['_durum']}")
    if notlar:
        son["notlar"] = " | ".join(notlar)
    return {k: v for k, v in son.items() if v not in (None, "", [], {})}


def _parse_metin(text: str) -> dict:
    """Ctrl+A/Ctrl+C ile kopyalanan düz sayfa metnini okur (etiket satırı + alt satır = değer)."""
    satirlar = [s.strip() for s in text.splitlines() if s.strip()]
    # 'Firma Bilgileri' başlığından sonrasına odaklan (arama formuyla karışmasın)
    bas = 0
    for i, s in enumerate(satirlar):
        if s == "Firma Bilgileri":
            bas = i + 1
            break
    satirlar = satirlar[bas:]
    etiket_map = {e: a for e, a in _ETIKETLER}
    # etiket konumlarını bul
    konum = []  # (index, alan)
    for i, s in enumerate(satirlar):
        if s in etiket_map:
            konum.append((i, etiket_map[s]))
    out: dict = {}
    for j, (i, alan) in enumerate(konum):
        son_i = konum[j + 1][0] if j + 1 < len(konum) else len(satirlar)
        deger_satir = []
        for k in range(i + 1, min(son_i, i + 6)):
            s = satirlar[k]
            if any(b in s for b in _SINIR):
                break
            deger_satir.append(s)
        out[alan] = " ".join(deger_satir).strip()
    return _toparla(out)


def _parse_html(html: str) -> dict:
    """MERSİS firma sorgu HTML'inden künye bilgilerini çıkarır."""
    # Firma detay bölgesine odaklan (arama formundaki 'Unvan' ile karışmasın)
    i = html.find('id="divFirmaDetay"')
    region = html[i:] if i != -1 else html

    out: dict = {}
    out["unvan"] = _alan(region, "Unvan")
    out["kurulus_tarihi"] = _alan(region, "Kuruluş Tarihi")
    durum = _alan(region, "Firma Durumu")
    out["mersis_no"] = _alan(region, "MERSİS No")
    vd = _alan(region, "Vergi Dairesi / No")
    if vd:
        if "/" in vd:
            daire, vkn = vd.rsplit("/", 1)
            out["vergi_dairesi"] = daire.strip()
            out["vkn"] = re.sub(r"\D", "", vkn)
        else:
            out["vergi_dairesi"] = vd.strip()
    out["ticaret_sicil_no"] = _alan(region, "Ticaret Sicil No / Dosya No")
    firma_turu = _alan(region, "Firma Türü")
    tsm = _alan(region, "Ticaret Sicili Müdürlüğü")
    sehir = _alan(region, "Şehir")
    out["sermaye"] = _alan(region, "Toplam Sermaye")
    out["adres"] = _alan(region, "Firma Adres Bilgisi")
    out["kep_adresi"] = _alan(region, "Elektronik Tebligat Adresi")
    if sehir:
        out["il_ilce"] = sehir

    # ortaklar / yönetim kurulu (genişletilmişse gelir)
    out["ortaklar"] = _ortaklar_cikar(html)

    # not alanı: tür / müdürlük / durum
    notlar = []
    if firma_turu:
        notlar.append(f"Firma Türü: {firma_turu}")
    if tsm:
        notlar.append(f"TSM: {tsm}")
    if durum:
        notlar.append(f"Durum: {durum}")
    if notlar:
        out["notlar"] = " | ".join(notlar)

    # boşları at
    return {k: v for k, v in out.items() if v not in (None, "", [], {})}


def _ortaklar_cikar(html: str) -> list:
    """Yönetim Kurulu / Ortak bilgileri tablosundan ad-pay çıkarmaya çalışır (varsa)."""
    ort = []
    i = html.find('divYonetimKuruluYetkiliBilgileri')
    if i == -1:
        return ort
    bolge = html[i:i + 8000]
    # tablodaki satır hücrelerini topla
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", bolge, re.DOTALL):
        hucreler = [_temizle(td) for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.DOTALL)]
        hucreler = [h for h in hucreler if h]
        if hucreler and any(len(h) > 4 for h in hucreler):
            ad = hucreler[0]
            if ad and ad.upper() not in ("ADI SOYADI", "UNVAN", "AD SOYAD"):
                kayit = {"ad": ad}
                ort.append(kayit)
    return ort[:20]


def vkn_kod_haritasi() -> dict:
    """{vkn: firma_kodu} — mevcut künye kayıtlarından."""
    h = {}
    for kod, b in tum_bilgiler().items():
        v = (b.get("vkn") or "").strip()
        if v:
            h[v] = kod
    return h


def _unvan_kod_bul(unvan: str) -> str | None:
    """VKN tutmazsa ünvanın baş kelimesiyle firma klasörü bulmaya çalışır."""
    if not unvan:
        return None
    bas = re.sub(r"[^A-Za-zÇĞİÖŞÜçğıöşü0-9 ]", "", unvan).upper().split()
    bas = [w for w in bas if len(w) > 1][:2]
    if not bas:
        return None
    for kod, b in tum_bilgiler().items():
        u = (b.get("unvan") or kod).upper()
        if all(w in u for w in bas):
            return kod
    return None


def html_kaydet(html: str):
    """HTML'i okur, VKN ile firmayı bulur, kaydeder. (kod, bilgi, durum_mesaji) döner."""
    bilgi = parse(html)
    if not bilgi.get("unvan") and not bilgi.get("vkn"):
        return None, bilgi, "OKUNAMADI: Firma Bilgileri bulunamadı. Tüm sayfayı kopyaladığından emin ol."

    vkn = bilgi.get("vkn", "")
    kod = vkn_kod_haritasi().get(vkn) or _unvan_kod_bul(bilgi.get("unvan", ""))
    if not kod:
        return None, bilgi, (f"FİRMA EŞLEŞMEDİ: VKN {vkn or '?'} / {bilgi.get('unvan','?')} "
                             "panelde kayıtlı değil. Önce firma klasörü açılmalı.")

    bilgi_kaydet(kod, bilgi)
    ozet_excel_yaz()
    return kod, bilgi, "OK"


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        from pathlib import Path
        kod, bilgi, durum = html_kaydet(Path(sys.argv[1]).read_text(encoding="utf-8"))
        print("DURUM:", durum)
        print("KOD  :", kod)
        for k, v in bilgi.items():
            print(f"  {k}: {v}")
    else:
        print("Kullanım: python mersis_parse.py <html_dosyasi>")
