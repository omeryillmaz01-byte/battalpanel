# BATTAL MUHASEBE — Proje Hafızası

Ömer Yılmaz'ın (BATTAL MUHASEBE) Defter Beyan otomasyonu. Panel: `BATTAL_MUHASEBE_DB_PRO.html`,
Chrome eklentisi: `battal_db_eklenti/`. Portal: portal.defterbeyan.gov.tr,
backend: `https://backend-p.defterbeyan.gov.tr/rs`.

## AYLIK GELİR MUTABAKATI (her ay tekrarlanan iş — hızlı yapılacak)

**Kural:** `Trendyol + Hepsiburada (iptal/red HARİÇ) = Defter Beyan Gelir`. KDV de tutmalı.

Kullanıcı 3 dosya verir:
1. **Defter Beyan → Gelir Listele → Excel** (`gelir_gider_report` sheet). Veri satır ~10'dan başlar.
   Kolonlar: `[7]=Belge Sıra No, [8]=Açıklama, [10]=KDV Oranı, [14]=Tutar(matrah), [16]=Hesaplanan KDV`.
   Karışık faturalar 2 satır (%20 normal + istisna). Belge no'ya göre topla.
2. **Trendyol E-Arşiv Listesi** (`E-Arşiv Listesi` sheet, header satır 1).
   Kolonlar: `[2]=Fatura No, [5]=Fatura Tipi(Satış/İstisna/İade), [10]=Statü, [12]=Vergiler Hariç(matrah),
   [15]=KDV Toplamı, [28]=%0 Matrah(istisna), [33]=%20 Matrah, [42]=Harici İptal`.
   **İPTAL ÇIKAR:** Statü `İptal Edildi` olanları at.
3. **Hepsiburada Satışlar CSV** (`;` ayraç, değerler `'` ile başlayabilir, ondalık virgül).
   Kolonlar: `[0]=Fatura No, [18]=%20 Matrah, [19]=Toplam KDV, [20]=Vergiler Hariç(matrah),
   [8]=%0 Matrah(istisna), [24]=Fatura Tipi, [27]=Fatura Durumu`. İptal olanları at.
   Belge ön ekleri: `AYA` (e-arşiv), `SNN` (e-fatura/ticari).

**Yöntem:** belge no'yu normalize et (`[^0-9A-Za-z]` sil, upper). Belge-belge eşleştir:
- Kaynakta var / DB'de yok → **DB'ye eksik girilmiş**
- DB'de var / kaynakta yok → genelde **iptal edilmiş ama DB'den silinmemiş** (Trendyol statüsünü kontrol et; İptal ise DB'den SİL)
- Eşleşende matrah/KDV farkı → o faturayı incele
- Özel matrah (istisna, %0>0): karışık ise DB'de 2 satır (%20+istisna 99034), saf istisna 1 satır olmalı.

Hazır script: `scratchpad/mutabakat.py` (dosya yollarını güncelle, çalıştır).
DB'yi API'den çekmek için: `scratchpad/sinan_haziran_gelir_karsilastir.js` (konsola yapıştır).

**Örnek (Sinan Haziran 2026):** Fark = DB'de fazla 3 İptal faturası (TYA…677/713/772 = 2.857,85 matrah).
Diğer her şey birebir tuttu.

## SİNAN ATALAY (VKN 0960155134) — e-ticaret kuyum/gümüş, İşletme defteri, NACE 479114

### GELİR
- Trendyol e-Arşiv (`TYA…`) + Hepsiburada (`AYA…`/`SNN…`).
- Karışık kuyumcu faturası: aynı faturada %20 + özel matrah (istisna). DB'de 2 kayıt:
  normal (satisTuru 1, %20) + istisna (`gelirKayitAltTuruKodu=99034`, satisTuruKodu 6, kdvsizIslem, kod 99034).

### GİDER — tedarikçi VKN → kod haritası (panelde `tedarikciMap`)
- **D-MARKET** (Hepsiburada op., VKN `2650179910`): tek faturada **Kargo 193 + Komisyon 188**. 194 YOK.
- **DSM Grup** (Trendyol op., VKN `3130557669`): her hizmet AYRI fatura, bölme yok. Belge-no ön eki + fatura AÇIKLAMASI'na göre:
  - `DCF…` (açıklama "…hakediş tutarı") → **188** Komisyon ve Pos Giderleri (GVK 40/1)
  - `DDF…` açıklama "Kargo taşıma…" → **193** Kargo ,Posta ve Kurye
  - `DDF…` açıklama "Teknolojik altyapı/sistem işletimi…" (veya Tahsilat/Hizmet) → **194** Dışarıdan Sağlanan Fayda ve Hizmetler
  - Panel prefixMap DDF'yi varsayılan 193 yapıp `DDF-KONTROL` uyarısı verir; açıklama "Teknolojik" ise elle 194'e çevir.

### Sinan GİDER mutabakatında GİRİLMEYENLER (kullanıcı kararı — DB'de olmayacak, fark normal)
Sadece operatör/mal alışı girilir: DSM Grup, D-MARKET, Dilaver (DLV), Gördes (GRD).
GİRİLMEZ: İGDAŞ doğalgaz (VKN 4700022607 · ES0/ED0), elektrik CK Boğaziçi (BEF·1790617537),
telefon/internet (Turkcell/TTNET/Vodafone/Lifecell), Bin Ulaşım (7420466098·E0x), ECO, Elvan, Çitlekçi, Beşiktaş Sportif, Yesmed.
Elle girilen: Battal Taner muhasebe ücreti (TNR·24679499156) — kaynakta yok, normal.
- **GÖRDES** (`4090017206`): 186 Mal Alışı %20 · **DİLAVER** (`34241131728`): 186 Mal Alışı kdvsiz.
- Gider kodları: **186** Mal Alışı, **188** Komisyon ve Pos, **193** Kargo/Posta/Kurye,
  **194** Dışarıdan Sağlanan Fayda ve Hizmetler, **218** Özel İletişim Vergisi. Hepsi GVK 40/1, tür 4 (186 tür 1).

### DB düzeltme scriptleri (konsola yapıştır, backend API)
- Gider kod düzeltme (açıklama neyse kod ona uysun): `scratchpad/sinan_haziran_kod_fix.js`
  (önce kuru çalışma, sonra `window.GO=true`). `/gider/update` kullanır.
- Açıklama toplu düzeltme (gelir): `scratchpad/bulk_aciklama_fix_v5.js`. `/gelir/update`, kayıtta `updated:true` şart.

## GENEL KURALLAR
- Geliştirme dalı: `claude/project-development-continue-ni27io`. Repo: `omeryillmaz01-byte/battalpanel`.
- Kullanıcı **panele gömülmesini** ister, ayrı HTML/manuel giriş istemez ("PANELE GÖM").
- API update payload'da tanınmayan alan (`ad` vb.) 500 verir → sadece bilinen alanları gönder.
- Tarih formatları: DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD hepsi parse edilir.
