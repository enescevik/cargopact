# Requirements – Rezervasyon, Blokaj ve Taşıyıcı Onayı

## Giriş
Müşterinin teklifi kabul etmesi, süreli blokaj, taşıyıcı onay/ret kararı, sipariş numarası ve öncelik sıralaması.

## Gereksinimler

### 1. Teklif kabul ve blokaj
**Kullanıcı hikayesi:** Müşteri olarak fiyatı kabul edip yerimi süreli ayırtmak istiyorum.
1. WHEN müşteri geçerli teklifi kabul ederse THEN sistem tek işlemde kapasiteyi bloke edecek, başvuru referansı üretecek ve durumu `TASIYICI_ONAYI_BEKLIYOR` yapacak.
2. IF teklif süresi dolmuşsa veya sefer sürümü değişmişse THEN sistem kabulü reddedecek ve yeni teklif isteyecek.
3. IF sunucu saati T−3 sınırını geçmişse THEN sistem yeni blokaj açmayacak (sınır dahil).
4. Blokaj süresi T−3 sınırını aşamayacak.
5. WHEN iki eşzamanlı istek son kalan kapasiteyi isterse THEN yalnız biri başarılı olacak, diğeri kapasite yetersiz hatası alacak.
6. Teklifte gösterilen fiyat blokaj boyunca sabit kalacak.

### 2. Taşıyıcı kararı
1. WHEN planlamacı onaylarsa THEN sistem uygunluğu yeniden denetleyecek, kesin rezervasyonu ve tekil sipariş numarasını (`CP-YYYY-NNNNNN`) aynı işlemde kaydedecek ve müşteriye bildirecek.
2. WHEN aynı onay tekrar işlenirse THEN aynı sipariş numarası dönecek.
3. WHEN planlamacı reddederse THEN gerekçe zorunlu olacak ve kapasite bir kez iade edilecek.
4. IF T−3 geçmişse THEN bekleyen rezervasyon kesinleşmeyecek.
5. Onaylı rezervasyonun fiyatı sonradan tarife değişikliğinden etkilenmeyecek.

### 3. Süre aşımı
1. WHEN blokaj süresi dolarsa THEN kapasite bir kez serbest bırakılacak ve durum `SURESI_DOLDU` olacak.
2. Serbest bırakma işlemi tekrar çalışsa da kapasite ikinci kez iade edilmeyecek.

### 4. Öncelik sıralaması
1. Sistem bekleyen talepleri sıralarken doğrulanmış gelmeme kaydı olan firmaları, kaydı olmayan eşdeğer taleplerin altına yerleştirecek; eşitlikte başvuru sırası geçerli olacak.
2. Aynı girdiler aynı sırayı üretecek.
3. Gelmeme sayılmayanlar: zamanında bildirilmiş iptal, taşıyıcı kaynaklı aksama, inceleme bekleyen yük, geç gelen yük, ölçüm farkı.
4. Planlamacı seçim gerekçesini kaydedecek; kayıt denetim izine yazılacak.
5. Müşteri arayüzü ve API'si diğer firmaların talebini, sırasını veya geçmişini göstermeyecek.

### 5. Müşteri iptali (ücret kuralları payments-and-cancellation spec'inde)
1. WHEN müşteri onay öncesi iptal ederse THEN blokaj serbest bırakılacak.
2. WHEN müşteri onay sonrası iptal ederse THEN kapasite bir kez iade edilecek ve iptal nedeni/ücreti kaydedilecek.

### 6. Takip ve sorgulama
1. WHEN müşteri sipariş numarasıyla sorgularsa THEN son doğrulanmış durum, güncelleme saati, sıradaki adım, çıkış deposu ve T−1 saati, varış alım penceresi dönecek.
2. Müşteri yalnız kendi firmasının siparişini sorgulayabilecek.
