# Mayıs Banka Kontrol Raporu

Kontrol tarihi: 2026-06-27

## İncelenen Kaynaklar

- Mayıs çıktı klasörü: `C:\Users\omery\OneDrive\Desktop\Mayıs Ayı Banka Hareketleri`
- Word notu: `C:\Users\omery\OneDrive\Desktop\📂 IS_VERILERI\Banka eksiklikleri.docx`
- Proje firma referansları: `firmalar/*`

## Mayıs Çıktı Envanteri

- 43 adet `.xlsx` çıktı bulundu.
- 1171 hareket satırı okundu.
- Çıktı formatı Word talimatına uygun görünüyor: tek sayfa, 1. satırda `Tarih`, `Açıklama`, `Tutar`, `Hesap Kodu`.

## Tespit Edilen Ana Sorun

- Mevcut Mayıs çıktılarında `780.02` 263 kez kullanılmış.
- Mevcut Mayıs çıktılarında `335.02` 70 kez kullanılmış.
- 37 firmanın hiçbirinde `06_hesap_plani.xlsx` yok.
- Beklenen kaynak klasör `C:\Users\omery\OneDrive\Desktop\HESAP PLANLARI` mevcut değil.

Bu nedenle eski çıktıları firma hesap planına göre kesin düzeltebilmek için tam hesap planı dosyaları tekrar yüklenmeli veya geri getirilmelidir.

## Yapılan Güçlendirme

- `motor/eslestirici.py` içinde hesap arama önceliği değiştirildi: önce `06_hesap_plani.xlsx`, sonra referans tabloları, en son kural sözlüğü.
- Eski `780.02` / `335.02` kural değerleri sabit kod sayılmayacak şekilde dinamik çözüme bağlandı.
- `motor/firma_kur.py` yeni kural sözlüğü üretirken `780.??` ve `335.??` dinamik yer tutucuları kullanacak hale getirildi.
- Mevcut 37 firmanın `04_kural_sozlugu.xlsx` dosyalarında `780.02` ve `335.02` hücreleri dinamik yer tutuculara çevrildi.
- Word notundaki muhasebe talimatları `docs/BANKA_ESLESTIRME_HAFIZA.md` dosyasına aktarıldı.

## Devam İçin Gerekli Dosya

Tam düzeltme ve yeni sarı klasöre doğru revize çıktı alabilmek için hesap planı dosyalarının bulunduğu klasör gerekiyor. Kodun beklediği varsayılan yol:

`C:\Users\omery\OneDrive\Desktop\HESAP PLANLARI`

Bu klasör gelince önce:

```powershell
python hesap_plani_kurtar.py "C:\Users\omery\OneDrive\Desktop\HESAP PLANLARI"
```

ardından Mayıs banka hareketleri yeniden dağıtılıp üretilebilir.
