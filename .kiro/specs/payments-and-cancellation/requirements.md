# Requirements – Ödeme ve İptal

## Giriş
Simüle ödeme sağlayıcısıyla tamamı veya kısmi ödeme, iptal ücretleri ve iade senaryoları. Dilim ve oran değerleri taşıyıcı parametresidir; gerçek sağlayıcı sonradan takılır.

## Gereksinimler

### 1. Ödeme planı
**Kullanıcı hikayesi:** Müşteri olarak tutarın tamamını veya bir kısmını ödeyebilmek istiyorum.
1. Taşıyıcı ödeme planını seçecek: (a) onayda tamamı, (b) onayda %X kapora + kalan T−1 öncesi, (c) kalan teslimde.
2. Onay anındaki ödeme planı ve iptal politikası siparişe sabitlenecek (sonraki ayar değişiklikleri etkilemeyecek).
3. WHEN taşıyıcı onaylarsa THEN sistem planın ilk tahsilatını talep edecek; ödeme olmadan sipariş `ONAYLI` ama `ODEME_BEKLIYOR` bayrağıyla izlenecek ve ödeme süresi dolarsa otomatik iptal kuralı uygulanacak.
4. Ödeme çağrıları `PaymentProvider` arayüzü arkasında olacak; MVP uygulaması simüle sağlayıcıdır (başarılı, reddedilen, zaman aşımı, tekrar deneme senaryoları tetiklenebilir).
5. Her ödeme çağrısı idempotency anahtarı taşıyacak; tekrarında çift tahsilat olmayacak.

### 2. Defter (ledger)
1. Tüm para hareketleri yalnız-ekleme defterinde tutulacak: `AUTHORIZED`, `CAPTURED`, `REFUNDED`, `RETAINED` (iptal ücreti), `FAILED`.
2. Her kayıt sipariş, tutar (kuruş), para birimi, neden kodu, idempotency anahtarı ve correlationId içerecek.
3. Bakiye = tahsil edilen − iade edilen − tutulan ücret defterden hesaplanacak; ayrıca kaydedilen bakiye alanı olmayacak.

### 3. İptal ücreti politikası
1. Taşıyıcı, kalkışa (T) kalan süreye göre dilimli iptal politikası tanımlayacak (örnek yapı: ≥24 saat tam iade; 24 saat–T−3 yüzde kesinti; T−3 sonrası iade yok). Değerler varsayılan placeholder'dır.
2. WHEN müşteri iptal ederse THEN sistem, iptal anında politikayı uygulayıp iade/ücret tutarını önceden gösterecek; müşteri onaylarsa işlem yapılacak.
3. WHEN onay öncesi iptal, ret veya süre aşımı olursa THEN tahsilat alınmamışsa alınmayacak; provizyon varsa serbest bırakılacak.

### 4. Taşıyıcı kaynaklı durumlar
1. WHEN taşıyıcı onaylı siparişi iptal ederse veya yeniden planlama müşteri için uygunsuzsa THEN müşteriye tam iade yapılacak ve gelmeme sayılmayacak.
2. WHEN yeniden planlama olursa THEN müşteri yeni seferi ücretsiz kabul edebilecek veya ücretsiz iptal edip tam iade alabilecek.

### 5. Gelmeme (no-show)
1. WHEN onaylı yük T−1'e kadar teslim alınmazsa THEN operasyon doğrulamasıyla gelmeme kaydı açılacak ve politika uyarınca ücret tutulacak.
2. Gelmeme olmayan nedenler (bkz. reservation spec) ücret doğurmayacak.

### 6. Hasar ve eksik palet
1. WHEN palet hasarlı veya eksikse THEN palet bazında talep kaydı açılacak; onaylanan tutar kısmi iade olarak deftere yazılacak.
2. Kısmi teslimde teslim edilmeyen paletlere düşen pay iade edilebilir olarak işaretlenecek.

### 7. Çift işlem koruması
1. Aynı iptal veya iade tekrar çalışsa kapasite ve para en fazla bir kez iade edilecek.
2. Mutabakat işi defter ile sipariş durumlarını karşılaştırıp tutarsızlıkları raporlayacak.
