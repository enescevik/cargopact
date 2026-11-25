# Requirements – Ana Veri (Tesis, Araç, Ürün/Ambalaj Tipleri) ve Seed Verisi

## Giriş
Taşıyıcıların transfer merkezlerini, dağıtım merkezlerini, araçlarını ve araç tiplerini; platformun ise palet, koli gibi ambalaj/ürün tiplerini tanımlayabilmesi. Test ve demo için gerçekçi, tekrar üretilebilir seed verisi.

## Gereksinimler

### 1. Tesisler (transfer merkezi / dağıtım merkezi)
**Kullanıcı hikayesi:** Taşıyıcı yöneticisi olarak kendi çıkış transfer merkezlerimi ve varış dağıtım merkezlerimi tanımlamak istiyorum.
1. Taşıyıcı yöneticisi tesis oluşturup düzenleyebilecek: ad, tür (`transfer_center`, `distribution_center`, ikisi birden olabilir), şehir/ilçe, adres, koordinat, saat dilimi, çalışma saatleri, çıkış kabul penceresi ve varış alım penceresi, günlük kabul/rampa slot limiti, iletişim kişisi.
2. Bir sefer yalnız kendi taşıyıcısının tesisleriyle tanımlanabilecek.
3. Tesis pasife alınırsa yeni sefer açılamayacak; mevcut onaylı siparişler etkilenmeyecek.
4. Müşteri tesisin adını, adresini ve çalışma saatlerini yalnız ilgili sefer için görecek ("depoya nasıl giderim?").

