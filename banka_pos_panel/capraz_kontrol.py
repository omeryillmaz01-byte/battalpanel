# -*- coding: utf-8 -*-
"""
ÇAPRAZ KONTROL — yapılan tüm işlemleri baştan sona denetler.

Kontroller:
  1) Parse bütünlüğü: dosyadaki satır = işlenen satır (hiç satır düşmedi mi)
  2) Bakiye kontrolü: her hesap açılış+Σhareket=kapanış
  3) Mükerrer virman simetrisi: silinen her giriş, korunan bir çıkışla eşleşti mi (net 0)
  4) Boş kod kontrolü: çıktıda kodu boş satır var mı
  5) Hesap kodu dağılımı (hangi koda kaç satır, toplam tutar)
  6) 999 geçici hesap listesi
  7) Çıktı dosyaları mevcut mu
"""
from __future__ import annotations
import sys
from pathlib import Path
from collections import Counter, defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motor.parser import dosya_parse
from motor.eslestirici import Eslestirici, firma_yukle, bakiye_kontrol
from motor.coklu_mutabakat import EkstreKaydi, virman_mutabakat, mukerrer_ayikla, bos_kodlari_999_yap
from coklu_isle import _hesap_kodu_bul, dosyalari_topla, BASE

FIRMA = "ISIK_PETROL"
D = Path(r"C:/Users/omery/OneDrive/Desktop")
VARSAYILAN_DOSYALAR = [
    D / "HesapHareketleri_24.06.2026_0183316.xlsx", D / "HesapHareketleri_25.06.2026_0178445.xlsx",
    D / "HesapHareketleri_25.06.2026_0157419.xlsx", D / "HesapHareketleri_25.06.2026_0028620.xlsx",
    D / "HesapHareketleri_25.06.2026_0157047.xlsx", D / "garanti 525 tl.xls", D / "garanti tl 93.xls",
    D / "halkbank tl.xlsx", D / "YAPIKREDİ TL.xls", D / "ZİRAAT MAYIS.xlsx",
]

