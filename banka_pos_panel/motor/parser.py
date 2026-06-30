# -*- coding: utf-8 -*-
"""
Banka ekstresi parser'ı — CSV / Excel / PDF girdiyi normalize eder.

Çıktı: list[Hareket(tarih, aciklama, tutar, referans)] + meta (banka, açılış, kapanış)

İlk fazda generic davranış:
  - Tarih kolonu bulunur (tarih formatına uyan)
  - Açıklama kolonu (en uzun metin alanları)
  - Tutar kolonu (sayısal, ya tek kolon ya borç+alacak çift kolon)

PDF için pdfplumber gerekiyor (yoksa hata mesajı).
"""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .eslestirici import Hareket


TARIH_REGEX = [
    re.compile(r"^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})"),     # dd/mm/yyyy
    re.compile(r"^\s*(\d{4})[./-](\d{1,2})[./-](\d{1,2})"),       # yyyy-mm-dd
]


def tarih_parse(deger) -> str | None:
    if deger is None:
        return None
    if isinstance(deger, datetime):
        return deger.strftime("%d/%m/%Y")
    s = str(deger).strip()
    for rx in TARIH_REGEX:
        m = rx.match(s)
        if not m:
            continue
        a, b, c = m.groups()
        if len(a) == 4:
            yil, ay, gun = int(a), int(b), int(c)
        else:
            gun, ay, yil = int(a), int(b), int(c)
            if yil < 100:
                yil += 2000
        try:
            return datetime(yil, ay, gun).strftime("%d/%m/%Y")
        except ValueError:
            return None
    return None


def sayi_parse(deger) -> float | None:
    if deger is None or deger == "":
        return None
    if isinstance(deger, (int, float)):
        return float(deger)
    s = str(deger).strip()
    if not s:
        return None
    # "1.234,56" → "1234.56" / "1,234.56" → "1234.56"
    s = s.replace(" ", "").replace("TL", "").replace("₺", "").replace(" ", "")
    # Binlik ayırıcıyı tespit et
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(".", "").replace(",", ".")
    s = re.sub(r"[^0-9.\-]", "", s)
    try:
        return float(s)
    except ValueError:
        return None


@dataclass
class EkstreSonuc:
    hareketler: list[Hareket]
    banka_adi: str = ""
    hesap_no: str = ""
    iban: str = ""
    acilis: float | None = None
    kapanis: float | None = None
    kaynak_dosya: str = ""
    not_: str = ""
    fon: bool = False          # fon alım/satım ekstresi mi (→ firmanın 102 FON hesabına gider)
    doviz: str = ""            # USD/EUR (döviz hesabıysa → TCMB kuruyla TL kolonu eklenir)


# ----------------------------------------------------------------------------- #
# CSV / Excel — generic
# ----------------------------------------------------------------------------- #
TARIH_KOLON_KEY = ("tarih", "date", "i̇şlem tarihi", "islem tarihi", "tarih/saat", "muh tarih")
ACIKLAMA_KOLON_KEY = ("açıklama", "aciklama", "description", "tanım", "tanim", "konu", "işlem açıklama")
TUTAR_KOLON_KEY = ("tutar", "amount", "i̇şlem tutarı", "islem tutari", "işlem tutarı", "miktar")
BORC_KEY = ("borç", "borc", "çekilen", "cekilen", "debit", "çıkış", "cikis")
ALACAK_KEY = ("alacak", "yatan", "credit", "giriş", "giris")
BA_KEY = ("b/a", "borç/alacak", "borc/alacak", "ba")          # tek harf B/A göstergesi
BAKIYE_KEY = ("bakiye", "bakıye", "yeni bakiye", "kalan")
REF_KEY = ("dekont", "fiş no", "fis no", "referans", "ref no")
IBAN_KEY = ("iban",)
HESAPNO_KEY = ("hesap no", "hesap numara", "şube kodu - hesap", "sube kodu - hesap", "hesap")

# IBAN'ın 5 haneli banka kodu (pozisyon 4:9) → banka adı (güvenilir tespit)
BANKA_IBAN_KODU = {
    "00010": "ZİRAAT", "00012": "HALKBANK", "00015": "VAKIFBANK", "00032": "TEB",
    "00046": "AKBANK", "00062": "GARANTİ", "00064": "İŞ BANKASI", "00067": "YAPIKREDİ",
    "00099": "ING", "00103": "FİBABANKA", "00111": "QNB", "00123": "HSBC",
    "00134": "DENİZBANK", "00143": "ODEABANK", "00203": "ALBARAKA", "00205": "KUVEYTTÜRK",
    "00206": "TÜRKİYE FİNANS", "00059": "ŞEKERBANK", "00111 ": "QNB",
}


def banka_iban_adi(iban: str) -> str:
    iban = (iban or "").replace(" ", "").upper()
    if iban.startswith("TR") and len(iban) >= 9:
        return BANKA_IBAN_KODU.get(iban[4:9], "")
    return ""


