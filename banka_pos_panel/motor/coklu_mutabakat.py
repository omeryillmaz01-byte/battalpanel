# -*- coding: utf-8 -*-
"""
Çoklu ekstre MUTABAKAT — hesaplar arası VİRMAN mükerrerlerini ayıklar.

Sorun:
  Hesaplar arası transfer her İKİ banka hesabının ekstresinde de görünür.
    102.05 ekstresi:  VİRMAN 0271-0028620  -250.000   (çıkış)
    102.08 ekstresi:  VİRMAN 0271-0183316  +250.000   (giriş)
  İkisi de Mikro'ya işlenirse aynı transfer iki kez kaydedilir.

Çözüm:
  Tüm ekstreler birlikte verilince eşleşen virman çiftleri bulunur; biri KORUNUR,
  diğeri 'MÜKERRER' işaretlenip çıkarılır (eşleştirilerek silinir).

Eşleşme ölçütü (A ve B iki ayrı ekstrede):
  - A.kendi_hesap == B.karşı_hesap   ve   A.karşı_hesap == B.kendi_hesap
  - aynı tarih
  - |A.tutar| == |B.tutar|
  - işaretler zıt (biri +, biri -)
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .eslestirici import Eslesme, normalize


@dataclass
class EkstreKaydi:
    """Bir bankanın işlenmiş ekstresi: hangi 102.xx hesabı + eşleşmeleri."""
    hesap_kodu: str            # bu ekstrenin ait olduğu 102.xx
    hesap_no: str              # bu hesabın no'su (örn '0183316' / '183316')
    eslesmeler: list[Eslesme]


def _no_sade(s: str) -> str:
    """'0271-0028620' / '0028620' / '28620' → '28620'"""
    if not s:
        return ""
    return s.split("-")[-1].strip().lstrip("0")


def _virman_hedef_no(aciklama: str) -> str:
    """Virman açıklamasındaki karşı hesap no'sunu çıkarır."""
    import re
    for no in re.findall(r"\d{6,}", aciklama):
        return no.lstrip("0")
    return ""


