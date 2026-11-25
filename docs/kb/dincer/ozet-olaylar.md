# Dinçer Lojistik – Doğrulanmış olay özeti (kişisel veri içermez)

## Doğrulanmış gelmeme kayıtları
- Marmara Ambar: 10 sonuçlanmış taşıma talebi içinde 2 doğrulanmış gelmeme. Her iki olayda da rezervasyon taşıyıcı tarafından onaylanmış, ancak yük T−1 depo kabul sınırına kadar getirilmemiştir.
- Başkent Nakliye: 1 doğrulanmış gelmeme, sefer DNC-PAST-GEB-ANK, dün.
- Listede olmayan firmalar için bu özet dokümanda doğrulanmış gelmeme kaydı yoktur (kayıt bulunmaması güncel kayıt olmadığı anlamına gelmez; güncel adet API'den doğrulanır).

## Karar desteği yorumu
- Doğrulanmış gelmeme geçmişi uygunluk kontrolünü tek başına geçersiz kılmaz ve otomatik ret nedeni değildir.
- Uygun talepler arasında gelmeme geçmişi bulunan müşteri daha düşük öncelikte değerlendirilir; eşitlikte başvuru sırası kullanılır.
- Onaylayıcı güncel `customerHistory.historicalReservationCount` ve `customerHistory.verifiedNoShows` sayılarını işlem API'sinden doğrulamalı, bu bilgi tabanını yalnız kuralın açıklaması için kullanmalıdır.

Not: Bu özet bilgi amaçlıdır; güncel adet ve tarih için işlem API'sindeki `customerHistory` değeri esas alınır.
