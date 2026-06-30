"""
Eksik PDF tespiti: CSV'yi tara, hedef klasörde BYN+THK varsa atla,
sadece eksik satırları içeren yeni CSV üret.

Kullanım:
  python eksik_filtrele.py uretilen_kdv1_202508.csv \
      --cikti "C:/Users/omery/OneDrive/Desktop/EBYN_TEST"
"""
import csv, sys, argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from indir import (
    hedef_klasor_bul, temiz_isim, klasor_bul, mukellef_listesi_yukle,
)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--cikti", default="")
    ap.add_argument("--cikti-csv", default=None)
    args = ap.parse_args()

    base = Path(__file__).parent
    src = Path(args.csv)
    if not src.is_absolute():
        src = base / src
    if not src.exists():
        print(f"[HATA] CSV bulunamadı: {src}")
        sys.exit(1)

    out = Path(args.cikti_csv) if args.cikti_csv else src.with_name(f"eksik_{src.name.replace('uretilen_','')}")

    taner_set, omer_set = mukellef_listesi_yukle(base)
    print(f"  Mükellef listesi: {len(taner_set)} TANER, {len(omer_set)} ÖMER")

    with open(src, encoding="utf-8-sig") as f:
        rdr = list(csv.DictReader(f, delimiter=";"))

    eksik = []
    tam, atlandi, listede_yok, ihb_atlandi = 0, 0, 0, 0
    for i, row in enumerate(rdr, 1):
        ad = row.get("Ad_Soyad", "").strip()
        tur = row.get("Beyanname_Turu", "").strip()
        donem = row.get("Vergilendirme_Donemi", "").strip()
        ihb = (row.get("IhbOID", "") or "").strip().upper()
        if ihb in ("VAR", "YES", "1"):
            ihb_atlandi += 1
            continue

        sahip = klasor_bul(ad, taner_set, omer_set)
        if not sahip:
            listede_yok += 1
            continue

        hedef = hedef_klasor_bul(tur, sahip, donem, src.name, args.cikti or "")
        isim = temiz_isim(ad)
        byn = hedef / f"{isim} BYN.pdf"
        thk = hedef / f"{isim} THK.pdf"

        eksik_byn = not byn.exists()
        eksik_thk = not thk.exists()
        if not eksik_byn and not eksik_thk:
            tam += 1
        else:
            eksik.append(row)
            etiket = []
            if eksik_byn: etiket.append("BYN")
            if eksik_thk: etiket.append("THK")
            atlandi += 1

    print(f"\n  Toplam satır     : {len(rdr)}")
    print(f"  Zaten tam (atla) : {tam}")
    print(f"  Eksik (yazılacak): {len(eksik)}")
    print(f"  Listede yok      : {listede_yok}")
    print(f"  İHB atlandı      : {ihb_atlandi}")

    if not eksik:
        print(f"\n[i] Eksik yok — yeni CSV yazılmadı.")
        return

    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rdr[0].keys(), delimiter=";", quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(eksik)
    print(f"\n[OK] Eksikler yazıldı: {out.name}")

if __name__ == "__main__":
    main()
