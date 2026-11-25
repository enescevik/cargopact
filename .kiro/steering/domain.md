---
inclusion: always
---
# Alan Kuralları

## Zaman sınırları (T = planlanan kalkış)
- Yer ayırma ve kesin rezervasyon: en geç **T−3 saat** (sınır dahil). Geçici blokaj süresi bu sınırı aşamaz.
- Çıkış deposu fiziksel kabul ve kayıt: en geç **T−1 saat**. Sonrası standart akışta işlenmez, operasyona gecikme bildirilir.
- Varış teslim alma: varış deposunun alım penceresine göre.
- Backend sunucu saatiyle doğrular; web, mobil ve sohbet aynı hesaplanmış değerleri gösterir.

## Sipariş durumları
`TEKLIF → TASIYICI_ONAYI_BEKLIYOR → ONAYLI → DEPO_KABUL → YUKLENDI → VARISTA → TESLIM`
Yan geçişler: SURESI_DOLDU, RET, IPTAL, EKSIK_HASAR, YENIDEN_PLANLAMA. Ret/iptal/süre aşımı kapasiteyi **bir kez** iade eder.
Onayda tekil sipariş numarası (`CP-2026-000123`) üretilir; aynı onay tekrarında aynı numara döner.

## Uygunluk
Palet adedi + brüt kg + ölçü/yükseklik + m³ + ürün uyumu + zaman penceresi + iç yük rezervi. Nominal boş pozisyon yeterli değil. Depo ölçümü beyandan ayrı saklanır; fark olursa uygunluk yeniden çalışır. İç transfer kapasitesine dokunulmaz.

## Öncelik (no-show)
Doğrulanmış gelmeme (T−1'e kadar getirilmeyen onaylı yük) kaydı olan firma uygun talepler arasında daha düşük önceliktedir; eşitlikte başvuru sırası. Zamanında bildirilmiş iptal, taşıyıcı kaynaklı aksama, inceleme bekleyen yük, geç gelen yük ve ölçüm farkı gelmeme sayılmaz (ayrı neden kodları). Planlamacının seçim gerekçesi denetim izine yazılır. Müşteriye başka firmanın geçmişi gösterilmez.

## Palet izleme
Her palet tekil kimlik/QR (pilotta SSCC eşlemesi). Olaylar: kabul, yükleme, varış, teslim. Aynı okutma tekrarında çift hareket oluşmaz. Teslim yetkisi paletten ayrı doğrulanır; palet bazında e-POD.

## Taşıyıcıya özel bilgi tabanı
Her taşıyıcının kendi Knowledge Base'i (gelmeme kuralları, istisnalar, özet olaylar). Firma kimliğiyle filtreli arama; güncel adet/tarih işlem API'sinden doğrulanır. Ham evrak ve gereksiz kişisel veri indekslenmez.

## Ödeme ve iptal (ÖNERİ – iş sahibi onayı bekliyor, bkz. decisions.md)
- Ödeme planı taşıyıcı bazlı parametre: (a) onayda tamamı, (b) onayda %X kapora + kalan T−1 öncesi, (c) kalan teslimde.
- Defter (ledger) append-only: `AUTHORIZED, CAPTURED, REFUNDED, RETAINED`; her kayıt idempotency key ve sipariş referansı taşır.
- İptal ücreti taşıyıcı bazlı politika tablosu (kalkışa kalan süreye göre dilimler); onay anındaki politika siparişe sabitlenir.
- Taşıyıcı iptali / yeniden planlama / taşıyıcı kaynaklı aksama: müşteriye tam iade. Hasar/eksik palet: palet bazında kısmi iade (talep kaydı).
- Onay öncesi iptal/ret/süre aşımı: ödeme alınmaz veya provizyon serbest bırakılır.
