"""
Muhtasar & Tahakkuk PDF Otomatik İndirici
==========================================
KULLANIM:
  1. ADIM1_chrome_baslat.bat  → Chrome açılır, giriş yap
  2. Console snippet ile muhtasar.csv oluştur → proje klasörüne koy
  3. ADIM3_muhtasar_indir.bat → PDF'ler indirilir
"""

import os, sys, time, json, csv, re, requests, websocket, urllib3, ssl, datetime
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from pathlib import Path
from glob import glob
from collections import defaultdict
from difflib import SequenceMatcher
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
import pandas as pd


class GibSSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.set_ciphers("ALL:@SECLEVEL=0")
        kwargs["ssl_context"] = ctx
        super().init_poolmanager(*args, **kwargs)


# ──────────────────────────────────────────
# AYARLAR
# ──────────────────────────────────────────
CSV_DOSYASI    = "muhtasar.csv"
MUKELLEF_EXCEL = "TANER BATTAL MÜKELLEF LİSTESİ.xlsx"
DEBUG_PORT     = 9222
BASE_URL       = "https://ebeyanname.gib.gov.tr"

# ÖMER ve TANER için ayrı çıkış yolları
CIKIS_TANER = r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE\1-) OFİS MUHASEBE\4-) BEYAN VE TAHAKKUKLAR\2-) MUHTASAR BYN & THK"
CIKIS_OMER  = r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE\2-) ÖMER MUHASEBE\1-) BEYAN VE TAHAKKUKLAR\2026 YILI\2-) MUHTASAR BYN & THK"

# Aylık klasör isimleri (numara + isim formatı)
AY_KLASORLERI = {
    "01": "1-) OCAK AYI",
    "02": "2-) ŞUBAT AYI",
    "03": "3-) MART AYI",
    "04": "4-) NİSAN AYI",
    "05": "5-) MAYIS AYI",
    "06": "6-) HAZİRAN AYI",
    "07": "7-) TEMMUZ AYI",
    "08": "8-) AĞUSTOS AYI",
    "09": "9-) EYLÜL AYI",
    "10": "10-) EKİM AYI",
    "11": "11-) KASIM AYI",
    "12": "12-) ARALIK AYI",
}

# 3 aylık dönem klasörleri (başlangıç ayı → klasör adı)
DONEM_KLASORLERI = {
    ("01", "03"): "13-) 1-3 DÖNEMİ",
    ("04", "06"): "14-) 4-6 DÖNEMİ",
    ("07", "09"): "15-) 7-9 DÖNEMİ",
    ("10", "12"): "16-) 10-12 DÖNEMİ",
}
# ──────────────────────────────────────────


def chrome_baglanti():
    try:
        hedefler = requests.get(f"http://localhost:{DEBUG_PORT}/json", timeout=5).json()
    except Exception:
        print("\n[HATA] Chrome'a bağlanılamadı!")
        print("  → ADIM1_chrome_baslat.bat ile Chrome'u açtınız mı?")
        sys.exit(1)

    ws_url = next(
        (t["webSocketDebuggerUrl"] for t in hedefler
         if t.get("type") == "page" and "gib.gov.tr" in t.get("url", "")),
        None
    ) or next(
        (t["webSocketDebuggerUrl"] for t in hedefler if t.get("type") == "page"),
        None
    )
    if not ws_url:
        print("[HATA] Chrome'da açık sekme bulunamadı.")
        sys.exit(1)

    try:
        ws = websocket.create_connection(ws_url, timeout=10)
        ws.send(json.dumps({"id": 1, "method": "Network.getAllCookies"}))
        cookie_sonuc = json.loads(ws.recv())

        expr = """(function(){
  var el = document.getElementById('TOKEN');
  if (el && el.value) return el.value;
  var m = window.location.href.match(/[?&]TOKEN=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  var inp = document.querySelector('input[name="TOKEN"]');
  if (inp && inp.value) return inp.value;
  return '';
})()"""
        ws.send(json.dumps({"id": 2, "method": "Runtime.evaluate", "params": {"expression": expr}}))
        token_sonuc = json.loads(ws.recv())
        ws.close()
    except Exception as e:
        print(f"\n[HATA] Chrome WebSocket hatası: {e}")
        sys.exit(1)

    tum = cookie_sonuc.get("result", {}).get("cookies", [])
    gib = [c for c in tum if "gib.gov.tr" in c.get("domain", "")]
    if not gib:
        print("\n[HATA] gib.gov.tr cookie'si yok — giriş yaptınız mı?")
        sys.exit(1)

    cookie_header = "; ".join(f"{c['name']}={c['value']}" for c in tum)
    token = token_sonuc.get("result", {}).get("result", {}).get("value", "")

    print(f"  ✓ {len(gib)} cookie alındı.")
    if token:
        print(f"  ✓ TOKEN alındı ({token[:20]}...)")
    else:
        print("  [!] TOKEN alınamadı — cookie ile denenecek")

    return cookie_header, token


