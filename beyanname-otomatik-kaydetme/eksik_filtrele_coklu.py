"""
Birden fazla CSV'yi tara, hepsinden eksikleri topla, BynOID'ye göre dedupe et,
tek bir birleşik eksik CSV üret.

Kullanım:
  python eksik_filtrele_coklu.py --cikti "C:/Users/omery/OneDrive/Desktop/EBYN_TEST" \
      --cikti-csv eksik_kdv1_TUM.csv uretilen_kdv1_*.csv
"""
import csv, sys, argparse, glob
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from indir import (
    hedef_klasor_bul, temiz_isim, klasor_bul, mukellef_listesi_yukle,
)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_pattern", nargs="+")
    ap.add_argument("--cikti", default="")
    ap.add_argument("--cikti-csv", required=True)
    args = ap.parse_args()

    base = Path(__file__).parent
    csv_yollari = []
    for pat in args.csv_pattern:
        matches = glob.glob(pat) if any(c in pat for c in "*?[") else [pat]
        for m in matches:
            p = Path(m)
            if not p.is_absolute(): p = base / p
            if p.exists(): csv_yollari.append(p)

    if not csv_yollari:
        print("[HATA] hiç CSV bulunamadı"); sys.exit(1)

    print(f"  Taranan CSV: {len(csv_yollari)} adet")
    for p in csv_yollari: print(f"    - {p.name}")

    taner_set, omer_set = mukellef_listesi_yukle(base)

    tum_satirlar = []
    fieldnames = None
    for p in csv_yollari:
        with open(p, encoding="utf-8-sig") as f:
            rdr = list(csv.DictReader(f, delimiter=";"))
            if rdr:
                if fieldnames is None: fieldnames = list(rdr[0].keys())
                for r in rdr:
                    r["_kaynak_csv"] = p.name
                    tum_satirlar.append(r)

    print(f"\n  Toplam (dedupe öncesi): {len(tum_satirlar)} satır")

    gorulen = set()
    benzersiz = []
    for r in tum_satirlar:
        key = (r.get("BynOID","").strip(), r.get("ThkOID","").strip())
        if key in gorulen or not any(key): continue
        gorulen.add(key)
        benzersiz.append(r)
    print(f"  Dedupe sonrası        : {len(benzersiz)} satır")

    eksik = []
    tam, listede_yok, ihb_atlandi = 0, 0, 0
    listede_yok_isimleri = []
    ihb_isimleri = []
    for r in benzersiz:
        ad = r.get("Ad_Soyad","").strip()
        tur = r.get("Beyanname_Turu","").strip()
        donem = r.get("Vergilendirme_Donemi","").strip()
        ihb = (r.get("IhbOID","") or "").strip().upper()
        kaynak = r.get("_kaynak_csv","")
        if ihb in ("VAR","YES","1"):
            ihb_atlandi += 1
            ihb_isimleri.append(f"  - {ad}  ({donem})")
            continue
        sahip = klasor_bul(ad, taner_set, omer_set)
        if not sahip:
            listede_yok += 1
            listede_yok_isimleri.append(f"  - {ad}  ({r.get('VK_No','')}, {donem})")
            continue
        hedef = hedef_klasor_bul(tur, sahip, donem, kaynak, args.cikti or "")
        isim = temiz_isim(ad)
        byn = hedef / f"{isim} BYN.pdf"
        thk = hedef / f"{isim} THK.pdf"
        if byn.exists() and thk.exists():
            tam += 1
        else:
            eksik.append(r)

    print(f"\n  Zaten tam        : {tam}")
    print(f"  Eksik            : {len(eksik)}")
    print(f"  Listede yok      : {listede_yok}")
    print(f"  İHB atlandı      : {ihb_atlandi}")

    if listede_yok_isimleri:
        # Aynı firma birden fazla kez gözükebilir — benzersizleştir
        benzersiz_lyok = sorted(set(
            l.split("  (")[0].strip() for l in listede_yok_isimleri
        ))
        print(f"\n  Mükellef listesinde olmayan firmalar:")
        for ad in benzersiz_lyok: print(f"    - {ad.lstrip('- ').strip()}")

    if ihb_isimleri:
        print(f"\n  İHB nedeniyle atlananlar (manuel inceleyin):")
        for s in ihb_isimleri: print(s)

    if not eksik:
        print("\n[i] Eksik yok."); return

    out = Path(args.cikti_csv)
    if not out.is_absolute(): out = base / out
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";", quoting=csv.QUOTE_ALL)
        w.writeheader()
        for r in eksik:
            w.writerow({k: r.get(k,"") for k in fieldnames})
    print(f"\n[OK] {out.name} yazıldı ({len(eksik)} satır)")

if __name__ == "__main__":
    main()
