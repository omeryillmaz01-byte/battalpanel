# -*- coding: utf-8 -*-
"""
KDV klasörlerini tarar: BYN var ama THK yoksa eksik THK'yı indirir.
FIRMA BYN.pdf → FIRMA THK.pdf
FIRMA DÜZ BYN.pdf → FIRMA DÜZ THK.pdf
"""
import csv, re, json, sys, time, ssl, requests, websocket, urllib3, os
urllib3.disable_warnings()
from pathlib import Path
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
import pandas as pd
from collections import defaultdict
from difflib import SequenceMatcher

BASE = Path(__file__).parent

KDV_TANER = Path(r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE\1-) OFİS MUHASEBE\4-) BEYAN VE TAHAKKUKLAR\1-) KDV BEYAN & THK")
KDV_OMER  = Path(r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE\2-) ÖMER MUHASEBE\1-) BEYAN VE TAHAKKUKLAR\2026 YILI\1-) KDV BYN & THK")
BASE_URL  = "https://ebeyanname.gib.gov.tr"

class GibSSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *a, **kw):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.set_ciphers('ALL:@SECLEVEL=0')
        kw['ssl_context'] = ctx
        super().init_poolmanager(*a, **kw)

def temiz_isim(isim):
    ad = " ".join(str(isim).strip().split()[:2])
    for ch in r'\/:*?"<>|': ad = ad.replace(ch, "")
    return ad.strip()

# ── CSV'den OID tablosu ──────────────────────────────────────────
# key: byn_dosya_adi (örn: "AKÇA AĞIZ BYN.pdf") → thk_oid
oid_tablosu = {}   # byn_dosyaadi → thk_oid
byn_tablosu = {}   # byn_dosyaadi → byn_oid

_TR = str.maketrans('ÇĞİÖŞÜçğıöşü', 'CGIOSUcgiosu')
_LEGAL = {'LTD','AS','STI','VE','ADI','ORT','ORTAKLIGI','SIRKETI','LIMITED','ANONIM','TASF','HAL','AO','MUS','SAN','TIC'}
def _tr(s): return str(s).upper().translate(_TR)
def _norm(s): return re.sub(r'[\s\.\-\(\),/]', '', _tr(s))
def _kw(s): return [w for w in re.findall(r'[A-Z0-9]+', _tr(s)) if len(w)>2 and w not in _LEGAL][:3]
def _sim(a,b): return SequenceMatcher(None,a,b).ratio()

def klasor_bul_sahip(ad, taner_set, omer_set):
    if re.match(r'TASF[\.\s]*HAL', _tr(ad)): return "TANER BATTAL"
    hn = _norm(ad); hw = set(re.findall(r'[A-Z0-9]+', _tr(ad)))
    for listesi, sonuc in [(taner_set,"TANER BATTAL"),(omer_set,"ÖMER YILMAZ")]:
        for m in listesi:
            mn = _norm(m)
            if mn and (mn in hn or hn in mn): return sonuc
            kws = _kw(m)
            if len(kws)>=2:
                e = sum(1 for kw in kws[:2] if kw in hw or any(len(kw)>3 and _sim(kw,h)>=0.82 for h in hw))
                if e>=2: return sonuc
    return None

AY = {"01":"1-) OCAK AYI","02":"2-) ŞUBAT AYI","03":"3-) MART AYI",
      "04":"4-) NİSAN AYI","05":"5-) MAYIS AYI","06":"6-) HAZİRAN AYI",
      "07":"7-) TEMMUZ AYI","08":"8-) AĞUSTOS AYI","09":"9-) EYLÜL AYI",
      "10":"10-) EKİM AYI","11":"11-) KASIM AYI","12":"12-) ARALIK AYI"}

df = pd.read_excel(str(BASE / "TANER BATTAL MÜKELLEF LİSTESİ.xlsx"), header=None)
taner_set = set(str(v).strip().upper() for v in df.iloc[2:,1].dropna() if str(v).strip())
omer_set  = set(str(v).strip().upper() for v in df.iloc[2:,4].dropna() if str(v).strip())

from collections import defaultdict
import datetime
gruplar = defaultdict(list)
tum_rows = []
for csv_dosya in sorted(BASE.glob("kdv*.csv")):
    with open(csv_dosya, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter=";"):
            tum_rows.append(r)

def dt(r):
    try: return datetime.datetime.strptime(r.get("Yukleme_Zamani","").strip()[:16],"%d.%m.%Y - %H:%M")
    except: return datetime.datetime.min

for r in tum_rows:
    ad = r.get("Ad_Soyad","").strip()
    don = r.get("Vergilendirme_Donemi","").strip()
    tur = r.get("Beyanname_Turu","").strip().upper()
    gruplar[(ad,don,tur)].append(r)

duz_eki = {}
for (ad,don,tur),grup in gruplar.items():
    for idx,r in enumerate(sorted(grup,key=dt)):
        oid = r.get("BynOID","").strip()
        duz_eki[oid] = "" if idx==0 else (" DÜZ" if idx==1 else f" DÜZ{idx}")

for r in tum_rows:
    ad = r.get("Ad_Soyad","").strip()
    byn_oid = r.get("BynOID","").strip()
    thk_oid = r.get("ThkOID","").strip()
    don = r.get("Vergilendirme_Donemi","").strip()
    tur = r.get("Beyanname_Turu","").strip().upper()
    ihb = r.get("IhbOID","").strip().upper()
    if not byn_oid or tur != "KDV1" or "2026" not in don: continue
    if ihb in ("VAR","YES","1"): continue
    isim = temiz_isim(ad)
    ek = duz_eki.get(byn_oid,"")
    byn_dosya = f"{isim}{ek} BYN.pdf"
    oid_tablosu[byn_dosya] = thk_oid
    byn_tablosu[byn_dosya] = byn_oid