def mukellef_listesi_yukle(base):
    yol = base / MUKELLEF_EXCEL
    if not yol.exists():
        print(f"[HATA] Mükellef listesi bulunamadı: {yol}")
        sys.exit(1)
    df = pd.read_excel(str(yol), header=None)
    taner = set(str(v).strip().upper() for v in df.iloc[2:, 1].dropna() if str(v).strip())
    omer  = set(str(v).strip().upper() for v in df.iloc[2:, 4].dropna() if str(v).strip())
    print(f"  ✓ Mükellef listesi yüklendi: {len(taner)} TANER, {len(omer)} ÖMER kaydı")
    return taner, omer


_TR = str.maketrans('ÇĞİÖŞÜçğıöşü', 'CGIOSUcgiosu')
_LEGAL = {'LTD','AS','STI','VE','ADI','ORT','ORTAKLIGI','SIRKETI',
          'LIMITED','ANONIM','TASF','HAL','AO','MUS','SAN','TIC'}

def _tr(s):   return str(s).upper().translate(_TR)
def _norm(s): return re.sub(r'[\s\.\-\(\),/]', '', _tr(s))
def _kw(s):
    return [w for w in re.findall(r'[A-Z0-9]+', _tr(s)) if len(w) > 2 and w not in _LEGAL][:3]
def _benzer(a, b): return SequenceMatcher(None, a, b).ratio()

def klasor_bul(ad, taner_set, omer_set):
    if re.match(r'TASF[\.\s]*HAL', _tr(ad)):
        return "TANER BATTAL"
    hn = _norm(ad)
    hw = set(re.findall(r'[A-Z0-9]+', _tr(ad)))
    for listesi, sonuc in [(taner_set, "TANER BATTAL"), (omer_set, "ÖMER YILMAZ")]:
        for m in listesi:
            mn = _norm(m)
            if mn and (mn in hn or hn in mn): return sonuc
            kws = _kw(m)
            if len(kws) >= 2:
                e = sum(
                    1 for kw in kws[:2]
                    if kw in hw or any(len(kw) > 3 and _benzer(kw, h) >= 0.82 for h in hw)
                )
                if e >= 2: return sonuc
    return None


def temiz_isim(isim):
    ad = " ".join(str(isim).strip().split()[:2])
    for ch in r'\/:*?"<>|':
        ad = ad.replace(ch, "")
    return ad.strip()


def klasor_adi_bul(vergilendirme_donemi):
    """
    '01/2026-01/2026' → '1-) OCAK AYI'  (aylık)
    '01/2026-03/2026' → '13-) 1-3 DÖNEMİ'  (3 aylık dönem)
    """
    m = re.findall(r'(\d{2})/\d{4}', str(vergilendirme_donemi))
    if not m:
        return "DIGER"
    bas = m[0]
    bit = m[-1] if len(m) > 1 else m[0]

    # 3 aylık dönem mi?
    if bas != bit:
        donem = DONEM_KLASORLERI.get((bas, bit))
        return donem if donem else f"{bas}-{bit} DÖNEMİ"

    # Aylık
    return AY_KLASORLERI.get(bas, f"AY-{bas}")