def _banka_adi_meta(icerik: list[list], bas_idx: int) -> str:
    """Meta alanından (işlem satırları HARİÇ) banka adını tespit eder."""
    metin = " ".join(str(c).upper() for row in icerik[:bas_idx + 1] for c in row)
    for ad in ("ZİRAAT", "ZIRAAT", "HALKBANK", "VAKIFBANK", "VAKIF", "GARANTİ", "GARANTI",
               "AKBANK", "YAPI", "İŞ BANKASI", "IS BANKASI", "TÜRKİYE İŞ", "TEB",
               "QNB", "FİNANSBANK", "FINANSBANK", "DENİZBANK", "KUVEYT"):
        if ad in metin:
            return ad.replace("İ", "İ")
    return ""


def _tr_norm(s: str) -> str:
    """Türkçe-duyarlı normalleştirme: İ/I/ş/ğ/ü/ö/ç → ascii, küçük harf. ('BAKİYE'→'bakiye')"""
    s = str(s)
    s = s.translate(str.maketrans("İIıŞşĞğÜüÖöÇç", "iiisSgGuUoOcC")).lower()
    import unicodedata
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").strip()


def _kolon_bul(basliklar: list[str], anahtarlar: tuple[str, ...]) -> int:
    normlar = [_tr_norm(b) for b in basliklar]
    anlar = [_tr_norm(a) for a in anahtarlar]
    for i, bn in enumerate(normlar):
        for a in anlar:
            if a and a in bn:
                return i
    return -1


def csv_parse(yol: Path) -> EkstreSonuc:
    """Bir CSV ekstresi okur. Ayraç ve encoding otomatik."""
    icerik: list[list[str]] = []
    # Encoding denemeleri
    for enc in ("utf-8-sig", "utf-8", "cp1254", "iso-8859-9", "latin-1"):
        try:
            with open(yol, "r", encoding=enc, newline="") as f:
                ornek = f.read(4096)
                f.seek(0)
                try:
                    diyalekt = csv.Sniffer().sniff(ornek, delimiters=";,\t|")
                    ayrac = diyalekt.delimiter
                except csv.Error:
                    ayrac = ";" if ornek.count(";") > ornek.count(",") else ","
                icerik = list(csv.reader(f, delimiter=ayrac))
            break
        except (UnicodeDecodeError, UnicodeError):
            continue

    if not icerik:
        return EkstreSonuc([], not_="CSV okunamadı (encoding/ayraç).", kaynak_dosya=str(yol))

    return _generic_satirlardan_hareket(icerik, yol)


def _rows_oku(yol: Path) -> list[list]:
    """Evrensel satır okuyucu: .xlsx→openpyxl, .xls→xlrd (HTML ise read_html), .csv."""
    ext = yol.suffix.lower()
    if ext in (".xlsx", ".xlsm"):
        import openpyxl
        wb = openpyxl.load_workbook(yol, data_only=True)
        ws = wb.active
        return [[("" if c is None else c) for c in row] for row in ws.iter_rows(values_only=True)]
    if ext == ".xls":
        # Bazı bankalar .xls adıyla HTML verir (TEB) — başlığa bak
        with open(yol, "rb") as f:
            bas = f.read(200).lstrip()
        if bas[:5].lower() == b"<html" or bas[:9].lower() == b"<!doctype" or bas[:5].lower() == b"<meta":
            return _html_rows(yol)
        import xlrd
        wb = xlrd.open_workbook(yol)
        ws = wb.sheet_by_index(0)
        return [[ws.cell_value(r, c) for c in range(ws.ncols)] for r in range(ws.nrows)]
    if ext in (".htm", ".html"):
        return _html_rows(yol)
    return []


def _html_rows(yol: Path) -> list[list]:
    """HTML tablosunu (TEB gibi .xls adlı HTML) satırlara çevirir."""
    rows: list[list] = []
    # 1) BeautifulSoup ile dene (pandas'ın kaçırdığı tabloları yakalar)
    try:
        from bs4 import BeautifulSoup
        for enc in ("utf-8", "cp1254", "iso-8859-9", "latin-1"):
            try:
                with open(yol, "r", encoding=enc) as f:
                    html = f.read()
                break
            except (UnicodeDecodeError, UnicodeError):
                html = None
                continue
        if html:
            soup = BeautifulSoup(html, "html.parser")
            for tablo in soup.find_all("table"):
                for tr in tablo.find_all("tr"):
                    hucreler = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
                    if hucreler and any(h for h in hucreler):
                        rows.append(hucreler)
            if rows:
                return [[("" if c is None else c) for c in r] for r in rows]
    except ImportError:
        pass
    # 2) Fallback: pandas read_html
    try:
        import pandas as pd
        tablolar = None
        for enc in ("utf-8", "cp1254", "iso-8859-9", "latin-1"):
            try:
                tablolar = pd.read_html(yol, encoding=enc)
                break
            except (UnicodeDecodeError, ValueError):
                tablolar = None
                continue
        if not tablolar:
            tablolar = pd.read_html(yol)
        for df in tablolar:
            df = df.astype(object).where(df.notna(), "")
            kolonlar = [c for c in df.columns]
            if any(isinstance(c, str) and c.strip() for c in kolonlar):
                rows.append(list(kolonlar))
            rows += df.values.tolist()
        return [[("" if c is None else c) for c in r] for r in rows]
    except Exception:
        return []


