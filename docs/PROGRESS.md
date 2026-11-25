# İlerleme (son güncelleme: 25.11.2026)

## Tamamlandı
- [x] Monorepo iskeleti: web (Vite), mobil (Expo), shared, API Lambda, agents (Strands), CDK (Auth, Data, Agents, Api, Web), CI.
- [x] Kiro knowledge base: steering (product, domain, tech, structure, decisions).
- [x] AWS erişimi doğrulandı (CLI). Çalışan Bedrock modeli: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`. Amazon Q Business erişilemiyor.
- [x] Karar: sabit fiyat + dinamik hesaplama; simüle ödeme sağlayıcı; iptal politikası önerisi kabul.
- [x] Plan `docs/` altına alındı, spec yapısı kuruldu (requirements taslakları).

## Sürüyor
- [x] Altı spec'in requirements onayı alındı
- [x] master-data-and-seed requirements onayı (koli kararı A işlendi)
- [x] platform-foundation + master-data-and-seed design yazıldı (DSQL davranışları gerçek cluster'da doğrulandı, geçici cluster silindi)
- [x] design + tasks onayı
- [x] platform-foundation ve master-data-and-seed uygulandı ve AWS'ye deploy edildi (ayrıntı aşağıda)

## Spec durumu
| Spec | Requirements | Design | Tasks | Uygulama |
|---|---|---|---|---|
| platform-foundation | onaylı | onaylı | onaylı | **tamam** |
| capacity-and-pricing | onaylı | taslak | taslak | – |
| reservation-and-approval | onaylı | – | – | – |
| payments-and-cancellation | onaylı | – | – | – |
| warehouse-and-tracking | onaylı | – | – | – |
| master-data-and-seed | onaylı | onaylı | onaylı | **L1 tamam** (L2–L4 diğer spec'lerle) |
| agents-and-chat | onaylı | – | – | – |

## AWS ortamı (dev, us-east-1)
| Kaynak | Değer |
|---|---|
| API | https://765h182ijf.execute-api.us-east-1.amazonaws.com |
| DSQL cluster | `3vuiixlcyn63vwyzuab6cfz3y4` (CargoPact-Data stack'i) |
| Cognito User Pool / Client | `us-east-1_6KUOjpqWj` / `72hnkn87h160or9j2ilo8f8dhl` |
| Lambda DB rolü | IAM `cargopact-api-lambda` ↔ DSQL `cargopact_app` |

Deploy edilen stack'ler: CargoPact-Auth, -Data, -Api, -Agents (ECR + Memory, Runtime yok), -Web.

## Doğrulama (25.11.2026)
- 21 migrasyon uygulandı, tekrar çalıştırmada 0 (idempotent); 8 async indeks geçerli.
- Seed L1: 9 kiracı (platform + 2 taşıyıcı + 6 müşteri), 12 tesis, 10 araç, 14 Cognito kullanıcısı. `seed:verify` 9/9 geçti; ikinci seed çalıştırmasında satır sayıları değişmedi.
- Uçtan uca kontrol (`scripts/smoke-master-data.mjs`): 38/38 geçti — kiracı izolasyonu, rol 403'leri, onaysız firma kısıtı, idempotency tekrarı/422, sürüm çakışması 409, tekillik 409, pasife alma, sayfalama, koli→palet tahmini.
- Birim testleri: 21 (domain 8, db 5, api 8).
- Bulunan ve düzeltilen hata: sayfalama imleci zamanı milisaniyeye kırpıyordu, aynı işlemdeki kayıtlar ikinci sayfada tekrarlanıyordu.

## Açık kalanların kapatılması
- OpenAPI 3 belgesi zod şemalarından üretiliyor (`packages/contracts/openapi.json`, 33 yol). Birim testi: belge güncel mi, tüm yazma uçları `Idempotency-Key` istiyor mu, yönlendirici ile belge birebir mi.
- Canlı sözleşme kontrolü `npm run smoke` içinde: 32/32 yanıt şemaya uydu. Bulunan uyumsuzluk: token yokken 401'i API Gateway `{message}` gövdesiyle dönüyor (özelleştirilemez); belge buna göre güncellendi.
- DSQL entegrasyon testi (`npm run test:integration`, DSQL_TEST_ENDPOINT): FK, eşzamanlı 6 istekten 1 kazanan, 3000 satır sınırı, DDL+DML yasağı. 4/4 geçti, geçici tablolar silindi.
- Smoke kayıtları `npm run smoke` sonunda otomatik temizlenir (`cleanup:smoke`); önceki 5 tesis + 5 araç silindi.
- CI artık birim testlerini de çalıştırıyor.

## Bilinen eksikler
- Web ve mobil istemciler henüz ana veri ekranlarına bağlı değil.
- Cognito istemcisinde `USER_PASSWORD_AUTH` açık (smoke/seed için); üretimde kapatılmalı.

## Açık kararlar
`.kiro/steering/decisions.md` dosyasına bakın.
