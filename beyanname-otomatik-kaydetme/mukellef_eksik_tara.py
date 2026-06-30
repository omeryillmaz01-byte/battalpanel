"""
Mükellef listesinden hangi firmaların hangi aylarda PDF'i var/yok kontrol et.
Çıktı: her firma için tüm aylar matrisi (✓ var, ✗ yok).

Kullanım:
  python mukellef_eksik_tara.py --tur KDV1 --yil 2025 \
      --cikti "C:/Users/omery/OneDrive/Desktop/EBYN_TEST"
"""
import sys, argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from indir import mukellef_listesi_yukle, temiz_isim, KDV_AY

AYLAR_KISA = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tur", default="KDV1")
    ap.add_argument("--yil", default="2025")
    ap.add_argument("--cikti", required=True)
    args = ap.parse_args()

    base = Path(__file__).parent
    taner_set, omer_set = mukellef_listesi_yukle(base)

    cikti = Path(args.cikti)
    sonuc = {"TANER": {}, "OMER": {}}

    for sahip_kisa, mukellef_set in [("TANER", taner_set), ("OMER", omer_set)]:
        for ad in sorted(mukellef_set):
            isim = temiz_isim(ad)
            satir = []
            for ay_num in range(1, 13):
                ay_str = f"{ay_num:02d}"
                ay_klas = KDV_AY[ay_str]
                hedef = cikti / sahip_kisa / args.tur / f"{args.yil} YILI" / ay_klas
                byn = hedef / f"{isim} BYN.pdf"
                thk = hedef / f"{isim} THK.pdf"
                if byn.exists() and thk.exists():
                    satir.append("✓")
                elif byn.exists() or thk.exists():
                    satir.append("Y")  # yarım
                else:
                    satir.append("·")
            sonuc[sahip_kisa][isim] = satir

    # Yazdır
    for sahip_kisa in ["TANER", "OMER"]:
        print(f"\n{'='*100}")
        print(f"  {sahip_kisa} — {args.tur} {args.yil}  (✓ tam, Y yarım, · yok)")
        print(f"{'='*100}")
        baslik = "  " + " ".join(f"{a:>3}" for a in AYLAR_KISA[:8])
        print(f"  {'Firma':<48}" + baslik)
        # Eksik olanları öne, tam olanları sona
        sirali = sorted(sonuc[sahip_kisa].items(),
                       key=lambda kv: (kv[1][:8].count("✓"), kv[0]))
        for isim, satir in sirali:
            eksik_sayi = 8 - satir[:8].count("✓") - satir[:8].count("·")  # yarımları say
            yok_sayi = satir[:8].count("·")
            if satir[:8].count("✓") == 8: continue  # tamamen tam → atla
            satir_str = "  " + " ".join(f"{c:>3}" for c in satir[:8])
            print(f"  {isim:<48}{satir_str}")

    # Özet
    for sahip_kisa in ["TANER", "OMER"]:
        toplam = len(sonuc[sahip_kisa])
        tam = sum(1 for s in sonuc[sahip_kisa].values() if s[:8].count("✓") == 8)
        print(f"\n  {sahip_kisa}: {tam}/{toplam} firma 8 ayı da tam.")

if __name__ == "__main__":
    main()
