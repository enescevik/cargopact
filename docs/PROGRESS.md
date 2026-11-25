# İlerleme (son güncelleme: 25.11.2026)
Kaynak: `.kiro/specs/*/tasks.md` (madde bazlı [x]/[ ]) ve git geçmişi. Spec'ler MVP hızı için sonradan belgelendi; design/tasks gerçekleşen koda göre yazıldı, sapmalar her design.md'nin son bölümünde.

## Spec durumu
| Spec | Requirements | Design | Tasks | Uygulama |
|---|---|---|---|---|
| platform-foundation | onaylı | onaylı | onaylı | **tamam**, dağıtıldı |
| master-data-and-seed | onaylı | onaylı | onaylı | **L1 tamam**; L2 (seferler/demo) `seed:demo` ile |
| capacity-and-pricing | onaylı | yazıldı | güncel | **çekirdek tamam**; `pricing_policies` ve kalıcı `quotes` yok (fiyat sefer satırında, teklif yazmaz) |
| reservation-and-approval | onaylı | yazıldı | güncel | **çekirdek tamam**; teklif süresi/sürümü, bildirim, planlamacı gerekçesi, zamanlanmış süre aşımı yok |
| payments-and-cancellation | onaylı | yazıldı | güncel | **simüle akış tamam** (provizyon→tahsilat, iade, iptal ücreti, defter); taşıyıcı bazlı plan/politika, hasar iadesi, mutabakat yok |
| warehouse-and-tracking | onaylı | yazıldı | güncel | **olay akışı + takip tamam**; ölçüm/fark, palet bazlı teslim, yetkili alıcı yok; e-POD ve entegrasyonlar devam ediyor |
| agents-and-chat | onaylı | yazıldı | güncel | **tamam** (salt okunur ajan, Runtime v5, carrier KB); Gateway/MCP, oran sınırı, ajan izi yok |

## Canlı ortam (dev, us-east-1)
| Kaynak | Değer |
|---|---|
| Web | https://d1xysc2r88pheq.cloudfront.net |
| Mobil (Expo web çıktısı) | https://d1xysc2r88pheq.cloudfront.net/m/ |
| API | https://765h182ijf.execute-api.us-east-1.amazonaws.com |
| Cognito User Pool / Client | `us-east-1_6KUOjpqWj` / `72hnkn87h160or9j2ilo8f8dhl` |
| DSQL cluster | `3vuiixlcyn63vwyzuab6cfz3y4` (rol IAM `cargopact-api-lambda` ↔ `cargopact_app`) |
| Ajan | AgentCore Runtime `cargopact_orchestrator`, imaj `agentImageTag` **v5**, Haiku 4.5; Memory `cargopact_memory` |
| Bilgi tabanı | Bedrock KB `ATCPKGCFWE` (S3 Vectors), Dinçer + Siva dokümanları (`docs/kb/README.md`) |
Stack'ler: CargoPact-Auth, -Data, -Api, -Agents, -Web. Demo hesapları ve sözleşme: `docs/DEMO_API.md` (parola `.env.seed` / DEMO_API). Sunum akışı: `docs/DEMO_SCRIPT.md`.

## Uygulananlar (özet)
- **Taban:** monorepo, Cognito JWT, DSQL (IAM, OCC yeniden deneme, idempotency, audit), ana veri CRUD, seed L1 (9 kiracı, 12 tesis, 10 araç, 14 kullanıcı), OpenAPI zod'dan (yönlendirici=belge testi).
- **Çekirdek iş akışı** (`routes/demo.ts`): sefer yayını ("Aracım var, yük ekle"), müşteri arama ve dinamik fiyat dökümü, teklif (yazmaz), blokaj (`trip_capacity` tek satır, taşma korumalı UPDATE), taşıyıcı onay/ret (sipariş no `CP-YYYY-NNNNNN`, palet kodları), öncelik (gelmeme sona), tembel süre aşımı, müşteri iptali + önizleme, sefer iptali, depo olayları (`DEPO_KABUL`→`YUKLENDI`→`VARISTA`→`TESLIM`, `EKSIK_HASAR`, `GELMEDI`), takip, taşıyıcı panosu (gelir/maliyet/katkı).
- **Ödeme (simüle):** talepte provizyon, onayda tahsilat (kapora %30 ise kalan depo kabulünde), iade/ücret/serbest bırakma yalnız-ekleme defterde; kart `4000000000000002` reddedilir.
- **İstemciler:** web (müşteri, taşıyıcı, pano, sohbet), mobil Expo (müşteri ve depo; QR üretimi, kamera okuyucu, çevrimdışı olay kuyruğu, e-POD ekranı – commit `0b13a02`), ikisi de `/chat`'e bağlı.
- **Ajanlar:** Strands orkestratör + müşteri/taşıyıcı uzmanı ("agents as tools"), araçlar çağıranın token'ıyla iş API'sini çağırır (salt okunur), AgentCore Memory, taşıyıcıya özel KB (`carrier_knowledge`, `carrierId` süzgeci).

