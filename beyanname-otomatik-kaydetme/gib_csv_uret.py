"""
GIB Beyanname Ara formunu CDP üzerinden doldur, Sorgula bas, snippet'i çalıştır.
Ay ay döngü ile her vergi dönemi için ayrı sorgu yapar (Yükleme Tarih max 1 ay).
Sonuçları birleştirip tek CSV yazar.

Kullanım:
  python gib_csv_uret.py --bas-ay 4 --bit-ay 7 --yil 2025 --tur KDV1 \
      --out uretilen_kdv1_2025_0407.csv
"""
import json, time, requests, websocket, argparse, sys, calendar
from pathlib import Path

PORT = 9222

def js_run(ws, expr, msg_id=[1], timeout=10):
    msg_id[0] += 1
    ws.settimeout(timeout)
    ws.send(json.dumps({"id": msg_id[0], "method": "Runtime.evaluate",
                        "params": {"expression": expr, "returnByValue": True,
                                   "awaitPromise": True}}))
    while True:
        try:
            msg = json.loads(ws.recv())
        except Exception:
            return None
        if msg.get("id") == msg_id[0]:
            return msg.get("result", {}).get("result", {}).get("value")

def reconnect():
    tabs = requests.get(f"http://localhost:{PORT}/json").json()
    gib = next((t for t in tabs if "ebeyanname.gib" in t.get("url","")), None)
    return websocket.create_connection(gib["webSocketDebuggerUrl"], timeout=30) if gib else None

def beyanname_ara_sayfasina_git(ws):
    """Form sayfasına git, BEYANNAMELISTESI hazır olana dek bekle.
    Önce sol menüdeki Beyanname Ara linkine tıkla — TOKEN otomatik dahil olur."""
    js_run(ws, """
    (function(){
      // 1. Menüdeki Beyanname Ara linkini bul ve tıkla
      var lnk = Array.from(document.querySelectorAll('a, td')).find(e => e.innerText.trim() === 'Beyanname Ara' && (e.onclick || e.href));
      if (lnk) { lnk.click(); return 'link_click'; }
      // 2. Fonksiyon varsa çağır
      if (typeof window.menuBeyannameAra === 'function') { menuBeyannameAra(); return 'fn'; }
      // 3. Son çare: TOKEN'ı koru, history.back ile dön
      var tk = document.querySelector('input[name=TOKEN]')?.value || new URLSearchParams(location.search).get('TOKEN');
      if (tk) { location.href = '/dispatch?cmd=LOGIN&TOKEN=' + tk; return 'href_token'; }
      history.back(); return 'back';
    })()
    """)
    time.sleep(3)
    for _ in range(25):
        try:
            ws2 = reconnect()
            cmd = js_run(ws2, "document.querySelector('input[name=cmd]')?.value || ''", timeout=4)
            if cmd == "BEYANNAMELISTESI":
                return ws2
        except: pass
        time.sleep(1)
    return ws

