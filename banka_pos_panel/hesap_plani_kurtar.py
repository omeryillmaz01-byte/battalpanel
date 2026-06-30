# -*- coding: utf-8 -*-
"""
HESAP PLANI KURTARMA — sadece 06_hesap_plani.xlsx üretir.

OneDrive'dan HESAP PLANLARI klasörünü geri yükledikten sonra bu scripti çalıştır.
Diğer 5 dosyaya (01-05, manuel düzenlemeler) DOKUNMAZ — sadece tam hesap planını
kalıcı olarak 06_hesap_plani.xlsx'e yazar. Motor 780/335/770/193/642/679 alt
hesabını oradan okur (ezbere değil).

Kullanım:
  python hesap_plani_kurtar.py
  python hesap_plani_kurtar.py "C:/Users/omery/OneDrive/Desktop/HESAP PLANLARI"
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motor.firma_kur import _hesap_planini_oku, tam_hesap_plani_kaydet, FIRMA_DIZIN
from toplu_hesap_plani_kur import DOSYA_KOD, KAYNAK


def main():
    kaynak = Path(sys.argv[1]) if len(sys.argv) > 1 else KAYNAK
    if not kaynak.exists():
        print(f"HATA: Kaynak klasör yok: {kaynak}")
        print("OneDrive Geri Dönüşüm Kutusu'ndan HESAP PLANLARI'yı geri yükle,")
        print("sonra bu scripti tekrar çalıştır.")
        return
    dosyalar = sorted(list(kaynak.glob("*.xlsx")) + list(kaynak.glob("*.xls")))
    print(f"{len(dosyalar)} hesap planı dosyası bulundu: {kaynak}\n")
    ok = 0
    bilinmeyen = []
    for yol in dosyalar:
        ad_kucuk = yol.stem.lower().strip()
        firma_kodu = DOSYA_KOD.get(ad_kucuk)
        if not firma_kodu:
            # gevşek eşleştirme: dosya adı firma kodunu içeriyor mu
            for k, v in DOSYA_KOD.items():
                if k in ad_kucuk or ad_kucuk in k:
                    firma_kodu = v
                    break
        if not firma_kodu:
            bilinmeyen.append(yol.name)
            continue
        firma_dizini = FIRMA_DIZIN / firma_kodu
        if not firma_dizini.exists():
            bilinmeyen.append(f"{yol.name} (firma klasörü yok: {firma_kodu})")
            continue
        try:
            satirlar = _hesap_planini_oku(yol)
            n = tam_hesap_plani_kaydet(satirlar, firma_dizini / "06_hesap_plani.xlsx")
            print(f"  ✓ {firma_kodu:25s} ← {yol.name}  ({n} hesap)")
            ok += 1
        except Exception as e:
            print(f"  ✗ {firma_kodu:25s} HATA: {e}")
    print(f"\n{ok} firmanın tam hesap planı kaydedildi (06_hesap_plani.xlsx).")
    if bilinmeyen:
        print(f"\n⚠ Eşleşmeyen {len(bilinmeyen)} dosya:")
        for b in bilinmeyen:
            print(f"    {b}")


if __name__ == "__main__":
    main()