def _fon_parse(icerik: list[list], yol: Path) -> EkstreSonuc | None:
    """Garanti fon ekstresi: Tarih | Fon | İşlem Detayı | İşlem Tipi | Adet | Birim Fiyatı | Tutar."""
    bas = -1
    for i, row in enumerate(icerik[:30]):
        n = [_tr_norm(c) for c in row]
        if "tarih" in n and "fon" in n and any("islem tipi" in x or "islem detay" in x for x in n):
            bas = i
            break
    if bas < 0:
        return None
    blk = [_tr_norm(c) for c in icerik[bas]]
    def k(*adlar):
        for a in adlar:
            for j, b in enumerate(blk):
                if a in b:
                    return j
        return -1
    i_tarih, i_fon, i_tip, i_tutar = k("tarih"), k("fon"), k("islem tipi"), k("tutar")
    if min(i_tarih, i_tutar) < 0:
        return None
    iban, hesap_no, _ = _meta_cikar(icerik, bas)
    hareketler = []
    for row in icerik[bas + 1:]:
        if i_tarih >= len(row):
            continue
        t = tarih_parse(row[i_tarih])
        if not t:
            continue
        tut = sayi_parse(row[i_tutar]) if i_tutar < len(row) else None
        if tut is None:
            continue
        fon_ad = str(row[i_fon]).strip() if 0 <= i_fon < len(row) else ""
        tip = str(row[i_tip]).strip() if 0 <= i_tip < len(row) else ""
        hareketler.append(Hareket(tarih=t, aciklama=f"FON {tip} - {fon_ad}".strip(), tutar=tut))
    if not hareketler:
        return None
    return EkstreSonuc(hareketler=hareketler, banka_adi="GARANTİ", hesap_no=hesap_no, iban=iban,
                       fon=True, kaynak_dosya=str(yol))


def excel_parse(yol: Path) -> EkstreSonuc:
    icerik = _rows_oku(yol)
    fon = _fon_parse(icerik, yol)        # önce fon formatını dene
    if fon is not None:
        return fon
    return _generic_satirlardan_hareket(icerik, yol)


def _meta_cikar(icerik: list[list], bas_idx: int) -> tuple[str, str, str]:
    """Başlık öncesi alandan IBAN, hesap no ve döviz cinsini çıkarır."""
    iban = hesap_no = doviz = ""
    for row in icerik[:bas_idx + 1]:
        for i, h in enumerate(row):
            hl = str(h).lower().strip()
            deger = ""
            # 'IBAN' etiketi → yanındaki/aynı hücredeki TR..
            if "iban" in hl:
                for c in list(row[i:]) + [h]:
                    m = re.search(r"TR\s*[0-9 ]{20,32}", str(c))
                    if m:
                        iban = re.sub(r"\s+", "", m.group(0)); break
            if not hesap_no and any(k in hl for k in ("hesap no", "hesap numara", "şube kodu - hesap", "sube kodu - hesap")):
                for c in row[i + 1:]:
                    cs = str(c)
                    if "-" in cs and re.search(r"\d", cs):
                        # '1024-0156312' / '211 - 6298189' → tireden sonraki (asıl hesap no)
                        son = re.findall(r"\d{3,}", cs)
                        if son:
                            hesap_no = son[-1]; break
                    m = re.findall(r"\d{4,}", cs)
                    if m:
                        hesap_no = max(m, key=len); break
            if not doviz:
                for kod in ("USD", "EUR", "GBP"):
                    if kod in str(h):
                        doviz = kod
    # IBAN'dan da döviz çıkmaz; açıklamalardan döviz tipi
    return iban, hesap_no, doviz


