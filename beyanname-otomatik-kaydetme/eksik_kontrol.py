import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

from indir import (
    csv_listesi_bul,
    hedef_klasor_bul,
    klasor_bul,
    mukellef_listesi_yukle,
    temiz_isim,
)


BASE = Path(__file__).parent


def _norm(s):
    return re.sub(r"[\s\.\-\(\),/]", "", str(s or "").upper())


def csvleri_bul(csv_filter_list=None):
    dosyalar = [Path(p) for p in csv_listesi_bul(BASE)]
    if not csv_filter_list:
        return dosyalar

    hedefler = {_norm(v) for v in csv_filter_list}
    return [p for p in dosyalar if _norm(p.name) in hedefler]


def tur_normalize(tur):
    return str(tur or "").strip().upper()


def dosya_say(klasor, isim, tip):
    if not klasor.exists():
        return 0
    pat = re.compile(rf"^{re.escape(isim)}(?: DÜZ(?: \d+)?)? {tip}\.pdf$", re.IGNORECASE)
    return sum(1 for p in klasor.glob(f"{isim}* {tip}.pdf") if pat.match(p.name))


def main():
    args = sys.argv[1:]
    csv_filter_list = []
    for idx, arg in enumerate(args):
        if arg == "--csv" and idx + 1 < len(args):
            csv_filter_list.append(args[idx + 1])

    taner_set, omer_set = mukellef_listesi_yukle(BASE)
    gruplar = defaultdict(lambda: {"beklenen": 0, "csvler": set()})

    csv_dosyalari = csvleri_bul(csv_filter_list)
    for csv_yolu in csv_dosyalari:
        with open(csv_yolu, encoding="utf-8-sig") as f:
            for row in csv.DictReader(f, delimiter=";"):
                row = {(str(k).lstrip("\ufeff").strip() if k is not None else ""): v for k, v in row.items()}
                ad = (row.get("Ad_Soyad") or "").strip()
                tur = tur_normalize(row.get("Beyanname_Turu"))
                donem = (row.get("Vergilendirme_Donemi") or "").strip()
                ihb = str(row.get("IhbOID") or "").strip().upper()
                if not ad or not tur or not donem:
                    continue
                if ihb in ("VAR", "YES", "1"):
                    continue

                sahip = klasor_bul(ad, taner_set, omer_set)
                if csv_yolu.name.lower() == "tcc kurumlar 2026.csv":
                    sahip = "TANER BATTAL"
                if not sahip:
                    continue

                klasor = hedef_klasor_bul(tur, sahip, donem, csv_yolu.name)
                isim = temiz_isim(ad)
                key = (tur, sahip, str(klasor), isim)
                gruplar[key]["beklenen"] += 1
                gruplar[key]["csvler"].add(csv_yolu.name)

    eksikler = []
    for (tur, sahip, klasor_str, isim), veri in sorted(gruplar.items()):
        klasor = Path(klasor_str)
        beklenen = veri["beklenen"]
        byn_var = dosya_say(klasor, isim, "BYN")
        thk_var = dosya_say(klasor, isim, "THK")
        eksik_byn = max(0, beklenen - byn_var)
        eksik_thk = max(0, beklenen - thk_var)
        if eksik_byn or eksik_thk:
            eksikler.append({
                "Tur": tur,
                "Sahip": sahip,
                "Klasor": klasor_str,
                "Isim": isim,
                "Beklenen": beklenen,
                "Var_BYN": byn_var,
                "Var_THK": thk_var,
                "Eksik_BYN": eksik_byn,
                "Eksik_THK": eksik_thk,
                "CSV": ", ".join(sorted(veri["csvler"])),
            })

    rapor_adi = "eksik_kontrol_raporu.csv" if not csv_filter_list else "eksik_kontrol_secili_raporu.csv"
    cikis = BASE / rapor_adi
    with open(cikis, "w", newline="", encoding="utf-8-sig") as f:
        alanlar = ["Tur", "Sahip", "Klasor", "Isim", "Beklenen", "Var_BYN", "Var_THK", "Eksik_BYN", "Eksik_THK", "CSV"]
        writer = csv.DictWriter(f, fieldnames=alanlar, delimiter=";")
        writer.writeheader()
        writer.writerows(eksikler)

    print(f"Kontrol tamamlandı. Eksik kayıt sayısı: {len(eksikler)}")
    print(f"Rapor: {cikis}")


if __name__ == "__main__":
    main()
