# Banka Esleştirme Hafızası

Bu dosya, `Banka eksiklikleri.docx` içindeki muhasebe talimatlarının kalıcı özetidir. Panel ve
eşleştirme motoru geliştirilirken bu kurallar esas alınır.

## Hesap Planı Önceliği

- 780, 335, 760, 770, 193, 642, 679, 329, 131, 331 gibi hesaplar ezbere alt hesapla atanmaz.
- Her firma için önce `firmalar/<FIRMA>/06_hesap_plani.xlsx` okunur.
- `06_hesap_plani.xlsx` yoksa motor güvenli genel hesaba düşer; doğru alt hesap için hesap planı yüklenmelidir.
- Eski `780.02` ve `335.02` kural değerleri sabit kod değildir; dinamik olarak `780.??` ve `335.??` gibi çözülür.

## Temel Muhasebe Kuralları

- Komisyon, BSMV, masraf, POS yazılım/bakım, MKK ücreti, kesinti ve küçük banka ücretleri 780 grubunda toplanır.
- Maaş, maaş avansı, huzur hakkı, ihbar/kıdem tazminatı, yol, yemek, bayram ve mesai ödemeleri 335 grubunda toplanır.
- `KESİNTİ VE EKLERİ-Maaş Avansı` veya `KESİNTİ VE EKLERİ-Prim` personel değil banka masrafıdır; 780 grubuna gider.
- Faiz geliri 642 grubunda, faiz stopajı/vergi kesintisi 193 grubunda bankaya göre alt hesapla izlenir.
- Devlet desteği gibi olağan dışı gelirler 679 grubunda aranır.
- HGS, araç bakım, araç akaryakıt ve taşıtla ilgili giderler firma planındaki 760/770 araç giderlerinde aranır.
- Aidat ve genel yönetim niteliğindeki ödemeler 770 grubunda aranır.
- Depozito hareketleri 126 grubunda değerlendirilir.
- Kasa para yatırma/çekme ve ATM nakit işlemleri 100 kasa hesabına gider.

## Cari ve Özel Açıklama Kuralları

- MULTNT/Multinet, TRKCLL/Turkcell, Superonline, Vodafone, Bedaş vb. açıklamalar önce 320 carilerde aranır.
- Taner Battal hiçbir zaman 120/320 olarak ezbere atanmaz; 195 veya 329 hesaplarında aranır.
- Kira ödemelerinde açıklamadaki kişi/kurum 329 hesabında aranır.
- Kredi kartı ödemelerinde açıklamadaki kart son 4 hanesi 329 hesaplarında aranır; şahıs firmalarında şirket kartı yoksa 131/331 kullanılır.
- `EKSTRE BORÇ TAHSİLATI` açıklamasında baştaki kart numarası 329 eşleştirmesi için kullanılır.
- Çek ödemesi bankadan çıkışsa 103, çek tahsilatı bankaya girişse 101 hesabında bankaya göre aranır.
- Senet ödemelerinde 121 alacak senetleri dikkate alınır; net eşleşme yoksa 999 geçici hesapta bırakılır.

## Ortak ve Şahıs Hareketleri

- Açıklamada ortak/yetkili adı varsa ve maaş/huzur hakkı/prim/tazminat değilse 131/331 grubunda izlenir.
- Ortak hareketlerinde 131 ve 331 aynı anda karıştırılmaz; hesap planında bakiye/aktiflik hangi taraftaysa tek taraf kullanılır.
- İhtiyaç, paylaşım, yardım, şahsi aktarım, yatırım hesabı aktarımı, kıymetli maden alımı ve şahsi SGK/Bağkur ödemeleri 131/331 grubuna gider.
- Tam adı belli olmayan maskeli kişi açıklamaları net eşleşmiyorsa 999 geçici hesapta bırakılır.

## Virman ve Döviz

- Hesaplar arası virmanlarda aynı firma bankaları karşılaştırılır; bir hesapta işlenen hareket diğer hesapta mükerrer bırakılmaz.
- Döviz alım/satımında TL hesabındaki karşı hareket silinir, döviz hesabı kur bilgisiyle işlenir.
- Arbitraj işlemlerinde ilgili döviz hesapları ve TCMB kuru dikkate alınır.
- Fon alış/satışları 118 yerine varsa 102 altındaki fon hesabında toplanır.

## Çıktı Formatı

- Mikro aktarım Excel'lerinde tek sayfa kullanılır.
- Başlıklar 1. satırdan başlar: `Tarih`, `Açıklama`, `Tutar`, `Hesap Kodu`.
- Üst bilgi, kontrol listesi ve açılacak cariler listesi Mikro çıktısına yazılmaz.
- Sıfır tutarlı satırlar işlenmez.
- STS Sağlık için açıklamasında `tah` olan satırlar başka yerden işlenecekse çıktıdan ayıklanır.