def _generic_satirlardan_hareket(icerik: list[list], yol: Path) -> EkstreSonuc:
    if not icerik:
        return EkstreSonuc([], not_="Dosya okunamadı (format/HTML?).", kaynak_dosya=str(yol))
    # Başlık satırını bul: tarih + (tutar | borç/alacak | tutar+B/A)
    bas_idx = -1
    for i, row in enumerate(icerik[:40]):
        metin = " | ".join(_tr_norm(c) for c in row)
        tarih_var = any(_tr_norm(k) in metin for k in TARIH_KOLON_KEY)
        tutar_var = any(_tr_norm(k) in metin for k in TUTAR_KOLON_KEY)
        borc_alacak = any(_tr_norm(k) in metin for k in BORC_KEY) and any(_tr_norm(k) in metin for k in ALACAK_KEY)
        if tarih_var and (tutar_var or borc_alacak):
            bas_idx = i
            break
    # Garanti PDF: başlık satırında Tarih yok ama "Açıklama"+"İşlem Tutarı"+"Bakiye" var
    if bas_idx < 0:
        for i, row in enumerate(icerik[:40]):
            metin = " | ".join(_tr_norm(c) for c in row)
            tutar_var = any(_tr_norm(k) in metin for k in TUTAR_KOLON_KEY)
            aciklama_var = any(_tr_norm(k) in metin for k in ACIKLAMA_KOLON_KEY)
            bakiye_var = any(_tr_norm(k) in metin for k in BAKIYE_KEY)
            if aciklama_var and tutar_var and bakiye_var:
                # İlk boş/None kolonu "Tarih" olarak varsay
                for j, h in enumerate(row):
                    if not str(h).strip():
                        row[j] = "Tarih"
                        break
                bas_idx = i
                break
    if bas_idx < 0:
        return EkstreSonuc([], not_="Başlık satırı bulunamadı.", kaynak_dosya=str(yol))

    basliklar = [str(c).strip() for c in icerik[bas_idx]]
    i_tarih = _kolon_bul(basliklar, TARIH_KOLON_KEY)
    i_aciklama = _kolon_bul(basliklar, ACIKLAMA_KOLON_KEY)
    i_tutar = _kolon_bul(basliklar, TUTAR_KOLON_KEY)
    i_borc = _kolon_bul(basliklar, BORC_KEY)
    i_alacak = _kolon_bul(basliklar, ALACAK_KEY)
    i_ba = _kolon_bul(basliklar, BA_KEY)
    i_bakiye = _kolon_bul(basliklar, BAKIYE_KEY)
    i_ref = _kolon_bul(basliklar, REF_KEY)
    if i_aciklama < 0:   # açıklama yoksa 'işlem' kolonunu dene
        i_aciklama = _kolon_bul(basliklar, ("işlem", "islem"))

    if i_tarih < 0 or (i_tutar < 0 and (i_borc < 0 or i_alacak < 0)):
        return EkstreSonuc([], not_=f"Kolon bulunamadı. Başlıklar: {basliklar}", kaynak_dosya=str(yol))

    iban, hesap_no, doviz = _meta_cikar(icerik, bas_idx)
    # Hesap no başlıkta yoksa, işlem tablosundaki 'Hesap No' kolonundan al (ilk veri satırı)
    if not hesap_no:
        i_hno = _kolon_bul(basliklar, ("hesap no", "hesap numara"))
        if i_hno >= 0:
            for row in icerik[bas_idx + 1:]:
                if i_hno < len(row):
                    m = re.findall(r"\d{4,}", str(row[i_hno]))
                    if m:
                        hesap_no = max(m, key=len); break

    # Tutar zaten işaretli mi? (negatif varsa B/A uygulanmaz)
    tutar_imzali = False
    if i_tutar >= 0:
        for row in icerik[bas_idx + 1: bas_idx + 60]:
            if i_tutar < len(row):
                v = sayi_parse(row[i_tutar])
                if v is not None and v < 0:
                    tutar_imzali = True
                    break

    hareketler: list[Hareket] = []
    bakiyeler: list[tuple[float, float]] = []
    onceki_tarih = None
    for row in icerik[bas_idx + 1:]:
        if not row or all((c is None or str(c).strip() == "") for c in row):
            continue
        tarih = tarih_parse(row[i_tarih]) if i_tarih < len(row) else None
        if not tarih:
            # Tarih boş ama tutar varsa → önceki tarihi miras al (Garanti PDF vb.)
            if onceki_tarih and i_tutar >= 0 and i_tutar < len(row) and sayi_parse(row[i_tutar]) is not None:
                tarih = onceki_tarih
            else:
                continue
        onceki_tarih = tarih
        aciklama = str(row[i_aciklama]).strip() if 0 <= i_aciklama < len(row) else ""
        if i_tutar >= 0 and i_tutar < len(row):
            tutar = sayi_parse(row[i_tutar])
            if tutar is not None and not tutar_imzali and i_ba >= 0 and i_ba < len(row):
                ba = str(row[i_ba]).strip().upper()
                if ba.startswith("B"):     # Borç → negatif
                    tutar = -abs(tutar)
                elif ba.startswith("A"):
                    tutar = abs(tutar)
        else:
            borc = sayi_parse(row[i_borc]) if 0 <= i_borc < len(row) else None
            alacak = sayi_parse(row[i_alacak]) if 0 <= i_alacak < len(row) else None
            tutar = (alacak or 0) - (borc or 0)
        if tutar is None:
            continue
        ref = str(row[i_ref]).strip() if 0 <= i_ref < len(row) else ""
        hareketler.append(Hareket(tarih=tarih, aciklama=aciklama, tutar=tutar, referans=ref))
        if i_bakiye >= 0 and i_bakiye < len(row):
            bak = sayi_parse(row[i_bakiye])
            if bak is not None:
                bakiyeler.append((tutar, bak))

    # Açılış/kapanış: yönü BAKİYE ZİNCİRİNDEN tespit et (tarihe güvenme — aynı tarihli satırlar olabilir)
    acilis = kapanis = None
    if len(bakiyeler) >= 2:
        artan = ters = 0
        for i in range(1, len(bakiyeler)):
            tut_i, bak_i = bakiyeler[i]
            tut_o, bak_o = bakiyeler[i - 1]
            if abs(bak_i - (bak_o + tut_i)) < 0.02:      # artan: bakiye[i]=bakiye[i-1]+tutar[i]
                artan += 1
            if abs(bak_i - (bak_o - tut_o)) < 0.02:      # azalan: bakiye[i]=bakiye[i-1]-tutar[i-1]
                ters += 1
        ilk_tut, ilk_bak = bakiyeler[0]
        son_tut, son_bak = bakiyeler[-1]
        if ters > artan:                                  # dosya AZALAN (ilk=en yeni)
            acilis, kapanis = round(son_bak - son_tut, 2), round(ilk_bak, 2)
        else:                                             # dosya ARTAN (ilk=en eski)
            acilis, kapanis = round(ilk_bak - ilk_tut, 2), round(son_bak, 2)
    elif len(bakiyeler) == 1:
        tut, bak = bakiyeler[0]
        acilis, kapanis = round(bak - tut, 2), round(bak, 2)

    # kronolojik sırala
    try:
        hareketler.sort(key=lambda h: tuple(int(x) for x in reversed(h.tarih.split("/"))))
    except Exception:
        pass

    banka_adi = banka_iban_adi(iban) or _banka_adi_meta(icerik, bas_idx)
    # Döviz cinsi tespiti (meta + başlık alanı)
    ust_metin = " ".join(str(c).upper() for row in icerik[:bas_idx + 1] for c in row)
    if not doviz:
        for kod in ("USD", "EUR", "GBP", "DOLAR", "EURO"):
            if kod in ust_metin:
                doviz = "USD" if kod in ("USD", "DOLAR") else ("EUR" if kod in ("EUR", "EURO") else kod)
                break
    return EkstreSonuc(hareketler=hareketler, hesap_no=hesap_no, iban=iban, banka_adi=banka_adi,
                       acilis=acilis, kapanis=kapanis, doviz=doviz, kaynak_dosya=str(yol))


