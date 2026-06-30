"""Beyanname Ara formunun input/select alanlarını listele."""
import json, requests, websocket

PORT = 9222
tabs = requests.get(f"http://localhost:{PORT}/json").json()
gib = next((t for t in tabs if "ebeyanname.gib" in t.get("url","")), None)
ws = websocket.create_connection(gib["webSocketDebuggerUrl"], timeout=10)

def js(expr):
    ws.send(json.dumps({"id":1, "method":"Runtime.evaluate",
                        "params":{"expression": expr, "returnByValue": True}}))
    return json.loads(ws.recv()).get("result",{}).get("result",{}).get("value")

print("--- INPUT alanları ---")
print(js("""Array.from(document.querySelectorAll('input')).map(i =>
  `name=${i.name}  type=${i.type}  value="${i.value}"  id=${i.id}`).join('\\n')"""))

print("\n--- SELECT alanları ---")
print(js("""Array.from(document.querySelectorAll('select')).map(s =>
  `name=${s.name}  id=${s.id}  opt=${Array.from(s.options).slice(0,5).map(o=>o.value+':'+o.text).join('|')}`).join('\\n')"""))

print("\n--- BUTTON alanları ---")
print(js("""Array.from(document.querySelectorAll('input[type=button],input[type=submit],button')).map(b =>
  `value="${b.value||b.innerText}"  onclick=${(b.onclick||'').toString().slice(0,80)}  name=${b.name}`).join('\\n')"""))

ws.close()
