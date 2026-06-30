# -*- coding: utf-8 -*-
"""
Garanti / Yapıkredi / Halkbank ekstre parser'ları.

Hepsi tutarı İŞARETLİ verir (borç negatif, alacak pozitif) ve yürüyen bakiye taşır.
Açılış = ilk (kronolojik) satırın (bakiye - tutar); Kapanış = son satırın bakiyesi.
.xls (Garanti, Yapıkredi) → xlrd; .xlsx (Halkbank) → openpyxl.
"""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from .eslestirici import Hareket
from .parser import EkstreSonuc, sayi_parse, tarih_parse


# ----------------------------------------------------------------------------- #
def _xls_rows(yol: Path) -> list[list]:
    import xlrd
    wb = xlrd.open_workbook(yol)
    ws = wb.sheet_by_index(0)
    return [[ws.cell_value(r, c) for c in range(ws.ncols)] for r in range(ws.nrows)]


def _xlsx_rows(yol: Path) -> list[list]:
    import openpyxl
    wb = openpyxl.load_workbook(yol, data_only=True)
    ws = wb.active
    return [[("" if c is None else c) for c in row] for row in ws.iter_rows(values_only=True)]


def _meta_bul(rows, anahtar: str, kolonlar=(1, 2)) -> str:
    """İlk kolonu 'anahtar' ile başlayan satırın değer kolonunu döner."""
    for row in rows:
        if not row:
            continue
        ilk = str(row[0]).strip()
        if ilk.lower().startswith(anahtar.lower()):
            for k in kolonlar:
                if k < len(row) and str(row[k]).strip():
                    return str(row[k]).strip()
    return ""


def _kronolojik(hareketler: list[Hareket]) -> list[Hareket]:
    def key(h):
        try:
            g, a, y = h.tarih.split("/")
            return (int(y), int(a), int(g))
        except Exception:
            return (0, 0, 0)
    return sorted(hareketler, key=key)


def _acilis_kapanis(rows, i_tarih, i_tutar, i_bakiye, bas):
    """İlk ve son veri satırından açılış/kapanış hesaplar (dosya sırasına göre)."""
    veri = []
    for row in rows[bas + 1:]:
        if i_tarih >= len(row):
            continue
        t = tarih_parse(row[i_tarih])
        if not t:
            continue
        tut = sayi_parse(row[i_tutar]) if i_tutar < len(row) else None
        bak = sayi_parse(row[i_bakiye]) if i_bakiye < len(row) else None
        if tut is None or bak is None:
            continue
        veri.append((t, tut, bak))
    if not veri:
        return None, None
    # Kronolojik sırala (tarih artan); aynı tarihte dosya sırası korunur
    # Dosyadaki sıra kapanış/açılışı belirler — ilk satır en güncel mi en eski mi bilinmez,
    # bu yüzden bakiyeden güvenli hesap: ilk dosya satırı + sonuncu.
    ilk_bak, ilk_tut = veri[0][2], veri[0][1]
    son_bak = veri[-1][2]
    return ilk_bak, son_bak, ilk_tut


