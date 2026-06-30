# -*- coding: utf-8 -*-
"""
MAYIS (veya herhangi bir ay) BANKALARINI DÜZELTİLMİŞ MOTORLA BAŞTAN İŞLE
- Hesap planlarından (06) doğru ALT hesapları okur
- Firma içi virman mutabakatı yapar
- Aynı kodları ALT ALTA gruplar (hesap koduna göre sıralı)
- Kontrol gereken satırları _KONTROL_RAPORU.xlsx'e yazar

Kullanım:
  python mayis_yeniden_isle.py                       # varsayılan mayıs klasörü
  python mayis_yeniden_isle.py "<girdi_klasoru>" "<cikti_klasoru>"
"""
from __future__ import annotations
import sys, os, re
from pathlib import Path
from collections import defaultdict, Counter
BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))
import openpyxl
from motor.parser import dosya_parse
from motor.eslestirici import Eslestirici, firma_yukle
from motor.cikti_yazici import mikro_excel_yaz
from motor.coklu_mutabakat import EkstreKaydi, virman_mutabakat, mukerrer_ayikla, bos_kodlari_999_yap
from dagit_ve_isle import _global_index, FIRMA_ADLARI

DESK = Path.home() / "OneDrive" / "Desktop"


def norm(s):
    s = (s or "").upper()
    for a, b in [("İ", "I"), ("Ş", "S"), ("Ğ", "G"), ("Ü", "U"), ("Ö", "O"), ("Ç", "C")]:
        s = s.replace(a, b)
    return re.sub(r"[^A-Z0-9 ]", " ", s)


AD2KOD = sorted(((norm(v), k) for k, v in FIRMA_ADLARI.items()), key=lambda x: -len(x[0]))


def isle(girdi: Path, cikti: Path):
    cikti.mkdir(parents=True, exist_ok=True)
    iban_idx, no_idx = _global_index()
    firma_dosyalari = defaultdict(list)
    atlanan = []
    for p in sorted(girdi.iterdir()):
        if p.suffix.lower() != ".xlsx" or p.name.startswith("~$"):
            continue
        s = dosya_parse(p)
        if not s.hareketler:
            atlanan.append((p.name, "boş")); continue
        pars = re.findall(r"\(([^)]+)\)", p.name)
        acc = re.sub(r"\D", "", pars[-1]).lstrip("0") if pars else ""
        firma = kod = ad = no = None
        if acc and acc in no_idx and len({e[0] for e in no_idx[acc]}) == 1:
            firma, kod, ad, no = no_idx[acc][0]
        elif "FON" in p.name.upper():
            nm = norm(p.name)
            for an, fk in AD2KOD:
                if an and an in nm:
                    t = firma_yukle(fk)
                    fb = next((b for b in t.bankalar if "FON" in b.hesap_adi.upper()), None)
                    if fb:
                        firma, kod, ad, no = fk, fb.hesap_kodu, fb.hesap_adi, fb.hesap_no
                    break
        if not firma and acc and len(acc) >= 5:
            al = []
            for an, ks in no_idx.items():
                if an.endswith(acc) or acc.endswith(an):
                    al += ks
            if al and len({a[0] for a in al}) == 1:
                firma, kod, ad, no = al[0]
        if not firma:
            atlanan.append((p.name, f"firma çözülemedi (acc={acc})")); continue
        firma_dosyalari[firma].append((p, s, kod, ad, no))

    rapor = []
    toplam = 0
    for firma, kayitlar in sorted(firma_dosyalari.items()):
        es0 = Eslestirici(firma, None); tablolar = es0.tablolar
        try:
            cariler = firma_yukle(firma).cariler
        except Exception:
            cariler = None
        ekstreler = []
        for yol, s, kod, ad, no in kayitlar:
            ek = EkstreKaydi(kod, s.hesap_no, Eslestirici(firma, kod).toplu(s.hareketler))
            ekstreler.append((yol, s, kod, ad, no, ek))
        virman_mutabakat([e[5] for e in ekstreler])
        for e in ekstreler:
            bos_kodlari_999_yap(e[5].eslesmeler)
        for yol, s, kod, ad, no, ek in ekstreler:
            esl = ek.eslesmeler
            if firma == "STS_SAGLIK":
                esl = [x for x in esl if "tah" not in x.hareket.aciklama.lower().split()]
            temiz = mukerrer_ayikla(esl)
            # AYNI KODLAR ALT ALTA: hesap koduna göre, içinde tarihe göre
            temiz = sorted(temiz, key=lambda e: (str(e.hesap_kodu or "zzz"), str(e.hareket.tarih)))
            try:
                mikro_excel_yaz(temiz, cikti / yol.name, firma=FIRMA_ADLARI.get(firma, firma),
                                banka=f"{s.banka_adi} ({no})", hesap_kodu=kod,
                                acilis=s.acilis, kapanis=s.kapanis, cariler=cariler,
                                doviz=getattr(s, "doviz", ""))
            except PermissionError:
                atlanan.append((yol.name, "DOSYA AÇIK (Excel'de) — kapat, tekrar çalıştır"))
                continue
            toplam += 1
            for e in temiz:
                kt = str(e.hesap_kodu or "").strip()
                if kt in ("", "999") or (e.guven or 0) < 80 or e.kaynak == "MANUEL":
                    rapor.append((FIRMA_ADLARI.get(firma, firma), yol.name[:38], kt or "(boş)",
                                  e.hesap_adi[:28], f"{e.hareket.tutar:.2f}", e.hareket.aciklama[:46],
                                  e.guven or 0, e.kaynak))

    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "KONTROL GEREKEN"
    ws.append(["FİRMA", "DOSYA", "HESAP KODU", "HESAP ADI", "TUTAR", "AÇIKLAMA", "GÜVEN", "KAYNAK"])
    for r in rapor:
        ws.append(list(r))
    for col, w in zip("ABCDEFGH", [16, 34, 14, 28, 12, 46, 8, 10]):
        ws.column_dimensions[col].width = w
    wb.save(cikti / "_KONTROL_RAPORU.xlsx")
    print(f"✅ {toplam} dosya DÜZELTİLDİ + KOD'A GÖRE GRUPLANDI → {cikti.name}")
    print(f"📋 Kontrol gereken: {len(rapor)} satır → _KONTROL_RAPORU.xlsx")
    if atlanan:
        print(f"⚠ Atlanan {len(atlanan)}: " + ", ".join(n[:28] for n, _ in atlanan))
    return toplam, len(rapor)


def main():
    # Klasör masaüstünde ya da PANELLER/IS_VERILERI içinde olabilir — adayları sırayla dene
    adaylar = [
        DESK / "📂 PANELLER" / "IS_VERILERI" / "Mayıs Ayı Banka Hareketleri",
        DESK / "📂 IS_VERILERI" / "Mayıs Ayı Banka Hareketleri",
        DESK / "IS_VERILERI" / "Mayıs Ayı Banka Hareketleri",
    ]
    if len(sys.argv) > 1:
        girdi = Path(sys.argv[1])
    else:
        girdi = next((p for p in adaylar if p.exists()), adaylar[0])
    cikti = Path(sys.argv[2]) if len(sys.argv) > 2 else girdi.parent / "Mayıs Ayı Banka Hareketleri - DÜZELTİLMİŞ"
    if not girdi.exists():
        print(f"HATA: girdi klasörü yok: {girdi}"); return
    print(f"Girdi: {girdi}")
    isle(girdi, cikti)
    try:
        os.startfile(str(cikti))
    except Exception:
        pass


if __name__ == "__main__":
    main()