# ── Klasörleri tara: BYN var THK yok / THK var BYN yok ──────────
eksikler = []  # (klasor, byn_dosyaadi, eksik_hedef, byn_oid, thk_oid, tip)
for kdv_base in [KDV_TANER, KDV_OMER]:
    if not kdv_base.exists(): continue
    for ay_klas in kdv_base.glob("*/"):
        # BYN var → THK yok
        for byn_dosya in ay_klas.glob("* BYN.pdf"):
            thk_dosya = ay_klas / byn_dosya.name.replace(" BYN.pdf", " THK.pdf")
            if not thk_dosya.exists():
                byn_adi = byn_dosya.name
                thk_oid = oid_tablosu.get(byn_adi,"")
                byn_oid_val = byn_tablosu.get(byn_adi,"")
                eksikler.append((ay_klas, byn_adi, thk_dosya, byn_oid_val, thk_oid, "THK"))
        # THK var → BYN yok
        for thk_dosya in ay_klas.glob("* THK.pdf"):
            byn_dosya = ay_klas / thk_dosya.name.replace(" THK.pdf", " BYN.pdf")
            if not byn_dosya.exists():
                thk_adi = thk_dosya.name
                byn_adi = thk_adi.replace(" THK.pdf", " BYN.pdf")
                thk_oid = oid_tablosu.get(byn_adi,"")
                byn_oid_val = byn_tablosu.get(byn_adi,"")
                eksikler.append((ay_klas, byn_adi, byn_dosya, byn_oid_val, thk_oid, "BYN"))

if not eksikler:
    print("Eksik BYN veya THK bulunamadı! Her şey tamam.")
    input("Enter...")
    sys.exit(0)

print(f"\nEksik dosyalar ({len(eksikler)} adet):")
for klas, byn, hedef, boid, toid, tip in eksikler:
    durum = "✓ OID var" if (boid and toid) else "✗ OID bulunamadı"
    print(f"  [Eksik {tip}] [{durum}] {klas.name} / {hedef.name}")

# ── Chrome oturumu ───────────────────────────────────────────────
print("\nChrome'dan oturum alınıyor...")
hedefler = requests.get('http://localhost:9222/json', timeout=5).json()
ws_url = next((t['webSocketDebuggerUrl'] for t in hedefler if t.get('type')=='page' and 'gib.gov.tr' in t.get('url','')),None) \
      or next((t['webSocketDebuggerUrl'] for t in hedefler if t.get('type')=='page'),None)
ws = websocket.create_connection(ws_url, timeout=10)
ws.send(json.dumps({'id':1,'method':'Network.getAllCookies'}))
cookies = json.loads(ws.recv()).get('result',{}).get('cookies',[])
ws.send(json.dumps({'id':2,'method':'Runtime.evaluate','params':{'expression':
    "(function(){var m=window.location.href.match(/[?&]TOKEN=([^&]+)/);return m?decodeURIComponent(m[1]):'';})()"}}))
token = json.loads(ws.recv()).get('result',{}).get('result',{}).get('value','')
ws.close()
cookie_header = '; '.join(f"{c['name']}={c['value']}" for c in cookies)
print(f"  ✓ Oturum alındı. TOKEN: {token[:20]}...")

s = requests.Session()
s.mount('https://', GibSSLAdapter())
s.verify = False
s.headers.update({'Cookie':cookie_header,'User-Agent':'Mozilla/5.0','Accept':'application/pdf,*/*'})

# ── İndir ────────────────────────────────────────────────────────
basarili = 0
for klas, byn_adi, hedef_dosya, byn_oid, thk_oid, tip in eksikler:
    print(f"\n→ {hedef_dosya.name}")
    if not byn_oid:
        print("  [!] OID bulunamadı, atlandı")
        continue
    if tip == "THK":
        if not thk_oid:
            print("  [!] ThkOID bulunamadı, atlandı")
            continue
        url = (f"{BASE_URL}/dispatch?cmd=IMAJ&subcmd=TAHAKKUKGORUNTULE"
               f"&TOKEN={token}&beyannameOid={byn_oid}&tahakkukOid={thk_oid}&inline=true")
    else:  # BYN
        url = (f"{BASE_URL}/dispatch?cmd=IMAJ&subcmd=BEYANNAMEGORUNTULE"
               f"&TOKEN={token}&beyannameOid={byn_oid}&inline=true")
    try:
        r = s.get(url, timeout=60, stream=True)
        if 'text/html' in r.headers.get('Content-Type',''):
            print("  [!] HTML geldi — oturum sona ermiş")
            break
        if r.status_code != 200:
            print(f"  [!] HTTP {r.status_code}")
            continue
        with open(hedef_dosya,'wb') as f:
            for chunk in r.iter_content(8192): f.write(chunk)
        print(f"  [✓] {hedef_dosya.name}  ({os.path.getsize(hedef_dosya)//1024} KB)")
        basarili += 1
    except Exception as e:
        print(f"  [!] Hata: {e}")
    time.sleep(1.5)

print(f"\nTamamlandı: {basarili}/{len(eksikler)} eksik THK indirildi.")
input("Enter...")