# ----------------------------------------------------------------------------- #
# PDF
# ----------------------------------------------------------------------------- #
def _pdf_tablo_temizle(icerik: list[list[str]]) -> list[list[str]]:
    """None-ağırlıklı kolonları çıkar, boş satırları sil."""
    if not icerik:
        return icerik
    max_kol = max(len(r) for r in icerik)
    # Kolon başına None/boş oranı hesapla
    bos_oran = []
    for c in range(max_kol):
        bos = sum(1 for r in icerik if c >= len(r) or not str(r[c]).strip())
        bos_oran.append(bos / len(icerik))
    # %90'dan fazla boş olan kolonları çıkar (ama en az 3 kolon kalsın)
    kalan = [c for c, o in enumerate(bos_oran) if o < 0.9]
    if len(kalan) < 3:
        kalan = list(range(min(max_kol, 6)))
    temiz = []
    for r in icerik:
        satir = [str(r[c]).strip() if c < len(r) else "" for c in kalan]
        if any(s for s in satir):
            temiz.append(satir)
    return temiz


def _pdf_metin_satirlar(yol: Path) -> tuple[list[list[str]], str, str]:
    """pdfplumber text extraction → satır bazlı parse.
    Akbank/YapıKredi/Denizbank gibi tablo çıkaramayan PDF'ler için."""
    import pdfplumber
    tum_metin = ""
    with pdfplumber.open(yol) as pdf:
        for sayfa in pdf.pages:
            tum_metin += (sayfa.extract_text() or "") + "\n"
    if not tum_metin.strip():
        return [], "", ""
    # IBAN çıkar
    iban = ""
    iban_m = re.search(r"TR\s*\d{2}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{2}", tum_metin)
    if iban_m:
        iban = re.sub(r"\s+", "", iban_m.group(0))
    # Hesap no çıkar
    hesap_no = ""
    hno_m = re.search(r"(?:Hesap\s*(?:No|Num)[^:]*[:\s]\s*|Hesap\s+)(\d[\d\s\-]{5,})", tum_metin, re.IGNORECASE)
    if hno_m:
        hesap_no = re.sub(r"[\s\-]", "", hno_m.group(1))
    # Satır satır parse et
    satirlar = tum_metin.split("\n")
    icerik: list[list[str]] = []
    for satir in satirlar:
        satir = satir.strip()
        if not satir:
            continue
        # Tarih ile başlayan satırları işlem satırı olarak al
        tarih = tarih_parse(satir)
        if tarih:
            # Tarih + geri kalan → parçala
            parcalar = re.split(r"\s{2,}", satir)
            if len(parcalar) >= 2:
                icerik.append(parcalar)
            else:
                icerik.append([satir])
        else:
            icerik.append([satir])
    return icerik, iban, hesap_no


