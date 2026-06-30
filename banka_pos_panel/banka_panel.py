# -*- coding: utf-8 -*-
"""
BANKA / POS Excel Düzenleyici — Masaüstü Panel
================================================

Akış:
  1) Firma seç (şimdilik ISIK_PETROL)
  2) Banka hesabı seç (102.xx)
  3) Ekstre dosyası yükle (CSV / Excel / PDF)
  4) "Dönüştür" → eşleştirme ön izlemesi
  5) (Opsiyonel) Açılış/Kapanış bakiyesi gir → bakiye kontrol
  6) "Mikro Excel'e Çıkar" → cikti/ klasörüne yazılır, açılır

Çift tıkla çalıştırmak için: BANKA_PANEL.bat
"""
from __future__ import annotations

import os
import sys
import threading
import traceback
from datetime import datetime
from pathlib import Path

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))

from motor.eslestirici import Eslestirici, firma_yukle, bakiye_kontrol
from motor.parser import dosya_parse
from motor.cikti_yazici import mikro_excel_yaz
from motor.firma_kur import firma_kur, FIRMA_DIZIN
from motor.firma_bilgi import tum_bilgiler, ozet_excel_yaz, bilgi_oku
from motor import mersis_parse

MASAUSTU = Path(r"C:\Users\omery\OneDrive\Desktop")

# Renkler — modern koyu tema (slate/teal) v2
RENK_BG       = "#0f172a"   # slate-900 arka plan
RENK_PANEL    = "#1e293b"   # slate-800 panel
RENK_PANEL_2  = "#334155"   # slate-700 kart
RENK_YAZI     = "#f1f5f9"   # slate-100 yazı
RENK_YAZI_2   = "#94a3b8"   # slate-400 ikincil
RENK_YESIL    = "#10b981"   # emerald
RENK_MAVI     = "#0ea5e9"   # sky
RENK_TURUNCU  = "#f59e0b"   # amber
RENK_KIRMIZI  = "#ef4444"   # red
RENK_MOR      = "#a78bfa"   # violet
RENK_INPUT_BG = "#0b1220"   # input arka


def tr_upper(s):
    """Türkçe imla kurallarına uygun BÜYÜK HARF: i→İ, ı→I, ş→Ş, ğ→Ğ, ü→Ü, ö→Ö, ç→Ç."""
    return (s or "").replace("i", "İ").upper()


