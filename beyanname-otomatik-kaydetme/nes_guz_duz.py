# -*- coding: utf-8 -*-
import json, requests, websocket, ssl, urllib3, os
urllib3.disable_warnings()
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context

class GibSSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *a, **kw):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.set_ciphers('ALL:@SECLEVEL=0')
        kw['ssl_context'] = ctx
        super().init_poolmanager(*a, **kw)

# NES GÜZELLİK - ŞUBAT 2026 DÜZELTMESİ
BYN_OID = "11mmta7dcq1fn8"
THK_OID = "10mmt5wgfg1mc7"

HEDEF_BYN = (r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE"
             r"\1-) OFİS MUHASEBE\4-) BEYAN VE TAHAKKUKLAR"
             r"\2-) MUHTASAR BYN & THK\2-) ŞUBAT AYI\NES GÜZELLİK DÜZ BYN.pdf")

HEDEF_THK = (r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE"
             r"\1-) OFİS MUHASEBE\4-) BEYAN VE TAHAKKUKLAR"
             r"\2-) MUHTASAR BYN & THK\2-) ŞUBAT AYI\NES GÜZELLİK DÜZ THK.pdf")

hedefler = requests.get('http://localhost:9222/json', timeout=5).json()
ws_url = next((t['webSocketDebuggerUrl'] for t in hedefler if t.get('type')=='page' and 'gib.gov.tr' in t.get('url','')), None) \
      or next((t['webSocketDebuggerUrl'] for t in hedefler if t.get('type')=='page'), None)
ws = websocket.create_connection(ws_url, timeout=10)
ws.send(json.dumps({'id':1,'method':'Network.getAllCookies'}))
cookies = json.loads(ws.recv()).get('result',{}).get('cookies',[])
ws.send(json.dumps({'id':2,'method':'Runtime.evaluate','params':{'expression':
    "(function(){var m=window.location.href.match(/[?&]TOKEN=([^&]+)/);return m?decodeURIComponent(m[1]):'';})()"}
}))
token = json.loads(ws.recv()).get('result',{}).get('result',{}).get('value','')
ws.close()

cookie_header = '; '.join(f"{c['name']}={c['value']}" for c in cookies)

s = requests.Session()
s.mount('https://', GibSSLAdapter())
s.verify = False
s.headers.update({'Cookie': cookie_header, 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/pdf,*/*'})

BASE = "https://ebeyanname.gib.gov.tr/dispatch?cmd=IMAJ"

def indir(url, hedef):
    os.makedirs(os.path.dirname(hedef), exist_ok=True)
    r = s.get(url, timeout=60, stream=True)
    if 'text/html' in r.headers.get('Content-Type',''):
        print('[!] HTML geldi — önce giriş yapın')
        return False
    if r.status_code != 200:
        print(f'[!] HTTP {r.status_code}')
        return False
    with open(hedef, 'wb') as f:
        for chunk in r.iter_content(8192): f.write(chunk)
    print(f'[OK] {os.path.basename(hedef)}  ({os.path.getsize(hedef)//1024} KB)')
    return True

print("NES GÜZELLİK - ŞUBAT DÜZ indiriliyor...")
indir(f"{BASE}&subcmd=BEYANNAMEGORUNTULE&TOKEN={token}&beyannameOid={BYN_OID}&inline=true", HEDEF_BYN)
indir(f"{BASE}&subcmd=TAHAKKUKGORUNTULE&TOKEN={token}&beyannameOid={BYN_OID}&tahakkukOid={THK_OID}&inline=true", HEDEF_THK)
