# CargoPact – Genel Bakış

## Amaç
Taşıyıcıların (Dinçer Lojistik, Siva vb.) planlı depo-depo transferlerinde boş kalan palet alanını yayınlaması, müşterilerin kendi rotasına uygun araçta yer için sabit (dinamik hesaplanan) fiyatla rezervasyon talep etmesi ve taşıyıcının onayıyla yükün birleştirilerek taşınmasıdır.

## Akış
1. Taşıyıcı seferi ve satışa açık kapasiteyi (palet/kg/m³) yayınlar ("Aracım var, yük ekle").
2. Müşteri yükünü beyan eder, fiyat önizler, teklifi kabul eder → süreli blokaj.
3. Taşıyıcı talebi onaylar → kesin rezervasyon + sipariş numarası (CP-YYYY-NNNNNN). Ödeme planı devreye girer.
4. Müşteri yükü çıkış transfer merkezine getirir (T−1'e kadar). Depo kabul, ölçüm, QR/barkod, yükleme.
5. Araç varış dağıtım merkezine taşır. Müşteri/yetkili alıcı depodan teslim alır (palet bazlı e-POD).
6. İptal, ret, no-show, hasar senaryoları iade/ücret kurallarıyla işlenir.

Mikro toplama ve toplama müşteri sorumluluğundadır (kapsam dışı, ileride entegrasyon).

## Roller
Müşteri, taşıyıcı planlamacı, taşıyıcı depo personeli, yönetim/jüri.

## Mimari (özet)
- İstemciler: React + Vite (web), Expo/React Native (mobil), ortak tipler `packages/shared`.
- Kimlik: Cognito. API: API Gateway HTTP API + Lambda (TS). Veri: Aurora DSQL. Dosya: S3 (özel).
- Ajanlar: Strands + AgentCore Runtime (orkestratör + uzmanlar), AgentCore Memory, taşıyıcıya özel Bedrock Knowledge Base.
- Sohbet: kendi React sohbet arayüzü → `/chat` → AgentCore. (Amazon Q Business bu hesapta kullanılamıyor.)
- IaC: CDK (TypeScript), us-east-1. CI: GitHub Actions.

## Çalışma yöntemi
Spec-driven: her özellik `.kiro/specs/<özellik>/` altında requirements → design → tasks sırasıyla ilerler, onaydan sonra uygulanır.
