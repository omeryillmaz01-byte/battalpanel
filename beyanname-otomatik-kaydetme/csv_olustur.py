"""
Beyanname Listesi → CSV Çıkarıcı (v4 - Tam URL desteği)
=========================================================
PDF URL formatı:
  dispatch?cmd=IMAJ&subcmd=BEYANNAMEGORUNTULE&TOKEN=...&beyannameOid={OID}&inline=true
  dispatch?cmd=IMAJ&subcmd=TAHAKKUKGORUNTULE&TOKEN=...&tahakkukOid={THKOID}&beyannameOid={OID}&inline=true

KULLANIM:
  1. ADIM1_chrome_baslat.bat → Chrome aç, giriş yap
  2. Beyanname Listesi penceresini aç
  3. ADIM3_csv_olustur.bat çalıştır
"""

import csv
import re
import time
import sys
from pathlib import Path

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
except ImportError:
    print("[HATA] Selenium kurulu değil. ADIM3_csv_olustur.bat kullanın.")
    sys.exit(1)

# ─────────────────────────────────
DEBUG_PORT    = 9222
CIKIS_DOSYASI = "tum_beyannameler_yeni.csv"
SAYFA_BEKLEME = 1.5
CSV_AYRAC     = ";"    # Türk Excel: noktalı virgül
BASE_URL      = "https://ebeyanname.gib.gov.tr"
# ─────────────────────────────────


def chrome_baglan():
    options = Options()
    options.add_experimental_option("debuggerAddress", f"localhost:{DEBUG_PORT}")
    try:
        driver = webdriver.Chrome(options=options)
        return driver
    except Exception as e:
        print(f"\n[HATA] Chrome'a bağlanılamadı: {e}")
        print("→ ADIM1_chrome_baslat.bat ile Chrome'u açıp giriş yaptınız mı?")
        input("Çıkmak için Enter...")
        sys.exit(1)


def token_al(driver):
    """Sayfadaki gizli TOKEN input'undan session token'ını çek."""
    try:
        token = driver.find_element(By.ID, "TOKEN").get_attribute("value")
        if token:
            print(f"  ✓ TOKEN alındı ({token[:20]}...)")
            return token
    except Exception:
        pass
    print("  [!] TOKEN bulunamadı — URL'ler OID-only olacak")
    return ""


def pdf_url_olustur(token, subcmd, beyanname_oid, tahakkuk_oid=""):
    """
    Beyanname veya Tahakkuk PDF URL'si üret.
    subcmd: 'BEYANNAMEGORUNTULE' veya 'TAHAKKUKGORUNTULE'
    """
    base = f"{BASE_URL}/dispatch?cmd=IMAJ&subcmd={subcmd}&TOKEN={token}"
    if subcmd == "BEYANNAMEGORUNTULE":
        return f"{base}&beyannameOid={beyanname_oid}&inline=true"
    else:
        return f"{base}&beyannameOid={beyanname_oid}&tahakkukOid={tahakkuk_oid}&inline=true"


def satir_oku(row_el, token):
    """
    tr[id^='row'] elementinden tüm veriyi ve PDF URL'lerini çıkar.
    """
    oid = row_el.get_attribute("id").replace("row", "")
    tds = row_el.find_elements(By.XPATH, "./td")

    def td_text(idx, use_title=False):
        if idx >= len(tds):
            return ""
        td = tds[idx]
        if use_title:
            title = td.get_attribute("title") or ""
            return title if title else td.text.strip()
        return td.text.strip().replace("\n", " ")

    byn_turu      = td_text(1)
    vk_no         = td_text(2)
    ad_soyad      = td_text(3, use_title=True)   # Uzun isimler title attr'da tam
    vergi_dairesi = td_text(4)
    donem         = td_text(5)
    sube          = td_text(6)
    yukleme       = td_text(7)

    # Durum: durumTD{oid} içeriği
    durum = ""
    try:
        durum_el = row_el.find_element(By.ID, f"durumTD{oid}")
        durum = durum_el.text.strip().replace("\n", " ")
    except Exception:
        durum = td_text(8)

    # Tahakkuk OID: onclick="tahakkukGoruntule('bynOid','thkOid',...)"
    thk_oid = ""
    try:
        thk_img = row_el.find_element(By.CSS_SELECTOR, f"#thkPDF{oid} img")
        onclick = thk_img.get_attribute("onclick") or ""
        m = re.search(r"tahakkukGoruntule\('[^']+','([^']+)'", onclick)
        if m:
            thk_oid = m.group(1)
    except Exception:
        pass

    # PDF URL'leri
    byn_url = pdf_url_olustur(token, "BEYANNAMEGORUNTULE", oid)
    thk_url = pdf_url_olustur(token, "TAHAKKUKGORUNTULE", oid, thk_oid) if thk_oid else ""

    return {
        "Beyanname_Turu":       byn_turu,
        "TC_VK_No":             vk_no,
        "Ad_Soyad":             ad_soyad,
        "Vergi_Dairesi":        vergi_dairesi,
        "Vergilendirme_Donemi": donem,
        "Sube_No":              sube,
        "Yukleme_Zamani":       yukleme,
        "Durum":                durum,
        "Beyanname_OID":        oid,
        "Tahakkuk_OID":         thk_oid,
        "Beyanname_PDF":        byn_url,
        "Tahakkuk_PDF":         thk_url,
    }


