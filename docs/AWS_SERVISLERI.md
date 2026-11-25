# CargoPact · AWS servisleri

25 Kasım 2026 · AWS demo ortamı `us-east-1` · Repo `81ebd14` · CDK ajan imaj etiketi `assist-1`

| Servis | CargoPact’te ne için kullanıyoruz? |
|---|---|
| Amazon CloudFront | Web uygulamasını ve Expo’nun `/m/` mobil web çıktısını dağıtır. |
| Amazon S3 | Ayrı bucket’larda uygulama dosyalarını ve fotoğraf/imza gibi teslimat kanıtlarını (e-POD) saklar. Kanıtlara süreli bağlantıyla erişilir. |
| Amazon Cognito | Kullanıcı girişini yönetir ve API çağrılarında kullanılan kimlik belirtecini üretir. Firma ve rol yetkisi iş API’sinde kontrol edilir. |
| Amazon API Gateway | Ürün HTTP API’sidir. Web, mobil ve ajan çağrılarını alır. Korumalı uçlarda Cognito JWT’sini doğrular. |
| AWS Lambda · BusinessApi | Sefer, uygunluk, fiyat, rezervasyon, onay ve takip kurallarını yürütür. Formdan veya teyitli sohbetten gelen işlemlerde rolü, firmayı ve iş kurallarını yeniden denetler. |
| AWS Lambda · Chat, Tools, Health | `Chat`, oturum ve `correlationId` ile Runtime’ı çağırır. `Tools`, AgentCore Gateway’deki GET araçlarını çağıranın JWT’siyle iş API’sine iletir. `Health`, sağlık kontrolünü yanıtlar. |
| Amazon Aurora DSQL | Sefer, kapasite, rezervasyon, bildirim ve denetim kayıtlarını tutar. Kapasite kontrolü ve rezervasyon kaydı aynı işlemde yapılır. |
| Amazon Bedrock | Claude Haiku 4.5 ile kullanıcı isteğini yorumlar, Strands araçlarını seçer ve sonucu açıklar. Sonraki turdaki teyit kontrolünü model değil uygulama kodu yapar. |
| Amazon Bedrock AgentCore Runtime | Strands tabanlı asistanı çalıştırır. `/me` sonucuna göre müşteri veya taşıyıcı uzmanını seçer. Yazılacak işlem önce önizlenir. Geçerli teyitte Runtime MCP’ye uğramadan iş API’sine gider. |
| Amazon Bedrock AgentCore Gateway | Cognito JWT’siyle korunan MCP geçididir. Sekiz GET aracı kayıtlıdır. Gateway, Tools Lambda’yı IAM rolüyle çağırır. Yazma işlemleri bu geçitten yapılmaz. |
| Amazon Bedrock AgentCore Memory | Runtime’ın sohbet geçmişini geri yüklemesine yardımcı olur. Bekleyen işlem teyidi ayrı olarak Runtime belleğindedir. Rezervasyon ve kapasite DSQL’dedir. |
| Amazon Bedrock Knowledge Bases + Amazon S3 Vectors | Taşıyıcıya ait iş kurallarını firma filtresiyle arar. Güncel sefer ve rezervasyon bilgisi bilgi tabanından değil, iş API’sinden gelir. |
| Amazon ECR | AgentCore Runtime’da çalışan ajan konteyner imajını saklar. |
| AWS IAM | Lambda, AgentCore, DSQL ve S3 arasındaki servis erişimlerini rollerle sınırlar. Son kullanıcı kimliğini Cognito yönetir. |
| AWS CDK | AWS altyapısını kod olarak tanımlar ve dağıtır. |
| Amazon CloudWatch Logs | Lambda logları ve ajan tanılama kayıtları için kullanılır. İş API’sindeki ajan iz kayıtları `correlationId` ile sorgulanabilir. |

**Entegrasyon katmanı — kodda var, canlı doğrulaması açık.** Zamanlanmış **AWS Lambda** işçisi, Aurora DSQL’deki yeni denetim kayıtlarını (`audit_log`) okur ve **Amazon EventBridge** üzerinden yayınlar. **Amazon SQS**, WMS/ERP aboneleri için olayları kuyrukta tutar. Başarısız teslimler veya tekrarlanan işleme hataları için ayrı hata kuyruğu (DLQ) tanımlıdır. [Entegrasyon ayrıntıları](INTEGRATIONS.md)

**Teyitli işlemler.** Müşteri rezervasyon talebi, iptal ve yetkili alıcı güncellemesini sohbet üzerinden başlatabilir. Yetkili taşıyıcı onay/ret, depo olayı, sefer açma ve istisna kapatma işlemlerini yapabilir. İlk turda iş işlemi uygulanmaz. Sonraki turda aynı oturum ve aynı işlem için açık teyit gerekir. Asistan yazma isteğine işlem anahtarı ekler. Müşterinin teyidi taşıyıcının onayının yerine geçmez.

**Demo sınırı.** Ödeme simüledir ve kart bilgisi sohbette istenmez. Amazon Q Business ve AWS Supply Chain demo mimarisine dahil değildir. `81ebd14` commit mesajı `smoke-assistant` sonucunu 12/12 olarak bildiriyor. Bu güncellemede canlı AWS ve TMS/WMS akışları yeniden sınanmadı.

[Draw.io çizimi](CargoPact_AWS_Mimarisi.drawio) · [Teknik mimari](ARCHITECTURE.md) · [Son durum](PROGRESS.md)