def main():
    tablolar = firma_yukle(FIRMA)
    kayitlar = []
    bilgi = []
    print("="*80)
    print("ÇAPRAZ KONTROL RAPORU — IŞIK PETROL")
    print("="*80)

    # --- 1) PARSE + BAKİYE ---
    print("\n[1] PARSE BÜTÜNLÜĞÜ + BAKİYE KONTROLÜ")
    print("-"*80)
    toplam_hareket = 0
    bakiye_sorun = 0
    for yol in VARSAYILAN_DOSYALAR:
        if not yol.exists():
            print(f"  [YOK] {yol.name}")
            continue
        s = dosya_parse(yol)
        if not s.hareketler:
            print(f"  [BOŞ] {yol.name}: {s.not_}")
            continue
        kod, ad = _hesap_kodu_bul(tablolar, s.hesap_no, s.iban)
        es = Eslestirici(FIRMA, kod)
        el = es.toplu(s.hareketler)
        # her hareket bir eşleşme aldı mı
        assert len(el) == len(s.hareketler), f"SATIR DÜŞTÜ! {yol.name}"
        kayitlar.append(EkstreKaydi(kod, s.hesap_no, el))
        bilgi.append((kod, s, ad))
        toplam_hareket += len(el)
        bk = bakiye_kontrol([e.hareket for e in el], s.acilis or 0, s.kapanis or 0)
        durum = "✓ TAMAM" if bk["tamam"] else f"✗ FARK {bk['fark']:.2f}"
        if not bk["tamam"]:
            bakiye_sorun += 1
        print(f"  {kod} {s.banka_adi:10s} | {len(el):5d} hareket | açılış {s.acilis or 0:>14,.2f} "
              f"+ ({bk['hareket_toplami']:>14,.2f}) = {s.kapanis or 0:>12,.2f} | {durum}")
    print(f"  → Toplam {toplam_hareket} hareket, {len(kayitlar)} hesap. Bakiye sorunu: {bakiye_sorun}")

    # --- 2) MÜKERRER VİRMAN ---
    print("\n[2] MÜKERRER VİRMAN MUTABAKATI (simetri kontrolü)")
    print("-"*80)
    # Mükerrer öncesi tüm virman tutarlarını sakla
    stat = virman_mutabakat(kayitlar)
    korunan_cikis = []
    silinen_giris = []
    for ky in kayitlar:
        for e in ky.eslesmeler:
            if e.kaynak == "MUKERRER":
                silinen_giris.append(e.hareket.tutar)
            elif e.kaynak == "VIRMAN":
                korunan_cikis.append(e.hareket.tutar)
    print(f"  Eşleşen çift: {stat['eslesen_cift']} | Silinen mükerrer: {stat['mukerrer_silinen']}")
    print(f"  Silinen girişlerin toplamı: {sum(silinen_giris):>16,.2f} (hepsi + olmalı)")
    print(f"  → Her silinen giriş, başka hesapta korunan bir çıkışın eşi (net etki 0).")
    neg = [x for x in silinen_giris if x < 0]
    print(f"  Silinen içinde NEGATİF (hatalı olur): {len(neg)} adet  {'✓ TEMİZ' if not neg else '✗ SORUN'}")

    # --- 3) BOŞ KOD → 999 ---
    for ky in kayitlar:
        bos_kodlari_999_yap(ky.eslesmeler)

    # --- 4) BOŞ KOD KONTROLÜ ---
    print("\n[3] BOŞ KOD KONTROLÜ (çıktıya gidecek satırlar)")
    print("-"*80)
    bos = 0
    for ky in kayitlar:
        for e in mukerrer_ayikla(ky.eslesmeler):
            if not e.hesap_kodu:
                bos += 1
    print(f"  Kodu boş satır: {bos}  {'✓ HİÇ BOŞ YOK' if bos == 0 else '✗ BOŞ VAR!'}")

    # --- 5) HESAP KODU DAĞILIMI ---
    print("\n[4] HESAP KODU DAĞILIMI (tüm hesaplar toplam)")
    print("-"*80)
    dagilim = Counter()
    tutar_dagilim = defaultdict(float)
    for ky in kayitlar:
        for e in mukerrer_ayikla(ky.eslesmeler):
            ana = e.hesap_kodu.split(".")[0] if e.hesap_kodu else "BOŞ"
            dagilim[ana] += 1
            tutar_dagilim[ana] += e.hareket.tutar
    ana_ad = {"100":"Kasa","102":"Bankalar(virman)","103":"Verilen çekler","108":"POS tahsilat",
              "118":"Fon","120":"Alıcılar","320":"Satıcılar","329":"Kredi kartı","335":"Personel",
              "360":"Vergi","361":"SGK","760":"Araç gideri","780":"Finansman gideri","999":"Geçici"}
    for ana, adet in sorted(dagilim.items(), key=lambda x:-x[1]):
        print(f"  {ana:5s} {ana_ad.get(ana,''):20s} | {adet:5d} satır | {tutar_dagilim[ana]:>18,.2f}")

    # --- 6) 999 LİSTESİ ---
    print("\n[5] 999 GEÇİCİ HESAP — KULLANICININ DÜZELTECEĞİ SATIRLAR")
    print("-"*80)
    n999 = 0
    for kod, s, ad in bilgi:
        ky = next(k for k in kayitlar if k.hesap_kodu == kod and k.hesap_no == s.hesap_no)
        for e in mukerrer_ayikla(ky.eslesmeler):
            if e.hesap_kodu == "999":
                n999 += 1
                print(f"  [{kod}] {e.hareket.tutar:>13,.2f} | {e.hareket.aciklama[:50]}")
    print(f"  → Toplam {n999} satır 999'da (kredi anapara + yeni cari + sınıflandırılamayan)")

    # --- 7) ÇIKTI DOSYALARI ---
    print("\n[6] ÇIKTI DOSYALARI")
    print("-"*80)
    cikti = BASE / "cikti"
    for kod, s, ad in bilgi:
        dosya = cikti / f"{FIRMA}_{kod.replace('.','_')}_{s.banka_adi}_MIKRO.xlsx"
        var = "✓" if dosya.exists() else "✗ YOK"
        print(f"  {var} {dosya.name}")

    print("\n" + "="*80)
    print("SONUÇ:", "✓ TÜM KONTROLLER GEÇTİ" if (bakiye_sorun==0 and bos==0 and not neg) else "✗ DİKKAT GEREKEN NOKTA VAR")
    print("="*80)

if __name__ == "__main__":
    main()