def pdf_indir(url, hedef_yol, session, satir_no):
    try:
        r = session.get(url, timeout=60, stream=True)
        if r.status_code in (301, 302, 401, 403):
            print(f"  [!] HTTP {r.status_code} — oturum sona ermiş olabilir.")
            return False
        if r.status_code != 200:
            print(f"  [!] HTTP {r.status_code}")
            return False
        if "text/html" in r.headers.get("Content-Type", ""):
            print("  [!] PDF yerine HTML geldi — oturum sona ermiş.")
            return False
        os.makedirs(os.path.dirname(hedef_yol), exist_ok=True)
        with open(hedef_yol, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        kb = os.path.getsize(hedef_yol) / 1024
        print(f"  [✓] {Path(hedef_yol).name}  ({kb:.1f} KB)")
        return True
    except requests.exceptions.Timeout:
        print(f"  [!] Zaman aşımı — satır {satir_no}")
        return False
    except Exception as e:
        print(f"  [!] Hata: {e}")
        return False


def pdf_url(token, subcmd, byn_oid, thk_oid=""):
    base = f"{BASE_URL}/dispatch?cmd=IMAJ&subcmd={subcmd}&TOKEN={token}"
    if subcmd == "BEYANNAMEGORUNTULE":
        return f"{base}&beyannameOid={byn_oid}&inline=true"
    else:
        return f"{base}&beyannameOid={byn_oid}&tahakkukOid={thk_oid}&inline=true"


def ana():
    base = Path(__file__).parent

    print("=" * 60)
    print("  Muhtasar & Tahakkuk PDF İndirici")
    print("=" * 60)

    # CSV bul
    csv_yolu = base / CSV_DOSYASI
    if not csv_yolu.exists():
        eslesme = sorted(glob(str(base / "muhtasar*.csv")), reverse=True)
        csv_yolu = Path(eslesme[0]) if eslesme else None
    if not csv_yolu:
        print(f"\n[HATA] {CSV_DOSYASI} bulunamadı!")
        input("Çıkmak için Enter...")
        sys.exit(1)

    print(f"CSV    : {csv_yolu.name}")
    print(f"TANER  : {CIKIS_TANER}")
    print(f"ÖMER   : {CIKIS_OMER}\n")

    # Mükellef listesi
    print("Mükellef listesi okunuyor...")
    taner_set, omer_set = mukellef_listesi_yukle(base)
    print()

    # Chrome bağlantısı
    print("Chrome'dan oturum alınıyor...")
    cookie_header, token = chrome_baglanti()
    print()

    # HTTP session
    session = requests.Session()
    session.verify = False
    session.mount("https://", GibSSLAdapter())
    session.headers.update({
        "Cookie":     cookie_header,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/136.0.0.0 Safari/537.36",
        "Referer":    f"{BASE_URL}/",
        "Accept":     "application/pdf,application/octet-stream,*/*",
    })

    # CSV oku
    with open(csv_yolu, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f, delimiter=";"))

    # Düzeltme tespiti
    def yukleme_dt(r):
        try:
            return datetime.datetime.strptime(
                r.get("Yukleme_Zamani", "").strip()[:16], "%d.%m.%Y - %H:%M"
            )
        except Exception:
            return datetime.datetime.min

    gruplar = defaultdict(list)
    for r in rows:
        gruplar[(r.get("Ad_Soyad","").strip(), r.get("Vergilendirme_Donemi","").strip())].append(r)

    duz_eki = {}
    for grup in gruplar.values():
        for idx, r in enumerate(sorted(grup, key=yukleme_dt)):
            oid = r.get("BynOID","").strip()
            duz_eki[oid] = "" if idx == 0 else (" DÜZ" if idx == 1 else f" DÜZ{idx}")

    toplam   = len(rows)
    basarili = 0
    basarisiz = []

    print(f"Toplam {toplam} kayıt işlenecek...\n")

    for i, row in enumerate(rows, 1):
        def col(*keys):
            for k in keys:
                if k in row and row[k]:
                    return row[k].strip()
            return ""

        ad_soyad  = col("Ad_Soyad", "AdSoyad", "ad_soyad")
        byn_oid   = col("BynOID", "Byn_OID", "Beyanname_OID", "bynoid")
        thk_oid   = col("ThkOID", "Thk_OID", "Tahakkuk_OID", "thkoid")
        vd_donemi = col("Vergilendirme_Donemi", "vergilendirme_donemi")

        if not byn_oid:
            print(f"[{i}/{toplam}] OID yok, atlandı.")
            continue

        # Sahip tespiti
        sahip = klasor_bul(ad_soyad, taner_set, omer_set)
        if not sahip:
            print(f"[{i}/{toplam}] {ad_soyad}  →  [!] Listede bulunamadı, atlandı.")
            basarisiz.append(f"Satır {i}: {ad_soyad} (listede yok)")
            continue

        # Çıkış yolu
        cikis_yolu = Path(CIKIS_TANER if sahip == "TANER BATTAL" else CIKIS_OMER)
        ay_klasoru = klasor_adi_bul(vd_donemi)
        hedef_klasor = cikis_yolu / ay_klasoru

        ek     = duz_eki.get(byn_oid, "")
        isim   = temiz_isim(ad_soyad) if ad_soyad else byn_oid[:8]
        etiket = f"{isim}{ek}"
        durum_str = " [DÜZELTMELİ]" if ek else ""

        print(f"[{i}/{toplam}] {ad_soyad}{durum_str}  →  {sahip} / {ay_klasoru}/")

        satir_ok = True

        # Beyanname PDF
        dosya_byn = hedef_klasor / f"{etiket} BYN.pdf"
        if dosya_byn.exists():
            print(f"  [=] {dosya_byn.name} zaten var")
        else:
            if not pdf_indir(pdf_url(token, "BEYANNAMEGORUNTULE", byn_oid), str(dosya_byn), session, i):
                satir_ok = False

        time.sleep(1.0)

        # Tahakkuk PDF
        if thk_oid:
            dosya_thk = hedef_klasor / f"{etiket} THK.pdf"
            if dosya_thk.exists():
                print(f"  [=] {dosya_thk.name} zaten var")
            else:
                if not pdf_indir(pdf_url(token, "TAHAKKUKGORUNTULE", byn_oid, thk_oid), str(dosya_thk), session, i):
                    satir_ok = False
        else:
            print("  [-] Tahakkuk OID yok")

        if satir_ok:
            basarili += 1
        else:
            basarisiz.append(f"Satır {i}: {ad_soyad or byn_oid}")

        time.sleep(1.5)

    print()
    print("=" * 60)
    print(f"  TAMAMLANDI  |  Başarılı: {basarili}/{toplam}  |  Hatalı: {toplam - basarili}")
    print("=" * 60)

    if basarisiz:
        print("\nİNDİRİLEMEYENLER:")
        for item in basarisiz:
            print(f"  - {item}")
        print("\nİpucu: Oturum sona erdiyse ADIM1 → giriş → tekrar çalıştırın.")

    input("\nBitmek için Enter'a basın...")


if __name__ == "__main__":
    ana()
