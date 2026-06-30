# -*- coding: utf-8 -*-
"""
MERSİS künye kaydedici — _mersis_input.json dosyasındaki firma bilgisini
ilgili firma klasörüne kaydeder ve özet Excel'i yeniler.

Kullanım:
    python mersis_kaydet.py            # _mersis_input.json okur
    python mersis_kaydet.py baska.json
"""
import sys, json
from pathlib import Path
from firma_bilgi import bilgi_kaydet, ozet_excel_yaz, bilgi_oku

def main():
    girdi = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "_mersis_input.json"
    veri = json.loads(girdi.read_text(encoding="utf-8"))
    # tek firma da, liste de kabul et
    kayitlar = veri if isinstance(veri, list) else [veri]
    for k in kayitlar:
        kod = k.pop("_firma_kodu")
        bilgi_kaydet(kod, k)
        b = bilgi_oku(kod)
        print(f"KAYDEDILDI: {kod}  |  {b.get('unvan','')}  |  VKN {b.get('vkn','')}  |  sermaye {b.get('sermaye','')}")
    yol = ozet_excel_yaz()
    print(f"OZET GUNCELLENDI: {yol}")

if __name__ == "__main__":
    main()
