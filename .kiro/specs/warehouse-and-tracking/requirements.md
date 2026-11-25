# Requirements – Depo İşlemleri ve Takip

## Giriş
Çıkış deposu kabulü, ölçüm, palet kimliği/QR, yükleme, varış ve palet bazında teslim (e-POD). Mobilde çevrimdışı kuyruk.

## Gereksinimler

### 1. Palet kimliği
1. WHEN rezervasyon onaylanırsa THEN her palet için tekil kimlik ve QR üretilecek (pilotta SSCC ile eşlenebilir alan olacak).
2. Teslim yetkisi palet kodundan ayrı doğrulanacak.

### 2. Çıkış deposu kabulü
**Kullanıcı hikayesi:** Depo personeli olarak gelen paleti ölçüp kaydetmek istiyorum.
1. WHEN personel referans/QR ile paleti bulup ölçü ve kg girerse THEN sistem beyanla farkı hesaplayacak ve ölçümü beyandan ayrı saklayacak.
2. WHEN fark eşiği aşılırsa THEN uygunluk yeniden çalışacak; uygun değilse kısmi kabul veya inceleme kaydı açılacak.
3. IF sunucu saati T−1'i geçmişse THEN standart kabul reddedilecek ve gecikme operasyon kuyruğuna düşecek.
4. Kabul olayı personel, depo, zaman ve fotoğraf (S3) bilgisi taşıyacak.

5. Depo yalnız paletleri kabul eder; paletlenmemiş koli veya dökme yük kabul edilmez ve inceleme kaydı açılır.

### 3. Yükleme ve varış
1. WHEN personel sefer manifestosundaki paleti okutursa THEN `YUKLENDI` olayı yazılacak; okunan/kalan sayacı güncellenecek.
2. WHEN araç varışta paletler okutulursa THEN `VARISTA` olayı yazılacak ve alıcıya bildirim gidecek.
3. Varış deposu alım penceresi dışındaki teslim operasyon uyarısı üretecek.

### 4. Teslim ve e-POD
1. WHEN yetkili alıcı doğrulanır ve palet okutulursa THEN palet bazında teslim olayı, zaman, alıcı ve e-POD (imza/fotoğraf) kaydedilecek.
2. Yetkisiz alıcıya teslim reddedilecek.
3. Kısmi teslimde hangi palet, ne zaman, kime teslim edildi görünecek.

### 5. Çift olay koruması ve çevrimdışı
1. WHEN aynı barkod aynı olay türüyle tekrar okutulursa THEN çift hareket oluşmayacak.
2. WHILE mobil çevrimdışıysa THEN ölçüm ve okutmalar cihazda sıraya alınacak ve "bekliyor" gösterilecek; bağlantıda idempotent olarak eşitlenecek; sunucu teyidine kadar kapasite/teslim onaylı sayılmayacak.

### 6. Takip görünümü
1. Müşteri sipariş durumu: Onaylandı → çıkışta kabul edildi → araca yüklendi → yolda → varışta teslime hazır → teslim edildi. Hasar/eksik/kısmi teslim ilgili palete bağlı görünecek.
2. Canlı araç konumu yalnız doğrulanmış araç takip kaynağı bağlıysa gösterilecek.

### 7. İstisnalar
1. Gelmeme, geç bırakma, ölçüm farkı, hasar, teslim alınmama için durum, sorumlu, neden kodu ve bildirim tanımlanacak.
2. Doluluk raporu planlanan ve fiili palet doluluğunu ayrı verecek.