def _pdf_metin_hareket(yol: Path) -> EkstreSonuc:
    """Text-based PDF parse — tablo çıkaramayan PDF'ler için."""
    icerik, iban, hesap_no = _pdf_metin_satirlar(yol)
    if not icerik:
        return EkstreSonuc([], not_="PDF'den metin çıkarılamadı.", kaynak_dosya=str(yol))
    # Önce _generic ile dene
    sonuc = _generic_satirlardan_hareket(icerik, yol)
    if sonuc.hareketler:
        if iban and not sonuc.iban:
            sonuc.iban = iban
        if hesap_no and not sonuc.hesap_no:
            sonuc.hesap_no = hesap_no
        if not sonuc.banka_adi:
            sonuc.banka_adi = banka_iban_adi(iban)
        return sonuc
    # Generic başarısız → regex ile tarih+tutar çıkar (tek string satırlar)
    # Pattern: dd.mm.yyyy ... TUTAR TL ... BAKİYE TL
    _tutar_rx = re.compile(
        r"(-?[\d.,]+)\s*TL\s+(-?[\d.,]+)\s*TL\s*$"
    )
    _tutar_ba_rx = re.compile(
        r"([\d.,]+)\s+([\d.,]+)\s+([BA])\s+(.+)$"
    )
    # Denizbank: "dd.mm.yyyy REF ACIKLAMA -1.234,56 5.678,90" (TL yok, son 2 sayı tutar+bakiye)
    _tutar_son2_rx = re.compile(
        r"\s(-?[\d.,]+)\s+(-?[\d.,]+)\s*$"
    )
    hareketler: list[Hareket] = []
    bakiyeler: list[tuple[float, float]] = []
    onceki_aciklama_ref: list | None = None
    for satir_parcalar in icerik:
        birlesik = " ".join(satir_parcalar)
        tarih = tarih_parse(birlesik)
        if not tarih:
            # Devam satırı (önceki harekete açıklama ekle)
            if onceki_aciklama_ref is not None and hareketler:
                metin = birlesik.strip()
                if metin and not re.match(r"^[\d\sXP]+$", metin):
                    hareketler[-1] = Hareket(
                        tarih=hareketler[-1].tarih,
                        aciklama=hareketler[-1].aciklama + " " + metin,
                        tutar=hareketler[-1].tutar,
                        referans=hareketler[-1].referans,
                    )
            continue
        onceki_aciklama_ref = None
        # B/A formatı: "28.04.2026 11:07 28.04.2026 102142 228.694,39 0,00 B AÇIKLAMA"
        m_ba = _tutar_ba_rx.search(birlesik)
        if m_ba:
            t1 = sayi_parse(m_ba.group(1))
            t2 = sayi_parse(m_ba.group(2))
            ba = m_ba.group(3)
            aciklama = m_ba.group(4).strip()
            if t1 is not None:
                tutar = -abs(t1) if ba == "B" else abs(t1)
                bakiye = t2
                hareketler.append(Hareket(tarih=tarih, aciklama=aciklama, tutar=tutar))
                if bakiye is not None:
                    bakiyeler.append((tutar, bakiye))
                onceki_aciklama_ref = True
                continue
        # TL formatı: "09.04.2026 10.04.2026 AÇIKLAMA 650.000,00 TL 650.039,81 TL"
        m_tl = _tutar_rx.search(birlesik)
        if m_tl:
            tutar = sayi_parse(m_tl.group(1))
            bakiye = sayi_parse(m_tl.group(2))
            aciklama = birlesik[:m_tl.start()].strip()
            # Tarihleri açıklamadan çıkar
            aciklama = re.sub(r"^\d{2}\.\d{2}\.\d{4}\s*", "", aciklama)
            aciklama = re.sub(r"^\d{2}\.\d{2}\.\d{4}\s*", "", aciklama).strip()
            if tutar is not None:
                hareketler.append(Hareket(tarih=tarih, aciklama=aciklama, tutar=tutar))
                if bakiye is not None:
                    bakiyeler.append((tutar, bakiye))
                onceki_aciklama_ref = True
                continue
        # Denizbank: son 2 sayı tutar+bakiye (TL yok, tek boşluk)
        m_son2 = _tutar_son2_rx.search(birlesik)
        if m_son2:
            tutar = sayi_parse(m_son2.group(1))
            bakiye = sayi_parse(m_son2.group(2))
            aciklama = birlesik[:m_son2.start()].strip()
            aciklama = re.sub(r"^\d{2}\.\d{2}\.\d{4}\s*", "", aciklama)
            aciklama = re.sub(r"^\S+\s+", "", aciklama, count=1).strip()  # ref kodu çıkar
            if tutar is not None:
                hareketler.append(Hareket(tarih=tarih, aciklama=aciklama, tutar=tutar))
                if bakiye is not None:
                    bakiyeler.append((tutar, bakiye))
                onceki_aciklama_ref = True
                continue
        # Genel: sayı araması
        tutarlar = []
        aciklama_p = []
        for p in re.split(r"\s{2,}", birlesik):
            s = sayi_parse(p)
            if s is not None and abs(s) > 0.001:
                tutarlar.append(s)
            elif not tarih_parse(p):
                aciklama_p.append(p)
        if not tutarlar:
            continue
        aciklama = " ".join(aciklama_p).strip()
        tutar = tutarlar[0]
        hareketler.append(Hareket(tarih=tarih, aciklama=aciklama, tutar=tutar))
        onceki_aciklama_ref = True

    # Bakiye zincirinden açılış/kapanış
    acilis = kapanis = None
    if len(bakiyeler) >= 2:
        ilk_tut, ilk_bak = bakiyeler[0]
        son_tut, son_bak = bakiyeler[-1]
        acilis = round(ilk_bak - ilk_tut, 2)
        kapanis = round(son_bak, 2)
    elif len(bakiyeler) == 1:
        tut, bak = bakiyeler[0]
        acilis = round(bak - tut, 2)
        kapanis = round(bak, 2)

    banka = banka_iban_adi(iban)
    return EkstreSonuc(hareketler=hareketler, banka_adi=banka, hesap_no=hesap_no,
                       iban=iban, acilis=acilis, kapanis=kapanis,
                       kaynak_dosya=str(yol),
                       not_=f"PDF metin parse ({len(hareketler)} hareket)")


