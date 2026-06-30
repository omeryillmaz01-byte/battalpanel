# -*- coding: utf-8 -*-
"""
ÇOKLU EKSTRE İŞLEME — bir firmanın tüm banka ekstrelerini işler + virman mutabakatı yapar.

Kullanım:
  python coklu_isle.py <FIRMA_KODU> <dosya1> <dosya2> ...     (belirli dosyalar)
  python coklu_isle.py <FIRMA_KODU> <klasör>                  (klasördeki tüm ekstreler)
  python coklu_isle.py <FIRMA_KODU>                           (girdi/<FIRMA>/ klasörü)

Akış (her firma için IŞIK PETROL ile AYNI mantık):
  1) Her dosyayı parse et (Excel/.xls/CSV/PDF), IBAN/hesap no'dan 102.xx hesabını bul
  2) Her ekstreyi eslestirici ile kodla (POS/çek/maaş/komisyon/cari/virman...)
  3) Tüm ekstreleri karşılaştır → MÜKERRER virmanları ayıkla, boşları 999'a al
  4) Her hesap için temiz Mikro Excel üret → cikti/<FIRMA>/
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from motor.parser import dosya_parse
from motor.eslestirici import Eslestirici, firma_yukle, bakiye_kontrol
from motor.cikti_yazici import mikro_excel_yaz
from motor.coklu_mutabakat import (EkstreKaydi, virman_mutabakat, mukerrer_ayikla,
                                   bos_kodlari_999_yap)

BASE = Path(__file__).resolve().parent
EKSTRE_UZANTILARI = (".xlsx", ".xls", ".xlsm", ".csv", ".pdf")


def _hesap_kodu_bul(tablolar, hesap_no: str, iban: str) -> tuple[str, str]:
    """Parse edilen hesap no / IBAN'dan 102.xx kodunu bulur."""
    iban_bs = (iban or "").replace(" ", "").upper()
    no_temiz = (hesap_no or "").split("-")[-1].lstrip("0")
    for b in tablolar.bankalar:
        b_iban = (getattr(b, "iban", "") or "").replace(" ", "").upper()
        if b_iban and iban_bs and b_iban == iban_bs:
            return b.hesap_kodu, b.hesap_adi
    for b in tablolar.bankalar:
        b_no = (b.hesap_no or "").split("-")[-1].lstrip("0")
        if b_no and no_temiz and b_no == no_temiz:
            return b.hesap_kodu, b.hesap_adi
    return "", ""


def dosyalari_topla(args: list[str], firma_kodu: str) -> list[Path]:
    """Argümanlardan ekstre dosyalarını toplar (dosya, klasör, ya da varsayılan girdi klasörü)."""
    yollar: list[Path] = []
    if not args:
        gir = BASE / "girdi" / firma_kodu
        if gir.exists():
            yollar = [p for p in gir.iterdir() if p.suffix.lower() in EKSTRE_UZANTILARI]
    else:
        for a in args:
            p = Path(a)
            if p.is_dir():
                yollar += [q for q in p.iterdir() if q.suffix.lower() in EKSTRE_UZANTILARI]
            elif p.exists():
                yollar.append(p)
    return sorted(yollar)


def isle(firma_kodu: str, dosyalar: list[Path]) -> None:
    tablolar = firma_yukle(firma_kodu)
    ekstre_kayitlari: list[EkstreKaydi] = []
    parse_bilgi = []

    print("=" * 78)
    print(f"ÇOKLU İŞLEME — {firma_kodu}  ({len(dosyalar)} dosya)")
    print("=" * 78)
    print("\n1) DOSYALAR PARSE EDİLİYOR")
    for yol in dosyalar:
        sonuc = dosya_parse(yol)
        if not sonuc.hareketler:
            print(f"  [BOŞ] {yol.name}  ({sonuc.not_})")
            continue
        kod, ad = _hesap_kodu_bul(tablolar, sonuc.hesap_no, sonuc.iban)
        if not kod:
            print(f"  [?]   {yol.name} → hesap eşlenemedi (no={sonuc.hesap_no} iban={sonuc.iban}) — "
                  f"banka_hesaplari'na IBAN ekleyince çözülür")
            continue
        es = Eslestirici(firma_kodu, kod)
        eslesmeler = es.toplu(sonuc.hareketler)
        ekstre_kayitlari.append(EkstreKaydi(kod, sonuc.hesap_no, eslesmeler))
        parse_bilgi.append((yol, sonuc, kod, ad))
        print(f"  [OK]  {yol.name} → {kod} {sonuc.banka_adi} | {len(sonuc.hareketler)} hareket")

    if not ekstre_kayitlari:
        print("\nİşlenecek ekstre bulunamadı.")
        return

    print("\n2) VİRMAN MUTABAKATI")
    stat = virman_mutabakat(ekstre_kayitlari)
    toplam_999 = sum(bos_kodlari_999_yap(k.eslesmeler) for k in ekstre_kayitlari)
    print(f"  Mükerrer silinen: {stat['mukerrer_silinen']} | kod dolduruldu: {stat['kod_dolduruldu']} "
          f"| boş→999: {toplam_999}")

    print("\n3) MİKRO EXCEL ÜRETİLİYOR")
    cikti_dizin = BASE / "cikti" / firma_kodu
    for (yol, sonuc, kod, ad), kayit in zip(parse_bilgi, ekstre_kayitlari):
        temiz = mukerrer_ayikla(kayit.eslesmeler)
        silinen = len(kayit.eslesmeler) - len(temiz)
        bk = bakiye_kontrol([e.hareket for e in kayit.eslesmeler], sonuc.acilis or 0, sonuc.kapanis or 0)
        dosya_adi = f"{firma_kodu}_{kod.replace('.', '_')}_{sonuc.banka_adi}_MIKRO.xlsx"
        hedef = cikti_dizin / dosya_adi
        try:
            mikro_excel_yaz(temiz, hedef, firma=firma_kodu,
                            banka=f"{sonuc.banka_adi} ({sonuc.hesap_no})", hesap_kodu=kod,
                            acilis=sonuc.acilis, kapanis=sonuc.kapanis, cariler=tablolar.cariler)
            durum = "TAMAM" if bk["tamam"] else f"FARK {bk['fark']:.2f}"
            print(f"  {kod} {sonuc.banka_adi:9s} | {len(temiz):4d} satır (-{silinen} mük.) | bakiye {durum}")
        except PermissionError:
            print(f"  {kod} | DOSYA AÇIK, yazılamadı: {dosya_adi}")
    print(f"\n→ Çıktılar: cikti/{firma_kodu}/")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Kullanım: python coklu_isle.py <FIRMA_KODU> [dosya/klasör ...]")
        print("Örnek:    python coklu_isle.py ISIK_PETROL girdi/ISIK_PETROL")
        sys.exit(1)
    firma = sys.argv[1]
    dosyalar = dosyalari_topla(sys.argv[2:], firma)
    if not dosyalar:
        print(f"Dosya bulunamadı. girdi/{firma}/ klasörüne ekstreleri koy ya da argüman ver.")
        sys.exit(0)
    isle(firma, dosyalar)