class BankaPanel(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("BANKA / POS Excel Düzenleyici — Mali Müşavir Paneli · v10.0")
        self.geometry("1180x780")
        self.minsize(1024, 680)
        self.configure(bg=RENK_BG)

        self.firma_kodu = tk.StringVar(value="ISIK_PETROL")
        self.banka_secim = tk.StringVar()
        self.dosya_yolu: Path | None = None
        self.eslesmeler: list = []
        self.ekstre_meta = None
        self.bankalar: list = []
        self.acilis_var = tk.StringVar()
        self.kapanis_var = tk.StringVar()

        self._stil_kur()
        self._arayuz_kur()
        self._firmalari_yukle()

    # ------------------------------------------------------------------ #
    def _stil_kur(self):
        s = ttk.Style(self)
        s.theme_use("clam")
        s.configure("TCombobox",
                    fieldbackground=RENK_INPUT_BG, background=RENK_PANEL,
                    foreground=RENK_YAZI, arrowcolor=RENK_YAZI, bordercolor=RENK_PANEL_2)
        s.map("TCombobox", fieldbackground=[("readonly", RENK_INPUT_BG)],
              foreground=[("readonly", RENK_YAZI)])
        s.configure("Treeview",
                    background=RENK_INPUT_BG, foreground=RENK_YAZI,
                    fieldbackground=RENK_INPUT_BG, bordercolor=RENK_PANEL_2,
                    rowheight=24)
        s.configure("Treeview.Heading",
                    background=RENK_PANEL_2, foreground=RENK_YAZI, relief="flat",
                    font=("Segoe UI", 9, "bold"))
        s.map("Treeview", background=[("selected", RENK_MAVI)])

    # ------------------------------------------------------------------ #
    def _arayuz_kur(self):
        # === ÜST BAŞLIK ===
        ust = tk.Frame(self, bg=RENK_PANEL, height=72)
        ust.pack(fill="x", padx=0, pady=0)
        ust.pack_propagate(False)
        tk.Label(ust, text="🏦  BANKA / POS  →  MİKRO EXCEL", bg=RENK_PANEL, fg=RENK_YAZI,
                 font=("Segoe UI", 18, "bold")).pack(side="left", padx=24)
        tk.Label(ust, text="Mali müşavir kontrollü dönüştürücü", bg=RENK_PANEL, fg=RENK_YAZI_2,
                 font=("Segoe UI", 10, "italic")).pack(side="left", padx=8)
        # Her zaman görünür künye butonu (sağ üst)
        tk.Button(ust, text="📇  FİRMA KÜNYE / MERSİS", command=self._kunye_penceresi,
                  bg=RENK_TURUNCU, fg="white", activebackground="#d97706", activeforeground="white",
                  font=("Segoe UI", 11, "bold"), relief="flat", padx=16, pady=8, cursor="hand2"
                  ).pack(side="right", padx=24)

        # === SOL: AYARLAR ===
        govde = tk.Frame(self, bg=RENK_BG)
        govde.pack(fill="both", expand=True, padx=12, pady=12)

        sol = tk.Frame(govde, bg=RENK_PANEL, width=420)
        sol.pack(side="left", fill="y", padx=(0, 12))
        sol.pack_propagate(False)

        # Firma
        self._etiket(sol, "1. FİRMA").pack(anchor="w", padx=16, pady=(18, 4))
        self.firma_combo = ttk.Combobox(sol, textvariable=self.firma_kodu, state="readonly", width=48)
        self.firma_combo.pack(padx=16, fill="x")
        self.firma_combo.bind("<<ComboboxSelected>>", lambda e: self._bankalari_yukle())

        # Banka
        self._etiket(sol, "2. BANKA HESABI").pack(anchor="w", padx=16, pady=(16, 4))
        self.banka_combo = ttk.Combobox(sol, textvariable=self.banka_secim, state="readonly", width=48)
        self.banka_combo.pack(padx=16, fill="x")

        # Dosya
        self._etiket(sol, "3. EKSTRE DOSYASI").pack(anchor="w", padx=16, pady=(16, 4))
        self.dosya_etiket = tk.Label(sol, text="(seçilmedi)", bg=RENK_INPUT_BG, fg=RENK_YAZI_2,
                                     anchor="w", padx=10, pady=8, wraplength=380, justify="left",
                                     font=("Segoe UI", 9))
        self.dosya_etiket.pack(fill="x", padx=16)
        tk.Button(sol, text="📁  Dosya Seç (CSV / Excel / PDF)",
                  command=self._dosya_sec,
                  bg=RENK_PANEL_2, fg=RENK_YAZI, activebackground=RENK_MAVI, activeforeground="white",
                  font=("Segoe UI", 10), relief="flat", padx=12, pady=8, cursor="hand2"
                  ).pack(fill="x", padx=16, pady=(6, 0))

        # Bakiye
        self._etiket(sol, "4. BAKİYE KONTROLÜ (opsiyonel)").pack(anchor="w", padx=16, pady=(16, 4))
        bak_frame = tk.Frame(sol, bg=RENK_PANEL)
        bak_frame.pack(fill="x", padx=16)
        tk.Label(bak_frame, text="Açılış:", bg=RENK_PANEL, fg=RENK_YAZI_2,
                 font=("Segoe UI", 9)).grid(row=0, column=0, sticky="w")
        tk.Entry(bak_frame, textvariable=self.acilis_var,
                 bg=RENK_INPUT_BG, fg=RENK_YAZI, insertbackground=RENK_YAZI,
                 relief="flat", width=18, font=("Segoe UI", 10)
                 ).grid(row=0, column=1, padx=(8, 0), pady=4, sticky="ew")
        tk.Label(bak_frame, text="Kapanış:", bg=RENK_PANEL, fg=RENK_YAZI_2,
                 font=("Segoe UI", 9)).grid(row=1, column=0, sticky="w")
        tk.Entry(bak_frame, textvariable=self.kapanis_var,
                 bg=RENK_INPUT_BG, fg=RENK_YAZI, insertbackground=RENK_YAZI,
                 relief="flat", width=18, font=("Segoe UI", 10)
                 ).grid(row=1, column=1, padx=(8, 0), pady=4, sticky="ew")
        bak_frame.columnconfigure(1, weight=1)

        # Aksiyonlar
        tk.Frame(sol, bg=RENK_PANEL, height=8).pack(fill="x", padx=16, pady=(20, 0))
        tk.Button(sol, text="🔄  DÖNÜŞTÜR (Önizleme)",
                  command=self._donustur,
                  bg=RENK_MAVI, fg="white", activebackground="#2563eb",
                  font=("Segoe UI", 11, "bold"), relief="flat", padx=12, pady=10, cursor="hand2"
                  ).pack(fill="x", padx=16, pady=(0, 6))
        tk.Button(sol, text="💾  MİKRO EXCEL'E ÇIKAR",
                  command=self._mikro_yaz,
                  bg=RENK_YESIL, fg="white", activebackground="#1f8d3a",
                  font=("Segoe UI", 11, "bold"), relief="flat", padx=12, pady=10, cursor="hand2"
                  ).pack(fill="x", padx=16, pady=(0, 6))
        tk.Button(sol, text="📦  TOPLU YÜKLE & ÇIKAR (Excel/PDF/JPG)",
                  command=self._toplu_yukle,
                  bg=RENK_TURUNCU, fg="white", activebackground="#d97706", activeforeground="white",
                  font=("Segoe UI", 10, "bold"), relief="flat", padx=12, pady=10, cursor="hand2"
                  ).pack(fill="x", padx=16, pady=(0, 6))

        tk.Frame(sol, bg=RENK_PANEL_2, height=1).pack(fill="x", padx=16, pady=(16, 12))
        tk.Button(sol, text="📧  OUTLOOK'TAN BANKALARI ÇEK",
                  command=self._outlook_penceresi,
                  bg="#0891b2", fg="white", activebackground="#0e7490", activeforeground="white",
                  font=("Segoe UI", 10, "bold"), relief="flat", pady=9, cursor="hand2"
                  ).pack(fill="x", padx=16, pady=(0, 8))
        tk.Button(sol, text="🗂️  KARIŞIK DOSYALARI DAĞIT (tüm firmalar)",
                  command=self._dagit,
                  bg=RENK_MOR, fg="white", activebackground="#8b5cf6", activeforeground="white",
                  font=("Segoe UI", 10, "bold"), relief="flat", pady=9, cursor="hand2"
                  ).pack(fill="x", padx=16, pady=(0, 8))
        tk.Button(sol, text="📋  Referans Excel'leri Aç",
                  command=self._referans_klasoru_ac,
                  bg=RENK_PANEL_2, fg=RENK_YAZI, activebackground=RENK_MOR, activeforeground="white",
                  font=("Segoe UI", 9), relief="flat", pady=6, cursor="hand2"
                  ).pack(fill="x", padx=16)
        tk.Button(sol, text="📒  Hesap Planı (göster · ara)",
                  command=self._hesap_plani_penceresi,
                  bg=RENK_PANEL_2, fg=RENK_YAZI, activebackground=RENK_MOR, activeforeground="white",
                  font=("Segoe UI", 9), relief="flat", pady=6, cursor="hand2"
                  ).pack(fill="x", padx=16, pady=(6, 0))
        tk.Button(sol, text="➕  Yeni Firma Kur (hesap planından)",
                  command=self._yeni_firma_kur,
                  bg=RENK_PANEL_2, fg=RENK_YAZI, activebackground=RENK_MOR, activeforeground="white",
                  font=("Segoe UI", 9), relief="flat", pady=6, cursor="hand2"
                  ).pack(fill="x", padx=16, pady=(6, 0))

        tk.Frame(sol, bg=RENK_PANEL_2, height=1).pack(fill="x", padx=16, pady=(16, 12))
        tk.Button(sol, text="📇  FİRMA KÜNYE / MERSİS",
                  command=self._kunye_penceresi,
                  bg=RENK_TURUNCU, fg="white", activebackground="#d97706", activeforeground="white",
                  font=("Segoe UI", 11, "bold"), relief="flat", pady=10, cursor="hand2"
                  ).pack(fill="x", padx=16, pady=(0, 6))

        # === SAĞ: ÖNİZLEME + LOG ===
        sag = tk.Frame(govde, bg=RENK_BG)
        sag.pack(side="left", fill="both", expand=True)

        # Özet barı
        self.ozet_frame = tk.Frame(sag, bg=RENK_PANEL, height=64)
        self.ozet_frame.pack(fill="x", pady=(0, 8))
        self.ozet_frame.pack_propagate(False)
        self._ozet_kartlari()

        # Tablo
        tablo_frame = tk.Frame(sag, bg=RENK_PANEL)
        tablo_frame.pack(fill="both", expand=True)

        kolonlar = ("tarih", "aciklama", "tutar", "kod", "hesap_adi", "kaynak", "guven", "not")
        baslik_metni = {
            "tarih": "Tarih", "aciklama": "Açıklama", "tutar": "Tutar",
            "kod": "Hesap Kodu", "hesap_adi": "Hesap Adı",
            "kaynak": "Kaynak", "guven": "Güven", "not": "Not",
        }
        genislik = {"tarih": 80, "aciklama": 350, "tutar": 100, "kod": 110,
                    "hesap_adi": 200, "kaynak": 65, "guven": 50, "not": 200}
        self.tablo = ttk.Treeview(tablo_frame, columns=kolonlar, show="headings", height=18)
        for k in kolonlar:
            self.tablo.heading(k, text=baslik_metni[k])
            self.tablo.column(k, width=genislik[k], anchor="w" if k in ("aciklama", "hesap_adi", "not") else "center")
        self.tablo.tag_configure("manuel", background="#5c2a2a", foreground="#fcd5ce")
        self.tablo.tag_configure("dusuk", background="#5c4a1d", foreground="#fff3bf")
        self.tablo.tag_configure("ok", background="#1f3a23", foreground="#b7efc5")

        vs = ttk.Scrollbar(tablo_frame, orient="vertical", command=self.tablo.yview)
        self.tablo.configure(yscrollcommand=vs.set)
        self.tablo.pack(side="left", fill="both", expand=True, padx=(8, 0), pady=8)
        vs.pack(side="right", fill="y", pady=8)

        # Log
        log_frame = tk.Frame(sag, bg=RENK_PANEL, height=130)
        log_frame.pack(fill="x", pady=(8, 0))
        log_frame.pack_propagate(False)
        tk.Label(log_frame, text="📜  LOG", bg=RENK_PANEL, fg=RENK_YAZI_2,
                 font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=10, pady=(6, 0))
        self.log = tk.Text(log_frame, bg=RENK_INPUT_BG, fg=RENK_YAZI, relief="flat",
                           height=6, font=("Consolas", 9), wrap="word")
        self.log.pack(fill="both", expand=True, padx=10, pady=(2, 8))
        self.log.tag_configure("ok", foreground=RENK_YESIL)
        self.log.tag_configure("warn", foreground=RENK_TURUNCU)
        self.log.tag_configure("err", foreground=RENK_KIRMIZI)
        self._log("Panel hazır. Firma & banka & dosya seç, ardından DÖNÜŞTÜR.")

    # ------------------------------------------------------------------ #
    def _etiket(self, parent, metin):
        return tk.Label(parent, text=metin, bg=RENK_PANEL, fg=RENK_MAVI,
                        font=("Segoe UI", 9, "bold"))

    def _ozet_kartlari(self):
        for w in self.ozet_frame.winfo_children():
            w.destroy()
        veriler = [
            ("📊 Toplam", "0", RENK_MAVI),
            ("✅ Otomatik", "0", RENK_YESIL),
            ("⚠️ Düşük güven", "0", RENK_TURUNCU),
            ("❌ Manuel", "0", RENK_KIRMIZI),
            ("💰 Net Tutar", "0,00", RENK_MOR),
        ]
        self.ozet_etiketler = {}
        for i, (etk, deg, renk) in enumerate(veriler):
            f = tk.Frame(self.ozet_frame, bg=RENK_PANEL_2)
            f.grid(row=0, column=i, padx=6, pady=8, sticky="nsew")
            self.ozet_frame.columnconfigure(i, weight=1)
            tk.Label(f, text=etk, bg=RENK_PANEL_2, fg=RENK_YAZI_2,
                     font=("Segoe UI", 9)).pack(anchor="w", padx=10, pady=(6, 0))
            lbl = tk.Label(f, text=deg, bg=RENK_PANEL_2, fg=renk,
                           font=("Segoe UI", 14, "bold"))
            lbl.pack(anchor="w", padx=10, pady=(0, 6))
            self.ozet_etiketler[etk] = lbl

    def _ozet_guncelle(self):
        toplam = len(self.eslesmeler)
        otomatik = sum(1 for e in self.eslesmeler if e.kaynak != "MANUEL" and e.guven >= 80)
        dusuk = sum(1 for e in self.eslesmeler if 0 < e.guven < 80)
        manuel = sum(1 for e in self.eslesmeler if e.kaynak == "MANUEL" or e.guven == 0)
        net = sum(e.hareket.tutar for e in self.eslesmeler)
        self.ozet_etiketler["📊 Toplam"].config(text=str(toplam))
        self.ozet_etiketler["✅ Otomatik"].config(text=str(otomatik))
        self.ozet_etiketler["⚠️ Düşük güven"].config(text=str(dusuk))
        self.ozet_etiketler["❌ Manuel"].config(text=str(manuel))
        self.ozet_etiketler["💰 Net Tutar"].config(text=f"{net:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."))

    # ------------------------------------------------------------------ #
    def _firmalari_yukle(self):
        if not FIRMA_DIZIN.exists():
            FIRMA_DIZIN.mkdir(parents=True, exist_ok=True)
        firmalar = sorted([p.name for p in FIRMA_DIZIN.iterdir() if p.is_dir()])
        self.firma_combo["values"] = firmalar
        if firmalar and self.firma_kodu.get() not in firmalar:
            self.firma_kodu.set(firmalar[0])
        if firmalar:
            self._bankalari_yukle()

    def _bankalari_yukle(self):
        try:
            t = firma_yukle(self.firma_kodu.get())
            self.bankalar = t.bankalar
            etiketler = [f"{b.hesap_kodu}  —  {b.hesap_adi}" + (f"  [{b.hesap_no}]" if b.hesap_no else "")
                         for b in self.bankalar]
            self.banka_combo["values"] = etiketler
            if etiketler:
                self.banka_combo.current(0)
            self._log(f"Firma yüklendi: {self.firma_kodu.get()}  |  {len(self.bankalar)} banka hesabı")
        except Exception as e:
            self._log(f"Firma yüklenemedi: {e}", "err")

    # ------------------------------------------------------------------ #
    def _dosya_sec(self):
        yol = filedialog.askopenfilename(
            title="Banka ekstresi seç",
            filetypes=[("Tüm desteklenenler", "*.csv;*.xlsx;*.xls;*.xlsm;*.pdf;*.jpg;*.jpeg;*.png"),
                       ("CSV", "*.csv"), ("Excel", "*.xlsx;*.xls;*.xlsm"),
                       ("PDF", "*.pdf"), ("Tümü", "*.*")],
        )
        if not yol:
            return
        self.dosya_yolu = Path(yol)
        self.dosya_etiket.config(text=self.dosya_yolu.name, fg=RENK_YAZI)
        self._log(f"Dosya seçildi: {self.dosya_yolu.name}")

    # ------------------------------------------------------------------ #
    def _dagit(self):
        """Karışık klasördeki tüm firmaların ekstrelerini dağıt → masaüstü ay klasörü."""
        klasor = filedialog.askdirectory(title="Karışık banka ekstreleri klasörünü seç")
        if not klasor:
            return
        import tkinter.simpledialog
        ay = tkinter.simpledialog.askstring("Ay klasörü",
                                            "Masaüstünde açılacak klasör adı:",
                                            initialvalue="Mayıs Ayı Banka Hareketleri", parent=self)
        if not ay:
            return
        self._log(f"Dağıtım başlıyor: {klasor}", "ok")
        threading.Thread(target=self._dagit_isle, args=(klasor, ay), daemon=True).start()

    def _dagit_isle(self, klasor, ay):
        import io, contextlib
        try:
            from dagit_ve_isle import dagit
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                dagit(Path(klasor), ay)
            for satir in buf.getvalue().splitlines():
                etk = "ok" if "✓" in satir or "TOPLAM" in satir else ("warn" if ("⚠" in satir or "✗" in satir or "◆" in satir) else "")
                self._log(satir, etk)
            self._log(f"BİTTİ → Masaüstü/{ay}", "ok")
            try:
                os.startfile(str(MASAUSTU_AY := Path.home() / "OneDrive" / "Desktop" / ay))
            except Exception:
                pass
        except Exception as e:
            self._log(f"HATA: {e}", "err")
            self._log(traceback.format_exc(), "err")

    def _secili_banka_kodu(self) -> str:
        sec = self.banka_combo.current()
        if sec < 0 or sec >= len(self.bankalar):
            return ""
        return self.bankalar[sec].hesap_kodu

    def _donustur(self):
        if not self.dosya_yolu:
            messagebox.showwarning("Dosya yok", "Önce bir ekstre dosyası seç.")
            return
        if not self._secili_banka_kodu():
            messagebox.showwarning("Banka yok", "Önce bir banka hesabı seç.")
            return

        self._log("Dönüştürme başlıyor…")
        threading.Thread(target=self._donustur_isle, daemon=True).start()

    def _donustur_isle(self):
        try:
            sonuc = dosya_parse(self.dosya_yolu)
            self.ekstre_meta = sonuc
            if not sonuc.hareketler:
                self._log(f"Hareket bulunamadı. {sonuc.not_}", "err")
                return
            self._log(f"Parser: {len(sonuc.hareketler)} hareket okundu.", "ok")

            # Banka parser açılış/kapanış verdiyse formu otomatik doldur
            if sonuc.acilis is not None and not self.acilis_var.get():
                self.acilis_var.set(f"{sonuc.acilis:.2f}".replace(".", ","))
                self._log(f"Açılış bakiyesi dosyadan alındı: {sonuc.acilis:,.2f}", "ok")
            if sonuc.kapanis is not None and not self.kapanis_var.get():
                self.kapanis_var.set(f"{sonuc.kapanis:.2f}".replace(".", ","))
                self._log(f"Kapanış bakiyesi dosyadan alındı: {sonuc.kapanis:,.2f}", "ok")

            # Eğer parser banka hesap no'su tespit ettiyse uygun bankayı otomatik seç
            if sonuc.hesap_no:
                hedef = sonuc.hesap_no.split("-")[-1].lstrip("0")
                for i, b in enumerate(self.bankalar):
                    if b.hesap_no and b.hesap_no.split("-")[-1].lstrip("0") == hedef:
                        self.banka_combo.current(i)
                        self._log(f"Banka otomatik seçildi: {b.hesap_kodu} {b.hesap_adi}", "ok")
                        break

            es = Eslestirici(self.firma_kodu.get(), self._secili_banka_kodu())
            self.eslesmeler = es.toplu(sonuc.hareketler)

            self.after(0, self._tablo_doldur)
            self.after(0, self._ozet_guncelle)
            self._log(f"Eşleştirme tamam: {len(self.eslesmeler)} satır.", "ok")
        except Exception as e:
            self._log(f"HATA: {e}", "err")
            self._log(traceback.format_exc(), "err")

    def _tablo_doldur(self):
        self.tablo.delete(*self.tablo.get_children())
        for e in self.eslesmeler:
            etiket = "ok"
            if e.kaynak == "MANUEL" or e.guven == 0:
                etiket = "manuel"
            elif e.guven < 80:
                etiket = "dusuk"
            tutar_str = f"{e.hareket.tutar:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            self.tablo.insert(
                "", "end",
                values=(e.hareket.tarih, e.hareket.aciklama, tutar_str,
                        e.hesap_kodu, tr_upper(e.hesap_adi), e.kaynak, e.guven, e.not_),
                tags=(etiket,),
            )

    # ------------------------------------------------------------------ #
    def _mikro_yaz(self):
        if not self.eslesmeler:
            messagebox.showwarning("Önce dönüştür", "Önce DÖNÜŞTÜR butonuna basıp önizleme oluştur.")
            return

        banka_idx = self.banka_combo.current()
        banka_obj = self.bankalar[banka_idx]
        ay_etiketi = datetime.now().strftime("%Y%m")
        dosya_adi = f"{self.firma_kodu.get()}_{banka_obj.banka.replace(' ', '_')}_{ay_etiketi}_MIKRO.xlsx"
        cikti_yol = BASE / "cikti" / dosya_adi

        acilis = self._sayi(self.acilis_var.get())
        kapanis = self._sayi(self.kapanis_var.get())

        try:
            yazilan = mikro_excel_yaz(
                self.eslesmeler, cikti_yol,
                firma=self.firma_kodu.get(),
                banka=banka_obj.banka,
                hesap_kodu=banka_obj.hesap_kodu,
                acilis=acilis, kapanis=kapanis,
                cariler=firma_yukle(self.firma_kodu.get()).cariler,
            )
            self._log(f"Excel yazıldı: {yazilan}", "ok")
            if acilis is not None and kapanis is not None:
                bk = bakiye_kontrol([e.hareket for e in self.eslesmeler], acilis, kapanis)
                if bk["tamam"]:
                    self._log(f"✓ Bakiye TAMAM (fark: {bk['fark']:.2f})", "ok")
                else:
                    self._log(f"✗ Bakiye TUTMUYOR! Fark: {bk['fark']:.2f}", "err")
            # Dosyayı aç
            try:
                os.startfile(str(yazilan))
            except Exception:
                pass
        except Exception as e:
            self._log(f"HATA: {e}", "err")
            self._log(traceback.format_exc(), "err")

    @staticmethod
    def _sayi(s: str):
        if not s or not s.strip():
            return None
        s = s.strip().replace(" ", "").replace(".", "").replace(",", ".")
        try:
            return float(s)
        except ValueError:
            return None

    # ------------------------------------------------------------------ #
    def _toplu_yukle(self):
        if not self.firma_kodu.get():
            messagebox.showwarning("Firma yok", "Önce bir firma seç.")
            return
        yollar = filedialog.askopenfilenames(
            title="Toplu yüklenecek dosyaları seç (Excel / PDF / JPG)",
            filetypes=[("Tüm desteklenenler", "*.csv;*.xlsx;*.xls;*.xlsm;*.pdf;*.jpg;*.jpeg;*.png"),
                       ("Excel", "*.xlsx;*.xls;*.xlsm"), ("PDF", "*.pdf"),
                       ("Görüntü (JPG/PNG)", "*.jpg;*.jpeg;*.png"), ("Tümü", "*.*")],
        )
        if not yollar:
            return
        out = filedialog.askdirectory(title="Excellerin çıkacağı klasörü seç (iptal = masaüstüne yeni klasör)")
        if not out:
            out = str(Path.home() / "OneDrive" / "Desktop" / ("TOPLU_BANKA_" + datetime.now().strftime("%Y%m%d_%H%M")))
        Path(out).mkdir(parents=True, exist_ok=True)
        self._log(f"Toplu işlem başlıyor: {len(yollar)} dosya  →  {out}", "ok")
        threading.Thread(target=self._toplu_isle, args=(list(yollar), out), daemon=True).start()

    def _toplu_isle(self, yollar, out):
        firma = self.firma_kodu.get()
        try:
            cariler = firma_yukle(firma).cariler
        except Exception:
            cariler = None
        basarili = atlanan = toplam_hareket = toplam_dusuk = 0
        for y in yollar:
            y = Path(y)
            try:
                sonuc = dosya_parse(y)
                if not sonuc.hareketler:
                    self._log(f"  ⚠ {y.name}: hareket bulunamadı ({sonuc.not_})", "warn"); atlanan += 1; continue
                banka_obj = None
                if sonuc.hesap_no:
                    hedef = sonuc.hesap_no.split("-")[-1].lstrip("0")
                    for b in self.bankalar:
                        if b.hesap_no and b.hesap_no.split("-")[-1].lstrip("0") == hedef:
                            banka_obj = b; break
                if banka_obj is None:
                    idx = self.banka_combo.current()
                    if idx >= 0:
                        banka_obj = self.bankalar[idx]
                if banka_obj is None:
                    self._log(f"  ⚠ {y.name}: banka tespit edilemedi, atlandı", "warn"); atlanan += 1; continue
                es = Eslestirici(firma, banka_obj.hesap_kodu).toplu(sonuc.hareketler)
                dusuk = sum(1 for e in es if (e.guven or 0) < 80 or e.kaynak == "MANUEL")
                ay = datetime.now().strftime("%Y%m")
                adi = f"{firma}_{banka_obj.banka.replace(' ', '_')}_{ay}_{y.stem}_MIKRO.xlsx"
                mikro_excel_yaz(es, Path(out) / adi, firma=firma, banka=banka_obj.banka,
                                hesap_kodu=banka_obj.hesap_kodu,
                                acilis=sonuc.acilis, kapanis=sonuc.kapanis, cariler=cariler)
                toplam_hareket += len(es); toplam_dusuk += dusuk; basarili += 1
                self._log(f"  ✓ {y.name} → {banka_obj.hesap_kodu} | {len(es)} hareket, {dusuk} kontrol gerek", "ok")
            except Exception as e:
                self._log(f"  ✗ {y.name}: {e}", "err"); atlanan += 1
        self._log(f"TOPLU BİTTİ → {basarili} dosya çıkarıldı, {atlanan} atlandı | {toplam_hareket} hareket, {toplam_dusuk} düşük güven (gözden geçir).", "ok")
        self._log(f"Klasör: {out}", "ok")
        try: os.startfile(out)
        except Exception: pass

    # ------------------------------------------------------------------ #
    def _referans_klasoru_ac(self):
        klasor = FIRMA_DIZIN / self.firma_kodu.get()
        if not klasor.exists():
            messagebox.showwarning("Klasör yok", f"{klasor}")
            return
        try:
            os.startfile(str(klasor))
        except Exception as e:
            messagebox.showerror("Açılamadı", str(e))

    def _hesap_plani_penceresi(self):
        """Seçili firmanın TAM hesap planını (06) aranabilir pencerede gösterir.
        Çift tık → kodu panoya kopyalar. Sadece banka kodları değil, tüm hesaplar."""
        fk = self.firma_kodu.get()
        hp = FIRMA_DIZIN / fk / "06_hesap_plani.xlsx"
        if not hp.exists():
            messagebox.showwarning(
                "Hesap planı yok",
                f"{fk} firmasının 06_hesap_plani.xlsx dosyası yok.\n\n"
                "HESAP PLANLARI klasöründen hesap_plani_kurtar.py ile oluşturulur.")
            return
        import openpyxl
        rows = []
        try:
            wb = openpyxl.load_workbook(hp, read_only=True, data_only=True)
            ws = wb.active
            for r in ws.iter_rows(values_only=True):
                if not r or not r[0]:
                    continue
                kod = str(r[0]).strip()
                if not kod or kod.upper() == "HESAP KODU":
                    continue
                ad = str(r[1]).strip() if len(r) > 1 and r[1] else ""
                bak = r[2] if len(r) > 2 and r[2] is not None else ""
                rows.append((kod, ad, bak))
            wb.close()
        except Exception as e:
            messagebox.showerror("Okunamadı", str(e))
            return

        win = tk.Toplevel(self)
        win.title(f"📒 Hesap Planı — {fk}  ({len(rows)} hesap)")
        win.configure(bg=RENK_BG)
        win.geometry("700x620")

        ust = tk.Frame(win, bg=RENK_PANEL)
        ust.pack(fill="x")
        tk.Label(ust, text="🔍 Ara (kod / ad):", bg=RENK_PANEL, fg=RENK_YAZI,
                 font=("Segoe UI", 10)).pack(side="left", padx=(10, 6), pady=8)
        arama = tk.Entry(ust, bg=RENK_INPUT_BG, fg=RENK_YAZI, insertbackground=RENK_YAZI,
                         relief="flat", font=("Segoe UI", 11))
        arama.pack(side="left", fill="x", expand=True, padx=(0, 10), pady=8, ipady=3)
        sayac = tk.Label(ust, text=f"{len(rows)} hesap", bg=RENK_PANEL, fg=RENK_YAZI_2,
                         font=("Segoe UI", 9))
        sayac.pack(side="right", padx=10)

        tf = tk.Frame(win, bg=RENK_BG)
        tf.pack(fill="both", expand=True, padx=8, pady=(0, 4))
        tv = ttk.Treeview(tf, columns=("kod", "ad", "bakiye"), show="headings")
        tv.heading("kod", text="Hesap Kodu"); tv.heading("ad", text="Hesap Adı"); tv.heading("bakiye", text="Bakiye")
        tv.column("kod", width=130, anchor="w"); tv.column("ad", width=400, anchor="w"); tv.column("bakiye", width=120, anchor="e")
        vs = ttk.Scrollbar(tf, orient="vertical", command=tv.yview)
        tv.configure(yscrollcommand=vs.set)
        tv.pack(side="left", fill="both", expand=True)
        vs.pack(side="right", fill="y")

        def doldur(filtre=""):
            tv.delete(*tv.get_children())
            f = filtre.lower().strip()
            n = 0
            for kod, ad, bak in rows:
                if not f or f in kod.lower() or f in ad.lower():
                    if isinstance(bak, (int, float)):
                        bs = f"{bak:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                    else:
                        bs = bak or ""
                    tv.insert("", "end", values=(kod, tr_upper(ad), bs))
                    n += 1
            sayac.config(text=f"{n} / {len(rows)} hesap")

        doldur()
        arama.bind("<KeyRelease>", lambda e: doldur(arama.get()))

        def kopyala(e):
            sel = tv.selection()
            if sel:
                kod = tv.item(sel[0])["values"][0]
                self.clipboard_clear()
                self.clipboard_append(str(kod))
                sayac.config(text=f"📋 kopyalandı: {kod}")
        tv.bind("<Double-1>", kopyala)

        tk.Label(win, text="💡 Çift tık → hesap kodunu panoya kopyalar",
                 bg=RENK_BG, fg=RENK_YAZI_2, font=("Segoe UI", 8)).pack(pady=(0, 6))
        arama.focus_set()

    def _yeni_firma_kur(self):
        firma_kodu = tk.simpledialog.askstring(
            "Yeni Firma", "Firma kodu (klasör adı, örn. ISIK_PETROL):", parent=self)
        if not firma_kodu:
            return
        hp = filedialog.askopenfilename(
            title="Hesap Planı Excel'i seç",
            filetypes=[("Excel", "*.xlsx;*.xls;*.xlsm")],
        )
        if not hp:
            return
        try:
            s = firma_kur(firma_kodu.strip(), Path(hp))
            self._log(f"Firma kuruldu: {firma_kodu}  |  Banka:{s['banka']} POS:{s['pos']} Cari:{s['cari']} Kural:{s['kural']}", "ok")
            self._firmalari_yukle()
            self.firma_kodu.set(firma_kodu.strip())
            self._bankalari_yukle()
        except Exception as e:
            self._log(f"HATA: {e}", "err")
            self._log(traceback.format_exc(), "err")

    # ------------------------------------------------------------------ #
    #  FİRMA KÜNYE / MERSİS penceresi
    # ------------------------------------------------------------------ #
    def _kunye_penceresi(self):
        win = tk.Toplevel(self)
        win.title("📇 Firma Künye — MERSİS Bilgileri")
        win.geometry("1500x900")
        win.minsize(1200, 750)
        win.configure(bg=RENK_BG)

        ust = tk.Frame(win, bg=RENK_PANEL)
        ust.pack(fill="x")
        tk.Label(ust, text="📇  FİRMA KÜNYE / MERSİS BİLGİLERİ", bg=RENK_PANEL, fg=RENK_YAZI,
                 font=("Segoe UI", 14, "bold")).pack(side="left", padx=16, pady=10)
        self._kunye_durum = tk.Label(ust, text="", bg=RENK_PANEL, fg=RENK_YAZI_2,
                                     font=("Segoe UI", 10))
        self._kunye_durum.pack(side="right", padx=16)

        yap = tk.Frame(win, bg=RENK_PANEL)
        yap.pack(fill="x", padx=12, pady=(10, 6))
        tk.Label(yap, text="MERSİS'te firmayı ara (captcha'yı sen çöz) → açılan sayfayı seç & kopyala (Ctrl+A, Ctrl+C) "
                           "→ buraya yapıştır (Ctrl+V) → 'Oku & Kaydet'",
                 bg=RENK_PANEL, fg=RENK_MAVI, font=("Segoe UI", 9, "bold"),
                 wraplength=1180, justify="left").pack(anchor="w", padx=10, pady=(8, 4))
        self._kunye_metin = tk.Text(yap, height=5, bg=RENK_INPUT_BG, fg=RENK_YAZI, relief="flat",
                                    font=("Consolas", 9), wrap="word")
        self._kunye_metin.pack(fill="x", padx=10, pady=(0, 6))
        btnf = tk.Frame(yap, bg=RENK_PANEL)
        btnf.pack(fill="x", padx=10, pady=(0, 8))
        tk.Button(btnf, text="📥  Oku & Kaydet", command=self._kunye_oku_kaydet,
                  bg=RENK_YESIL, fg="white", font=("Segoe UI", 10, "bold"), relief="flat",
                  padx=14, pady=7, cursor="hand2").pack(side="left")
        tk.Button(btnf, text="🔄  Yenile", command=self._kunye_tablo_doldur,
                  bg=RENK_PANEL_2, fg=RENK_YAZI, font=("Segoe UI", 9), relief="flat",
                  padx=12, pady=7, cursor="hand2").pack(side="left", padx=(8, 0))
        tk.Button(btnf, text="📊  Özet Excel'i Aç", command=self._kunye_ozet_ac,
                  bg=RENK_PANEL_2, fg=RENK_YAZI, font=("Segoe UI", 9), relief="flat",
                  padx=12, pady=7, cursor="hand2").pack(side="left", padx=(8, 0))
        self._kunye_sonuc = tk.Label(btnf, text="", bg=RENK_PANEL, fg=RENK_YAZI_2,
                                     font=("Segoe UI", 9))
        self._kunye_sonuc.pack(side="left", padx=12)

        # Alt bölge: solda firma listesi, sağda seçili firmanın tüm künyesi
        tf = tk.Frame(win, bg=RENK_BG)
        tf.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        # --- SOL: liste ---
        solf = tk.Frame(tf, bg=RENK_PANEL)
        solf.pack(side="left", fill="both", expand=True)
        kol = ("firma", "unvan", "vkn", "vergi_dairesi", "faaliyet", "mersis", "sermaye")
        basl = {"firma": "Firma Kodu", "unvan": "Ünvan", "vkn": "VKN/TC",
                "vergi_dairesi": "Vergi Dairesi", "faaliyet": "Faaliyet",
                "mersis": "MERSİS No", "sermaye": "Sermaye"}
        gen = {"firma": 150, "unvan": 220, "vkn": 90, "vergi_dairesi": 110,
               "faaliyet": 80, "mersis": 140, "sermaye": 100}
        self._kunye_tablo = ttk.Treeview(solf, columns=kol, show="headings")
        for k in kol:
            self._kunye_tablo.heading(k, text=basl[k])
            self._kunye_tablo.column(k, width=gen[k],
                                     anchor="w" if k == "unvan" else "center")
        self._kunye_tablo.tag_configure("tam", background="#1f3a23", foreground="#b7efc5")
        self._kunye_tablo.tag_configure("eksik", background="#3a2f1d", foreground="#fde6a8")
        vs = ttk.Scrollbar(solf, orient="vertical", command=self._kunye_tablo.yview)
        self._kunye_tablo.configure(yscrollcommand=vs.set)
        self._kunye_tablo.pack(side="left", fill="both", expand=True)
        vs.pack(side="right", fill="y")
        self._kunye_tablo.bind("<<TreeviewSelect>>", self._kunye_secildi)

        # --- SAĞ: seçili firma detayı + şifre alanları ---
        sagf = tk.Frame(tf, bg=RENK_PANEL, width=420)
        sagf.pack(side="right", fill="y", padx=(10, 0))
        sagf.pack_propagate(False)
        tk.Label(sagf, text="🔎  SEÇİLİ FİRMA — TÜM KÜNYE", bg=RENK_PANEL, fg=RENK_MAVI,
                 font=("Segoe UI", 10, "bold")).pack(anchor="w", padx=12, pady=(10, 4))
        self._kunye_detay = tk.Text(sagf, bg=RENK_INPUT_BG, fg=RENK_YAZI, relief="flat",
                                    font=("Segoe UI", 10), wrap="word", height=14)
        self._kunye_detay.pack(fill="x", padx=12, pady=(0, 4))
        self._kunye_detay.tag_configure("etiket", foreground=RENK_YAZI_2,
                                        font=("Segoe UI", 8, "bold"), spacing1=4)
        self._kunye_detay.tag_configure("deger", foreground=RENK_YAZI, font=("Segoe UI", 11))
        self._kunye_detay.tag_configure("bos", foreground=RENK_TURUNCU, font=("Segoe UI", 11))
        self._kunye_detay.insert("end", "← Soldan bir firmaya tıkla, tüm bilgileri burada görünsün.")
        self._kunye_detay.configure(state="disabled")

        # --- Şifre / giriş bilgileri bölümü ---
        sifre_frame = tk.LabelFrame(sagf, text="🔐 GİRİŞ BİLGİLERİ", bg=RENK_PANEL,
                                     fg=RENK_TURUNCU, font=("Segoe UI", 9, "bold"),
                                     relief="flat", bd=1)
        sifre_frame.pack(fill="both", expand=True, padx=12, pady=(2, 8))
        self._sifre_entries = {}
        sifre_alanlari = [
            ("uyumsoft_kullanici", "Uyumsoft Kullanıcı"),
            ("uyumsoft_sifre", "Uyumsoft Şifre"),
            ("ebeyanname_sifre", "E-Beyanname Şifre"),
            ("vergi_dairesi_kullanici", "VD Kullanıcı"),
            ("vergi_dairesi_sifre", "VD Şifre"),
            ("sgk_adi", "SGK Adı"),
            ("sgk_sicil_no", "SGK Sicil No"),
            ("sgk_kullanici_kodu", "SGK Kullanıcı"),
            ("sgk_sistem_sifresi", "SGK Şifre"),
        ]
        for key, label in sifre_alanlari:
            row = tk.Frame(sifre_frame, bg=RENK_PANEL)
            row.pack(fill="x", padx=6, pady=1)
            tk.Label(row, text=label, bg=RENK_PANEL, fg=RENK_YAZI_2,
                     font=("Segoe UI", 7), width=16, anchor="w").pack(side="left")
            fsize = 8 if key == "sgk_sicil_no" else 9
            e = tk.Entry(row, bg=RENK_INPUT_BG, fg=RENK_YAZI, relief="flat",
                         font=("Consolas", fsize), insertbackground=RENK_YAZI)
            e.pack(side="left", fill="x", expand=True, padx=(3, 0))
            self._sifre_entries[key] = e

        sifre_btn_f = tk.Frame(sifre_frame, bg=RENK_PANEL)
        sifre_btn_f.pack(fill="x", padx=8, pady=(4, 6))
        tk.Button(sifre_btn_f, text="💾 Kaydet", command=self._sifre_kaydet,
                  bg=RENK_YESIL, fg="white", font=("Segoe UI", 9, "bold"), relief="flat",
                  padx=10, pady=3, cursor="hand2").pack(side="left")
        self._sifre_durum = tk.Label(sifre_btn_f, text="", bg=RENK_PANEL, fg=RENK_YAZI_2,
                                     font=("Segoe UI", 8))
        self._sifre_durum.pack(side="left", padx=8)
        self._kunye_secili_kod = None

        self._kunye_tablo_doldur()

    def _kunye_tablo_doldur(self):
        self._kunye_tablo.delete(*self._kunye_tablo.get_children())
        bilgiler = tum_bilgiler()
        tam = 0
        for kod, b in sorted(bilgiler.items()):
            detay = [b.get(x) for x in ("mersis_no", "ticaret_sicil_no", "kurulus_tarihi",
                                        "sermaye", "adres")]
            dolu = sum(1 for d in detay if d)
            tag = "tam" if dolu >= 4 else "eksik"
            if dolu >= 4:
                tam += 1
            self._kunye_tablo.insert("", "end", values=(
                kod, b.get("unvan", ""),
                b.get("vkn") or b.get("tc", ""),
                b.get("vergi_dairesi", ""),
                b.get("faaliyet_kodu", ""),
                b.get("mersis_no", ""), b.get("sermaye", "")),
                tags=(tag,))
        self._kunye_durum.config(
            text=f"{tam}/{len(bilgiler)} firma TAM künye  •  {len(bilgiler)} firma kayıtlı")

    def _kunye_secildi(self, event=None):
        sec = self._kunye_tablo.selection()
        if not sec:
            return
        kod = self._kunye_tablo.item(sec[0], "values")[0]
        b = bilgi_oku(kod)
        il_ilce = " / ".join(filter(None, [b.get("il", ""), b.get("ilce", "")]))
        alanlar = [
            ("FİRMA KODU", kod),
            ("ÜNVAN", b.get("unvan", "")),
            ("VKN / TC", b.get("vkn") or b.get("tc", "")),
            ("VERGİ DAİRESİ", b.get("vergi_dairesi", "")),
            ("VERGİ TÜRÜ", b.get("vergi_turu", "")),
            ("FAALİYET KODU", b.get("faaliyet_kodu", "")),
            ("FAALİYET ADI", b.get("faaliyet_adi", "")),
            ("MERSİS NO", b.get("mersis_no", "")),
            ("TİCARET SİCİL NO", b.get("ticaret_sicil_no", "")),
            ("KURULUŞ TARİHİ", b.get("kurulus_tarihi", "")),
            ("SERMAYE", b.get("sermaye", "")),
            ("KEP ADRESİ", b.get("kep", "")),
            ("İL / İLÇE", il_ilce),
            ("ADRES", b.get("adres", "")),
        ]
        d = self._kunye_detay
        d.configure(state="normal")
        d.delete("1.0", "end")
        for et, dg in alanlar:
            d.insert("end", f"{et}\n", "etiket")
            d.insert("end", (f"{dg}\n\n" if dg else "—  (boş, MERSİS'ten doldur)\n\n"),
                     "deger" if dg else "bos")
        ort = b.get("ortaklar") or []
        if ort:
            d.insert("end", "ORTAKLAR / YETKİLİLER\n", "etiket")
            for o in ort:
                ad = o.get("ad", "") if isinstance(o, dict) else str(o)
                if ad:
                    d.insert("end", f"• {ad}\n", "deger")
        d.configure(state="disabled")

        self._kunye_secili_kod = kod
        for key, entry in self._sifre_entries.items():
            entry.delete(0, "end")
            val = b.get(key, "")
            if val:
                entry.insert(0, val)
        self._sifre_durum.config(text="")

    def _sifre_kaydet(self):
        kod = self._kunye_secili_kod
        if not kod:
            self._sifre_durum.config(text="Önce sol listeden firma seç", fg=RENK_TURUNCU)
            return
        from motor.firma_bilgi import bilgi_oku, FIRMA_DIZIN
        import json
        yol = FIRMA_DIZIN / kod / "firma_bilgi.json"
        data = bilgi_oku(kod)
        for key, entry in self._sifre_entries.items():
            val = entry.get().strip()
            if val:
                data[key] = val
            elif key in data:
                del data[key]
        yol.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        self._sifre_durum.config(text=f"✅ {kod} kaydedildi", fg=RENK_YESIL)

    def _kunye_oku_kaydet(self):
        metin = self._kunye_metin.get("1.0", "end").strip()
        if not metin:
            self._kunye_sonuc.config(text="Önce MERSİS sayfasını yapıştır.", fg=RENK_TURUNCU)
            return
        try:
            kod, bilgi, durum = mersis_parse.html_kaydet(metin)
        except Exception as e:
            self._kunye_sonuc.config(text=f"HATA: {e}", fg=RENK_KIRMIZI)
            return
        if durum == "OK":
            self._kunye_sonuc.config(
                text=f"✅ {kod} kaydedildi — {bilgi.get('unvan', '')[:42]}", fg=RENK_YESIL)
            self._kunye_metin.delete("1.0", "end")
            self._kunye_tablo_doldur()
        else:
            self._kunye_sonuc.config(text=f"⚠ {durum}", fg=RENK_TURUNCU)

    def _kunye_ozet_ac(self):
        try:
            yol = ozet_excel_yaz()
            os.startfile(str(yol))
        except Exception as e:
            messagebox.showerror("Açılamadı", str(e))

    # ------------------------------------------------------------------ #
    #  OUTLOOK BANKA TARAMA penceresi
    # ------------------------------------------------------------------ #
    def _outlook_penceresi(self):
        win = tk.Toplevel(self)
        win.title("📧 Outlook Banka Tarayıcı")
        win.geometry("1100x700")
        win.minsize(900, 550)
        win.configure(bg=RENK_BG)

        # Üst başlık
        ust = tk.Frame(win, bg=RENK_PANEL, height=60)
        ust.pack(fill="x")
        ust.pack_propagate(False)
        tk.Label(ust, text="📧  OUTLOOK BANKA TARAYICI", bg=RENK_PANEL, fg=RENK_YAZI,
                 font=("Segoe UI", 16, "bold")).pack(side="left", padx=20, pady=10)
        self._outlook_durum = tk.Label(ust, text="Hazır", bg=RENK_PANEL, fg=RENK_YAZI_2,
                                       font=("Segoe UI", 10))
        self._outlook_durum.pack(side="right", padx=20)

        # Kontrol paneli
        ctrl = tk.Frame(win, bg=RENK_PANEL)
        ctrl.pack(fill="x", padx=12, pady=(10, 6))

        tk.Label(ctrl, text="Ay:", bg=RENK_PANEL, fg=RENK_YAZI,
                 font=("Segoe UI", 10)).pack(side="left", padx=(12, 4))
        bugun = datetime.now()
        self._outlook_ay = tk.IntVar(value=bugun.month)
        ay_combo = ttk.Combobox(ctrl, textvariable=self._outlook_ay, state="readonly",
                                values=list(range(1, 13)), width=4)
        ay_combo.pack(side="left", padx=(0, 12))

        tk.Label(ctrl, text="Yıl:", bg=RENK_PANEL, fg=RENK_YAZI,
                 font=("Segoe UI", 10)).pack(side="left", padx=(0, 4))
        self._outlook_yil = tk.IntVar(value=bugun.year)
        yil_entry = tk.Entry(ctrl, textvariable=self._outlook_yil, width=6,
                             bg=RENK_INPUT_BG, fg=RENK_YAZI, relief="flat",
                             font=("Segoe UI", 10), insertbackground=RENK_YAZI)
        yil_entry.pack(side="left", padx=(0, 16))

        tk.Button(ctrl, text="🔍  SADECE TARA (indirme)",
                  command=lambda: self._outlook_calistir(win, sadece_tara=True),
                  bg=RENK_TURUNCU, fg="white", activebackground="#d97706",
                  font=("Segoe UI", 10, "bold"), relief="flat", padx=14, pady=7, cursor="hand2"
                  ).pack(side="left", padx=(0, 8))

        tk.Button(ctrl, text="📥  TARA & İNDİR & EŞLEŞTIR",
                  command=lambda: self._outlook_calistir(win, sadece_tara=False),
                  bg=RENK_YESIL, fg="white", activebackground="#1f8d3a",
                  font=("Segoe UI", 10, "bold"), relief="flat", padx=14, pady=7, cursor="hand2"
                  ).pack(side="left", padx=(0, 8))

        tk.Button(ctrl, text="🗂️  DAĞIT & İŞLE",
                  command=lambda: self._outlook_dagit(win),
                  bg=RENK_MOR, fg="white", activebackground="#8b5cf6",
                  font=("Segoe UI", 10, "bold"), relief="flat", padx=14, pady=7, cursor="hand2"
                  ).pack(side="left", padx=(0, 8))

        tk.Button(ctrl, text="📂  Klasörü Aç",
                  command=self._outlook_klasor_ac,
                  bg=RENK_PANEL_2, fg=RENK_YAZI, activebackground=RENK_MOR,
                  font=("Segoe UI", 9), relief="flat", padx=10, pady=7, cursor="hand2"
                  ).pack(side="right", padx=(0, 12))

        # Özet kartları
        ozet_f = tk.Frame(win, bg=RENK_BG)
        ozet_f.pack(fill="x", padx=12, pady=(4, 4))
        self._outlook_kartlar = {}
        kart_verileri = [
            ("📧 Email", "0", RENK_MAVI),
            ("📎 Dosya", "0", "#0ea5e9"),
            ("✅ Eşleşen", "0", RENK_YESIL),
            ("⚠ Eşleşmeyen", "0", RENK_TURUNCU),
            ("⏭ Atlanan", "0", RENK_YAZI_2),
        ]
        for i, (etk, deg, renk) in enumerate(kart_verileri):
            f = tk.Frame(ozet_f, bg=RENK_PANEL_2)
            f.grid(row=0, column=i, padx=4, pady=4, sticky="nsew")
            ozet_f.columnconfigure(i, weight=1)
            tk.Label(f, text=etk, bg=RENK_PANEL_2, fg=RENK_YAZI_2,
                     font=("Segoe UI", 9)).pack(anchor="w", padx=8, pady=(4, 0))
            lbl = tk.Label(f, text=deg, bg=RENK_PANEL_2, fg=renk,
                           font=("Segoe UI", 16, "bold"))
            lbl.pack(anchor="w", padx=8, pady=(0, 4))
            self._outlook_kartlar[etk] = lbl

        # Dosya tablosu
        tablo_f = tk.Frame(win, bg=RENK_PANEL)
        tablo_f.pack(fill="both", expand=True, padx=12, pady=(0, 6))

        kol = ("durum", "firma", "dosya", "konu", "gonderen", "tarih")
        basl = {"durum": "Durum", "firma": "Firma", "dosya": "Dosya",
                "konu": "Email Konusu", "gonderen": "Gönderen", "tarih": "Tarih"}
        gen = {"durum": 80, "firma": 160, "dosya": 220, "konu": 260, "gonderen": 200, "tarih": 100}
        self._outlook_tablo = ttk.Treeview(tablo_f, columns=kol, show="headings", height=14)
        for k in kol:
            self._outlook_tablo.heading(k, text=basl[k])
            self._outlook_tablo.column(k, width=gen[k],
                                        anchor="w" if k in ("dosya", "konu", "gonderen") else "center")
        self._outlook_tablo.tag_configure("eslesti", background="#1f3a23", foreground="#b7efc5")
        self._outlook_tablo.tag_configure("eslesmedi", background="#5c2a2a", foreground="#fcd5ce")
        self._outlook_tablo.tag_configure("atlandi", background="#3a3a3a", foreground="#999")
        vs = ttk.Scrollbar(tablo_f, orient="vertical", command=self._outlook_tablo.yview)
        self._outlook_tablo.configure(yscrollcommand=vs.set)
        self._outlook_tablo.pack(side="left", fill="both", expand=True, padx=8, pady=8)
        vs.pack(side="right", fill="y", pady=8)

        # Log
        log_f = tk.Frame(win, bg=RENK_PANEL, height=100)
        log_f.pack(fill="x", padx=12, pady=(0, 12))
        log_f.pack_propagate(False)
        tk.Label(log_f, text="📜 LOG", bg=RENK_PANEL, fg=RENK_YAZI_2,
                 font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=10, pady=(4, 0))
        self._outlook_log = tk.Text(log_f, bg=RENK_INPUT_BG, fg=RENK_YAZI, relief="flat",
                                     height=4, font=("Consolas", 9), wrap="word")
        self._outlook_log.pack(fill="both", expand=True, padx=10, pady=(2, 6))
        self._outlook_log.tag_configure("ok", foreground=RENK_YESIL)
        self._outlook_log.tag_configure("warn", foreground=RENK_TURUNCU)
        self._outlook_log.tag_configure("err", foreground=RENK_KIRMIZI)

        self._outlook_win = win
        self._outlook_sonuc = None

    def _outlook_log_yaz(self, msg: str, tag: str = ""):
        zaman = datetime.now().strftime("%H:%M:%S")
        self._outlook_log.insert("end", f"[{zaman}] ", "")
        self._outlook_log.insert("end", f"{msg}\n", tag)
        self._outlook_log.see("end")

    def _outlook_calistir(self, win, sadece_tara: bool):
        self._outlook_durum.config(text="Taranıyor...", fg=RENK_TURUNCU)
        self._outlook_log_yaz("Outlook tarama başlıyor...", "ok")
        threading.Thread(target=self._outlook_tara_thread,
                         args=(sadece_tara,), daemon=True).start()

    def _outlook_tara_thread(self, sadece_tara: bool):
        try:
            from motor.outlook_tarayici import OutlookTarayici
            ay = self._outlook_ay.get()
            yil = self._outlook_yil.get()

            def ilerleme(msg):
                try:
                    self._outlook_win.after(0, lambda: self._outlook_log_yaz(msg))
                except:
                    pass

            ot = OutlookTarayici(ay=ay, yil=yil, ilerleme_cb=ilerleme)
            sonuc = ot.tara_ve_indir(sadece_tara=sadece_tara)
            self._outlook_sonuc = sonuc
            self._outlook_win.after(0, lambda: self._outlook_sonuc_goster(sonuc, sadece_tara))
        except Exception as e:
            self._outlook_win.after(0, lambda: self._outlook_log_yaz(f"HATA: {e}", "err"))
            self._outlook_win.after(0, lambda: self._outlook_durum.config(
                text="Hata!", fg=RENK_KIRMIZI))
            import traceback as tb
            self._outlook_win.after(0, lambda: self._outlook_log_yaz(tb.format_exc(), "err"))

    def _outlook_sonuc_goster(self, sonuc, sadece_tara: bool):
        self._outlook_kartlar["📧 Email"].config(text=str(sonuc.taranan_email))
        self._outlook_kartlar["📎 Dosya"].config(text=str(sonuc.indirilen_dosya))
        self._outlook_kartlar["✅ Eşleşen"].config(text=str(sonuc.eslesen_firma))
        self._outlook_kartlar["⚠ Eşleşmeyen"].config(text=str(sonuc.eslesmeyen))
        self._outlook_kartlar["⏭ Atlanan"].config(text=str(sonuc.atlanan))

        self._outlook_tablo.delete(*self._outlook_tablo.get_children())
        for d in sonuc.dosyalar:
            durum_simge = {"eşleşti": "✅", "eşleşmedi": "⚠", "atlandı": "⏭",
                           "tarandı": "🔍", "hata": "❌"}.get(d.durum, "?")
            tag = {"eşleşti": "eslesti", "eşleşmedi": "eslesmedi",
                   "atlandı": "atlandi"}.get(d.durum, "")
            tarih_str = d.email_tarih.strftime("%d.%m.%Y") if d.email_tarih else ""
            self._outlook_tablo.insert("", "end", values=(
                f"{durum_simge} {d.durum}",
                d.firma_adi or d.firma_kodu or "-",
                d.orijinal_ad,
                d.email_konu[:50],
                d.email_gonderen[:40],
                tarih_str,
            ), tags=(tag,))

        mod = "tarandı (indirmedi)" if sadece_tara else "indirildi & eşleştirildi"
        self._outlook_durum.config(
            text=f"✅ {sonuc.indirilen_dosya} dosya {mod}", fg=RENK_YESIL)
        self._outlook_log_yaz(
            f"Tamamlandı: {sonuc.indirilen_dosya} dosya, "
            f"{sonuc.eslesen_firma} eşleşti, {sonuc.eslesmeyen} eşleşmedi", "ok")
        for h in sonuc.hatalar:
            self._outlook_log_yaz(f"Hata: {h}", "err")

    def _outlook_dagit(self, win):
        """Outlook'tan indirilen dosyaları dağıt & işle → panelin içindeki işlenmiş klasörüne."""
        ay = self._outlook_ay.get()
        yil = self._outlook_yil.get()
        from motor.outlook_tarayici import OutlookTarayici
        ot = OutlookTarayici(ay=ay, yil=yil)
        if not ot.ham_klasor.exists() or not any(ot.ham_klasor.iterdir()):
            messagebox.showwarning("Klasör boş",
                                   f"Önce 'TARA & İNDİR' yapın.\nKlasör: {ot.ham_klasor}")
            return
        self._outlook_log_yaz(f"Dağıt & İşle: {ot.ham_klasor} → {ot.islenmiş_klasor}", "ok")
        self._outlook_durum.config(text="Dağıtılıyor...", fg=RENK_TURUNCU)
        threading.Thread(target=self._outlook_dagit_thread,
                         args=(ot,), daemon=True).start()

    def _outlook_dagit_thread(self, ot):
        try:
            cikti = ot.isle()
            for satir in cikti.splitlines():
                etk = "ok" if "✓" in satir or "TOPLAM" in satir else (
                    "warn" if ("⚠" in satir or "✗" in satir) else "")
                self._outlook_win.after(0, lambda s=satir, e=etk: self._outlook_log_yaz(s, e))
            self._outlook_win.after(0, lambda: self._outlook_durum.config(
                text=f"✅ İşlendi → {ot.islenmiş_klasor.name}", fg=RENK_YESIL))
            try:
                os.startfile(str(ot.islenmiş_klasor))
            except:
                pass
        except Exception as e:
            self._outlook_win.after(0, lambda: self._outlook_log_yaz(f"HATA: {e}", "err"))
            self._outlook_win.after(0, lambda: self._outlook_durum.config(
                text="Hata!", fg=RENK_KIRMIZI))

    def _outlook_klasor_ac(self):
        """Outlook bankalar ana klasörünü aç."""
        from motor.outlook_tarayici import OUTLOOK_BANKALAR
        OUTLOOK_BANKALAR.mkdir(parents=True, exist_ok=True)
        os.startfile(str(OUTLOOK_BANKALAR))

    # ------------------------------------------------------------------ #
    def _log(self, mesaj: str, etiket: str = ""):
        zaman = datetime.now().strftime("%H:%M:%S")
        self.log.insert("end", f"[{zaman}] ", "")
        self.log.insert("end", f"{mesaj}\n", etiket)
        self.log.see("end")


if __name__ == "__main__":
    import tkinter.simpledialog  # noqa: F401  - lazy import
    BankaPanel().mainloop()