def _generic_signed(rows, bas, i_tarih, i_aciklama, i_tutar, i_bakiye, hesap_no, iban) -> EkstreSonuc:
    hareketler: list[Hareket] = []
    for row in rows[bas + 1:]:
        if i_tarih >= len(row):
            continue
        t = tarih_parse(row[i_tarih])
        if not t:
            continue
        tut = sayi_parse(row[i_tutar]) if i_tutar < len(row) else None
        if tut is None:
            continue
        ack = str(row[i_aciklama]).strip() if i_aciklama < len(row) else ""
        hareketler.append(Hareket(tarih=t, aciklama=ack, tutar=tut))

    # Açılış/kapanış: dosya sırasına bakmadan, ilk ve son satırın bakiyesinden
    veri_bak = []
    for row in rows[bas + 1:]:
        if i_tarih >= len(row):
            continue
        if not tarih_parse(row[i_tarih]):
            continue
        tut = sayi_parse(row[i_tutar]) if i_tutar < len(row) else None
        bak = sayi_parse(row[i_bakiye]) if i_bakiye < len(row) else None
        if tut is not None and bak is not None:
            veri_bak.append((tut, bak))
    acilis = kapanis = None
    if veri_bak:
        # ilk satır en güncelse (descending) ya da en eskiyse (ascending) fark etmez:
        # kronolojik açılış = en eski satırın (bakiye - tutar); kapanış = en yeni satırın bakiyesi
        # Dosya sırası belirsiz → hareketleri kronolojik alıp bakiye zinciriyle değil,
        # ilk/son DOSYA satırından hesapla ve büyüğü kapanış kabul etme; ikisini de ver.
        ilk_tut, ilk_bak = veri_bak[0]
        son_tut, son_bak = veri_bak[-1]
        # Hareketler kronolojik mi azalan mı? İlk hareket tarihiyle son hareket tarihini kıyasla
        if hareketler:
            ilk_h, son_h = hareketler[0], hareketler[-1]
            def d(h):
                g, a, y = h.tarih.split("/"); return (int(y), int(a), int(g))
            if d(ilk_h) <= d(son_h):   # dosya ARTAN (ilk=en eski)
                acilis = round(ilk_bak - ilk_tut, 2)
                kapanis = round(son_bak, 2)
            else:                       # dosya AZALAN (ilk=en yeni)
                acilis = round(son_bak - son_tut, 2)
                kapanis = round(ilk_bak, 2)

    hareketler = _kronolojik(hareketler)
    return EkstreSonuc(hareketler=hareketler, banka_adi="", hesap_no=hesap_no,
                       iban=iban, acilis=acilis, kapanis=kapanis)


# ----------------------------------------------------------------------------- #
# GARANTİ (.xls)
# ----------------------------------------------------------------------------- #
def garanti_parse(yol: Path) -> EkstreSonuc:
    rows = _xls_rows(yol)
    hesap = _meta_bul(rows, "Hesap")               # '637 - 6299525 TL'
    iban = _meta_bul(rows, "IBAN").replace(" ", "")
    hesap_no = ""
    m = re.search(r"(\d{6,})", hesap)
    if m:
        hesap_no = m.group(1)
    # Başlık satırı: 'Tarih','Açıklama','Etiket','Tutar','Bakiye','Dekont No'
    bas = -1
    for i, row in enumerate(rows):
        if row and str(row[0]).strip() == "Tarih" and any("Tutar" in str(c) for c in row):
            bas = i
            break
    if bas < 0:
        return EkstreSonuc([], not_="Garanti başlık bulunamadı", kaynak_dosya=str(yol))
    sonuc = _generic_signed(rows, bas, 0, 1, 3, 4, hesap_no, iban)
    sonuc.banka_adi = "GARANTİ"
    sonuc.kaynak_dosya = str(yol)
    return sonuc


# ----------------------------------------------------------------------------- #
# YAPIKREDİ (.xls)
# ----------------------------------------------------------------------------- #
def yapikredi_parse(yol: Path) -> EkstreSonuc:
    rows = _xls_rows(yol)
    iban = _meta_bul(rows, "IBAN").replace(" ", "")
    hesap_no = ""
    m = re.search(r"(\d{6,})$", iban)
    if m:
        hesap_no = m.group(1)
    # Başlık: 'Tarih','Saat','İşlem','Kanal','Referans No','Açıklama','İşlem Tutarı','Bakiye','Döviz Cinsi'
    bas = -1
    for i, row in enumerate(rows):
        if row and str(row[0]).strip() == "Tarih" and any("Tutar" in str(c) for c in row):
            bas = i
            break
    if bas < 0:
        return EkstreSonuc([], not_="Yapıkredi başlık bulunamadı", kaynak_dosya=str(yol))
    sonuc = _generic_signed(rows, bas, 0, 5, 6, 7, hesap_no, iban)
    sonuc.banka_adi = "YAPIKREDİ"
    sonuc.kaynak_dosya = str(yol)
    return sonuc


# ----------------------------------------------------------------------------- #
# HALKBANK (.xlsx)
# ----------------------------------------------------------------------------- #
def halkbank_parse(yol: Path) -> EkstreSonuc:
    rows = _xlsx_rows(yol)
    hesap_no = _meta_bul(rows, "Hesap Numarası")
    iban = _meta_bul(rows, "IBAN").replace(" ", "")
    # Başlık: 'İşlem Tarihi','Hesaba Giriş Tarihi','Açıklama','İşlem Tutarı','Yeni Bakiye'
    bas = -1
    for i, row in enumerate(rows):
        if row and "İşlem Tarihi" in str(row[0]):
            bas = i
            break
    if bas < 0:
        return EkstreSonuc([], not_="Halkbank başlık bulunamadı", kaynak_dosya=str(yol))
    sonuc = _generic_signed(rows, bas, 0, 2, 3, 4, hesap_no, iban)
    sonuc.banka_adi = "HALKBANK"
    sonuc.kaynak_dosya = str(yol)
    return sonuc