### 2. Araç tipleri ve araçlar
1. Araç tipi: ad (ör. tır, kamyon, kamyonet), palet pozisyonu, azami net yük (kg), yük hacmi (m³), iç ölçüler, istif edilebilirlik (MVP'de istiflenmez). Platform varsayılan tipleri sağlar; taşıyıcı kendi tiplerini ekleyebilir.
2. Araç: plaka, araç tipi, taşıyıcı, durum (aktif/bakımda/pasif), isteğe bağlı sürücü adı ve telefonu.
3. Bir sefer bir araca ve onun tipine bağlanacak; sefer, araç tipinin sınırlarını aşan kapasite yayınlayamayacak, ancak seferde araç tipinden düşük bir demo/operasyon azami yükü tanımlanabilecek.
4. IF araç aynı zaman aralığında başka bir seferde atanmışsa THEN sistem çakışmayı reddedecek.
5. Araç değişikliği kapasite sürümünü artıracak (bkz. capacity-and-pricing).

### 3. Ambalaj / ürün tipleri
1. Platform kataloğu ambalaj tiplerini içerecek: EUR palet (120×80), endüstriyel palet (120×100) ve koli boyutları (küçük/orta/büyük, ölçü ve tipik ağırlık). Taşıyıcı kendi kiracısına özel tip ekleyebilecek.
2. Ambalaj tipi alanları: kod, ad, tür (`pallet`, `carton`, `other`), ölçü (en/boy/yükseklik), azami brüt ağırlık, palet eşdeğeri hesaplama kuralı, istiflenebilirlik.
3. Ürün sınıfları (ör. genel kuru yük, gıda-ambalajlı, kırılgan, tehlikeli madde) ve taşıyıcının kabul ettiği sınıf listesi tanımlanabilecek. Kabul edilmeyen sınıf talep uygunluğunda reddedilecek.
4. Yük beyanında müşteri ambalaj tipi ve adet seçecek; sistem toplam brüt kg ve m³ değerini hesaplayıp müşteriye gösterecek, müşteri düzeltebilecek.
5. Koli (karar: müşteri paletler): WHEN müşteri koli beyan ederse THEN sistem toplam kg ve m³ değerini ve tahmini palet sayısını (`ceil(toplam koli hacmi / (palet kullanılabilir hacmi × doluluk katsayısı))`) hesaplayıp müşteriye gösterecek ve yükü paletlemesi gerektiğini bildirecek. Müşteri nihai palet adedini, her palet için içerik/ağırlık/ölçü beyanıyla onaylayacak. Kapasite, fiyat ve depo kabulü yalnız palet üzerinden işlenecek; çıkış deposu paletlenmemiş koli kabul etmeyecek.
5a. Şema ambalaj tipi ve palet eşdeğeri alanlarını baştan taşıyacak; ileride taşıyıcı bazlı paletlenmemiş koli kabulü eklenirse şema değişmeden yalnız kural ve ekran eklenecek.
6. Standart palet ölçü/yükseklik sınırı aşılırsa talep uygunluk kontrolünde reddedilecek.

### 4. Yönetim yetkileri
1. `carrier_admin` rolü kendi taşıyıcısının tesis, araç, araç tipi ve ambalaj tiplerini yönetecek. `platform_admin` platform kataloğunu yönetecek.
2. Müşteriler ana veriyi yalnız okuyacak (ilgili sefer ve ambalaj kataloğu kapsamında).
3. Ana veri değişiklikleri denetim izine yazılacak.
4. Silme yerine pasife alma kullanılacak; seferlerde/siparişlerde referanslı kayıt silinemeyecek.

### 5. Seed verisi
**Kullanıcı hikayesi:** Geliştirici ve jüri olarak sistemi boş başlamadan, gerçekçi veriyle denemek istiyorum.
1. Seed betiği tekrar çalıştırılabilir (idempotent) ve deterministik olacak; aynı girdiyle aynı kimlikleri/verileri üretecek.
2. Betik `isDemo` işaretiyle yazacak; üretim ortamında (ortam korumasıyla) çalışmayı reddedecek; `reset` komutu yalnız demo verisini silecek.
3. Tarihler çalıştırma anına göre göreli üretilecek (ör. "yarın 18:00 kalkış") ki demo hep geçerli olsun.
4. İçerik (gerçekçi ama kurgusal; gerçek firma kayıtları/adresleri kullanılmayacak):
   - **Taşıyıcılar:** Dinçer Lojistik, Siva Taşımacılık.
   - **Tesisler:** her taşıyıcı için en az 2 transfer merkezi ve 3 dağıtım merkezi (ör. Gebze, Çerkezköy, Bursa, Ankara, İzmir, Konya, Adana, Mersin), çalışma saatleri ve alım pencereleriyle.
   - **Araç tipleri ve araçlar:** tır (33 palet), kamyon (~18 palet), kamyonet (~6 palet); taşıyıcı başına 4–6 plakalı araç.
   - **Ambalaj/ürün tipleri:** EUR palet, endüstriyel palet, 3 koli boyutu; 4 ürün sınıfı.
   - **Müşteri firmaları:** Marmara Ambar, Anadolu Parsiyel, Başkent Nakliye ve en az 3 firma daha (biri doğrulanmış gelmeme geçmişli, biri onaysız firma).
   - **Kullanıcılar:** her rol için test kullanıcısı (Cognito); parolalar repoya yazılmayacak, ortam değişkeni/yerel dosyadan alınacak.
   - **Seferler (göreli tarihli):** plandaki Gebze→Ankara 3+2+3 senaryosu, diğer rotalarda bos/yarı dolu/dolu seferler, T−3 sınırını geçmiş sefer, T−1'i geçmiş sefer, geçmişte tamamlanmış sefer.
   - **Siparişler ve olaylar:** her sipariş durumunu (teklif, onay bekliyor, onaylı, depo kabul, yüklendi, varışta, teslim, süresi doldu, ret, iptal, eksik/hasar) en az bir kez kapsayan kayıtlar; palet olayları ve e-POD örnekleri.
   - **Ödeme ve iptal:** tam ödeme, kapora+kalan, ücretsiz iptal, ücretli iptal, taşıyıcı iptali iadesi, gelmeme ücreti, hasar iadesi örnekleri defter kayıtlarıyla.
   - **Öncelik:** en az bir firmada doğrulanmış gelmeme kaydı ve aynı sefere iki eşdeğer talep (sıralama testi).
5. Seed sonrası bir doğrulama betiği tutarlılığı denetleyecek: kapasite toplamları kayıtlarla eşleşiyor, defter bakiyeleri tutarlı, hiçbir kayıt kiracı sınırını aşmıyor.
6. Seed, yerel geliştirme ve dağıtılmış demo ortamı için aynı betikle çalışacak.
