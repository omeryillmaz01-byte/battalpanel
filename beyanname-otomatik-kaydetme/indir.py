"""
Beyanname & Tahakkuk PDF Otomatik İndirici (KDV + Muhtasar)
============================================================
KULLANIM:
  1. ADIM1_chrome_baslat.bat  → Chrome açılır, giriş yap
  2. Console snippet ile CSV oluştur → proje klasörüne koy
  3. ADIM2_indir.bat          → PDF'ler indirilir

Beyanname türü (C sütunu) otomatik algılanır:
  KDV1   → 2026 YILI BYN VE THK / {ÖMER/TANER} / 1-) KDV BEYAN + TAHAKKUK / {AY}
  MUHSGK → Muhtasar yolları / {numaralı ay klasörü}
"""

import os, sys, time, json, csv, re, requests, websocket, urllib3, ssl, datetime, hashlib
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from pathlib import Path
from urllib.parse import quote
from glob import glob
from collections import defaultdict
from difflib import SequenceMatcher
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
import pandas as pd

try:
    import fitz  # pymupdf
    PDF_OKUMA = True
except ImportError:
    PDF_OKUMA = False


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
MUKELLEF_EXCEL = "TANER BATTAL MÜKELLEF LİSTESİ.xlsx"
DEBUG_PORT     = 9222
BASE_URL       = "https://ebeyanname.gib.gov.tr"
MAX_DENEME     = 4
BEKLEME_SANIYE = [2, 5, 10, 20]
TEKRAR_DENE_HTTP = {408, 425, 429, 500, 502, 503, 504}
OTURUM_HTTP      = {301, 302, 401, 403}
HATA_LOGU        = "indirilemeyenler_log.csv"
DUZELTME_RAPORU  = "duzeltme_raporu.csv"

# KDV yolları (TANER ve ÖMER ayrı) — iCloud Drive
# TANER  → OFİS MUHASEBE
# ÖMER   → ÖMER MUHASEBE
KDV_TANER = r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE\1-) OFİS MUHASEBE\4-) BEYAN VE TAHAKKUKLAR\1-) KDV BEYAN & THK"
KDV_OMER  = r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE\2-) ÖMER MUHASEBE\1-) BEYAN VE TAHAKKUKLAR\2026 YILI\1-) KDV BYN & THK"

# iCloud kök yolları (kısayol)
_ICL_OFIS = r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE\1-) OFİS MUHASEBE\4-) BEYAN VE TAHAKKUKLAR"
_ICL_OMER = r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE\2-) ÖMER MUHASEBE\1-) BEYAN VE TAHAKKUKLAR\2026 YILI"

# Geçici Vergi yolları (TANER ve ÖMER ayrı) — iCloud
GGECICI_TANER = _ICL_OFIS + r"\3-) GEÇİCİ VERGİ BYN & THK"
GGECICI_OMER  = _ICL_OMER + r"\3-) GEÇİCİ VERGİ BYN & THK"
KGECICI_TANER = GGECICI_TANER
KGECICI_OMER  = GGECICI_OMER

# GEKAP (POSET) yolları — iCloud
GEKAP_TANER = _ICL_OFIS + r"\5-) GEKAP BYN & THK"
GEKAP_OMER  = _ICL_OMER + r"\5-) GEKAP BYN & THK"

# DAMGA yolları — iCloud
DAMGA_TANER = _ICL_OFIS + r"\6-) DAMGA BYN & THK"
DAMGA_OMER  = _ICL_OMER + r"\6-) DAMGA BYN & THK"

# Kurumlar (yıllık) yolları — iCloud
KURUMLAR_TANER = _ICL_OFIS + r"\4-) YILLIK + KURUMLAR BYN & THK"
KURUMLAR_OMER  = _ICL_OMER + r"\4-) YILLIK + KURUMLAR BYN & THK"

# Yıllık Gelir / Kurumlar yolları
GELIR2025_TANER = r"D:\EBYN-INDIRME\OFIS MUHASEBE\4-) BEYAN VE TAHAKKUKLAR\4-) 2025 YILI YILLIK + KURUMLAR BYN & THK"
GELIR2025_OMER  = r"D:\EBYN-INDIRME\OMER MUHASEBE\4-) BEYAN VE TAHAKKUKLAR\4-) 2025 YILI YILLIK + KURUMLAR BYN & THK"
KURUMLAR2024_TANER = r"D:\EBYN-INDIRME\OFIS MUHASEBE\4-) BEYAN VE TAHAKKUKLAR\7-) 2024 YILI YILLIK + KURUMLAR BYN & THK"
KURUMLAR2024_OMER  = r"D:\EBYN-INDIRME\OMER MUHASEBE\4-) BEYAN VE TAHAKKUKLAR\6-) 2024 YILI YILLIK + KURUMLAR BYN & THK"
TCC2026_TANER = r"D:\EBYN-INDIRME\OFIS MUHASEBE\4-) BEYAN VE TAHAKKUKLAR\6-) 2026 YILI YILLIK + KURUMLAR BYN & THK"

# Muhtasar yolları (TANER ve ÖMER ayrı)
MUHTASAR_TANER = r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE\1-) OFİS MUHASEBE\4-) BEYAN VE TAHAKKUKLAR\2-) MUHTASAR BYN & THK"
MUHTASAR_OMER  = r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE\2-) ÖMER MUHASEBE\1-) BEYAN VE TAHAKKUKLAR\2026 YILI\2-) MUHTASAR BYN & THK"

# SGK yolları (Muhtasar'dan AYRI klasör — TANER ve ÖMER ayrı)
SGK_TANER = _ICL_OFIS + r"\5-) SİGORTA HİZMET LİSTESİ & THK"
SGK_OMER  = _ICL_OMER + r"\5-) SİGORTA HİZMET LİSTESİ & THK"

# Ay klasörleri (numaralı — KDV ve Muhtasar aynı format)
MUHTASAR_AY = {
    "01": "1-) OCAK AYI",    "02": "2-) ŞUBAT AYI",   "03": "3-) MART AYI",
    "04": "4-) NİSAN AYI",   "05": "5-) MAYIS AYI",   "06": "6-) HAZİRAN AYI",
    "07": "7-) TEMMUZ AYI",  "08": "8-) AĞUSTOS AYI", "09": "9-) EYLÜL AYI",
    "10": "10-) EKİM AYI",   "11": "11-) KASIM AYI",  "12": "12-) ARALIK AYI",
}
KDV_AY = MUHTASAR_AY  # KDV de aynı numaralı format

GGECICI_DONEM = {
    ("01","03"): "1-) 1-3 DÖNEMİ",
    ("04","06"): "2-) 4-6 DÖNEMİ",
    ("07","09"): "3-) 7-9 DÖNEMİ",
    ("10","12"): "4-) 10-12 DÖNEMİ",
}
KGECICI_DONEM = GGECICI_DONEM

