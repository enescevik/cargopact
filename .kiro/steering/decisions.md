---
inclusion: always
---
# Açık Kararlar ve Çelişkiler

| # | Konu | Durum |
|---|---|---|
| 1 | Veri tabanı: plan DynamoDB diyor, ekip ilişkisel (Aurora DSQL) seçti | **DSQL**. Çift rezervasyon: tek kapasite satırı + OCC çakışmasında yeniden deneme + idempotency tablosu. **Doğrulandı:** yabancı anahtar çalışıyor ve uygulanıyor; jsonb var; dizi kolonu ve trigger yok (bkz. platform-foundation/design.md §1). |
| 2 | Tek taşıyıcı (Dinçer) vs çoklu taşıyıcı (Dinçer, Siva…) | **Çoklu**: `carrier` kiracı, `customer` ayrı kiracı. Tüm sorgular tenant filtreli. |
| 3 | Fiyat | **KARAR:** Sabit fiyat, müşteri pazarlık etmez. Fiyatı backend dinamik hesaplar (talep yüksekse artar, kalkışa yaklaştıkça satılmamış kapasitede düşer). Bkz. domain.md "Dinamik fiyat". |
| 4 | Ödeme sağlayıcı | **KARAR:** Hackathon için simüle sağlayıcı. Soyut `PaymentProvider` arayüzü arkasında; gerçek sağlayıcı sonra takılır. |
| 5 | İptal ücret dilimleri | **KARAR:** domain.md önerisi kabul. Dilimler taşıyıcı bazlı parametre, varsayılan değerler placeholder. |
| 6 | "Q" = Amazon Q Business (plan) / Amazon Quick (ekip) | Kendi sohbet arayüzümüz + AgentCore birincil. Quick/Q ek kanal, sonra. |
| 7 | Hackathon servisleri | Konsolda tümü listeli. Erişim CLI ile doğrulandı (25.11.2026): CloudFormation, Lambda, S3, Cognito, DSQL, DynamoDB, API Gateway, CloudFront, ECR, IAM, AgentCore (control), Bedrock, Bedrock KB, EventBridge, SQS, CDK bootstrap v34 hazır. **Amazon Q Business: AccessDenied** (kullanılamaz). Çalışan model: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`. |
| 8 | Mikro toplama / toplama | Müşteri yönetir; sistemde yok. Entegrasyon noktası ileride. |
| 9 | Koli / paletlenmemiş yük | **KARAR (A):** Müşteri kolilerini kendi paletler. Sistem koli beyanından tahmini palet sayısı gösterir; kapasite, fiyat ve depo kabulü yalnız palet. Depo koli kabul etmez. Şema ambalaj tipi/palet eşdeğeri alanlarını taşır, taşıyıcı bazlı koli kabulü ileride eklenebilir. |
| 10 | Ana veri sahipliği | Tesis/araç/araç tipi taşıyıcıya özel; ambalaj ve ürün sınıfı platform kataloğu + taşıyıcıya özel eklemeler. Seed verisi kurgusaldır. |
| 11 | Asistanla yazma işlemleri | **KARAR:** Asistan elle yapılan işleri yapar. Teyit kodda zorunlu (writes.py `_gate`): önceki turda önizlenmiş aynı işlem + bu turdaki açık teyit; Idempotency-Key oturum+işlemden türetilir; kart bilgisi sohbette istenmez (simüle kayıtlı kart). Yönlendirme rol bazlı kodla, uzman ajan sohbet geçmişini taşır. |
