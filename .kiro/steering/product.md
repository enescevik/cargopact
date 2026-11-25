---
inclusion: always
---
# CargoPact – Ürün Bağlamı (Plan v1.3, 25 Kasım 2026)

**Amaç:** Taşıyıcıların (yükleniciler: Dinçer Lojistik, Siva vb.) planlı depo-depo transferlerinde boş kalan palet alanını yayınlaması; müşterilerin kendi rotasına uygun araçta yer için teklif vermesi; onaylanan yükün çıkış transfer merkezine müşteri tarafından getirilmesi, aracın varış dağıtım merkezine taşıması ve müşterinin/yetkili alıcısının varış deposundan teslim almasıdır.

**Kapsam dışı (MVP):** kapıdan alım/teslim (mikro toplama ve toplama müşteride; ileride entegrasyon), açık taşıyıcı pazarı, ara durak, istiflenebilir palet, ürünün tetiklediği yeni sefer.

## Roller
- **Müşteri / yük sahibi:** sefer arar, yük beyan eder, teklif verir/kabul eder, ödeme yapar, takip eder, yetkili alıcı tanımlar. Yalnız kendi firmasının verisini görür.
- **Taşıyıcı planlamacı:** "Aracım var, yük ekle" ile sefer kapasitesini yayınlar, talepleri onaylar/reddeder.
- **Taşıyıcı depo personeli:** kabul, ölçüm, barkod/QR, yükleme, varış, teslim olaylarını işler (mobil, kamera, çevrimdışı kuyruk).
- **Yönetim/jüri:** salt okunur özet panosu.

## İlkeler
- Sistem kayıt sahibi olduğu alanlar: teklif, blokaj, onay, ödeme, müşteri deneyimi. TMS = sefer, WMS = depo hareketi (sahip sistemler).
- Palet/kg/m³ doluluğu ayrı gösterilir. Planlanan, bloke ve fiili doluluk karıştırılmaz.
- Aynı isteğin tekrarı tek mutasyon üretir (idempotency key). Mobil eşitleme de idempotent.
- Müşteriler birbirinin teklifini, geçmişini, önceliğini göremez.
- Demo/simülasyon verisi işaretlenir.
