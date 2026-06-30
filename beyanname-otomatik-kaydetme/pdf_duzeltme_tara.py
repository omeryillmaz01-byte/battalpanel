import csv
from pathlib import Path

from indir import KDV_TANER, KDV_OMER, MUHTASAR_TANER, MUHTASAR_OMER, pdf_duzeltme_bilgisi


CIKIS = "mevcut_pdf_duzeltme_taramasi.csv"


def tur_bul(yol):
    p = str(yol).upper()
    if "KDV" in p:
        return "KDV1"
    if "MUHTASAR" in p:
        return "MUHSGK"
    return ""


def tara_klasor(kok):
    kok_path = Path(kok)
    if not kok_path.exists():
        return []

    kayitlar = []
    for pdf in kok_path.rglob("* BYN.pdf"):
        bilgi = pdf_duzeltme_bilgisi(pdf)
        kayitlar.append({
            "Dosya": str(pdf),
            "Tur": tur_bul(pdf),
            "Duzeltme": "EVET" if bilgi["duzeltme"] else "HAYIR",
        })
    return kayitlar


def main():
    kokler = [KDV_TANER, KDV_OMER, MUHTASAR_TANER, MUHTASAR_OMER]
    tum = []
    for kok in kokler:
        tum.extend(tara_klasor(kok))

    cikis = Path(__file__).parent / CIKIS
    with open(cikis, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["Dosya", "Tur", "Duzeltme"],
            delimiter=";",
        )
        writer.writeheader()
        writer.writerows(tum)

    print(f"Tamamlandı: {len(tum)} PDF tarandı")
    print(f"Rapor: {cikis}")


if __name__ == "__main__":
    main()