## Doğrulama (doğrulanabilir sayılar)
- Birim testleri (`npm test`, 25.11.2026): **36/36** (contracts 2, db 5, domain 20, api 9).
- DSQL entegrasyon testi (`npm run test:integration`, `DSQL_TEST_ENDPOINT` gerekir): 4 test (FK, 6 eşzamanlı istekten 1 kazanan, 3000 satır, DDL+DML yasağı); önceki çalıştırmada 4/4 geçti.
- Ana veri uçtan uca (`scripts/smoke-master-data.mjs`): 38 kontrol, son kayıtlı sonuç 38/38.
- Jüri akışı (`scripts/smoke-demo.mjs`): 54 kontrol tanımlı (sefer arama, fiyat, blokaj, onay, uygunsuz talep, ödeme, depo olayları, takip, kiracı izolasyonu, ret, iptal, son palet yarışı, araç çakışması, sefer iptali, demo seed sıfırlama). Bu belge yazılırken yeniden çalıştırılmadı (paylaşılan canlı veriyi sıfırlar).
- Kapsam dışı testler: ajan davranışı için otomatik test yok (canlı sohbetle denendi); mobil çevrimdışı kuyruk için otomatik test yok.

## Bugün düzeltilenler
- Web beyaz ekran, React hata #527 (çift React kopyası): tek React 19.1.0'a sabitlendi (`792cc2b`).
- CORS preflight 401: proxy rotası `ANY` yerine açık yöntemlerle tanımlandı (`792cc2b`); API Gateway CORS yöntemleri GET/POST/PUT/PATCH.
- Sohbet 403: Lambda rolüne `bedrock-agentcore:InvokeAgentRuntimeForUser` eklendi; sohbet Runtime v4'e bağlandı (`a6f0450`), KB ile v5 (`61a33ca`).
- Ajan: İstanbul saati dönüşümü ve ilçe duyarlı sefer arama (`eefff2f`); web sohbet hata mesajları (`fb235d0`).

## Devam ediyor (paralel ajanlar; son durum için git log'a bakın)
| İş | Durum |
|---|---|
| e-POD (`pod-upload-url`, `TESLIM` alıcı adı + dosya doğrulama, `reservation_attachments`) | **devam ediyor** – backend çalışma ağacında, mobil ekran commit'te (`0b13a02`); API commit/dağıtımı bekliyor |
| Sefer düzenleme + bekleyen talepleri yeniden değerlendirme (`PUT /carrier/trips/{id}`, `needs_review`) | **devam ediyor** – kod çalışma ağacında; web taşıyıcı ekranı değişiyor |
| Mobil QR okutma + çevrimdışı kuyruk | commit'te (`0b13a02`); otomatik test yok |
| Taşıyıcıya özel KB | **tamam** (`9b23d22`, `61a33ca`) |
| EventBridge olay yayını, TMS sefer, WMS palet olayı entegrasyonları | **devam ediyor** – kod çalışma ağacında (`routes/integrations.ts`, `lib/events.ts`, migrasyon 0060–0062); CDK bus/kural/worker dağıtımı bekliyor |

## Kalan eksikler
- **Ödeme:** taşıyıcı bazlı ödeme planı ve iptal politikası (siparişe sabitleme), `PaymentProvider` arayüzü, `ODEME_BEKLIYOR`, yeniden planlama akışı, palet bazlı hasar iadesi, mutabakat işi.
- **Rezervasyon:** kalıcı teklif (`quotes`), teklif süresi/sürüm kontrolü, müşteri bildirimi, planlamacı seçim gerekçesi, gelmeme sayılmayan nedenlerin kodları, zamanlanmış süre aşımı.
- **Depo:** ölçüm/beyan farkı ve uygunluk yeniden çalışması, palet tablosu/SSCC, yetkili alıcı doğrulaması, kısmi teslim, istisna kayıtları, canlı konum.
- **Ajan:** Gateway/MCP, oran sınırı, correlationId/araç izi, yazma işlemleri (kasıtlı salt okunur), çapraz kiracı ve enjeksiyon testleri.
- **Fiyat:** `pricing_policies` (taşıyıcı bazlı basamaklar) tablosu ve CRUD.
- **Güvenlik/operasyon:** Cognito'da `USER_PASSWORD_AUTH` açık (smoke/seed; üretimde kapatılmalı); Amazon Q Business erişilemez (kapsam dışı).

## Açık kararlar
`.kiro/steering/decisions.md` dosyasına bakın.