# Muhtasar 3 aylık dönemler
MUHTASAR_DONEM = {
    ("01","03"): "13-) 1-3 DÖNEMİ",
    ("04","06"): "14-) 4-6 DÖNEMİ",
    ("07","09"): "15-) 7-9 DÖNEMİ",
    ("10","12"): "16-) 10-12 DÖNEMİ",
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
    print(f"  ✓ TOKEN alındı ({token[:20]}...)" if token else "  [!] TOKEN alınamadı — cookie ile denenecek")
    return cookie_header, token


def bekle_kapat(mesaj):
    try:
        if sys.stdin and sys.stdin.isatty():
            input(mesaj)
    except EOFError:
        pass


def yillik_kurumlar_csv_mi(csv_adi):
    csv_norm = _norm(str(csv_adi or ""))
    return csv_norm in {
        _norm("yıllık gelir 2025.csv"),
        _norm("2024 yıllık beyanlar .csv"),
        _norm("2024 yıllık beyanlar 2 .csv"),
        _norm("2024 yılı kurumlar .csv"),
        _norm("tcc kurumlar 2026.csv"),
        _norm("2024_kurumlar_secili_tekrar.csv"),
    }


def _pasif_mukellefler_yukle():
    """Masaüstündeki 'PASIF MUKELLEFLER.xlsx' (veya benzeri) dosyadan pasif firma adlarını oku.
    Eşleştirme için _norm() ile normalize edilmiş şekilde döner."""
    adaylar = [
        Path.home() / "OneDrive" / "Desktop" / "PASIF MUKELLEFLER.xlsx",
        Path.home() / "Desktop" / "PASIF MUKELLEFLER.xlsx",
        Path.home() / "OneDrive" / "Masaüstü" / "PASIF MUKELLEFLER.xlsx",
        Path.home() / "Masaüstü" / "PASIF MUKELLEFLER.xlsx",
    ]
    for yol in adaylar:
        if not yol.exists():
            continue
        try:
            df = pd.read_excel(str(yol))
            firma_kol = next((c for c in df.columns
                              if "FIRMA" in str(c).upper() or "FİRMA" in str(c).upper() or "UNVAN" in str(c).upper()),
                             df.columns[0])
            pasif_set = set()
            for v in df[firma_kol].dropna():
                s = str(v).strip().upper()
                if s and s != "NAN" and not s.startswith("("):
                    pasif_set.add(_norm(s))
            if pasif_set:
                print(f"  ✓ Pasif liste: {len(pasif_set)} firma  ({yol.name})")
            return pasif_set
        except Exception as e:
            print(f"  [!] Pasif liste okunamadı ({yol.name}): {e}")
    return set()


def mukellef_muaf_set(base, tur):
    """Belirli bir tür için MUAF olan firmaların normalized adlarını döndür.
    Excel'de 'VERMİYOR' / 'MUAF' / 'İSTİSNA' / 'YOK' sütunu aranır.
    Değer virgülle ayrılmış tür kodları olabilir: 'KDV1, GEKAP' gibi."""
    yol = base / MUKELLEF_EXCEL
    if not yol.exists():
        return set()
    try:
        df = pd.read_excel(str(yol))
        kolonlar = {str(c).strip().upper(): c for c in df.columns}
        muaf_kol = None
        for k in ("VERMİYOR","VERMIYOR","MUAF","İSTİSNA","ISTISNA","YOK","VERMEZ","VERMIYORUZ"):
            if k in kolonlar:
                muaf_kol = kolonlar[k]; break
        if muaf_kol is None:
            return set()
        firma_kol = (kolonlar.get("FİRMA ÜNVANI") or kolonlar.get("FIRMA ÜNVANI")
                     or kolonlar.get("FIRMA UNVANI"))
        if firma_kol is None:
            return set()

        tur_upper = (tur or "").upper().strip()
        # Tür eşanlamlıları
        eslesir = {tur_upper}
        if tur_upper in ("KDV1","KDV2"): eslesir.add("KDV")
        if tur_upper == "MUHSGK": eslesir.update({"MUHTASAR","MUHSGK","SGK"})
        if tur_upper in ("GGECICI","KGECICI"): eslesir.update({"GECICI","GEÇİCİ"})
        if tur_upper == "POSET": eslesir.update({"GEKAP","POSET"})
        if tur_upper == "KURUMLAR": eslesir.update({"KURUMLAR","YILLIK"})

        muaf = set()
        for _, row in df.iterrows():
            firma = str(row.get(firma_kol, "")).strip().upper()
            if not firma or firma == "NAN": continue
            muaf_val = str(row.get(muaf_kol, "")).strip().upper()
            if not muaf_val or muaf_val == "NAN": continue
            parcalar = [p.strip() for p in re.split(r'[,;/\s]+', muaf_val) if p.strip()]
            for p in parcalar:
                if any(p == e or p in e or e in p for e in eslesir if e):
                    muaf.add(_norm(firma))
                    break
        return muaf
    except Exception:
        return set()


def mukellef_listesi_yukle(base):
    yol = base / MUKELLEF_EXCEL
    if not yol.exists():
        print(f"[HATA] Mükellef listesi bulunamadı: {yol}")
        sys.exit(1)

    pasif_norm = _pasif_mukellefler_yukle()
    def pasif_mi(firma):
        if not pasif_norm: return False
        fn = _norm(firma)
        if fn in pasif_norm: return True
        # Kısmi eşleşme (CSV-mükellef adı farkları için)
        return any(p and (p in fn or fn in p) for p in pasif_norm)

    # Yeni format: FIRMA ÜNVANI + SAHİBİ (+ opsiyonel DURUM sütunu)
    try:
        df_yeni = pd.read_excel(str(yol))
        kolonlar = {str(c).strip().upper(): c for c in df_yeni.columns}
        firma_kol = kolonlar.get("FİRMA ÜNVANI") or kolonlar.get("FIRMA ÜNVANI") or kolonlar.get("FIRMA UNVANI")
        sahip_kol = kolonlar.get("SAHİBİ") or kolonlar.get("SAHIBI")
        durum_kol = (kolonlar.get("DURUM") or kolonlar.get("AKTİF") or kolonlar.get("AKTIF")
                     or kolonlar.get("DEFTER") or kolonlar.get("SÖZLEŞME") or kolonlar.get("SOZLESME"))

        if firma_kol and sahip_kol:
            taner = set()
            omer = set()
            pasif_atlanan = 0
            PASIF_KEYW = ("PASİF","PASIF","KAPALI","KAPANDI","KAPANDİ","İPTAL","IPTAL",
                          "AYRIL","SİL","SIL","ÇIKTI","CIKTI","DURDU","HAYIR","NO","0","FALSE")
            for _, row in df_yeni.iterrows():
                firma = str(row.get(firma_kol, "")).strip().upper()
                sahip = str(row.get(sahip_kol, "")).strip().upper()
                if not firma or firma == "NAN":
                    continue
                # DURUM sütunu varsa, pasif olanları atla
                if durum_kol is not None:
                    durum_val = str(row.get(durum_kol, "")).strip().upper()
                    if durum_val and any(k in durum_val for k in PASIF_KEYW):
                        pasif_atlanan += 1
                        continue
                # Masaüstündeki PASIF MUKELLEFLER.xlsx ile çapraz kontrol
                if pasif_mi(firma):
                    pasif_atlanan += 1
                    continue
                if sahip == "TANER":
                    taner.add(firma)
                elif sahip in ("ÖMER", "OMER"):
                    omer.add(firma)
            extra = f" (pasif {pasif_atlanan} atlandı)" if pasif_atlanan else ""
            print(f"  ✓ Mükellef listesi: {len(taner)} TANER, {len(omer)} ÖMER{extra}")
            return taner, omer
    except Exception:
        pass

    # Eski format: TANER ve ÖMER ayrı bloklar
    df = pd.read_excel(str(yol), header=None)
    taner = set(str(v).strip().upper() for v in df.iloc[2:, 1].dropna() if str(v).strip())
    omer  = set(str(v).strip().upper() for v in df.iloc[2:, 4].dropna() if str(v).strip())
    once = len(taner) + len(omer)
    taner = {f for f in taner if not pasif_mi(f)}
    omer  = {f for f in omer  if not pasif_mi(f)}
    pasif_atlanan = once - len(taner) - len(omer)
    extra = f" (pasif {pasif_atlanan} atlandı)" if pasif_atlanan else ""
    print(f"  ✓ Mükellef listesi: {len(taner)} TANER, {len(omer)} ÖMER{extra}")
    return taner, omer


_TR = str.maketrans('ÇĞİÖŞÜçğıöşü', 'CGIOSUcgiosu')
_LEGAL = {'LTD','AS','STI','VE','ADI','ORT','ORTAKLIGI','SIRKETI',
          'LIMITED','ANONIM','TASF','HAL','AO','MUS','SAN','TIC'}

def _tr(s):   return str(s).upper().translate(_TR)
def _norm(s): return re.sub(r'[\s\.\-\(\),/]', '', _tr(s))
def _kw(s):   return [w for w in re.findall(r'[A-Z0-9]+', _tr(s)) if len(w)>2 and w not in _LEGAL][:3]
def _sim(a,b): return SequenceMatcher(None, a, b).ratio()

def klasor_bul(ad, taner_set, omer_set):
    if re.match(r'TASF[\.\s]*HAL', _tr(ad)): return "TANER BATTAL"
    hn = _norm(ad)
    hw = set(re.findall(r'[A-Z0-9]+', _tr(ad)))
    for listesi, sonuc in [(taner_set, "TANER BATTAL"), (omer_set, "ÖMER YILMAZ")]:
        for m in listesi:
            mn = _norm(m)
            if mn and (mn in hn or hn in mn): return sonuc
            kws = _kw(m)
            if len(kws) >= 2:
                e = sum(1 for kw in kws[:2] if kw in hw or any(len(kw)>3 and _sim(kw,h)>=0.82 for h in hw))
                if e >= 2: return sonuc
    return None


def temiz_isim(isim):
    ad = " ".join(str(isim).strip().split()[:2])
    for ch in r'\/:*?"<>|': ad = ad.replace(ch, "")
    return ad.strip()


def hedef_klasor_bul(beyanname_turu, sahip, vergilendirme_donemi, kaynak_csv="", cikti=""):
    """Beyanname türü ve sahibine göre tam hedef klasörü döndür.
    cikti verilirse (test modu): {cikti}/{TANER|OMER}/{tür}/{ay_klas} altına yazar."""
    aylar = re.findall(r'(\d{2})/\d{4}', str(vergilendirme_donemi))
    bas = aylar[0] if aylar else "01"
    bit = aylar[-1] if len(aylar) > 1 else bas

    tur = str(beyanname_turu).strip().upper()
    csv_ad = str(kaynak_csv or "").strip().lower()
    csv_norm = _norm(csv_ad)

    if csv_norm == _norm("yıllık gelir 2025.csv"):
        return Path(GELIR2025_TANER if sahip == "TANER BATTAL" else GELIR2025_OMER)
    if csv_norm in (
        _norm("2024 yıllık beyanlar .csv"),
        _norm("2024 yıllık beyanlar 2 .csv"),
    ):
        return Path(KURUMLAR2024_TANER if sahip == "TANER BATTAL" else KURUMLAR2024_OMER)
    if csv_norm == _norm("2024_kurumlar_secili_tekrar.csv"):
        return Path(KURUMLAR2024_TANER if sahip == "TANER BATTAL" else KURUMLAR2024_OMER)
    if csv_norm == _norm("2024 yılı kurumlar .csv"):
        return Path(KURUMLAR2024_TANER if sahip == "TANER BATTAL" else KURUMLAR2024_OMER)
    if csv_norm == _norm("tcc kurumlar 2026.csv"):
        return Path(TCC2026_TANER)

    yil = (re.findall(r'\d{2}/(\d{4})', str(vergilendirme_donemi)) or ["2026"])[0]

    if tur == "MUHSGK":
        base = Path(MUHTASAR_TANER if sahip == "TANER BATTAL" else MUHTASAR_OMER)
        ay_klas = (MUHTASAR_DONEM.get((bas, bit), f"{bas}-{bit} DÖNEMİ")
                   if bas != bit else MUHTASAR_AY.get(bas, f"AY-{bas}"))
    elif tur == "GGECICI":
        base = Path(GGECICI_TANER if sahip == "TANER BATTAL" else GGECICI_OMER)
        ay_klas = GGECICI_DONEM.get((bas, bit), f"{bas}-{bit} DÖNEMİ")
    elif tur == "KGECICI":
        base = Path(KGECICI_TANER if sahip == "TANER BATTAL" else KGECICI_OMER)
        ay_klas = KGECICI_DONEM.get((bas, bit), f"{bas}-{bit} DÖNEMİ")
    elif tur == "POSET":      # GEKAP — aylık
        base = Path(GEKAP_TANER if sahip == "TANER BATTAL" else GEKAP_OMER)
        ay_klas = KDV_AY.get(bas, f"AY-{bas}")
    elif tur == "DAMGA":      # aylık
        base = Path(DAMGA_TANER if sahip == "TANER BATTAL" else DAMGA_OMER)
        ay_klas = KDV_AY.get(bas, f"AY-{bas}")
    elif tur in ("KURUMLAR", "KURUMLARP", "GELIR", "GELIR1001E"):  # yıllık
        base = Path(KURUMLAR_TANER if sahip == "TANER BATTAL" else KURUMLAR_OMER)
        ay_klas = f"{yil} YILI"
    else:  # KDV1, KDV2 ve diğer aylıklar
        base = Path(KDV_TANER if sahip == "TANER BATTAL" else KDV_OMER)
        ay_klas = KDV_AY.get(bas, f"AY-{bas}")

    # Test modu: {cikti}/{sahip}/{tür}/{yıl YILI}/{ay}
    # Her tür KENDİ adıyla; her yıl AYRI klasörde (2025 ile 2026 karışmaz).
    yillik = tur in ("KURUMLAR", "KURUMLARP", "GELIR", "GELIR1001E")
    if cikti:
        sahip_kisa = "TANER" if sahip == "TANER BATTAL" else "OMER"
        tur_klas = {"MUHSGK": "MUHTASAR", "KDV1": "KDV1", "KDV2": "KDV2",
                    "GGECICI": "GGECICI", "KGECICI": "KGECICI",
                    "POSET": "GEKAP", "DAMGA": "DAMGA",
                    "KURUMLAR": "KURUMLAR", "KURUMLARP": "KURUMLAR"}.get(tur, tur or "DIGER")
        p = Path(cikti) / sahip_kisa / tur_klas / f"{yil} YILI"
        return p if yillik else p / ay_klas

    return base / ay_klas


def sgk_hedef_klasor_bul(sahip, vergilendirme_donemi, cikti=""):
    """SGK belgeleri için AYRI klasör (muhtasar'dan bağımsız):
    test  → {cikti}/{sahip}/SGK/{yıl YILI}/{ay}
    gerçek→ SİGORTA HİZMET LİSTESİ & THK / {ay}"""
    aylar = re.findall(r'(\d{2})/\d{4}', str(vergilendirme_donemi))
    bas = aylar[0] if aylar else "01"
    bit = aylar[-1] if len(aylar) > 1 else bas
    yil = (re.findall(r'\d{2}/(\d{4})', str(vergilendirme_donemi)) or ["2026"])[0]
    # Aylık → ay klasörü; 3 aylık (01-03 gibi) → dönem klasörü (muhtasar ile aynı)
    if bas != bit:
        ay_klas = MUHTASAR_DONEM.get((bas, bit), f"{bas}-{bit} DÖNEMİ")
    else:
        ay_klas = MUHTASAR_AY.get(bas, f"AY-{bas}")
    if cikti:
        sahip_kisa = "TANER" if sahip == "TANER BATTAL" else "OMER"
        return Path(cikti) / sahip_kisa / "SGK" / f"{yil} YILI" / ay_klas
    base = Path(SGK_TANER if sahip == "TANER BATTAL" else SGK_OMER)
    return base / ay_klas


def pdf_indir(url, hedef_yol, session, satir_no):
    son_hata = ""
    son_http = ""

    for deneme in range(1, MAX_DENEME + 1):
        try:
            r = session.get(url, timeout=60, stream=True)
            http = r.status_code
            son_http = str(http)

            if http in OTURUM_HTTP:
                son_hata = f"HTTP {http} - oturum"
                print(f"  [!] HTTP {http} — oturum sona ermiş olabilir.")
                return False, son_hata, son_http, True

            if http in TEKRAR_DENE_HTTP:
                son_hata = f"HTTP {http}"
                print(f"  [!] HTTP {http} — deneme {deneme}/{MAX_DENEME}")
                if deneme < MAX_DENEME:
                    time.sleep(BEKLEME_SANIYE[min(deneme - 1, len(BEKLEME_SANIYE) - 1)])
                    continue
                return False, son_hata, son_http, False

            if http != 200:
                son_hata = f"HTTP {http}"
                print(f"  [!] HTTP {http}")
                return False, son_hata, son_http, False

            if "text/html" in r.headers.get("Content-Type", ""):
                son_hata = "HTML geldi - oturum"
                print("  [!] PDF yerine HTML geldi — oturum sona ermiş.")
                return False, son_hata, son_http, True

            # İçeriği belleğe al ve GERÇEK PDF mi diye doğrula.
            # GIB oturum hatasında HTTP 200 ama 85 byte'lık XML döner:
            #   <SERVICERESULT><EYEKSERROR>Oturum hatası, hatalı token</EYEKSERROR></SERVICERESULT>
            # Bu yüzden %PDF başlığı yoksa KAYDETME, oturumu yenile.
            icerik = r.content
            if not icerik[:5].startswith(b"%PDF"):
                bas = icerik[:200].decode("utf-8", "replace")
                if (b"EYEKSERROR" in icerik or b"SERVICERESULT" in icerik
                        or "Oturum" in bas or "token" in bas.lower()):
                    son_hata = "Oturum/token hatası (XML)"
                    print(f"  [!] PDF değil — oturum/token hatası: {bas.strip()[:60]}")
                    return False, son_hata, son_http, True
                son_hata = f"Geçersiz PDF ({len(icerik)} byte)"
                print(f"  [!] Geçersiz içerik (PDF değil, {len(icerik)} byte) — kaydedilmedi")
                return False, son_hata, son_http, False

            os.makedirs(os.path.dirname(hedef_yol), exist_ok=True)
            with open(hedef_yol, "wb") as f:
                f.write(icerik)
            kb = os.path.getsize(hedef_yol) / 1024
            print(f"  [✓] {Path(hedef_yol).name}  ({kb:.1f} KB)")
            return True, "", son_http, False

        except requests.exceptions.Timeout:
            son_hata = "timeout"
            print(f"  [!] Zaman aşımı — satır {satir_no} (deneme {deneme}/{MAX_DENEME})")
            if deneme < MAX_DENEME:
                time.sleep(BEKLEME_SANIYE[min(deneme - 1, len(BEKLEME_SANIYE) - 1)])
                continue
            return False, son_hata, son_http, False
        except Exception as e:
            son_hata = str(e)
            print(f"  [!] Hata: {e} (deneme {deneme}/{MAX_DENEME})")
            if deneme < MAX_DENEME:
                time.sleep(BEKLEME_SANIYE[min(deneme - 1, len(BEKLEME_SANIYE) - 1)])
                continue
            return False, son_hata, son_http, False

    return False, son_hata or "bilinmeyen hata", son_http, False


def session_olustur(cookie_header):
    session = requests.Session()
    session.verify = False
    session.mount("https://", GibSSLAdapter())
    session.headers.update({
        "Cookie":     cookie_header,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/136.0.0.0 Safari/537.36",
        "Referer":    f"{BASE_URL}/",
        "Accept":     "application/pdf,application/octet-stream,*/*",
    })
    return session


def hata_logu_yaz(base, hatalar):
    if not hatalar:
        return None

    yol = base / HATA_LOGU
    alanlar = [
        "Satir_No", "Dosya_Tipi", "Beyanname_Turu", "Ad_Soyad", "Vergilendirme_Donemi",
        "BynOID", "EkOID", "Hedef_Dosya", "HTTP", "Hata"
    ]
    with open(yol, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=alanlar, delimiter=";")
        writer.writeheader()
        writer.writerows(hatalar)
    return yol


def duzeltme_raporu_yaz(base, kayitlar):
    if not kayitlar:
        return None

    yol = base / DUZELTME_RAPORU
    alanlar = [
        "Satir_No", "Beyanname_Turu", "Ad_Soyad", "Vergilendirme_Donemi",
        "BynOID", "Duzeltme", "Dosya"
    ]
    with open(yol, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=alanlar, delimiter=";")
        writer.writeheader()
        writer.writerows(kayitlar)
    return yol


def gecerli_pdf(yol):
    """Dosya gerçek bir PDF mi? (%PDF başlığı + makul boyut)
    GIB oturum hatası 85 byte'lık XML kaydetmiş olabilir — onları geçersiz say."""
    try:
        p = Path(yol)
        if not p.exists() or p.stat().st_size < 300:
            return False
        with open(p, "rb") as f:
            return f.read(5).startswith(b"%PDF")
    except Exception:
        return False


def pdf_metin_oku(dosya_yolu):
    if not PDF_OKUMA:
        return ""
    try:
        doc = fitz.open(str(dosya_yolu))
        return "\n".join(page.get_text() for page in doc)
    except Exception:
        return ""


def pdf_metin_norm(dosya_yolu):
    metin = pdf_metin_oku(dosya_yolu)
    if not metin:
        return ""
    temiz = metin.replace("\xa0", " ").lower()
    temiz = re.sub(r"\s+", " ", temiz).strip()
    return temiz


def pdf_duzeltme_bilgisi(dosya_yolu):
    metin = pdf_metin_oku(dosya_yolu)
    if not metin:
        return {"duzeltme": False}

    temiz = metin.replace("\xa0", " ").lower()
    return {"duzeltme": ("düzeltme nedeni" in temiz or "duzeltme nedeni" in temiz)}


def pdf_url(token, subcmd, byn_oid, ek_oid=""):
    # OID'ler DOM'da zaten GIB'in beklediği formatta (gerekirse yüzde-kodlu) tutuluyor.
    # Tekrar kodlama YAPMA — yoksa zaten kodlu '%' çift kodlanır (%→%25) ve OID bozulur.
    byn_oid = str(byn_oid)
    ek_oid = str(ek_oid)
    base = f"{BASE_URL}/dispatch?cmd=IMAJ&subcmd={subcmd}&TOKEN={token}"
    if subcmd == "BEYANNAMEGORUNTULE":
        return f"{base}&beyannameOid={byn_oid}&inline=true"
    if subcmd == "TAHAKKUKGORUNTULE":
        return f"{base}&beyannameOid={byn_oid}&tahakkukOid={ek_oid}&inline=true"
    if subcmd == "IHBARNAMEGORUNTULE":
        return f"{base}&beyannameOid={byn_oid}&ihbarnameOid={ek_oid}&inline=true"
    if subcmd == "SGKTAHAKKUKGORUNTULE":
        return f"{base}&beyannameOid={byn_oid}&sgkTahakkukOid={ek_oid}&inline=true"
    if subcmd == "SGKHIZMETGORUNTULE":
        return f"{base}&beyannameOid={byn_oid}&sgkTahakkukOid={ek_oid}&inline=true"
    return f"{base}&beyannameOid={byn_oid}&inline=true"


def csv_listesi_bul(base):
    """Proje klasöründeki tüm beyanname CSV'lerini bul (mükellef excel'i hariç)."""
    dosyalar = []
    for p in base.rglob("*.csv"):
        ad = p.name.lower()
        if ad.startswith(("beyannameler", "muhtasar", "kdv", "ggecici", "kgecici", "kgecıcı")) or \
           "kdv" in ad or \
           "yıllık gelir 2025" in ad or "yillik gelir 2025" in ad or \
           "2024 yıllık beyanlar" in ad or "2024 yillik beyanlar" in ad or \
           "2024_kurumlar_secili_tekrar" in ad or \
           "2024 yılı kurumlar" in ad or "2024 yili kurumlar" in ad or \
           "tcc kurumlar 2026" in ad:
            dosyalar.append(str(p))
    return sorted(set(dosyalar))


def dosya_hashi(yol):
    h = hashlib.md5()
    with open(yol, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def ayni_dosya_mi(yol1, yol2):
    try:
        if not Path(yol1).exists() or not Path(yol2).exists():
            return False
        if os.path.getsize(yol1) == os.path.getsize(yol2):
            if dosya_hashi(yol1) == dosya_hashi(yol2):
                return True

        # PDF'ler her indirmede metadata yüzünden farklı hash üretebiliyor.
        # Metin aynıysa aynı belge kabul et.
        if str(yol1).lower().endswith(".pdf") and str(yol2).lower().endswith(".pdf"):
            metin1 = pdf_metin_norm(yol1)
            metin2 = pdf_metin_norm(yol2)
            if metin1 and metin2 and metin1 == metin2:
                return True
        return False
    except Exception:
        return False


def duzeltme_adaylari(hedef, isim, dosya_tipi):
    adaylar = []
    normal = hedef / f"{isim} {dosya_tipi}.pdf"
    if normal.exists():
        adaylar.append(normal)

    pattern = re.compile(rf"^{re.escape(isim)} DÜZ(?: (\d+))? {re.escape(dosya_tipi)}\.pdf$", re.IGNORECASE)
    for p in hedef.glob(f"{isim}* {dosya_tipi}.pdf"):
        if pattern.match(p.name):
            adaylar.append(p)
    return sorted(set(adaylar), key=lambda p: p.name)


def sonraki_duzeltme_eki(hedef, isim, dosya_tipi):
    pattern = re.compile(rf"^{re.escape(isim)} DÜZ(?: (\d+))? {re.escape(dosya_tipi)}\.pdf$", re.IGNORECASE)
    sayilar = []
    for p in hedef.glob(f"{isim}* {dosya_tipi}.pdf"):
        m = pattern.match(p.name)
        if not m:
            continue
        sayilar.append(int(m.group(1)) if m.group(1) else 1)

    if not sayilar:
        return " DÜZ"
    return f" DÜZ {max(sayilar) + 1}"


def gecici_dosya_yolu(hedef, isim, dosya_tipi, satir_no):
    return hedef / f"__tmp__{isim}_{satir_no}_{dosya_tipi}.pdf"


def ana():
    base = Path(__file__).parent

    # Opsiyonel parametreler:
    #   --csv muhtasar.csv   → sadece bu CSV
    #   --tur MUHSGK         → sadece bu beyanname türü
    #   --yil 2026           → sadece bu yılın dönemleri (yıl içinde geçmeli)
    #   --donem 04/2026      → sadece bu tam dönem (Vergilendirme_Donemi içinde geçmeli)
    csv_filter = None
    tur_filter = None
    yil_filter = None
    donem_filter = None
    csv_klasor = None
    csvpath_filter = None   # tam dosya yolu (panel kullanır)
    cikti_test = None       # test çıktı klasörü (--cikti)
    atla_mevcut = False     # --atla-mevcut: BYN+THK varsa HTTP atmadan atla
    args = sys.argv[1:]
    for idx, arg in enumerate(args):
        if arg == "--csv" and idx + 1 < len(args):
            csv_filter = args[idx + 1]
        if arg == "--csvpath" and idx + 1 < len(args):
            csvpath_filter = args[idx + 1]
        if arg == "--tur" and idx + 1 < len(args):
            tur_filter = args[idx + 1].strip().upper()
        if arg == "--yil" and idx + 1 < len(args):
            yil_filter = args[idx + 1].strip()
        if arg == "--donem" and idx + 1 < len(args):
            donem_filter = args[idx + 1].strip()
        if arg == "--csv-klasor" and idx + 1 < len(args):
            csv_klasor = args[idx + 1].strip()
        if arg == "--cikti" and idx + 1 < len(args):
            cikti_test = args[idx + 1].strip()
        if arg == "--atla-mevcut":
            atla_mevcut = True

    print("=" * 60)
    print("  Beyanname & Tahakkuk PDF İndirici")
    print("  (KDV + Muhtasar)")
    if csv_filter: print(f"  CSV Filtre : {csv_filter}")
    if csv_klasor: print(f"  CSV Klasör : {csv_klasor}")
    if tur_filter: print(f"  Tür Filtre : {tur_filter}")
    if yil_filter: print(f"  Yıl Filtre : {yil_filter}")
    if donem_filter: print(f"  Dönem Filtre: {donem_filter}")
    if cikti_test: print(f"  TEST ÇIKTI : {cikti_test}")
    print("=" * 60)

    # CSV'leri bul
    if csvpath_filter:
        # Panel doğrudan tam dosya yolu verdi → sadece onu kullan
        p = Path(csvpath_filter)
        csv_dosyalari = [str(p)] if p.exists() else []
        if not csv_dosyalari:
            print(f"\n[HATA] CSV bulunamadı: {csvpath_filter}")
            bekle_kapat("Çıkmak için Enter...")
            sys.exit(1)
    else:
        csv_dosyalari = csv_listesi_bul(base)
    if csv_klasor:
        hedef_norm = _norm(csv_klasor)
        csv_dosyalari = [
            d for d in csv_dosyalari
            if _norm(Path(d).resolve().parent.name) == hedef_norm
        ]
    if csv_filter:
        csv_dosyalari = [d for d in csv_dosyalari if _norm(Path(d).name) == _norm(csv_filter)]
    if not csv_dosyalari:
        print("\n[HATA] CSV bulunamadı! Proje klasörüne CSV koyun.")
        bekle_kapat("Çıkmak için Enter...")
        sys.exit(1)

    print(f"\nBulunan CSV'ler:")
    for d in csv_dosyalari: print(f"  - {Path(d).name}")
    print()

    # Mükellef listesi
    print("Mükellef listesi okunuyor...")
    taner_set, omer_set = mukellef_listesi_yukle(base)
    print()

    # Chrome bağlantısı
    print("Chrome'dan oturum alınıyor...")
    cookie_header, token = chrome_baglanti()
    print()

    # HTTP session
    session = session_olustur(cookie_header)

    # Tüm CSV'leri oku ve birleştir
    tum_rows = []
    for csv_yolu in csv_dosyalari:
        with open(csv_yolu, encoding="utf-8-sig") as f:
            satirlar = list(csv.DictReader(f, delimiter=";"))
            for s in satirlar:
                s["__csv_name"] = Path(csv_yolu).name
            tum_rows.extend(satirlar)
            print(f"  {Path(csv_yolu).name}: {len(satirlar)} satır okundu")

    print(f"\nToplam {len(tum_rows)} kayıt işlenecek...\n")

    # ──────────────────────────────────────────────────────────
    # CSV tabanlı DÜZELTME (DÜZ) eki hesaplama
    # Aynı (Ad_Soyad, Vergilendirme_Donemi, Beyanname_Turu) birden fazla
    # satırda varsa: en eski yükleme = normal, sonrakiler = DÜZ, DÜZ 2, ...
    # KDV1 için TEK düzeltme kaynağı budur (PDF taraması KDV1'de yanlış sonuç
    # verir — şablonda her zaman "Düzeltme Nedeni" alanı bulunur).
    # ──────────────────────────────────────────────────────────
    def _yukleme_dt(r):
        try:
            return datetime.datetime.strptime(
                str(r.get("Yukleme_Zamani", "")).strip()[:16], "%d.%m.%Y - %H:%M")
        except Exception:
            return datetime.datetime.min

    _duz_gruplar = defaultdict(list)
    for r in tum_rows:
        rr = {(str(k).lstrip("﻿").strip() if k is not None else ""): v for k, v in r.items()}
        ad_g  = str(rr.get("Ad_Soyad", "") or "").strip()
        don_g = str(rr.get("Vergilendirme_Donemi", "") or "").strip()
        tur_g = str(rr.get("Beyanname_Turu", "") or "").strip().upper()
        _duz_gruplar[(ad_g, don_g, tur_g)].append(rr)

    csv_duz_eki = {}  # BynOID -> "" / " DÜZ" / " DÜZ 2" ...
    for _anahtar, _grup in _duz_gruplar.items():
        for _idx, rr in enumerate(sorted(_grup, key=_yukleme_dt)):
            _oid = str(rr.get("BynOID", "") or "").strip()
            if not _oid:
                continue
            csv_duz_eki[_oid] = "" if _idx == 0 else (" DÜZ" if _idx == 1 else f" DÜZ {_idx}")

    basarili = 0
    basarisiz = []
    hata_kayitlari = []
    duzeltme_kayitlari = []

    # ÖN TARAMA — Hızlı mod için (HTTP başlamadan önce)
    # Hangi satırlar zaten tam, hangileri eksik say ve özet yazdır.
    on_tarama_atla_oid = set()
    if atla_mevcut:
        print("⚡ Hızlı mod: ön tarama yapılıyor (HTTP atılmıyor)...")
        on_atlanacak = 0
        on_indirilecek = 0
        for row in tum_rows:
            row_n = {(str(k).lstrip("﻿").strip() if k is not None else ""): v for k, v in row.items()}
            ad = (row_n.get("Ad_Soyad") or "").strip()
            byn_oid_n = (row_n.get("BynOID") or "").strip()
            ihb_n = (row_n.get("IhbOID") or "").strip().upper()
            vd = (row_n.get("Vergilendirme_Donemi") or "").strip()
            tur_n = (row_n.get("Beyanname_Turu") or "").strip()
            if not byn_oid_n or ihb_n in ("VAR", "YES", "1"):
                continue
            sahip_n = klasor_bul(ad, taner_set, omer_set)
            if not sahip_n: continue
            try:
                hedef_n = hedef_klasor_bul(tur_n, sahip_n, vd, "", cikti_test or "")
            except Exception:
                continue
            isim_n = temiz_isim(ad) if ad else byn_oid_n[:8]
            byn_p = hedef_n / f"{isim_n} BYN.pdf"
            thk_p = hedef_n / f"{isim_n} THK.pdf"
            if byn_p.exists() and thk_p.exists() and gecerli_pdf(byn_p) and gecerli_pdf(thk_p):
                on_atlanacak += 1
                on_tarama_atla_oid.add(byn_oid_n)
            else:
                on_indirilecek += 1
        print(f"  → {on_atlanacak} satır zaten tam (atlanacak)")
        print(f"  → {on_indirilecek} satır eksik (indirilecek)")
        print()

    for i, row in enumerate(tum_rows, 1):
        row = {(str(k).lstrip("\ufeff").strip() if k is not None else ""): v for k, v in row.items()}

        def col(*keys):
            for k in keys:
                if k in row and row[k]: return row[k].strip()
            return ""

        ad_soyad  = col("Ad_Soyad", "AdSoyad", "ad_soyad")
        byn_oid   = col("BynOID", "Byn_OID", "Beyanname_OID", "bynoid")
        thk_oid   = col("ThkOID", "Thk_OID", "Tahakkuk_OID", "thkoid")
        sgk_normal = col("SgkNormalOID", "SgkNormal_OID", "sgknormaloid")
        sgk_emekli = col("SgkEmekliOID", "SgkEmekli_OID", "sgkemekloid", "sgkemekliid")
        # Geriye dönük uyumluluk: eski tek sütunlu CSV'ler (SgkThkOID) normal sayılır
        if not sgk_normal and not sgk_emekli:
            sgk_normal = col("SgkThkOID", "SgkThk_OID", "SGKThkOID", "sgkthkoid", "SgkTahakkukOid")
        ihb_oid   = col("IhbOID", "Ihb_OID", "ihboid")
        vd_donemi = col("Vergilendirme_Donemi", "vergilendirme_donemi")
        byn_turu  = col("Beyanname_Turu", "beyanname_turu")
        kaynak_csv = col("__csv_name")
        csv_duz   = csv_duz_eki.get(byn_oid, "")  # CSV tekrarına göre DÜZ eki

        if not byn_oid:
            print(f"[{i}/{len(tum_rows)}] OID yok, atlandı.")
            continue

        # Tür filtresi (--tur parametresi)
        if tur_filter and not yillik_kurumlar_csv_mi(kaynak_csv) and str(byn_turu).strip().upper() != tur_filter:
            print(f"[{i}/{len(tum_rows)}] [{byn_turu}] atlandı (filtre: {tur_filter})")
            continue

        # Yıl filtresi (--yil parametresi) — Vergilendirme_Donemi içinde yıl geçmeli
        if yil_filter and yil_filter not in str(vd_donemi):
            print(f"[{i}/{len(tum_rows)}] [{byn_turu}] {vd_donemi} atlandı (filtre: {yil_filter})")
            continue

        # Dönem filtresi (--donem parametresi) — tam dönem Vergilendirme_Donemi içinde geçmeli
        if donem_filter and donem_filter not in str(vd_donemi):
            print(f"[{i}/{len(tum_rows)}] [{byn_turu}] {vd_donemi} atlandı (dönem filtresi: {donem_filter})")
            continue

        # İHB olan kayıtları atla (ihbarname mevcut, ayrıca işlenecek)
        if ihb_oid and ihb_oid.strip().upper() in ("VAR", "YES", "1"):
            print(f"[{i}/{len(tum_rows)}] [{byn_turu}] {ad_soyad}  →  [İHB] atlandı")
            continue

        sahip = klasor_bul(ad_soyad, taner_set, omer_set)
        if not sahip:
            print(f"[{i}/{len(tum_rows)}] {ad_soyad}  →  [!] Listede yok, atlandı.")
            basarisiz.append(f"Satır {i}: {ad_soyad} (listede yok)")
            continue

        if kaynak_csv.lower() == "tcc kurumlar 2026.csv":
            sahip = "TANER BATTAL"
        hedef = hedef_klasor_bul(byn_turu, sahip, vd_donemi, kaynak_csv, cikti_test or "")
        isim   = temiz_isim(ad_soyad) if ad_soyad else byn_oid[:8]
        etiket = isim
        tur_kisa = byn_turu if byn_turu else "?"
        duz_str  = ""

        print(f"[{i}/{len(tum_rows)}] [{tur_kisa}] {ad_soyad}{duz_str}  →  {sahip.split()[0]} / {hedef.name}/")

        # HIZLI MOD: ön taramada tam olduğu doğrulanmış → HTTP atmadan atla
        if atla_mevcut and byn_oid in on_tarama_atla_oid:
            print(f"  [⚡] BYN + THK var — atlandı (HTTP atılmadı)")
            basarili += 1
            continue

        satir_ok = True
        duz_bilgi = {"duzeltme": False}
        duzeltme_eki = ""

        # Beyanname PDF
        gecici_byn = gecici_dosya_yolu(hedef, isim, "BYN", i)
        dosya_byn = hedef / f"{isim} BYN.pdf"
        ok, hata, http, oturum_yenile = pdf_indir(
                pdf_url(token, "BEYANNAMEGORUNTULE", byn_oid), str(gecici_byn), session, i
        )
        if not ok and oturum_yenile:
            print("  [i] Oturum yenileniyor ve tekrar deneniyor...")
            cookie_header, token = chrome_baglanti()
            session = session_olustur(cookie_header)
            ok, hata, http, oturum_yenile = pdf_indir(
                pdf_url(token, "BEYANNAMEGORUNTULE", byn_oid), str(gecici_byn), session, i
            )
        if ok:
            # DÜZELTME tespiti — TÜM türler için CSV tekrarına göre (en güvenilir):
            # Aynı firma + aynı dönem + aynı tür listede birden fazla satırsa,
            # YÜKLEME ZAMANINA göre sıralanır; 2. ve sonrakiler düzeltmedir (DÜZ, DÜZ 2...).
            # Bu, GIB'de düzeltmenin gerçek tanımıdır (aynı dönemin yeniden beyanı).
            # PDF içindeki "Düzeltme Nedeni" alanı şablonda HER ZAMAN bulunduğu için
            # PDF taraması kullanılmaz (yanlış pozitif verir).
            duz_bilgi = {"duzeltme": bool(csv_duz)}
            duzeltme_eki = csv_duz

            if duzeltme_eki:
                dosya_byn = hedef / f"{isim}{duzeltme_eki} BYN.pdf"
                print(f"  [DÜZ] Düzeltme tespit edildi → {dosya_byn.name}")
            else:
                dosya_byn = hedef / f"{isim} BYN.pdf"

            mevcut_aday = next((p for p in duzeltme_adaylari(hedef, isim, "BYN") if ayni_dosya_mi(gecici_byn, p)), None)
            if mevcut_aday:
                print(f"  [=] {mevcut_aday.name} zaten var (aynı içerik)")
                try:
                    gecici_byn.unlink(missing_ok=True)
                except Exception:
                    pass
                dosya_byn = mevcut_aday
                m = re.match(rf"^{re.escape(isim)}( DÜZ(?: \d+)?)? BYN\.pdf$", mevcut_aday.name, re.IGNORECASE)
                duzeltme_eki = m.group(1) if m and m.group(1) else ""
            else:
                os.makedirs(hedef, exist_ok=True)
                if not duz_bilgi["duzeltme"] and gecerli_pdf(dosya_byn):
                    print(f"  [=] {dosya_byn.name} zaten var")
                    try:
                        gecici_byn.unlink(missing_ok=True)
                    except Exception:
                        pass
                else:
                    gecici_byn.replace(dosya_byn)
                    print(f"  [→] Kaydedildi: {dosya_byn.name}")

            etiket = f"{isim}{duzeltme_eki}"
            duzeltme_kayitlari.append({
                "Satir_No": i,
                "Beyanname_Turu": byn_turu,
                "Ad_Soyad": ad_soyad,
                "Vergilendirme_Donemi": vd_donemi,
                "BynOID": byn_oid,
                "Duzeltme": "EVET" if duz_bilgi["duzeltme"] else "HAYIR",
                "Dosya": str(dosya_byn),
            })
        else:
            satir_ok = False
            hata_kayitlari.append({
                "Satir_No": i,
                "Dosya_Tipi": "BYN",
                "Beyanname_Turu": byn_turu,
                "Ad_Soyad": ad_soyad,
                "Vergilendirme_Donemi": vd_donemi,
                "BynOID": byn_oid,
                "EkOID": "",
                "Hedef_Dosya": str(dosya_byn),
                "HTTP": http,
                "Hata": hata,
            })

        time.sleep(1.0)

        # Tahakkuk PDF
        if thk_oid:
            dosya_thk = hedef / f"{etiket} THK.pdf"
            gecici_thk = gecici_dosya_yolu(hedef, isim, "THK", i)
            ok, hata, http, oturum_yenile = pdf_indir(
                    pdf_url(token, "TAHAKKUKGORUNTULE", byn_oid, thk_oid), str(gecici_thk), session, i
            )
            if not ok and oturum_yenile:
                print("  [i] Oturum yenileniyor ve tekrar deneniyor...")
                cookie_header, token = chrome_baglanti()
                session = session_olustur(cookie_header)
                ok, hata, http, oturum_yenile = pdf_indir(
                    pdf_url(token, "TAHAKKUKGORUNTULE", byn_oid, thk_oid), str(gecici_thk), session, i
                )
            if ok:
                mevcut_thk = next((p for p in duzeltme_adaylari(hedef, isim, "THK") if ayni_dosya_mi(gecici_thk, p)), None)
                if mevcut_thk:
                    print(f"  [=] {mevcut_thk.name} zaten var (aynı içerik)")
                    try:
                        gecici_thk.unlink(missing_ok=True)
                    except Exception:
                        pass
                else:
                    os.makedirs(hedef, exist_ok=True)
                    if not duz_bilgi["duzeltme"] and gecerli_pdf(dosya_thk):
                        print(f"  [=] {dosya_thk.name} zaten var")
                        try:
                            gecici_thk.unlink(missing_ok=True)
                        except Exception:
                            pass
                    else:
                        gecici_thk.replace(dosya_thk)
                        print(f"  [→] Kaydedildi: {dosya_thk.name}")
            else:
                satir_ok = False
                hata_kayitlari.append({
                    "Satir_No": i,
                    "Dosya_Tipi": "THK",
                    "Beyanname_Turu": byn_turu,
                    "Ad_Soyad": ad_soyad,
                    "Vergilendirme_Donemi": vd_donemi,
                    "BynOID": byn_oid,
                    "EkOID": thk_oid,
                    "Hedef_Dosya": str(dosya_thk),
                    "HTTP": http,
                    "Hata": hata,
                })
        else:
            print("  [-] Tahakkuk OID yok")

        time.sleep(1.0)

        # ──────────────────────────────────────────────────────────
        # SGK belgeleri (sadece MUHSGK)
        #   NORMAL (5510 / TÜM SİG.KOLLARI)  → "SGK THK" + "SGK HİZMET LİSTESİ"
        #   EMEKLİ (SGDP / SOS.GÜV.DES PRİM) → "EMEKLİ SGK THK" + "EMEKLİ SGK HİZMET LİSTESİ"
        # Bir tipten birden fazla varsa (OID'ler '|' ile ayrılır) → sona 1,2,3 eklenir.
        # OID listesi boşsa o tip atlanır.
        # ──────────────────────────────────────────────────────────
        if str(byn_turu).strip().upper() == "MUHSGK":
            def _sgk_jobs(oid_str, thk_base, hzl_base):
                oidler = [o.strip() for o in str(oid_str or "").split("|") if o.strip()]
                jobs = []
                cok = len(oidler) > 1
                for idx, o in enumerate(oidler, 1):
                    son = f" {idx}" if cok else ""
                    jobs.append((o, f"{thk_base}{son}", f"{hzl_base}{son}"))
                return jobs

            # (sgk_oid, THK_etiketi, HZL_etiketi)  — düz liste
            sgk_tipleri = (
                _sgk_jobs(sgk_normal, "SGK THK", "SGK HİZMET LİSTESİ") +
                _sgk_jobs(sgk_emekli, "EMEKLİ SGK THK", "EMEKLİ SGK HİZMET LİSTESİ")
            )

            # SGK belgeleri AYRI klasöre gider (muhtasar'dan bağımsız):
            #   {sahip}/MUHTASAR/{ay}   ← BYN/THK
            #   {sahip}/SGK/{ay}        ← SGK belgeleri
            sgk_klasor = sgk_hedef_klasor_bul(sahip, vd_donemi, cikti_test or "")

            for sgk_oid_v, thk_etiket, hzl_etiket in sgk_tipleri:
                for sgk_subcmd, sgk_etiket in (
                    ("SGKTAHAKKUKGORUNTULE", thk_etiket),
                    ("SGKHIZMETGORUNTULE",   hzl_etiket),
                ):
                    dosya_sgk = sgk_klasor / f"{etiket} {sgk_etiket}.pdf"
                    gecici_sgk = gecici_dosya_yolu(sgk_klasor, isim, sgk_etiket.replace(" ", "_"), i)
                    ok, hata, http, oturum_yenile = pdf_indir(
                        pdf_url(token, sgk_subcmd, byn_oid, sgk_oid_v), str(gecici_sgk), session, i
                    )
                    if not ok and oturum_yenile:
                        print("  [i] Oturum yenileniyor ve tekrar deneniyor...")
                        cookie_header, token = chrome_baglanti()
                        session = session_olustur(cookie_header)
                        ok, hata, http, oturum_yenile = pdf_indir(
                            pdf_url(token, sgk_subcmd, byn_oid, sgk_oid_v), str(gecici_sgk), session, i
                        )
                    if ok:
                        if gecerli_pdf(dosya_sgk) and ayni_dosya_mi(gecici_sgk, dosya_sgk):
                            print(f"  [=] {dosya_sgk.name} zaten var (aynı içerik)")
                            try:
                                gecici_sgk.unlink(missing_ok=True)
                            except Exception:
                                pass
                        elif not duz_bilgi["duzeltme"] and gecerli_pdf(dosya_sgk):
                            print(f"  [=] {dosya_sgk.name} zaten var")
                            try:
                                gecici_sgk.unlink(missing_ok=True)
                            except Exception:
                                pass
                        else:
                            os.makedirs(sgk_klasor, exist_ok=True)
                            gecici_sgk.replace(dosya_sgk)
                            print(f"  [→] Kaydedildi: SGK/{dosya_sgk.name}")
                    else:
                        satir_ok = False
                        hata_kayitlari.append({
                            "Satir_No": i,
                            "Dosya_Tipi": sgk_etiket,
                            "Beyanname_Turu": byn_turu,
                            "Ad_Soyad": ad_soyad,
                            "Vergilendirme_Donemi": vd_donemi,
                            "BynOID": byn_oid,
                            "EkOID": sgk_oid_v,
                            "Hedef_Dosya": str(dosya_sgk),
                            "HTTP": http,
                            "Hata": hata,
                        })
                    time.sleep(1.0)

        # İhbarname PDF (varsa — gerçek OID gerekli, "VAR" bayrağı atlanır)
        if ihb_oid and ihb_oid.upper() not in ("VAR", "YES", "1"):
            dosya_ihb = hedef / f"{etiket} İHB.pdf"
            if dosya_ihb.exists():
                print(f"  [=] {dosya_ihb.name} zaten var")
            else:
                ok, hata, http, oturum_yenile = pdf_indir(
                    pdf_url(token, "IHBARNAMEGORUNTULE", byn_oid, ihb_oid), str(dosya_ihb), session, i
                )
                if not ok and oturum_yenile:
                    print("  [i] Oturum yenileniyor ve tekrar deneniyor...")
                    cookie_header, token = chrome_baglanti()
                    session = session_olustur(cookie_header)
                    ok, hata, http, oturum_yenile = pdf_indir(
                        pdf_url(token, "IHBARNAMEGORUNTULE", byn_oid, ihb_oid), str(dosya_ihb), session, i
                    )
                if not ok:
                    satir_ok = False
                    hata_kayitlari.append({
                        "Satir_No": i,
                        "Dosya_Tipi": "IHB",
                        "Beyanname_Turu": byn_turu,
                        "Ad_Soyad": ad_soyad,
                        "Vergilendirme_Donemi": vd_donemi,
                        "BynOID": byn_oid,
                        "EkOID": ihb_oid,
                        "Hedef_Dosya": str(dosya_ihb),
                        "HTTP": http,
                        "Hata": hata,
                    })
        elif ihb_oid:
            print(f"  [i] İHB mevcut (OID henüz bilinmiyor, atlandı)")

        if satir_ok: basarili += 1
        else: basarisiz.append(f"Satır {i}: {ad_soyad or byn_oid}")

        time.sleep(1.5)

    print()
    print("=" * 60)
    print(f"  TAMAMLANDI  |  Başarılı: {basarili}/{len(tum_rows)}  |  Hatalı: {len(tum_rows)-basarili}")
    print("=" * 60)

    if basarisiz:
        print("\nİNDİRİLEMEYENLER:")
        for item in basarisiz: print(f"  - {item}")
        log_yolu = hata_logu_yaz(base, hata_kayitlari)
        if log_yolu:
            print(f"\nAyrıntılı hata logu yazıldı: {log_yolu.name}")
        print("\nİpucu: Tekrarlayan 500 hatalarında aynı kayıtlar için log dosyasından yeniden deneme listesi üretilebilir.")

    duz_rapor_yolu = duzeltme_raporu_yaz(base, duzeltme_kayitlari)
    if duz_rapor_yolu:
        print(f"\nDüzeltme tarama raporu yazıldı: {duz_rapor_yolu.name}")

    bekle_kapat("\nBitmek için Enter'a basın...")


if __name__ == "__main__":
    ana()
