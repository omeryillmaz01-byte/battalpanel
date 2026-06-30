# -*- coding: utf-8 -*-
import json, requests, websocket, ssl, urllib3, os
urllib3.disable_warnings()
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context

class SSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *a, **kw):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.set_ciphers('ALL:@SECLEVEL=0')
        kw['ssl_context'] = ctx
        super().init_poolmanager(*a, **kw)

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
url = (f"https://ebeyanname.gib.gov.tr/dispatch?cmd=IMAJ&subcmd=TAHAKKUKGORUNTULE"
       f"&TOKEN={token}&beyannameOid=11mmte0f891mxe&tahakkukOid=11mmt6eeba1q93&inline=true")

hedef = (r"C:\Users\omery\iCloudDrive\SMMM ÖMER YILMAZ\1-) MUHASEBE"
         r"\1-) OFİS MUHASEBE\4-) BEYAN VE TAHAKKUKLAR"
         r"\2-) MUHTASAR BYN & THK\2-) ŞUBAT AYI\KOKET GIDA THK.pdf")

os.makedirs(os.path.dirname(hedef), exist_ok=True)
s = requests.Session()
s.mount('https://', SSLAdapter())
s.verify = False
s.headers.update({'Cookie': cookie_header, 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/pdf,*/*'})
r = s.get(url, timeout=60, stream=True)
if 'text/html' in r.headers.get('Content-Type',''):
    print('[!] HTML geldi — önce giriş yapın')
elif r.status_code == 200:
    with open(hedef, 'wb') as f:
        for chunk in r.iter_content(8192): f.write(chunk)
    print(f'[OK] KOKET GIDA THK.pdf indirildi ({os.path.getsize(hedef)//1024} KB)')
else:
    print(f'[!] HTTP {r.status_code}')
