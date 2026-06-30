"""GIB sekmesinin mevcut DOM yapısını incele — hangi sayfada, hangi form var."""
import json, requests, websocket

PORT = 9222
tabs = requests.get(f"http://localhost:{PORT}/json").json()
gib = next((t for t in tabs if "ebeyanname.gib" in t.get("url","")), None)
ws = websocket.create_connection(gib["webSocketDebuggerUrl"], timeout=10)

def js(expr):
    ws.send(json.dumps({"id":1, "method":"Runtime.evaluate",
                        "params":{"expression": expr, "returnByValue": True}}))
    return json.loads(ws.recv()).get("result",{}).get("result",{}).get("value")

print("URL:", js("location.href"))
print("Title:", js("document.title"))
print("Frame sayısı:", js("frames.length"))
print("--- Frames ---")
print(js("Array.from(document.querySelectorAll('frame,iframe')).map(f => f.src || f.name).join('\\n')"))
print("--- Tablodaki satır var mı? ---")
print(js("document.querySelectorAll('tr[id^=row]').length"))
print("--- Form sayısı + isimleri ---")
print(js("Array.from(document.querySelectorAll('form')).map(f => f.name||f.action).join('\\n')"))
print("--- Görünen menü/link metinleri (ilk 30) ---")
print(js("Array.from(document.querySelectorAll('a,td')).map(e=>e.innerText.trim()).filter(t=>t&&t.length<60).slice(0,30).join('\\n')"))

ws.close()
