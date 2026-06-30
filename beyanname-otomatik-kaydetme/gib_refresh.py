"""GIB e-Beyanname sekmesini CDP üzerinden yenile, yeni TOKEN'ı yazdır."""
import json, time, requests, websocket

PORT = 9222

tabs = requests.get(f"http://localhost:{PORT}/json").json()
gib = next((t for t in tabs if "ebeyanname.gib" in t.get("url","")), None)
if not gib:
    print("[HATA] ebeyanname.gib.gov.tr sekmesi yok"); raise SystemExit(1)

print("Eski URL:", gib["url"][:120])
ws = websocket.create_connection(gib["webSocketDebuggerUrl"], timeout=10)
ws.send(json.dumps({"id":1, "method":"Page.reload", "params":{"ignoreCache":True}}))
print("  ", ws.recv()[:80])
ws.close()
time.sleep(5)

tabs = requests.get(f"http://localhost:{PORT}/json").json()
gib = next((t for t in tabs if "ebeyanname.gib" in t.get("url","")), None)
print("Yeni URL:", gib["url"][:120])
