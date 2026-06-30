# -*- coding: utf-8 -*-
"""
DAĞIT VE İŞLE — karışık atılan TÜM banka ekstrelerini (Excel/.xls/PDF, tüm firmalar karışık)
otomatik firmaya+hesaba ayırır, her firmayı IŞIK mantığıyla işler (eşleştirme + virman mutabakatı),
masaüstündeki "<AY> BANKA HAREKETLERİ" klasörüne OKUNAKLI isimle kaydeder.

Dosya adı: "<FİRMA> <HESAP ADI> ( <hesap no> ).xlsx"
  örn: "BİLPARK BİLİŞİM GARANTİ VADESİZ TL HS. ( 298189 ).xlsx"

Kullanım:
  python dagit_ve_isle.py <girdi_klasörü> ["Mayıs Ayı Banka Hareketleri"]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent))

from motor.parser import dosya_parse
from motor.eslestirici import Eslestirici, firma_yukle, bakiye_kontrol, _ilk_satir_basliklar
from motor.cikti_yazici import mikro_excel_yaz
from motor.coklu_mutabakat import EkstreKaydi, virman_mutabakat, mukerrer_ayikla, bos_kodlari_999_yap

import openpyxl

BASE = Path(__file__).resolve().parent
FIRMA_DIZIN = BASE / "firmalar"
MASAUSTU = Path(r"C:/Users/omery/OneDrive/Desktop")
EKSTRE_UZANTILARI = (".xlsx", ".xls", ".xlsm", ".csv", ".pdf",
                     ".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp")

# firma kodu → okunaklı ad (dosya isimlendirme için)
FIRMA_ADLARI = {
    "2AA_YAYINCILIK": "2AA YAYINCILIK", "4_BIZ_BILISIM": "4 BİZ BİLİŞİM", "AKCA_AGIZ": "AKÇA AĞIZ",
    "BESA_GIDA": "BESA GIDA", "BILPARK_BILISIM": "BİLPARK BİLİŞİM", "BILPARK_YAZILIM": "BİLPARK YAZILIM",
    "BODUR_TEKNIK": "BODUR TEKNİK", "BURAK_CET_ADI_ORT": "BURAK CET ADİ ORT", "CET_ENERJI": "CET ENERJİ",
    "DECOR_PEOPLE": "DECOR PEOPLE", "DTB_YAZILIM": "DTB YAZILIM", "ERDA_GUMRUK": "ERDA GÜMRÜK",
    "ERDEM_OZSEN": "ERDEM ÖZŞEN", "ERLAMER": "ERLAMER", "ESNI_BILISIM": "ESNİ BİLİŞİM",
    "GIZEM_GOKER_ADI_ORT": "GİZEM GÖKER ADİ ORT", "HACIKERIMOGLU_GIDA": "HACIKERİMOĞLU GIDA",
    "HULYA_HATUN_AKPINAR": "HÜLYA HATUN AKPINAR", "ISIK_PETROL": "IŞIK PETROL",
    "ISTANBUL_PLASTIK": "İSTANBUL PLASTİK", "KARIYERKURE": "KARİYERKÜRE", "KARMAKENT": "KARMAKENT",
    "KIRPI_YAYINCILIK": "KİRPİ YAYINCILIK", "KNA_BILISIM": "KNA BİLİŞİM", "MARMARAGES_GUNES": "MARMARAGES GÜNEŞ",
    "MD_DERMATOLOJI": "MD DERMATOLOJİ", "NEN_SIGORTA": "NEN SİGORTA", "NES_GUZELLIK": "NES GÜZELLİK",
    "OGUTMEN_SAGLIK": "ÖĞÜTMEN SAĞLIK", "OSNAK_NAKLIYAT": "OSNAK NAKLİYAT", "SAMBAZ_SUKUSU": "SAMBAZ SUYU",
    "SCF_BILISIM": "SCF BİLİŞİM", "SINAN_YILMAZ": "SİNAN YILMAZ", "SSC_GUVENLIK": "SSC GÜVENLİK",
    "STS_SAGLIK": "STS SAĞLIK", "SVI": "SVİ", "TURBO_BILISIM": "TURBO BİLİŞİM",
}


def _global_index() -> tuple[dict, dict]:
    """Tüm firmaların hesaplarını tara → IBAN ve hesap no haritaları.
    Döner: (iban→[(firma,kod,ad,no)], hesap_no→[(firma,kod,ad,no)])"""
    iban_idx = defaultdict(list)
    no_idx = defaultdict(list)
    for fd in FIRMA_DIZIN.iterdir():
        if not fd.is_dir():
            continue
        yol = fd / "01_banka_hesaplari.xlsx"
        if not yol.exists():
            continue
        wb = openpyxl.load_workbook(yol, data_only=True)
        ws = wb.active
        bas = _ilk_satir_basliklar(ws)
        for row in ws.iter_rows(min_row=bas + 1, values_only=True):
            if not row:
                continue
            kod = str(row[0]).strip() if row[0] else ""
            ad = str(row[2] or "").strip()
            no = str(row[3] or "").strip()
            iban = (str(row[4] or "").strip().replace(" ", "").upper()) if len(row) > 4 else ""
            kayit = (fd.name, kod, ad, no)
            if iban:
                iban_idx[iban].append(kayit)
            no_t = re.sub(r"\D", "", no).lstrip("0")
            if no_t:
                no_idx[no_t].append(kayit)
    return iban_idx, no_idx


def _temizle_dosya_adi(s: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', "", s).strip()


def dagit(girdi_klasoru: Path, ay_klasor_adi: str, cikti_kok_override: Path | None = None) -> None:
    iban_idx, no_idx = _global_index()
    cikti_kok = cikti_kok_override or (MASAUSTU / ay_klasor_adi)
    cikti_kok.mkdir(parents=True, exist_ok=True)

    dosyalar = sorted([p for p in girdi_klasoru.iterdir() if p.suffix.lower() in EKSTRE_UZANTILARI])
    print(f"{len(dosyalar)} dosya bulundu. Çıktı: {cikti_kok}\n")

    # 1) Her dosyayı parse + firmaya ata
    firma_dosyalari = defaultdict(list)   # firma_kodu → [(yol, sonuc, kod, ad, no)]
    eslesemeyen = []
    for yol in dosyalar:
        sonuc = dosya_parse(yol)
        if not sonuc.hareketler:
            eslesemeyen.append((yol.name, f"okunamadı/boş ({sonuc.not_})"))
            continue
        iban = (sonuc.iban or "").replace(" ", "").upper()
        no_t = re.sub(r"\D", "", (sonuc.hesap_no or "").split("-")[-1]).lstrip("0")
        # IBAN'dan hesap no kuyruğu (son 7+ hane) da aday
        iban_no = re.sub(r"\D", "", iban)[-10:].lstrip("0") if iban else ""

        eşleşme = iban_idx.get(iban) or no_idx.get(no_t)
        # Esnek: hesap no sonek eşleşmesi (298189 ↔ 6298189) — en az 5 hane
        if not eşleşme:
            adaylar = []
            for aday_no, kayitlar in no_idx.items():
                for sno in (no_t, iban_no):
                    if sno and len(sno) >= 5 and (aday_no.endswith(sno) or sno.endswith(aday_no)):
                        adaylar += kayitlar
            # IBAN sonek eşleşmesi
            if not adaylar and iban:
                for aday_iban, kayitlar in iban_idx.items():
                    if aday_iban and (aday_iban[-16:] in iban or iban[-16:] in aday_iban):
                        adaylar += kayitlar
            eşleşme = adaylar or None
        if not eşleşme:
            eslesemeyen.append((yol.name, f"firma bulunamadı (iban={sonuc.iban} no={sonuc.hesap_no})"))
            continue
        firmalar_set = {e[0] for e in eşleşme}
        if len(firmalar_set) > 1:
            eslesemeyen.append((yol.name, f"BİRDEN FAZLA firma eşleşti: {firmalar_set}"))
            continue
        firma, kod, ad, no = eşleşme[0]
        # FON ekstresi → firmanın 102 FON hesabına yönlendir (vadesizle aynı no'yu paylaşır)
        if getattr(sonuc, "fon", False):
            t = firma_yukle(firma)
            fon_hesap = next((b for b in t.bankalar if "FON" in b.hesap_adi.upper()), None)
            if fon_hesap:
                kod, ad, no = fon_hesap.hesap_kodu, fon_hesap.hesap_adi, fon_hesap.hesap_no
        firma_dosyalari[firma].append((yol, sonuc, kod, ad, no))

    # 1b) Bakiyesiz VE fon OLMAYAN dosyaları ayır (gerçek belirsizler). Fon dosyaları işlenir.
    fon_dosyalari = []
    for firma in list(firma_dosyalari):
        kalan = []
        for kayit in firma_dosyalari[firma]:
            s = kayit[1]
            if s.acilis is None and s.kapanis is None and not getattr(s, "fon", False):
                fon_dosyalari.append((firma, kayit[0].name))
            else:
                kalan.append(kayit)
        firma_dosyalari[firma] = kalan

    # 2) Firma firma işle
    print("=" * 70)
    toplam_cikti = 0
    yazilanlar = set()
    for firma, kayitlar in sorted(firma_dosyalari.items()):
        es = Eslestirici(firma, None)
        tablolar = es.tablolar
        ekstreler = []
        for yol, sonuc, kod, ad, no in kayitlar:
            e2 = Eslestirici(firma, kod)
            ekstreler.append((sonuc, kod, ad, no, EkstreKaydi(kod, sonuc.hesap_no, e2.toplu(sonuc.hareketler))))
        # virman mutabakatı (firma içi)
        virman_mutabakat([ek[4] for ek in ekstreler])
        for ek in ekstreler:
            bos_kodlari_999_yap(ek[4].eslesmeler)
        # çıktı
        firma_ad = FIRMA_ADLARI.get(firma, firma)
        print(f"\n● {firma_ad} ({len(ekstreler)} hesap)")
        for sonuc, kod, ad, no, kayit in ekstreler:
            # STS SAĞLIK: "tah" açıklamalı satırları sil (başka yerden işlenecek)
            if firma == "STS_SAGLIK":
                kayit.eslesmeler = [e for e in kayit.eslesmeler
                                    if "tah" not in e.hareket.aciklama.lower().split()]
            temiz = mukerrer_ayikla(kayit.eslesmeler)
            fon = getattr(sonuc, "fon", False)
            no_etk = f" ( {no} )" if no else ""
            isim = _temizle_dosya_adi(f"{firma_ad} {ad}{no_etk}") + ".xlsx"
            # Dosya adı çakışmasını önle (aynı isimli iki hesap → üzerine yazma)
            if isim in yazilanlar:
                isim = isim[:-5] + f" [{kod}].xlsx"
            yazilanlar.add(isim)
            hedef = cikti_kok / isim
            try:
                mikro_excel_yaz(temiz, hedef, firma=firma_ad, banka=f"{sonuc.banka_adi} ({no})",
                                hesap_kodu=kod, acilis=sonuc.acilis, kapanis=sonuc.kapanis,
                                cariler=tablolar.cariler, doviz=getattr(sonuc, "doviz", ""))
                if fon:
                    durum = "◆ fon"
                elif sonuc.acilis is not None:
                    bk = bakiye_kontrol([e.hareket for e in kayit.eslesmeler], sonuc.acilis, sonuc.kapanis)
                    durum = "✓" if bk["tamam"] else f"✗ FARK {bk['fark']:.2f}"
                else:
                    durum = "(bakiye yok)"
                print(f"    {durum} {isim}  ({len(temiz)} satır)")
                toplam_cikti += 1
            except PermissionError:
                print(f"    [AÇIK] {isim} yazılamadı")

    print("\n" + "=" * 70)
    print(f"TOPLAM {toplam_cikti} Excel '{ay_klasor_adi}' klasörüne yazıldı.")
    if fon_dosyalari:
        print(f"\n◆ FON/BAKİYESİZ {len(fon_dosyalari)} dosya (ayrı kontrol — 118 fon hesabı):")
        for firma, ad in fon_dosyalari:
            print(f"    {FIRMA_ADLARI.get(firma, firma)} ← {ad}")
    if eslesemeyen:
        print(f"\n⚠ EŞLEŞMEYEN {len(eslesemeyen)} dosya (kontrol et):")
        for ad, sebep in eslesemeyen:
            print(f"    {ad} → {sebep}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print('Kullanım: python dagit_ve_isle.py <girdi_klasörü> ["Mayıs Ayı Banka Hareketleri"]')
        sys.exit(1)
    girdi = Path(sys.argv[1])
    ay = sys.argv[2] if len(sys.argv) > 2 else "Mayıs Ayı Banka Hareketleri"
    dagit(girdi, ay)