def sorgula_ve_topla(ws, snippet, vergi_ay, yil, yuk_bas_ay, yuk_bit_ay, yuk_bas_yil, yuk_bit_yil):
    """Tek ay için form doldur, sorgula, snippet'i çalıştır, CSV içeriği döndür."""
    son_gun_bas = calendar.monthrange(yuk_bas_yil, yuk_bas_ay)[1]
    son_gun_bit = calendar.monthrange(yuk_bit_yil, yuk_bit_ay)[1]
    fill = f"""
    (function() {{
      document.querySelector('select[name=donemBasAy]').value = '{vergi_ay}';
      document.querySelector('select[name=donemBasYil]').value = '{yil}';
      document.querySelector('select[name=donemBitAy]').value = '{vergi_ay}';
      document.querySelector('select[name=donemBitYil]').value = '{yil}';
      var radios = document.querySelectorAll('input[name=durum]');
      radios.forEach((r,i) => r.checked = (i===2));  // Onaylandı
      document.querySelectorAll('input[name^=sorguTipi]').forEach(c => c.checked = false);
      var z = document.getElementById('sorguTipiZ'); if (z) z.checked = true;
      function setDF(prefix, gun, ay, yil) {{
        document.getElementsByName(prefix+'Gun')[0].value = String(gun);
        document.getElementsByName(prefix+'Ay')[0].value = String(ay).padStart(2,'0');
        document.getElementsByName(prefix+'Yil')[0].value = String(yil);
        document.getElementsByName(prefix)[0].value = String(yil) + String(ay).padStart(2,'0') + String(gun).padStart(2,'0');
      }}
      setDF('baslangicTarihi', '01', '{yuk_bas_ay:02d}', '{yuk_bas_yil}');
      setDF('bitisTarihi',     '{son_gun_bit}', '{yuk_bit_ay:02d}', '{yuk_bit_yil}');
      return 'ok';
    }})()
    """
    res = js_run(ws, fill)
    print(f"  [ay {vergi_ay:02d}/{yil}] doldur: {res}, yük={yuk_bas_ay:02d}/{yuk_bas_yil} - {yuk_bit_ay:02d}/{yuk_bit_yil}")

    # Sorgula
    try:
        ws.settimeout(3)
        ws.send(json.dumps({"id": 999, "method": "Runtime.evaluate",
                            "params": {"expression": "taxReturnSearchFormPost(); 'sent'"}}))
    except Exception: pass

    # Yeni sayfa bekle
    n = 0
    for i in range(40):
        time.sleep(1)
        try:
            try: ws.close()
            except: pass
            ws = reconnect()
            n = js_run(ws, "document.querySelectorAll('tr[id^=row]').length", timeout=5) or 0
            # alert var mı?
            no_result = js_run(ws, "document.body.innerText.includes('Kayıt bulunamadı') || document.body.innerText.includes('bulunamamıştır')", timeout=3)
            if no_result:
                print(f"  [ay {vergi_ay:02d}] kayıt bulunamadı"); return ws, ""
        except Exception:
            n = 0
        if n > 0:
            print(f"  [ay {vergi_ay:02d}] {n} satır görüldü")
            break
    else:
        print(f"  [ay {vergi_ay:02d}] sonuç gelmedi"); return ws, None

    # Snippet
    csv_data = js_run(ws, snippet, timeout=180)
    if not csv_data:
        print(f"  [ay {vergi_ay:02d}] snippet boş"); return ws, None
    return ws, csv_data

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bas-ay", type=int, required=True)
    ap.add_argument("--bit-ay", type=int, required=True)
    ap.add_argument("--yil", type=int, default=2025)
    ap.add_argument("--tur", default="KDV1")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    base_dir = Path(__file__).parent
    snippet = (base_dir / "snippet_kdv_v2.js").read_text(encoding="utf-8")

    ws = reconnect()
    if not ws: print("[HATA] GIB sekmesi yok"); sys.exit(1)

    tum_satirlar = []
    basliklar = ""
    for ay in range(args.bas_ay, args.bit_ay + 1):
        time.sleep(2)  # GIB rate limit: aylar arası bekle
        # Modal pencerelerini kapat (birikmesin)
        try:
            js_run(ws, "if (typeof Windows !== 'undefined' && Windows.closeAll) Windows.closeAll();", timeout=3)
        except: pass
        print(f"\n=== Vergi dönemi: {ay:02d}/{args.yil} ===")
        # Yükleme tarihi: aynı ay (1-31) — bu vergi ayında ya da sonrasında yüklenmiş olabilir
        # 1 aydan fazla olamaz → tek ay alıyoruz; çoklu denemede ileride genişletilebilir
        # KDV beyannameleri genelde vergi ayının BİR SONRAKİ ayında yüklenir
        yuk_ay = ay + 1 if ay < 12 else 1
        yuk_yil = args.yil if ay < 12 else args.yil + 1

        # Önce Beyanname Ara sayfasına git (yeni sorgu için form lazım)
        cmd = js_run(ws, "document.querySelector('input[name=cmd]')?.value || ''", timeout=4)
        if cmd != "BEYANNAMELISTESI":
            ws = beyanname_ara_sayfasina_git(ws)

        ws, csv_data = sorgula_ve_topla(ws, snippet, ay, args.yil, yuk_ay, yuk_ay, yuk_yil, yuk_yil)
        if csv_data is None:
            print(f"  [!] ay {ay:02d} için sonuç alınamadı, devam ediliyor"); continue
        if csv_data == "": continue
        satirlar = csv_data.split("\r\n")
        if not basliklar: basliklar = satirlar[0]
        veri = [r for r in satirlar[1:] if r.strip()]
        tum_satirlar.extend(veri)
        print(f"  toplam birleşmiş: {len(tum_satirlar)} satır")

    # Tür filtresi
    cols = [c.strip('"') for c in basliklar.split(';')] if basliklar else []
    bt_idx = cols.index("Beyanname_Turu") if "Beyanname_Turu" in cols else 2
    filtreli = [r for r in tum_satirlar
                if len(r.split(';')) > bt_idx and f'"{args.tur}"' in r.split(';')[bt_idx]]
    # Dedupe by BynOID
    byn_idx = cols.index("BynOID") if "BynOID" in cols else 9
    gor = set(); benzersiz = []
    for r in filtreli:
        parts = r.split(';')
        if len(parts) > byn_idx:
            key = parts[byn_idx]
            if key in gor: continue
            gor.add(key); benzersiz.append(r)

    print(f"\nToplam {len(tum_satirlar)} → {args.tur}: {len(filtreli)} → benzersiz: {len(benzersiz)}")

    out_path = Path(args.out)
    if not out_path.is_absolute(): out_path = base_dir / out_path
    with open(out_path, "w", encoding="utf-8-sig", newline="") as f:
        f.write(basliklar + "\r\n")
        f.write("\r\n".join(benzersiz))
        if benzersiz: f.write("\r\n")
    print(f"[OK] {out_path.name} yazıldı ({len(benzersiz)} satır)")

    try: ws.close()
    except: pass

if __name__ == "__main__":
    main()
