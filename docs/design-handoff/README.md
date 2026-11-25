# CargoPact Modern + Premium tasarım teslimi

## Tasarım yönü ve kaynak

03 Modern yerleşimi + 01 Premium detayları: kobalt ve mint; porselen zemin; şampanya ayırıcılar; rota ve ana başlıklarda Fraunces. Bu teslim son kullanıcı istemi ve repodaki DESIGN_SYSTEM kararını izler. Önceki yeşil tasarım bu paketin yönü değildir.

Kaynak: https://github.com/enescevik/cargopact/blob/b90cb6f13439fe5d9783149e78db9a601229ae81/docs/DESIGN_SYSTEM.md

HEX değerleri kaynak kodda tanımlı kesin tasarım belirteçleridir. Raster mockup piksellerinden ölçüldükleri iddia edilmez. Web CSS ve mobil tema aynı ana renk değerlerini kullanır.

## Dosyalar

- tokens.json: istenen tüm cobalt, mint, porcelain, surface, champagne, ink ve status anahtarları; font, radius, space ve shadow.
- tokens.css: --cp-* değişkenleri ve okunabilir semantik eşlemeler.
- tokens.accessible.json: marka paletini koruyan metin/zemin kullanım önerileri.
- contrast-audit.json: mevcut ve önerilen renk çiftlerinin hesaplanan kontrastı.

## Tipografi ve boyutlar

Fraunces rota ve ana başlıklarda; Inter form, tablo, gövde ve fiyatlarda; JetBrains Mono sipariş ve korelasyon kimliklerinde. Fiyat serif olmaz. Web fontları ayrıca yüklenmelidir; mobil kaynak tema şu anda Georgia ve Menlo yedeklerine dayanır, Fraunces/JetBrains'in native uygulamada kurulu olduğu varsayılmaz.

Uygulama önerisi: gövde 16 px, etiket 14 px, rota masaüstü 28 px / mobil 24 px; yoğun sayı alanlarında tabular-nums. Köşeler 8 / 12 / 18 / 24 / 999 px; kart 18 px, kontrol 12 px. Dokunma hedefi en az 44 px, ana eylem 48 px.

## Yerleşim sözleşmesi

Müşteri web ekranında yatay gezinme; sefer listesi ana sütunda, rezervasyon özeti sağda. Mobilde tek sütun, metin etiketli alt sekmeler ve altta sabit toplam/ana eylem; safe-area ve son içeriğe yeterli alt boşluk. Operasyon ekranlarında sol menü ve okunaklı iş listeleri.

Palet, kg ve m³ ayrı göstergelerdir. Planlanan, bloke ve fiili doluluk etiketleri ayrıdır. İki depo; Son rezervasyon(T−3)15:00; Çıkış deposu son kabul(T−1)17:00; kalkış18:00 açıkça görünür. Varış alım penceresi bunlardan ayrıdır.

Fiyat alanı toplam+palet başı fiyat, teklif geri sayımı ve Fiyat neden böyle? açıklamasını taşır. Üç kapasite sınırının tümü ve ürün/zaman uygunluğu kontrol edilir. Müşteri ekranında başka firmaların verisi veya öncelik/gelmeme geçmişi gösterilmez.

Durumlar renk+metinle sunulur. Boş/yükleniyor/hata/başarı/ret/süre doldu tasarlanır; mobil çevrimdışında Bekliyor–sunucu teyidi yok etiketi korunur. Depo-depo operasyon dışında kapıdan hizmet ima edilmez.

## Kontrast ve uygulama

Marka renklerini küçük metin rengi olarak doğrudan kullanma. Mint düğmede koyu kobalt yazı, başarı/uyarı/ret rozetlerinde tokens.accessible.json içindeki koyu foreground değerleri kullanılmalı. Şampanya çizgiler dekoratif ayırıcılardır; küçük metin veya gerekli input sınırı olarak tek başına kullanılmamalı. Tüm durumlarda metin etiketi ve görünür klavye odağı korunmalı.

Önerilen durum metin çiftlerinin en düşük oranı 5.73:1; mint eylem çifti 8.65:1. Bu ölçüm tüm ekranların WCAG AA denetiminden geçtiği anlamına gelmez. JSON/CSS dosyaları teslimdir; uygulama değişikliği yapılmış değildir.

## Sunum

../presentation/cargopact-9-slides.html dosyası dokuz 16:9 slaytı, notları ve yerel gezinmeyi içerir. SVG kaynakları slides/ klasöründedir. HTML dosyasını tarayıcıda açıp Yazdır/PDF ile PDF alabilirsin. Fontlar çevrimiçi yüklenir; çevrimdışı yedekleri kullanılır.

PPTX/PDF üretimi ve son tarayıcı render kontrolü çalışma ortamı bağlantısı nedeniyle tamamlanmadı. Sunumun sayfa sayısı, metinleri, SVG çerçevesi, aritmetiği ve JavaScript sözdizimi kontrol edildi.