def pdf_parse(yol: Path) -> EkstreSonuc:
    try:
        import pdfplumber
    except ImportError:
        return EkstreSonuc([], not_="pdfplumber kurulu değil. Kur: pip install pdfplumber", kaynak_dosya=str(yol))

    icerik: list[list[str]] = []
    with pdfplumber.open(yol) as pdf:
        for sayfa in pdf.pages:
            tablolar = sayfa.extract_tables()
            for t in tablolar:
                for row in t:
                    icerik.append([("" if c is None else str(c)) for c in row])

    # PDF metninden IBAN/hesap no çıkar (tablo sonucuna eklemek için)
    _pdf_iban = _pdf_hno = ""
    try:
        with pdfplumber.open(yol) as pdf2:
            _pdf_metin = " ".join((s.extract_text() or "") for s in pdf2.pages)
        _im = re.search(r"TR\s*\d{2}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{2}", _pdf_metin)
        if _im:
            _pdf_iban = re.sub(r"\s+", "", _im.group(0))
        _hm = re.search(r"(?:Hesap\s*(?:No|Num)[^:]*[:\s]\s*)(\d[\d\s\-]{5,})", _pdf_metin, re.IGNORECASE)
        if _hm:
            _pdf_hno = re.sub(r"[\s\-]", "", _hm.group(1))
    except Exception:
        pass

    def _pdf_meta_ekle(sonuc):
        if _pdf_iban and not sonuc.iban:
            sonuc.iban = _pdf_iban
        if _pdf_hno and not sonuc.hesap_no:
            sonuc.hesap_no = _pdf_hno
        if not sonuc.banka_adi and sonuc.iban:
            sonuc.banka_adi = banka_iban_adi(sonuc.iban)

    # 1) Tablo bulundu → None-ağırlıklı kolonları temizle (Garanti/Denizbank sorunu)
    if icerik:
        temiz = _pdf_tablo_temizle(icerik)
        sonuc = _generic_satirlardan_hareket(temiz, yol)
        if sonuc.hareketler:
            _pdf_meta_ekle(sonuc)
            return sonuc
        # Temizleme sonrası da başarısız → orijinal ile dene
        sonuc = _generic_satirlardan_hareket(icerik, yol)
        if sonuc.hareketler:
            _pdf_meta_ekle(sonuc)
            return sonuc

    # 2) Tablo yok VEYA tablo başarısız → metin bazlı parse (her zaman dene)
    metin_sonuc = _pdf_metin_hareket(yol)
    if metin_sonuc.hareketler:
        return metin_sonuc

    # 3) Boş hesap kontrolü ("Görüntülenecek kayıt bulunmuyor" vb.)
    try:
        with pdfplumber.open(yol) as pdf:
            tum = " ".join((s.extract_text() or "") for s in pdf.pages)
        if "kayıt bulunmuyor" in tum.lower() or "kayit bulunmuyor" in tum.lower():
            return EkstreSonuc([], not_="Hesapta hareket yok (boş dönem).", kaynak_dosya=str(yol))
        # Metin varsa OCR'a gerek yok — text parse yeterli
        if len(tum.strip()) > 50:
            return EkstreSonuc([], not_="PDF tablo/metin parse başarısız (format tanınmadı).",
                                kaynak_dosya=str(yol))
    except Exception:
        pass

    # 4) Gerçekten taranmış (metin çıkmayan) PDF → OCR dene
    ocr = _ocr_parse(yol)
    if ocr and ocr.hareketler:
        return ocr

    return EkstreSonuc([], not_="PDF parse edilemedi (tablo/metin/OCR başarısız).",
                        kaynak_dosya=str(yol))


# ----------------------------------------------------------------------------- #
# RESİM OCR (JPG / PNG / WhatsApp screenshot / taranmış PDF)
# ----------------------------------------------------------------------------- #
_ocr_reader = None

def _get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        _ocr_reader = easyocr.Reader(["tr", "en"], gpu=False)
    return _ocr_reader


def _ocr_satirlara_ayir(metin_parcalari: list) -> list[list[str]]:
    """OCR sonuçlarını y koordinatına göre satırlara gruplar."""
    if not metin_parcalari:
        return []
    parcalar = sorted(metin_parcalari, key=lambda p: (p[0][0][1], p[0][0][0]))
    satirlar = []
    satir_yuksekligi = 15
    mevcut_satir = [parcalar[0]]
    mevcut_y = parcalar[0][0][0][1]

    for p in parcalar[1:]:
        y = p[0][0][1]
        if abs(y - mevcut_y) < satir_yuksekligi:
            mevcut_satir.append(p)
        else:
            mevcut_satir.sort(key=lambda x: x[0][0][0])
            satirlar.append([x[1] for x in mevcut_satir])
            mevcut_satir = [p]
            mevcut_y = y
    if mevcut_satir:
        mevcut_satir.sort(key=lambda x: x[0][0][0])
        satirlar.append([x[1] for x in mevcut_satir])
    return satirlar