def sayfadaki_satirlari_al(driver, token):
    rows = driver.find_elements(By.CSS_SELECTOR, "tr[id^='row']")
    satirlar = []
    for row in rows:
        try:
            satirlar.append(satir_oku(row, token))
        except Exception as e:
            print(f"  [!] Satır okuma hatası: {e}")
    return satirlar


def sonraki_sayfa_tiklat(driver):
    """>> butonunu bul ve tıkla. Son sayfadaysa False döner."""
    try:
        for btn in driver.find_elements(By.CSS_SELECTOR, "input[type='button']"):
            if btn.get_attribute("value") == ">>" and not btn.get_attribute("disabled"):
                btn.click()
                time.sleep(SAYFA_BEKLEME)
                return True
    except Exception:
        pass
    return False


def sayfa_bilgisi(driver):
    try:
        for el in driver.find_elements(By.CSS_SELECTOR, "b, font, td"):
            txt = el.text.strip()
            if re.match(r"\d+ - \d+ / \d+", txt):
                return txt
    except Exception:
        pass
    return "?"


def ana():
    print("=" * 60)
    print("  Beyanname Listesi → CSV Çıkarıcı")
    print("=" * 60)

    print("\nChrome'a bağlanılıyor...")
    driver = chrome_baglan()
    print(f"  ✓ {driver.title}")

    # TOKEN al
    token = token_al(driver)

    # Tablo yüklenmesini bekle
    print("\nTablo bekleniyor...")
    try:
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "tr[id^='row']"))
        )
    except Exception:
        print("[HATA] 'tr[id^=row]' bulunamadı!")
        print("→ 'Beyanname Listesi' penceresi açık mı?")
        input("Çıkmak için Enter...")
        sys.exit(1)

    # Tüm sayfaları dolaş
    tum_satirlar = []
    goruldu = set()
    sayfa_no = 1

    while True:
        bilgi = sayfa_bilgisi(driver)
        print(f"\n[Sayfa {sayfa_no}]  {bilgi}")

        yeni = sayfadaki_satirlari_al(driver, token)
        eklenen = 0
        for satir in yeni:
            oid = satir["Beyanname_OID"]
            if oid and oid not in goruldu:
                goruldu.add(oid)
                tum_satirlar.append(satir)
                eklenen += 1

        print(f"  → {eklenen} satır eklendi (toplam: {len(tum_satirlar)})")

        if not sonraki_sayfa_tiklat(driver):
            print("\n✓ Son sayfa.")
            break
        sayfa_no += 1

    # CSV kaydet (UTF-8 BOM — Türk Excel için)
    basliklar = [
        "Beyanname_Turu", "TC_VK_No", "Ad_Soyad", "Vergi_Dairesi",
        "Vergilendirme_Donemi", "Sube_No", "Yukleme_Zamani", "Durum",
        "Beyanname_OID", "Tahakkuk_OID", "Beyanname_PDF", "Tahakkuk_PDF",
    ]

    cikis = Path(__file__).parent / CIKIS_DOSYASI
    with open(cikis, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=basliklar, delimiter=CSV_AYRAC)
        writer.writeheader()
        writer.writerows(tum_satirlar)

    print()
    print("=" * 60)
    print(f"  TAMAMLANDI  |  {len(tum_satirlar)} satır")
    print(f"  Dosya: {cikis}")
    print("=" * 60)
    print()
    print("Sonraki adım: tum_beyannameler_yeni.csv'yi indir.py ile kullanın.")
    print("(indir.py'yi güncellemek için söyleyin)")
    input("\nÇıkmak için Enter...")


if __name__ == "__main__":
    ana()