def virman_mutabakat(ekstreler: list[EkstreKaydi]) -> dict:
    """
    Tüm ekstreleri karşılaştırır, mükerrer virman çiftlerini işaretler.
    Eşleşen çiftin BİRİ (çıkış/negatif olan) korunur, diğeri (giriş) MÜKERRER işaretlenir.
    Eşleşme bulunamayan virmanlar olduğu gibi kalır (tek taraflı — diğer hesap kapsam dışı olabilir).

    Dönüş: istatistik sözlüğü. Eslesme nesneleri yerinde güncellenir
           (mukerrer olanın .not_ = 'MÜKERRER...' ve metadata).
    """
    # Her ekstrenin kendi no'sunu sadeleştir
    for ek in ekstreler:
        ek._no = _no_sade(ek.hesap_no)

    # Tüm virman kayıtlarını indeksle: (ekstre, eslesme, kendi_no, hedef_no, tarih, tutar)
    virmanlar = []
    # Hesaplar arası transfer adayları: VIRMAN kaynağı + mevduat/faiz/vadeli anahtar kelimeleri
    _TRANSFER_KEYS = ("VIRMAN", "MEVDUAT", "FAIZ ORANI", "VADELI", "VADE", "HESAPLARARASI", "HESAPLAR ARASI")
    for ek in ekstreler:
        for es in ek.eslesmeler:
            na = normalize(es.hareket.aciklama)
            if es.kaynak != "VIRMAN" and not any(k in na for k in _TRANSFER_KEYS):
                continue
            hedef = _virman_hedef_no(es.hareket.aciklama)
            virmanlar.append({
                "ekstre": ek, "es": es,
                "kendi": ek._no, "hedef": hedef,
                "tarih": es.hareket.tarih, "tutar": es.hareket.tutar,
                "eslendi": False,
            })

    eslesen_cift = 0
    mukerrer_silinen = 0
    eslesmeyen = 0

    kod_dolduruldu = 0
    for i, a in enumerate(virmanlar):
        if a["eslendi"]:
            continue
        for b in virmanlar[i + 1:]:
            if b["eslendi"]:
                continue
            ayni_tarih = a["tarih"] == b["tarih"]
            zit_isaret = (a["tutar"] < 0) != (b["tutar"] < 0)
            esit_tutar = abs(abs(a["tutar"]) - abs(b["tutar"])) < 0.01
            # Tam karşılıklı (iki tarafta da hesap no var) VEYA
            # tek yönlü (bir tarafın no'su yok = memo virman 'market sgk' gibi, ama diğer taraf bu hesabı işaret ediyor)
            tam = (a["hedef"] and b["hedef"] and a["kendi"] == b["hedef"] and a["hedef"] == b["kendi"])
            tek = ((b["hedef"] and a["kendi"] == b["hedef"]) or
                   (a["hedef"] and b["kendi"] == a["hedef"]))
            if ayni_tarih and zit_isaret and esit_tutar and (tam or tek):
                a["eslendi"] = b["eslendi"] = True
                eslesen_cift += 1
                cikis = a if a["tutar"] < 0 else b      # çıkış (negatif) → KORUNUR
                giris = b if a["tutar"] < 0 else a       # giriş (pozitif) → MÜKERRER

                # Korunan tarafın 102 kodu boşsa (memo virman) → karşı ekstrenin kendi hesabından doldur
                if not cikis["es"].hesap_kodu:
                    cikis["es"].hesap_kodu = giris["ekstre"].hesap_kodu
                    cikis["es"].hesap_adi = f"VİRMAN → {giris['ekstre'].hesap_kodu}"
                    cikis["es"].kaynak = "VIRMAN"
                    cikis["es"].guven = 100
                    cikis["es"].not_ = (f"Hesaplar arası transfer → {giris['ekstre'].hesap_kodu} "
                                        f"(mutabakatla bulundu)")
                    kod_dolduruldu += 1

                giris["es"].not_ = (f"MÜKERRER — bu transfer {cikis['ekstre'].hesap_kodu} "
                                    f"hesabında işlendi, burada SİLİNECEK")
                giris["es"].kaynak = "MUKERRER"
                giris["es"].guven = 0
                mukerrer_silinen += 1
                break

    # 2. PASS — memo virman çiftleri (iki tarafın da hesap no'su yok: 'VİRMAN-market sgk')
    # Eşleşme: aynı tarih + eşit |tutar| + zıt işaret + aynı memo etiketi
    import re as _re

    def _memo(aciklama: str) -> str:
        m = _re.search(r"V[İI]RMAN[\s-]+(.+)$", aciklama, _re.IGNORECASE)
        if not m:
            return ""
        t = m.group(1).upper()
        t = t.translate(str.maketrans("İIŞĞÜÖÇ", "IISGUOC"))
        return _re.sub(r"[^A-Z0-9]+", " ", t).strip()

    for i, a in enumerate(virmanlar):
        if a["eslendi"] or a["hedef"]:
            continue
        a_memo = _memo(a["es"].hareket.aciklama)
        if not a_memo:
            continue
        for b in virmanlar[i + 1:]:
            if b["eslendi"] or b["hedef"]:
                continue
            if (a["tarih"] == b["tarih"] and
                    (a["tutar"] < 0) != (b["tutar"] < 0) and
                    abs(abs(a["tutar"]) - abs(b["tutar"])) < 0.01 and
                    _memo(b["es"].hareket.aciklama) == a_memo):
                a["eslendi"] = b["eslendi"] = True
                eslesen_cift += 1
                cikis = a if a["tutar"] < 0 else b
                giris = b if a["tutar"] < 0 else a
                cikis["es"].hesap_kodu = giris["ekstre"].hesap_kodu
                cikis["es"].hesap_adi = f"VİRMAN → {giris['ekstre'].hesap_kodu}"
                cikis["es"].kaynak = "VIRMAN"
                cikis["es"].guven = 100
                cikis["es"].not_ = f"Hesaplar arası transfer → {giris['ekstre'].hesap_kodu} (memo mutabakat)"
                kod_dolduruldu += 1
                giris["es"].not_ = f"MÜKERRER — {cikis['ekstre'].hesap_kodu} hesabında işlendi"
                giris["es"].kaynak = "MUKERRER"
                giris["es"].guven = 0
                mukerrer_silinen += 1
                break

    # 3. PASS — TARİH + TUTAR eşleşmesi (hesap no / memo yoksa)
    # Kullanıcı talimatı: "aynı tarihte aynı tutarda bir tarafta işleyip diğer tarafta
    # aynı ise sileceksin mükerrer olmaması için". FARKLI ekstrelerde olmalı.
    # Yanlış eşleşmeyi önlemek için: aynı (tarih, |tutar|, zıt işaret) için TEK aday olmalı.
    kalan = [v for v in virmanlar if not v["eslendi"]]
    for i, a in enumerate(kalan):
        if a["eslendi"]:
            continue
        adaylar = []
        for b in kalan:
            if b["eslendi"] or b is a:
                continue
            if b["ekstre"] is a["ekstre"]:
                continue  # aynı ekstrede mükerrer olmaz
            if (a["tarih"] == b["tarih"] and
                    (a["tutar"] < 0) != (b["tutar"] < 0) and
                    abs(abs(a["tutar"]) - abs(b["tutar"])) < 0.01):
                adaylar.append(b)
        # SADECE tek aday varsa otomatik eşleştir (belirsizlik yoksa)
        if len(adaylar) == 1:
            b = adaylar[0]
            a["eslendi"] = b["eslendi"] = True
            eslesen_cift += 1
            cikis = a if a["tutar"] < 0 else b
            giris = b if a["tutar"] < 0 else a
            if not cikis["es"].hesap_kodu or cikis["es"].hesap_kodu == "999":
                cikis["es"].hesap_kodu = giris["ekstre"].hesap_kodu
                cikis["es"].hesap_adi = f"VİRMAN → {giris['ekstre'].hesap_kodu}"
                cikis["es"].kaynak = "VIRMAN"
                cikis["es"].guven = 100
                cikis["es"].not_ = (f"Hesaplar arası transfer → {giris['ekstre'].hesap_kodu} "
                                    f"(tarih+tutar mutabakat)")
                kod_dolduruldu += 1
            giris["es"].not_ = (f"MÜKERRER — bu transfer {cikis['ekstre'].hesap_kodu} "
                                f"hesabında işlendi, SİLİNDİ")
            giris["es"].kaynak = "MUKERRER"
            giris["es"].guven = 0
            mukerrer_silinen += 1

    eslesmeyen = sum(1 for v in virmanlar if not v["eslendi"])

    return {
        "toplam_virman": len(virmanlar),
        "eslesen_cift": eslesen_cift,
        "mukerrer_silinen": mukerrer_silinen,
        "kod_dolduruldu": kod_dolduruldu,
        "eslesmeyen": eslesmeyen,
    }


def mukerrer_ayikla(eslesmeler: list[Eslesme]) -> list[Eslesme]:
    """MÜKERRER işaretli kayıtları çıkarır (Mikro'ya gitmeyecekler)."""
    return [e for e in eslesmeler if e.kaynak != "MUKERRER"]


def bos_kodlari_999_yap(eslesmeler: list[Eslesme]) -> int:
    """Mutabakat sonrası hâlâ kodu boş kalanları 999 geçici hesaba atar (hiç boş satır kalmasın)."""
    sayac = 0
    for e in eslesmeler:
        if e.kaynak == "MUKERRER":
            continue
        if not e.hesap_kodu:
            eski_not = e.not_
            e.hesap_kodu = "999"
            e.hesap_adi = "GEÇİCİ HESAP"
            e.guven = 30
            e.not_ = f"999 geçici → {eski_not}" if eski_not else "Eşleşmedi → 999 geçici hesap (KONTROL ET)"
            sayac += 1
    return sayac