def _ocr_parse(yol: Path) -> EkstreSonuc | None:
    """Resim veya taranmış PDF'den OCR ile hareket çıkar."""
    ext = yol.suffix.lower()
    try:
        reader = _get_ocr_reader()
    except Exception as e:
        return EkstreSonuc([], not_=f"OCR yüklenemedi: {e}", kaynak_dosya=str(yol))

    goruntuler = []
    if ext == ".pdf":
        try:
            from pdf2image import convert_from_path
            goruntuler = convert_from_path(str(yol), dpi=300)
        except ImportError:
            try:
                import fitz
                doc = fitz.open(str(yol))
                for sayfa in doc:
                    pix = sayfa.get_pixmap(dpi=300)
                    from PIL import Image
                    import io
                    img = Image.open(io.BytesIO(pix.tobytes("png")))
                    goruntuler.append(img)
                doc.close()
            except ImportError:
                return None
    elif ext in (".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"):
        from PIL import Image
        goruntuler = [Image.open(yol)]
    else:
        return None

    if not goruntuler:
        return None

    import numpy as np
    tum_satirlar = []
    for img in goruntuler:
        img_array = np.array(img)
        sonuclar = reader.readtext(img_array)
        satirlar = _ocr_satirlara_ayir(sonuclar)
        tum_satirlar.extend(satirlar)

    if not tum_satirlar:
        return EkstreSonuc([], not_="OCR metin bulamadı.", kaynak_dosya=str(yol))

    # IBAN tespiti
    tum_metin = " ".join(" ".join(s) for s in tum_satirlar)
    iban_m = re.search(r"TR\s*\d{2}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{2}", tum_metin)
    iban = iban_m.group(0).replace(" ", "") if iban_m else ""

    # Hesap no tespiti
    hesap_no = ""
    hno_m = re.search(r"(?:Hesap\s*(?:No|Num)[^:]*:\s*|(?:Hesap|Account)\s+)(\d[\d\s-]{5,})", tum_metin, re.IGNORECASE)
    if hno_m:
        hesap_no = re.sub(r"\s", "", hno_m.group(1))

    hareketler = []
    for satir in tum_satirlar:
        birlesik = " ".join(satir)
        tarih = tarih_parse(birlesik)
        if not tarih:
            continue
        tutarlar = []
        aciklama_parcalari = []
        for hucre in satir:
            s = sayi_parse(hucre)
            if s is not None and abs(s) > 0.001:
                tutarlar.append(s)
            elif not tarih_parse(hucre):
                aciklama_parcalari.append(hucre)
        if not tutarlar:
            continue
        aciklama = " ".join(aciklama_parcalari).strip()
        if not aciklama:
            aciklama = birlesik
        if len(tutarlar) == 1:
            tutar = tutarlar[0]
        elif len(tutarlar) >= 2:
            # İlk iki tutar borç/alacak olabilir, son bakiye olabilir
            t1, t2 = tutarlar[0], tutarlar[1]
            if t1 == 0:
                tutar = t2
            elif t2 == 0:
                tutar = -abs(t1)
            else:
                tutar = t1
        else:
            continue
        hareketler.append(Hareket(tarih=tarih, aciklama=aciklama, tutar=tutar))

    banka = banka_iban_adi(iban)
    return EkstreSonuc(
        hareketler=hareketler,
        banka_adi=banka or "OCR",
        hesap_no=hesap_no,
        iban=iban,
        kaynak_dosya=str(yol),
        not_=f"OCR ile okundu ({len(hareketler)} hareket)",
    )


# ----------------------------------------------------------------------------- #
# Dispatcher
# ----------------------------------------------------------------------------- #
RESIM_UZANTILARI = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"}

def _dosya_adından_meta(yol: Path, sonuc: EkstreSonuc) -> None:
    """Dosya adından IBAN veya hesap no çıkarmayı dene."""
    ad = yol.stem
    if not sonuc.iban:
        m = re.search(r"TR\d{24}", ad.replace(" ", ""))
        if m:
            sonuc.iban = m.group(0)
    if not sonuc.hesap_no:
        # "12090117828" gibi 6+ haneli rakam dizisi
        parcalar = re.findall(r"\d{6,}", ad)
        if parcalar:
            sonuc.hesap_no = max(parcalar, key=len)
    if not sonuc.banka_adi and sonuc.iban:
        sonuc.banka_adi = banka_iban_adi(sonuc.iban)


def dosya_parse(yol: Path) -> EkstreSonuc:
    yol = Path(yol)
    ext = yol.suffix.lower()
    if ext == ".pdf":
        s = pdf_parse(yol)
        _dosya_adından_meta(yol, s)
        return s
    if ext == ".csv":
        return csv_parse(yol)
    if ext in (".xlsx", ".xls", ".xlsm", ".htm", ".html"):
        s = excel_parse(yol)
        if s.hareketler:
            _dosya_adından_meta(yol, s)
            return s
        try:
            from .parser_akbank import akbank_uygun_mu, akbank_parse
            if ext == ".xlsx" and akbank_uygun_mu(yol):
                return akbank_parse(yol)
        except Exception:
            pass
        _dosya_adından_meta(yol, s)
        return s
    if ext in RESIM_UZANTILARI:
        sonuc = _ocr_parse(yol)
        if sonuc:
            return sonuc
        return EkstreSonuc([], not_=f"Resim OCR başarısız: {yol.name}", kaynak_dosya=str(yol))
    return EkstreSonuc([], not_=f"Desteklenmeyen format: {ext}", kaynak_dosya=str(yol))
