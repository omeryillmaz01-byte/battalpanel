# -*- coding: utf-8 -*-
"""
TCMB döviz kuru modülü — döviz banka hareketlerini TL'ye çevirmek için.

Kurallar (kullanıcı talimatı):
  • Normal döviz hareketi: işlem tarihinden 1 ÖNCEKİ (iş günü) TCMB DÖVİZ ALIŞ kuru × döviz = TL
  • Hesaplar arası virman: TCMB'ye bakma → kur = TL ÷ döviz (işlemin kendi tutarlarından)
  • Arbitraj: EUR TCMB'den TL'ye çevrilir; USD kuru = TL ÷ USD

TCMB XML: https://www.tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml
Hafta sonu/tatilde o güne XML yok → en yakın önceki iş gününe yürünür.
Kurlar JSON önbelleğine yazılır (tekrar tekrar indirmemek için).
"""
from __future__ import annotations

import json
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

_CACHE_YOL = Path(__file__).resolve().parent.parent / "tcmb_kur_cache.json"
_bellek: dict[str, dict[str, float]] = {}


def _cache_yukle() -> None:
    global _bellek
    if not _bellek and _CACHE_YOL.exists():
        try:
            _bellek = json.loads(_CACHE_YOL.read_text(encoding="utf-8"))
        except Exception:
            _bellek = {}


def _cache_yaz() -> None:
    try:
        _CACHE_YOL.write_text(json.dumps(_bellek, ensure_ascii=False, indent=0), encoding="utf-8")
    except Exception:
        pass


def _gun_kurlarini_indir(d: datetime) -> dict[str, float] | None:
    """Belirli bir günün TCMB döviz ALIŞ kurlarını indirir. O gün yayın yoksa None."""
    anahtar = d.strftime("%Y-%m-%d")
    _cache_yukle()
    if anahtar in _bellek:
        return _bellek[anahtar] or None
    url = f"https://www.tcmb.gov.tr/kurlar/{d.strftime('%Y%m')}/{d.strftime('%d%m%Y')}.xml"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=15).read()
        root = ET.fromstring(data)
        kurlar = {}
        for cur in root.findall("Currency"):
            kod = cur.get("CurrencyCode")
            alis = cur.findtext("ForexBuying")
            if kod and alis and alis.strip():
                kurlar[kod] = float(alis.replace(",", "."))
        _bellek[anahtar] = kurlar
        _cache_yaz()
        return kurlar
    except Exception:
        _bellek[anahtar] = {}     # o gün yayın yok → boş işaretle (tekrar denememek için)
        _cache_yaz()
        return None


def _tarih_parse(tarih: str | datetime) -> datetime:
    if isinstance(tarih, datetime):
        return tarih
    s = str(tarih).strip()
    for fmt in ("%d/%m/%Y", "%d.%m.%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise ValueError(f"Tarih çözülemedi: {tarih}")


def onceki_gun_kuru(doviz: str, islem_tarihi: str | datetime, geri_max: int = 10) -> float | None:
    """İşlem tarihinden 1 ÖNCEKİ iş gününün TCMB döviz alış kuru.
    O gün yayın yoksa (hafta sonu/tatil) en yakın önceki güne yürür."""
    d = _tarih_parse(islem_tarihi) - timedelta(days=1)
    doviz = doviz.upper()
    for _ in range(geri_max):
        kurlar = _gun_kurlarini_indir(d)
        if kurlar and doviz in kurlar:
            return kurlar[doviz]
        d -= timedelta(days=1)
    return None


def tl_cevir(doviz: str, tutar: float, islem_tarihi: str | datetime) -> tuple[float | None, float | None]:
    """Normal döviz hareketi → (kur, tl_tutar). Kur bulunamazsa (None, None)."""
    kur = onceki_gun_kuru(doviz, islem_tarihi)
    if kur is None:
        return None, None
    return kur, round(tutar * kur, 2)


def virman_kuru(tl_tutar: float, doviz_tutar: float) -> float | None:
    """Hesaplar arası virman → kur = TL ÷ döviz (TCMB'ye bakmadan)."""
    if not doviz_tutar:
        return None
    return round(abs(tl_tutar) / abs(doviz_tutar), 4)


def arbitraj(eur_tutar: float, usd_tutar: float, islem_tarihi: str | datetime) -> dict | None:
    """Arbitraj: EUR TCMB'den TL'ye → USD kuru = TL ÷ USD.
    Döner: {eur_kur, tl, usd_kur}"""
    eur_kur = onceki_gun_kuru("EUR", islem_tarihi)
    if eur_kur is None or not usd_tutar:
        return None
    tl = round(abs(eur_tutar) * eur_kur, 2)
    usd_kur = round(tl / abs(usd_tutar), 4)
    return {"eur_kur": eur_kur, "tl": tl, "usd_kur": usd_kur}


if __name__ == "__main__":
    print("Test — 05/06/2026 işlemi için önceki gün kuru:")
    print("  USD:", onceki_gun_kuru("USD", "05/06/2026"))
    print("  EUR:", onceki_gun_kuru("EUR", "05/06/2026"))
    print("  100 USD → TL:", tl_cevir("USD", 100, "05/06/2026"))
    print("  Virman 4588.73 TL / 100 USD → kur:", virman_kuru(4588.73, 100))
