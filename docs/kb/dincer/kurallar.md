# Dinçer Lojistik – Gelmeme, öncelik ve zaman kuralları

## Zaman sınırları (T = planlanan kalkış)
- Yer ayırma ve kesin rezervasyon en geç T−3 saat (sınır dahil).
- Çıkış deposu fiziksel kabul ve kayıt en geç T−1 saat. Sonrası standart akışta işlenmez, operasyona gecikme bildirilir.

## Gelmeme (no-show) tanımı
Onaylı bir yükün T−1 saate kadar çıkış deposuna getirilmemesi doğrulanmış gelmeme sayılır.

## Gelmeme SAYILMAYAN durumlar
- Zamanında bildirilmiş iptal
- Taşıyıcı kaynaklı aksama (araç gecikmesi, sefer değişikliği)
- İnceleme bekleyen yük
- Geç gelen yük (ayrı neden kodu: GEC_GELEN)
- Ölçüm farkı (depo ölçümü beyandan farklıysa; ayrı neden kodu)

## Öncelik
Doğrulanmış gelmeme kaydı olan firma uygun talepler arasında daha düşük önceliktedir; eşitlikte başvuru sırası belirler. Planlamacının seçim gerekçesi denetim izine yazılır. Başka firmanın geçmişi müşteriye gösterilmez.

## Müşteri yönetimi operasyonel güven skoru
- Skor 0–100 arasındadır ve işlem API'si tarafından deterministik hesaplanır; Knowledge Base skoru hesaplamaz, yalnız kuralı açıklar.
- Girdiler yalnız `TESLIM` ve doğrulanmış `GELMEDI` sonuçlarıdır. Başlangıç öncülü 4 başarılı / 1 başarısızdır; her teslim bir olumlu, her gelmeme iki olumsuz ağırlık taşır.
- Formül: `100 × (teslim + 4) / (teslim + 4 + 2 × gelmeme + 1)`, en yakın tam sayıya yuvarlanır.
- Kategoriler: 75–100 **UYGUN**, 50–74 **İZLENMELİ**, 0–49 **RİSKLİ PROFİL**.
- İptal, ret ve eksik/hasar olaylarında sorumlu taraf mevcut veriden kesin çıkarılamadığı için skora katılmaz; ekranda ayrı metrik olarak gösterilir.
- Skor rezervasyon uygunluğu, kredi skoru veya otomatik onay/ret değildir. Güncel kapasite, ürün ve zaman uygunluğu ayrıca değerlendirilir.
- Doğrulanmış gelmeme varsa mevcut düşük öncelik kuralı skordan bağımsız uygulanmaya devam eder.
- Kişi bilgisi, ödeme tutarı, adres, telefon, teslim alan kişi ve serbest metin notları skorda kullanılmaz.
- Güncel skor ve adetlerde işlem API'si esastır; bu doküman yalnız açıklama kaynağıdır.

## İptal ve iade dilimleri
- Kalkışa 24 saat veya daha fazla kala iptal: %100 iade.
- Kalkışa 24 saatten az, T−3 sınırından önce iptal: %50 iade.
- T−3 sınırından sonra iptal veya gelmeme: %0 iade (ücret alıkonur).
- Taşıyıcı iptali, yeniden planlama ve taşıyıcı kaynaklı aksamada tam iade yapılır.
- Dilimler onay anında siparişe sabitlenir.

## Ödeme / kapora
Ödeme planı: onayda %30 kapora, kalan tutar T−1 öncesi tahsil edilir. Kapora gelmeme durumunda iade edilmez.

## e-POD kuralı
Teslimde palet bazında e-POD zorunludur; yetkili alıcı kimliği paletten ayrı doğrulanır.

## Ürün sınıfları
GENEL, GIDA-AMBALAJLI ve TEHLIKELI kabul edilir. KIRILGAN ürün bu taşıyıcıda KABUL EDİLMEZ.
