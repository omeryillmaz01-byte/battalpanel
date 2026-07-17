#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""OMERYILMAZ.html: KGK-Sinav ve Soru-Cevap panellerini Fuat Hoca sablonuyla yeniden uret."""
import json, re, io

SC = "/tmp/claude-0/-home-user-battalpanel/80fac67a-e403-5b78-bdd7-3d8e155b8cf5/scratchpad/"
html = open(SC+"OMERYILMAZ.html", encoding="utf-8").read()

# ---- iki seviyeli escape: JS string (") + template-literal (`,${,\) ----
def emb(s):
    s1 = json.dumps(s or "", ensure_ascii=False)[1:-1]            # JS "..." icerigi
    return s1.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

# ---- SRCDOC template-literal degerini cikar/degistir ----
def find_value_span(html, key):
    """key = '"KGK-FuatHoca-Panel.html":`' — deger (backtickler haric) span'ini dondur."""
    marker = '"'+key+'.html":`'
    i = html.index(marker)
    start = i + len(marker)              # deger ilk karakteri
    j = start
    while j < len(html):
        c = html[j]
        if c == "\\":
            j += 2; continue
        if c == "`":
            return start, j              # [start, j) = deger, j = kapatan backtick
        j += 1
    raise RuntimeError("kapatan backtick yok: "+key)

fh_s, fh_e = find_value_span(html, "KGK-FuatHoca-Panel")
TEMPLATE = html[fh_s:fh_e]               # Fuat Hoca panel HTML (escaped haliyle)

# ---- sablon icindeki bir sabiti degistir (deger metni icinde) ----
def replace_const(tpl, decl, closer, newbody):
    i = tpl.index(decl)
    # closer'i decl sonrasindan, satir sonunda bul
    k = tpl.index(closer, i)
    return tpl[:i] + newbody + tpl[k+len(closer):]

def strip_excel(tpl):
    """Excel Yukle butonunu gizle + 'Excel ile genislet' yazisini degistir."""
    tpl = tpl.replace("</head>", '<style id="no-excel">button[onclick*="fileInput"]{display:none!important}</style></head>', 1)
    tpl = tpl.replace("Excel ile genişletebilirsin", "tamamı dijital · Excel yok")
    tpl = tpl.replace("Excel ile genişlet", "tamamı dijital")
    return tpl

# ---- HAZIR_SORULAR bloklari uret ----
def build_sorular(konular_dict):
    parts = ["const HAZIR_SORULAR = {\n"]
    for konu, arr in konular_dict.items():
        parts.append(" "+json_key(konu)+":[\n")
        for it in arr:
            parts.append('  {q:"'+emb(it["q"])+'",a:"'+emb(it.get("a",""))+'"},\n')
        parts.append(" ],\n")
    parts.append("}")
    return "".join(parts)

def json_key(k):
    return '"'+emb(k)+'"'

def build_gecmis(gecmis, yeni):
    parts = ["const HAZIR_GECMIS=[\n"]
    n=0
    for g in gecmis:
        n+=1
        parts.append(' {yil:"'+emb(g.get("yil",""))+'",sinav:"'+emb(g.get("sinav",""))+'",konu:"'+emb(g.get("konu",""))+'",sno:"'+str(n)+'",q:"'+emb(g["q"])+'",a:"'+emb(("Cevap: "+g.get("harf","")+" — " if g.get("harf") and g.get("harf")!="?" else "Cevap: ")+g.get("a",""))+'"},\n')
    parts.append("]")
    return "".join(parts)

def build_konular(konu_list):
    ics = ["📊","🔍","💰","📋","📜","⚖","🏛","⚖","🌍","🧠","📖","🕌","🇬🇧","💡","📝","🔢"]
    tips = ["t1","t2","t3","t4","t5","t6","t7","t8"]
    parts=["const KGK_KONULAR = [\n"]
    for i,k in enumerate(konu_list):
        parts.append('  {ad:"'+emb(k)+'", tip:"'+tips[i%8]+'", ic:"'+ics[i%len(ics)]+'", hoca:"Fuat Hoca"},\n')
    parts.append("]")
    return "".join(parts)

# ============ KGK PANEL ============
kgk = json.load(open(SC+"data_kgk.json", encoding="utf-8"))
# yeni sorulari konularina ekle
kgk_konular = dict(kgk["konular"])
for y in kgk["yeni"]:
    k = y.get("konu") or "YENİ SORULAR"
    kgk_konular.setdefault(k, []).append({"q":y["q"],"a":y.get("a","")})

