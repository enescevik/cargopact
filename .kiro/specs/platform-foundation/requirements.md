# Requirements – Platform Temeli

## Giriş
Çok kiracılı kimlik/yetki, veri şeması, API sözleşmesi ve idempotency altyapısı. Diğer tüm spec'ler buna dayanır.

## Gereksinimler

### 1. Çok kiracılı kimlik ve yetki
**Kullanıcı hikayesi:** Taşıyıcı ve müşteri firması olarak yalnız kendi verilerimi görmek istiyorum.
1. WHEN bir istek geçerli Cognito JWT ile gelirse THEN sistem `tenantId`, tenant türü (`carrier`/`customer`) ve rolü doğrulanmış üyelikten türetecek; istemciden gelen tenant alanını yok sayacak.
2. WHEN bir kullanıcı başka kiracıya ait kayda erişmeye çalışırsa THEN sistem 404 dönecek ve olayı denetim kaydına yazacak.
3. Roller: `customer_user`, `carrier_admin`, `carrier_planner`, `carrier_warehouse`, `admin_viewer`, `platform_admin`. WHEN rol uç nokta için yetkisizse THEN sistem 403 dönecek.
4. WHEN yeni müşteri kaydolursa THEN firma üyeliği ve onay durumu kaydedilecek; onaysız firma sefer listesini göremeyecek.

### 2. Veri modeli (Aurora DSQL)
1. Şema DSQL kısıtlarına uygun olacak (SERIAL/sequence, trigger ve aynı işlemde birden fazla DDL varsayılmayacak; indeksler `CREATE INDEX ASYNC`; yabancı anahtar ve JSON kolon desteği tasarım aşamasında dokümanla doğrulanacak).
2. Para tutarları tamsayı kuruş olarak, zamanlar UTC `timestamptz` olarak saklanacak.
3. WHEN şema değişirse THEN sürümlü, tekrar çalıştırılabilir migrasyon betikleri uygulanacak.
4. Bağlantı IAM token ile yapılacak; parola veya sır koda yazılmayacak.

### 3. Idempotency ve çakışma
1. WHEN yazan bir uç nokta `Idempotency-Key` başlığıyla tekrar çağrılırsa THEN sistem ilk sonucu aynen dönecek ve ikinci mutasyon yapmayacak.
2. WHEN DSQL optimistic concurrency çakışması (serialization error) oluşursa THEN sistem sınırlı sayıda geri çekilmeyle yeniden deneyecek; sonunda başarısızsa 409 dönecek.

### 4. API sözleşmesi
1. API, OpenAPI 3 belgesiyle tanımlanacak; web, mobil ve ajan araçları aynı sözleşmeyi kullanacak.
2. Tüm hatalar `{code, message, correlationId}` biçiminde dönecek.
3. WHEN istek alınırsa THEN `correlationId` üretilecek/iletilecek ve loglara yazılacak.
4. Girdi doğrulaması API sınırında yapılacak; sorgular parametreli olacak.

### 5. Denetim izi
1. WHEN durum değiştiren işlem gerçekleşirse THEN kim, ne zaman, neden, önceki/sonraki durum ve correlationId ile denetim kaydı yazılacak.
2. Denetim kayıtları silinemez/değiştirilemez (yalnız ekleme).
