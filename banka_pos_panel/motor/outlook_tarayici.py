# -*- coding: utf-8 -*-
"""
OUTLOOK BANKA TARAYICI
======================
Outlook gelen kutusunu tarar, banka ekstresi eklerini indirir,
IBAN/hesap_no ile firmaya eşleştirir, panelin kendi klasörüne firma adıyla kaydeder.

Klasör yapısı:
  banka_pos_panel/
    outlook_bankalar/
      2026-06-Haziran/
        ham/          ← Outlook'tan indirilen ham dosyalar
        islenmiş/     ← dagit sonrası çıktı Excel'leri
"""
from __future__ import annotations

import re
import os
import hashlib
from pathlib import Path
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from collections import defaultdict

EKSTRE_UZANTILARI = {".xlsx", ".xls", ".xlsm", ".csv", ".pdf",
                     ".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"}

BASE = Path(__file__).resolve().parent.parent
FIRMA_DIZIN = BASE / "firmalar"
OUTLOOK_BANKALAR = BASE / "outlook_bankalar"

AY_ISIMLERI = {
    1: "Ocak", 2: "Şubat", 3: "Mart", 4: "Nisan",
    5: "Mayıs", 6: "Haziran", 7: "Temmuz", 8: "Ağustos",
    9: "Eylül", 10: "Ekim", 11: "Kasım", 12: "Aralık",
}

BANKA_GONDERICI_DESENLERI = [
    "akbank", "garanti", "isbank", "isbankasi", "işbank",
    "yapikredi", "yapıkredi", "ykb", "halkbank", "vakifbank", "vakıfbank",
    "ziraat", "denizbank", "finansbank", "qnb", "teb", "ing",
    "kuveytturk", "kuveyttürk", "hsbc", "odeabank", "şekerbank",
    "anadolubank", "alternatifbank", "fibabanka", "icbc", "burgan",
    "turkiye finans", "albaraka", "aktifbank",
]

BANKA_KONU_DESENLERI = [
    r"hesap\s*(?:özet|hareketl|ekstre)",
    r"(?:banka|hesap)\s*(?:hareket|döküm|detay)",
    r"ekstre",
    r"account\s*statement",
    r"hesap\s*bilgi",
]

SERBEST_ISLETME = {
    "CIHAN_GUNES",
    "ERDEM_OZSEN", "HULYA_HATUN_AKPINAR", "GIZEM_GIDA",
    "SINAN_CAKMAK", "SAMBAZ_OSGB", "BURAK_PARCA",
}


@dataclass
class IndirilenDosya:
    dosya_yolu: Path
    orijinal_ad: str
    email_konu: str
    email_gonderen: str
    email_tarih: datetime | None
    firma_kodu: str = ""
    firma_adi: str = ""
    hesap_kodu: str = ""
    hesap_adi: str = ""
    durum: str = "bekliyor"


@dataclass
class TaramaSonucu:
    taranan_email: int = 0
    indirilen_dosya: int = 0
    eslesen_firma: int = 0
    eslesmeyen: int = 0
    atlanan: int = 0
    dosyalar: list[IndirilenDosya] = field(default_factory=list)
    hatalar: list[str] = field(default_factory=list)
    ham_klasor: Path = field(default_factory=Path)
    islenmiş_klasor: Path = field(default_factory=Path)