kgk_tpl = TEMPLATE
kgk_tpl = replace_const(kgk_tpl, "const KGK_KONULAR = [", "];", build_konular(list(kgk_konular.keys()))+";")
kgk_tpl = replace_const(kgk_tpl, "const HAZIR_SORULAR = {", "};", build_sorular(kgk_konular)+";")
kgk_tpl = replace_const(kgk_tpl, "const HAZIR_SORULAR_EK", "};", "const HAZIR_SORULAR_EK = {}"+";")
kgk_tpl = replace_const(kgk_tpl, "const HAZIR_GECMIS=[", "];", build_gecmis(kgk["gecmis"], kgk["yeni"])+";")

# ============ SORU-CEVAP PANEL (genel kultur) ============
sc = json.load(open(SC+"data_sorucevap.json", encoding="utf-8"))
# 2026 duzeltmelerini uygula (q_icerir eslesirse cevabi guncelle)
import os
_duz_say = 0
_duz = []
for _f in ["duzeltmeler_sorucevap.json","zenginlestirme_sorucevap.json"]:
    if os.path.exists(SC+_f):
        _duz += json.load(open(SC+_f, encoding="utf-8"))["duzeltmeler"]
if _duz:
    def _uygula(item):
        global _duz_say
        qu = (item.get("q","")).upper()
        for d in _duz:
            if d["q_icerir"].upper() in qu:
                item["a"] = d["yeni_cevap"]; _duz_say += 1
        return item
    for _k in sc["konular"]:
        sc["konular"][_k] = [_uygula(it) for it in sc["konular"][_k]]
    sc["yeni"] = [_uygula(it) for it in sc["yeni"]]
    print("Uygulanan 2026 düzeltmesi:", _duz_say)
sc_konular = dict(sc["konular"])
for y in sc["yeni"]:
    k = y.get("konu") or "YENİ SORULAR"
    sc_konular.setdefault(k, []).append({"q":y["q"],"a":y.get("a","")})

sc_tpl = TEMPLATE
sc_tpl = replace_const(sc_tpl, "const KGK_KONULAR = [", "];", build_konular(list(sc_konular.keys()))+";")
sc_tpl = replace_const(sc_tpl, "const HAZIR_SORULAR = {", "};", build_sorular(sc_konular)+";")
sc_tpl = replace_const(sc_tpl, "const HAZIR_SORULAR_EK", "};", "const HAZIR_SORULAR_EK = {}"+";")
sc_tpl = replace_const(sc_tpl, "const HAZIR_GECMIS=[", "];", "const HAZIR_GECMIS=[]"+";")
# --- Soru-Cevap markalama (genel kultur) ---
sc_tpl = sc_tpl.replace("KGK SINAV PANELİ · Fuat Hoca Tarzı · Pro", "GENEL SORU-CEVAP · Pro")
sc_tpl = sc_tpl.replace("KGK SINAV", "GENEL SORU-CEVAP")
sc_tpl = sc_tpl.replace("KGK Konuları", "Soru-Cevap Konuları")
sc_tpl = sc_tpl.replace("Fuat Hoca'nın püf noktasını öğren", "anahtar kavramı öğren")
sc_tpl = sc_tpl.replace(">8 Konu<", ">"+str(len(sc_konular))+" Konu<").replace("8 Konu", str(len(sc_konular))+" Konu")
# muhasebeye ozel sekmeleri + gecmis yillar kartini gizle (CSS, JS'e dokunmadan)
HIDE = ('<style id="sc-hide">[data-tab="bilgi"],[data-tab="gecmis"],[data-tab="infografik"],'
        '[data-tab="referans"],[data-tab="simulasyon"]{display:none!important}'
        '.hero-card.blue{display:none!important}.hero-grid{grid-template-columns:1fr!important}</style></head>')
sc_tpl = sc_tpl.replace("</head>", HIDE, 1)

# ---- iki paneli OMERYILMAZ.html'e goc ----
def replace_srcdoc(html, key, newval):
    s,e = find_value_span(html, key)
    return html[:s] + newval + html[e:]

new = html
new = replace_srcdoc(new, "KGK-Sinav-Paneli", strip_excel(kgk_tpl))
new = replace_srcdoc(new, "Soru-Paneli", strip_excel(sc_tpl))
# surum v1000 -> v5000
new = new.replace("v1000", "v5000")
# panel tile adi: Soru - Cevap -> Genel Soru-Cevap
new = new.replace('nm:"Soru – Cevap"', 'nm:"Genel Soru-Cevap"')

open(SC+"OMERYILMAZ_v5000.html","w",encoding="utf-8").write(new)
import os
print("KGK konular:", list(kgk_konular.keys()))
print("KGK soru toplam:", sum(len(v) for v in kgk_konular.values()), "| gecmis:", len(kgk["gecmis"]))
print("SC konular:", list(sc_konular.keys()))
print("SC soru toplam:", sum(len(v) for v in sc_konular.values()))
print("Eski boyut: %.2f MB  Yeni boyut: %.2f MB" % (len(html)/1e6, len(new)/1e6))
