#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Guncel Mevzuat panelini Fuat Hoca sablonuyla kur, OMERYILMAZ_v5000.html'e goc."""
import json, os
SC = os.path.dirname(os.path.abspath(__file__))+"/"
html = open(SC+"OMERYILMAZ_v5000.html", encoding="utf-8").read()

def emb(s):
    s1 = json.dumps(s or "", ensure_ascii=False)[1:-1]
    return s1.replace("\\","\\\\").replace("`","\\`").replace("${","\\${")

def find_value_span(html, key):
    marker = '"'+key+'.html":`'; i = html.index(marker); start = i+len(marker); j = start
    while j < len(html):
        c = html[j]
        if c == "\\": j += 2; continue
        if c == "`": return start, j
        j += 1
    raise RuntimeError("backtick yok "+key)

fh_s, fh_e = find_value_span(html, "KGK-FuatHoca-Panel")
TEMPLATE = html[fh_s:fh_e]

def replace_const(tpl, decl, closer, newbody):
    i = tpl.index(decl); k = tpl.index(closer, i)
    return tpl[:i] + newbody + tpl[k+len(closer):]

mev = json.load(open(SC+"mevzuat_data.json", encoding="utf-8"))
# her makale = bir konu; ad = "tarih · baslik"
konu_list = []
sorular_map = {}
ozet_map = {}
for a in mev["articles"]:
    ad = a["tarih"]+" · "+a["baslik"]
    konu_list.append(ad)
    sorular_map[ad] = a["sorular"]
    ozet_map[ad] = {"kaynak":a["kaynak"],"yazar":a["yazar"]}

# KGK_KONULAR
ics=["📰","⚖","🧾","📊","💡","📋","🏛","📜"]
parts=["const KGK_KONULAR = [\n"]
for i,k in enumerate(konu_list):
    parts.append('  {ad:"'+emb(k)+'", tip:"t'+str((i%8)+1)+'", ic:"'+ics[i%len(ics)]+'", hoca:"Mevzuat"},\n')
parts.append("];")
konular_block="".join(parts)

# HAZIR_SORULAR (anahtar dahil)
parts=["const HAZIR_SORULAR = {\n"]
for k in konu_list:
    parts.append(' "'+emb(k)+'":[\n')
    for s in sorular_map[k]:
        parts.append('  {q:"'+emb(s["q"])+'",a:"'+emb(s["a"])+'",anahtar:"'+emb(s.get("anahtar",""))+'"},\n')
    parts.append(' ],\n')
parts.append("};")
sorular_block="".join(parts)

tpl = TEMPLATE
tpl = replace_const(tpl, "const KGK_KONULAR = [", "];", konular_block)
tpl = replace_const(tpl, "const HAZIR_SORULAR = {", "};", sorular_block)
tpl = replace_const(tpl, "const HAZIR_SORULAR_EK", "};", "const HAZIR_SORULAR_EK = {};")
tpl = replace_const(tpl, "const HAZIR_GECMIS=[", "];", "const HAZIR_GECMIS=[];")
# markalama
tpl = tpl.replace("KGK SINAV PANELİ · Fuat Hoca Tarzı · Pro", "GÜNCEL MEVZUAT · Günlük Takip · Pro")
tpl = tpl.replace("KGK SINAV", "MEVZUAT")
tpl = tpl.replace("KGK Konuları", "Güncel Yazılar")
tpl = tpl.replace("Fuat Hoca'nın püf noktasını öğren", "yazının özünü anahtar kelimelerle öğren")
tpl = tpl.replace("8 Konu", str(len(konu_list))+" Yazı")
HIDE=('<style id="mv-hide">[data-tab="bilgi"],[data-tab="gecmis"],[data-tab="infografik"],'
      '[data-tab="referans"],[data-tab="simulasyon"]{display:none!important}'
      '.hero-card.blue{display:none!important}.hero-grid{grid-template-columns:1fr!important}</style></head>')
tpl = tpl.replace("</head>", HIDE, 1)
tpl = tpl.replace("</head>", '<style id="no-excel">button[onclick*="fileInput"]{display:none!important}</style></head>', 1)
tpl = tpl.replace("Excel ile genişletebilirsin", "tamamı dijital · Excel yok")
tpl = tpl.replace("Excel ile genişlet", "tamamı dijital")

def replace_srcdoc(html, key, newval):
    s,e = find_value_span(html, key); return html[:s]+newval+html[e:]

html = replace_srcdoc(html, "GUNCEL-MEVZUAT-PANEL", tpl)
open(SC+"OMERYILMAZ_v5000.html","w",encoding="utf-8").write(html)
print("Güncel Mevzuat: %d yazı, toplam %d soru" % (len(konu_list), sum(len(v) for v in sorular_map.values())))
print("Yazılar:", konu_list)
print("Dosya boyutu: %.2f MB" % (len(html)/1e6))
