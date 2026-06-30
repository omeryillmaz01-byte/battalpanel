# -*- coding: utf-8 -*-
"""
KDV klasörlerini tarar.
CSV'de olması gereken dosyaları hesaplar.
Klasörde bulunup CSV'de karşılığı olmayan dosyaları siler (bunlar IHB kayıtlarından gelmiş).
"""
import csv, re, sys, datetime
from pathlib import Path
from collections import defaultdict
from difflib import SequenceMatcher
import pandas as pd

BASE = Path(__file__).parent

KDV_TANER = Path(r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE\1-) OFİS MUHASEBE\4-) BEYAN VE TAHAKKUKLAR\1-) KDV BEYAN & THK")
KDV_OMER  = Path(r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE\2-) ÖMER MUHASEBE\1-) BEYAN VE TAHAKKUKLAR\2026 YILI\1-) KDV BYN & THK")

AY = {"01":"1-) OCAK AYI","02":"2-) ŞUBAT AYI","03":"3-) MART AYI",
      "04":"4-) NİSAN AYI","05":"5-) MAYIS AYI","06":"6-) HAZİRAN AYI",
      "07":"7-) TEMMUZ AYI","08":"8-) AĞUSTOS AYI","09":"9-) EYLÜL AYI",
      "10":"10-) EKİM AYI","11":"11-) KASIM AYI","12":"12-) ARALIK AYI"}

_TR = str.maketrans('ÇĞİÖŞÜçğıöşü','CGIOSUcgiosu')
_LEGAL = {'LTD','AS','STI','VE','ADI','ORT','ORTAKLIGI','SIRKETI','LIMITED','ANONIM','TASF','HAL','AO','MUS','SAN','TIC'}
def _tr(s): return str(s).upper().translate(_TR)
def _norm(s): return re.sub(r'[\s\.\-\(\),/]','',_tr(s))
def _kw(s): return [w for w in re.findall(r'[A-Z0-9]+',_tr(s)) if len(w)>2 and w not in _LEGAL][:3]
def _sim(a,b): return SequenceMatcher(None,a,b).ratio()

def klasor_bul(ad, taner_set, omer_set):
    if re.match(r'TASF[\.\s]*HAL',_tr(ad)): return "TANER"
    hn=_norm(ad); hw=set(re.findall(r'[A-Z0-9]+',_tr(ad)))
    for lst,sonuc in [(taner_set,"TANER"),(omer_set,"OMER")]:
        for m in lst:
            mn=_norm(m)
            if mn and (mn in hn or hn in mn): return sonuc
            kws=_kw(m)
            if len(kws)>=2:
                e=sum(1 for kw in kws[:2] if kw in hw or any(len(kw)>3 and _sim(kw,h)>=0.82 for h in hw))
                if e>=2: return sonuc
    return None

def temiz_isim(isim):
    ad=" ".join(str(isim).strip().split()[:2])
    for ch in r'\/:*?"<>|': ad=ad.replace(ch,"")
    return ad.strip()

def dt(r):
    try: return datetime.datetime.strptime(r.get("Yukleme_Zamani","").strip()[:16],"%d.%m.%Y - %H:%M")
    except: return datetime.datetime.min

# Mükellef listesi
df = pd.read_excel(str(BASE/"TANER BATTAL MÜKELLEF LİSTESİ.xlsx"), header=None)
taner_set = set(str(v).strip().upper() for v in df.iloc[2:,1].dropna() if str(v).strip())
omer_set  = set(str(v).strip().upper() for v in df.iloc[2:,4].dropna() if str(v).strip())

# CSV'den beklenen dosya isimlerini hesapla
tum_rows = []
for csv_dosya in sorted(BASE.glob("kdv1*.csv")):
    with open(csv_dosya, encoding="utf-8-sig") as f:
        tum_rows += list(csv.DictReader(f, delimiter=";"))

# DÜZ ekleri
gruplar = defaultdict(list)
for r in tum_rows:
    ad=r.get("Ad_Soyad","").strip(); don=r.get("Vergilendirme_Donemi","").strip()
    tur=r.get("Beyanname_Turu","").strip().upper()
    gruplar[(ad,don,tur)].append(r)
duz_eki={}
for (_,_,_),grup in gruplar.items():
    for idx,r in enumerate(sorted(grup,key=dt)):
        duz_eki[r.get("BynOID","").strip()] = "" if idx==0 else (" DÜZ" if idx==1 else f" DÜZ{idx}")

# Beklenen dosya seti: (klasor_path, dosya_adi)
beklenen = set()
for r in tum_rows:
    ad=r.get("Ad_Soyad","").strip()
    byn_oid=r.get("BynOID","").strip()
    don=r.get("Vergilendirme_Donemi","").strip()
    tur=r.get("Beyanname_Turu","").strip().upper()
    if tur != "KDV1" or "2026" not in don or not byn_oid: continue
    sahip = klasor_bul(ad, taner_set, omer_set)
    if not sahip: continue
    aylar = re.findall(r'(\d{2})/\d{4}', don)
    bas = aylar[0] if aylar else "01"
    base = KDV_TANER if sahip=="TANER" else KDV_OMER
    klasor = base / AY.get(bas, f"AY-{bas}")
    isim = temiz_isim(ad)
    ek = duz_eki.get(byn_oid,"")
    etiket = f"{isim}{ek}"
    beklenen.add((klasor, f"{etiket} BYN.pdf"))
    beklenen.add((klasor, f"{etiket} THK.pdf"))

# Klasörleri tara — beklenmeyenleri bul
fazladan = []
for kdv_base in [KDV_TANER, KDV_OMER]:
    if not kdv_base.exists(): continue
    for pdf in kdv_base.rglob("*.pdf"):
        klasor = pdf.parent
        if (klasor, pdf.name) not in beklenen:
            fazladan.append(pdf)

if not fazladan:
    print("\nFazladan dosya yok — her şey temiz!")
    input("Enter...")
    sys.exit(0)

print(f"\nCSV'de karşılığı olmayan {len(fazladan)} dosya:\n")
for p in fazladan:
    print(f"  {p.parent.name} / {p.name}")

print(f"\nBunlar büyük ihtimalle IHB kayıtlarından indirilmiş dosyalar.")
onay = input("\nHepsini silmek için EVET yazın: ").strip().upper()
if onay != "EVET":
    print("İptal.")
    input("Enter...")
    sys.exit(0)

silindi=0
for p in fazladan:
    try:
        p.unlink()
        print(f"  [SİLİNDİ] {p.name}")
        silindi+=1
    except Exception as e:
        print(f"  [HATA] {p.name}: {e}")

print(f"\n{silindi} dosya silindi.")
input("Enter...")