def _temizle(s: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', "", s).strip()


def _dosya_hash(yol: Path) -> str:
    h = hashlib.md5()
    with open(yol, "rb") as f:
        for blok in iter(lambda: f.read(8192), b""):
            h.update(blok)
    return h.hexdigest()


def ay_klasor_yolu(ay: int, yil: int) -> Path:
    """Panelin içindeki ay klasörü yolunu döner."""
    ay_isim = AY_ISIMLERI.get(ay, str(ay))
    return OUTLOOK_BANKALAR / f"{yil}-{ay:02d}-{ay_isim}"


def mevcut_aylar() -> list[tuple[int, int, str, Path]]:
    """Mevcut ay klasörlerini döner: [(yil, ay, etiket, path), ...]"""
    if not OUTLOOK_BANKALAR.exists():
        return []
    sonuc = []
    for d in sorted(OUTLOOK_BANKALAR.iterdir(), reverse=True):
        if not d.is_dir():
            continue
        m = re.match(r"(\d{4})-(\d{2})-(.+)", d.name)
        if m:
            yil, ay, isim = int(m.group(1)), int(m.group(2)), m.group(3)
            ham = d / "ham"
            dosya_sayisi = len(list(ham.glob("*"))) if ham.exists() else 0
            sonuc.append((yil, ay, f"{isim} {yil} ({dosya_sayisi} dosya)", d))
    return sonuc


class OutlookTarayici:

    def __init__(self, ay: int | None = None, yil: int | None = None,
                 ilerleme_cb=None):
        bugun = datetime.now()
        self.ay = ay or bugun.month
        self.yil = yil or bugun.year
        self.ay_klasor = ay_klasor_yolu(self.ay, self.yil)
        self.ham_klasor = self.ay_klasor / "ham"
        self.islenmiş_klasor = self.ay_klasor / "işlenmiş"
        self.ilerleme_cb = ilerleme_cb
        self._iban_idx: dict = {}
        self._no_idx: dict = {}

    def _log(self, msg: str):
        if self.ilerleme_cb:
            self.ilerleme_cb(msg)

    def _index_kur(self):
        import openpyxl
        from motor.eslestirici import _ilk_satir_basliklar
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
            wb.close()
        self._iban_idx = iban_idx
        self._no_idx = no_idx
        self._log(f"📊 {len(iban_idx)} IBAN, {len(no_idx)} hesap no indekslendi")

    def _outlook_baglan(self):
        import win32com.client
        outlook = win32com.client.Dispatch("Outlook.Application")
        ns = outlook.GetNamespace("MAPI")
        return ns

    def _email_banka_mi(self, mail) -> bool:
        gonderen = str(getattr(mail, "SenderEmailAddress", "") or "").lower()
        konu = str(getattr(mail, "Subject", "") or "").lower()
        govde = str(getattr(mail, "Body", "") or "")[:500].lower()
        for desen in BANKA_GONDERICI_DESENLERI:
            if desen in gonderen:
                return True
        for desen in BANKA_KONU_DESENLERI:
            if re.search(desen, konu, re.IGNORECASE):
                return True
            if re.search(desen, govde, re.IGNORECASE):
                return True
        ek_sayisi = getattr(mail, "Attachments", None)
        if ek_sayisi:
            for i in range(1, ek_sayisi.Count + 1):
                ek = ek_sayisi.Item(i)
                uzanti = Path(ek.FileName).suffix.lower()
                if uzanti in EKSTRE_UZANTILARI:
                    ad_lower = ek.FileName.lower()
                    for banka in BANKA_GONDERICI_DESENLERI:
                        if banka in ad_lower:
                            return True
                    if any(kw in ad_lower for kw in ("ekstre", "hesap", "hareket", "statement")):
                        return True
        return False

    def _ek_uygun_mu(self, dosya_adi: str) -> bool:
        uzanti = Path(dosya_adi).suffix.lower()
        if uzanti not in EKSTRE_UZANTILARI:
            return False
        ad_lower = dosya_adi.lower()
        if any(skip in ad_lower for skip in ("imza", "logo", "header", "footer", "banner")):
            return False
        return True

    def _dosya_firmaya_esle(self, dosya: IndirilenDosya) -> bool:
        try:
            from motor.parser import dosya_parse
            sonuc = dosya_parse(dosya.dosya_yolu)
            if not sonuc.hareketler:
                dosya.durum = "eşleşmedi"
                return False
            iban = (sonuc.iban or "").replace(" ", "").upper()
            no_t = re.sub(r"\D", "", (sonuc.hesap_no or "").split("-")[-1]).lstrip("0")
            iban_no = re.sub(r"\D", "", iban)[-10:].lstrip("0") if iban else ""

            eslesme = self._iban_idx.get(iban) or self._no_idx.get(no_t)
            if not eslesme:
                adaylar = []
                for aday_no, kayitlar in self._no_idx.items():
                    for sno in (no_t, iban_no):
                        if sno and len(sno) >= 5 and (aday_no.endswith(sno) or sno.endswith(aday_no)):
                            adaylar += kayitlar
                if not adaylar and iban:
                    for aday_iban, kayitlar in self._iban_idx.items():
                        if aday_iban and (aday_iban[-16:] in iban or iban[-16:] in aday_iban):
                            adaylar += kayitlar
                eslesme = adaylar or None

            if not eslesme:
                dosya.durum = "eşleşmedi"
                return False
            firmalar_set = {e[0] for e in eslesme}
            if len(firmalar_set) > 1:
                dosya.durum = "eşleşmedi"
                return False
            firma, kod, ad, no = eslesme[0]
            if firma in SERBEST_ISLETME:
                dosya.durum = "atlandı"
                return False
            dosya.firma_kodu = firma
            dosya.hesap_kodu = kod
            dosya.hesap_adi = ad
            dosya.durum = "eşleşti"
            return True
        except Exception:
            dosya.durum = "hata"
            return False

    def tara_ve_indir(self, sadece_tara: bool = False) -> TaramaSonucu:
        sonuc = TaramaSonucu()
        sonuc.ham_klasor = self.ham_klasor
        sonuc.islenmiş_klasor = self.islenmiş_klasor

        self._log("🔌 Outlook'a bağlanılıyor...")
        try:
            ns = self._outlook_baglan()
        except Exception as e:
            sonuc.hatalar.append(f"Outlook bağlantı hatası: {e}")
            self._log(f"❌ Outlook bağlanamadı: {e}")
            return sonuc

        self._log("📊 Firma indeksi oluşturuluyor...")
        self._index_kur()

        inbox = ns.GetDefaultFolder(6)
        ay_baslangic = datetime(self.yil, self.ay, 1)
        if self.ay == 12:
            ay_bitis = datetime(self.yil + 1, 1, 1)
        else:
            ay_bitis = datetime(self.yil, self.ay + 1, 1)
        ay_bitis_genis = ay_bitis + timedelta(days=10)

        filtre = (
            f"[ReceivedTime] >= '{ay_baslangic.strftime('%m/%d/%Y')}' AND "
            f"[ReceivedTime] < '{ay_bitis_genis.strftime('%m/%d/%Y')}'"
        )
        self._log(f"📧 Gelen kutusu taranıyor ({AY_ISIMLERI[self.ay]} {self.yil})...")

        try:
            items = inbox.Items.Restrict(filtre)
            items.Sort("[ReceivedTime]", True)
        except Exception as e:
            sonuc.hatalar.append(f"Outlook filtre hatası: {e}")
            return sonuc

        self.ham_klasor.mkdir(parents=True, exist_ok=True)
        mevcut_hashler = set()
        for mevcut in self.ham_klasor.iterdir():
            if mevcut.is_file() and mevcut.suffix.lower() in EKSTRE_UZANTILARI:
                try:
                    mevcut_hashler.add(_dosya_hash(mevcut))
                except:
                    pass

        islenen = 0
        from dagit_ve_isle import FIRMA_ADLARI
        try:
            for mail in items:
                islenen += 1
                if islenen % 50 == 0:
                    self._log(f"📧 {islenen} email tarandı...")
                try:
                    if not self._email_banka_mi(mail):
                        continue
                    sonuc.taranan_email += 1
                    ekler = getattr(mail, "Attachments", None)
                    if not ekler or ekler.Count == 0:
                        continue
                    konu = str(getattr(mail, "Subject", "") or "")
                    gonderen = str(getattr(mail, "SenderEmailAddress", "") or "")
                    tarih = getattr(mail, "ReceivedTime", None)
                    if tarih:
                        try:
                            tarih = datetime(tarih.year, tarih.month, tarih.day,
                                             tarih.hour, tarih.minute, tarih.second)
                        except:
                            tarih = None

                    for i in range(1, ekler.Count + 1):
                        ek = ekler.Item(i)
                        if not self._ek_uygun_mu(ek.FileName):
                            continue
                        if sadece_tara:
                            dosya = IndirilenDosya(
                                dosya_yolu=Path(""),
                                orijinal_ad=ek.FileName,
                                email_konu=konu,
                                email_gonderen=gonderen,
                                email_tarih=tarih,
                                durum="tarandı",
                            )
                            sonuc.dosyalar.append(dosya)
                            sonuc.indirilen_dosya += 1
                            continue

                        gecici = self.ham_klasor / f"_tmp_{ek.FileName}"
                        try:
                            ek.SaveAsFile(str(gecici))
                        except Exception:
                            continue
                        dosya_h = _dosya_hash(gecici)
                        if dosya_h in mevcut_hashler:
                            gecici.unlink(missing_ok=True)
                            continue
                        mevcut_hashler.add(dosya_h)

                        hedef_ad = _temizle(ek.FileName)
                        hedef_yol = self.ham_klasor / hedef_ad
                        sayac = 1
                        while hedef_yol.exists():
                            kok = Path(hedef_ad).stem
                            uzanti = Path(hedef_ad).suffix
                            hedef_yol = self.ham_klasor / f"{kok}_{sayac}{uzanti}"
                            sayac += 1
                        gecici.rename(hedef_yol)

                        dosya = IndirilenDosya(
                            dosya_yolu=hedef_yol,
                            orijinal_ad=ek.FileName,
                            email_konu=konu,
                            email_gonderen=gonderen,
                            email_tarih=tarih,
                        )
                        if self._dosya_firmaya_esle(dosya):
                            sonuc.eslesen_firma += 1
                            firma_ad = FIRMA_ADLARI.get(dosya.firma_kodu, dosya.firma_kodu)
                            dosya.firma_adi = firma_ad
                            yeni_ad = _temizle(f"{firma_ad}_{hedef_yol.name}")
                            yeni_yol = self.ham_klasor / yeni_ad
                            if not yeni_yol.exists():
                                try:
                                    hedef_yol.rename(yeni_yol)
                                    dosya.dosya_yolu = yeni_yol
                                except:
                                    pass
                        elif dosya.durum == "atlandı":
                            sonuc.atlanan += 1
                        else:
                            sonuc.eslesmeyen += 1
                        sonuc.dosyalar.append(dosya)
                        sonuc.indirilen_dosya += 1
                except Exception as e:
                    sonuc.hatalar.append(f"Email işleme hatası: {e}")
                    continue
        except Exception as e:
            sonuc.hatalar.append(f"Tarama döngüsü hatası: {e}")

        self._log(f"✅ Tamamlandı: {sonuc.indirilen_dosya} dosya, "
                  f"{sonuc.eslesen_firma} eşleşti, {sonuc.eslesmeyen} eşleşmedi")
        return sonuc

    def isle(self) -> str:
        """ham/ klasöründeki dosyaları dagit motoruyla işle → işlenmiş/ klasörüne yaz."""
        if not self.ham_klasor.exists():
            return "Ham klasör bulunamadı"
        dosyalar = [f for f in self.ham_klasor.iterdir()
                    if f.is_file() and f.suffix.lower() in EKSTRE_UZANTILARI]
        if not dosyalar:
            return "Ham klasörde dosya yok"

        self.islenmiş_klasor.mkdir(parents=True, exist_ok=True)
        import io, contextlib
        from dagit_ve_isle import dagit
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            dagit(self.ham_klasor, self.islenmiş_klasor.name,
                  cikti_kok_override=self.islenmiş_klasor)
        return buf.getvalue()
