import csv
import re
from pathlib import Path


BASE = Path(__file__).parent
KAYNAK = next(BASE.glob("*kurumlar*.csv"))
CIKIS = BASE / "2024_kurumlar_secili_tekrar.csv"

HEDEFLER = [
    "GÖKHAN ÇELİKKAYA",
    "FATİH YILMAZ",
    "NURİ HACIKERİMOĞLU",
    "RAFET EFE ERDOĞDU",
    "RAFET DAL",
    "GİZEM TAŞTEKNE",
]

TR = str.maketrans("ÇĞİÖŞÜçğıöşü", "CGIOSUcgiosu")


def norm(s):
    return re.sub(r"[^A-Z0-9]", "", str(s or "").upper().translate(TR))


def main():
    hedefler = {norm(v) for v in HEDEFLER}
    with open(KAYNAK, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f, delimiter=";"))

    secili = [r for r in rows if norm(r.get("Ad_Soyad")) in hedefler]
    alanlar = rows[0].keys() if rows else []

    with open(CIKIS, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=alanlar, delimiter=";")
        w.writeheader()
        w.writerows(secili)

    print(f"Kaynak: {KAYNAK.name}")
    print(f"Seçilen kayıt: {len(secili)}")
    print(f"Çıkış: {CIKIS}")


if __name__ == "__main__":
    main()