# ----------------------------------------------------------------------------- #
# ZİRAAT (.xlsx) — Borç/Alacak AYRI kolon
# ----------------------------------------------------------------------------- #
def ziraat_parse(yol: Path) -> EkstreSonuc:
    rows = _xlsx_rows(yol)
    # Başlık: Muh Tarih | Valör | Şube | Fiş No | İşl Kd | Borç | Alacak | Bakiye | İşlem Açıklaması | ...
    bas = -1
    for i, row in enumerate(rows):
        if row and str(row[0]).strip() == "Muh Tarih" and any("Açıklama" in str(c) for c in row):
            bas = i
            break
    if bas < 0:
        return EkstreSonuc([], not_="Ziraat başlık bulunamadı", kaynak_dosya=str(yol))

    i_tarih, i_borc, i_alacak, i_bakiye, i_aciklama = 0, 5, 6, 7, 8
    hareketler: list[Hareket] = []
    bakiyeler: list[tuple[float, float]] = []
    for row in rows[bas + 1:]:
        if i_tarih >= len(row):
            continue
        t = tarih_parse(row[i_tarih])
        if not t:
            continue
        borc = sayi_parse(row[i_borc]) if i_borc < len(row) else 0
        alacak = sayi_parse(row[i_alacak]) if i_alacak < len(row) else 0
        tutar = round((alacak or 0) - (borc or 0), 2)
        ack = str(row[i_aciklama]).strip() if i_aciklama < len(row) else ""
        bak = sayi_parse(row[i_bakiye]) if i_bakiye < len(row) else None
        hareketler.append(Hareket(tarih=t, aciklama=ack, tutar=tutar))
        if bak is not None:
            bakiyeler.append((tutar, bak))

    acilis = kapanis = None
    if bakiyeler:
        ilk_tut, ilk_bak = bakiyeler[0]
        son_tut, son_bak = bakiyeler[-1]
        acilis = round(ilk_bak - ilk_tut, 2)   # ascending: ilk = en eski
        kapanis = round(son_bak, 2)

    return EkstreSonuc(hareketler=hareketler, banka_adi="ZİRAAT", hesap_no="815001",
                       iban="", acilis=acilis, kapanis=kapanis, kaynak_dosya=str(yol))


# ----------------------------------------------------------------------------- #
# Tanıma
# ----------------------------------------------------------------------------- #
def banka_tani(yol: Path) -> str:
    """Dosya içeriğinden bankayı tespit eder. Döner: 'GARANTI'|'YAPIKREDI'|'HALKBANK'|''"""
    ext = yol.suffix.lower()
    try:
        if ext == ".xls":
            rows = _xls_rows(yol)
        else:
            rows = _xlsx_rows(yol)
    except Exception:
        return ""
    metin = " ".join(str(c) for row in rows[:15] for c in row).upper()
    if "ZİRAAT" in metin or "ZIRAAT" in metin:
        return "ZIRAAT"
    if "GARANTİ" in metin or "GARANTI" in metin or "GARANTBBVA" in metin or "GARANTİBBVA" in metin:
        return "GARANTI"
    if "YAPI" in metin and "KRED" in metin or "Hesap Hareketleri" in " ".join(str(c) for row in rows[:3] for c in row):
        # Yapıkredi başlığı 'Hesap Hareketleri' + IBAN TR4600067...
        if "TR" in metin and "67010" in metin.replace(" ", ""):
            return "YAPIKREDI"
    if "HALKBANK" in metin or "HALK BANK" in metin or "0001200" in metin.replace(" ", ""):
        return "HALKBANK"
    return ""


def banka_parse(yol: Path) -> EkstreSonuc | None:
    b = banka_tani(yol)
    if b == "ZIRAAT":
        return ziraat_parse(yol)
    if b == "GARANTI":
        return garanti_parse(yol)
    if b == "YAPIKREDI":
        return yapikredi_parse(yol)
    if b == "HALKBANK":
        return halkbank_parse(yol)
    return None
