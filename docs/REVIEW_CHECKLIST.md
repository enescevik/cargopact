# CargoPact – Sunum Öncesi İnceleme Listesi

Hazırlanma anı: git `5142983` civarı. Başka ekipler backend, web, mobil ve ajan işlerini bitiriyordu; bu yüzden uç nokta durumları büyük ölçüde **doğrulanacak**. Sunumdan 30 dk önce bu listeyi baştan sona geç, "Durum" sütununu güncelle.

Durum değerleri: **hazır** (repoda kanıtı var) · **kısmen** · **yok** · **doğrulanacak** (ben doğrulayamadım / başkaları bitiriyor).

Ortak değişkenler: `API=https://765h182ijf.execute-api.us-east-1.amazonaws.com`. Token almak için aşağıdaki §Token.

## 1. Plan §8 geçme kriterleri

| # | Kriter (özet) | Durum | Nasıl doğrulanır |
|---|---|---|---|
| 1 | Planlamacı yetkili seferi yayımlar; "Aracım var, yük ekle" ekranı aday yükü ve ret sebebini gösterir; araç değişiminde talepler yeniden değerlendirilir | doğrulanacak (web/mobil ekranı); araç değişiminde yeniden değerlendirme muhtemelen **yok** | Dinçer web hesabıyla "Aracım var, yük ekle" → sefer oluştur ve yayımla (`POST /carrier/trips`). Bekleyen talepte `eligibility.reasons` görünüyor mu? Araç değiştirme akışı demo kapsamında değilse sunumda iddia etme. |
| 2 | Müşteri web ve mobilde sefer bulur, kg/m³ ile teklif alır, ayırır, kendi rezervasyonunu izler; başka firmanın kaydını göremez | doğrulanacak | Web müşteri ve mobil müşteriyle: `GET /customer/trips`, `POST /customer/trips/{id}/quote`, `POST /customer/reservations`, `GET /customer/reservations`. Kiracı sızıntısı: Başkent token'ıyla Marmara rezervasyon id'si → 404 beklenir. Ana veri tarafında kiracı izolasyonu `npm run smoke` (38/38, 25.11) ile hazır. |
| 3 | 3+2+3 üç firma tek seferde; aşırı ağırlık ve yetersiz hacim kapasiteyi değiştirmez; son yer için iki eşzamanlı istekte biri kazanır; süresi dolan blokaj bir kez serbest kalır | kısmen. Eşzamanlı kazanan: **hazır** (DSQL entegrasyon testi, 6 istek → 1 kazanan). Domain birim testi `demo-flow.test.ts` (12 test) geçiyor. Uçtan uca API: doğrulanacak. Blokaj süre aşımı işi: doğrulanacak | `npm run test:integration` (`DSQL_TEST_ENDPOINT` ile). Demo: DEMO_SCRIPT §2–§4. Reddedilen Başkent isteğinden sonra panoda planlanan 30/33 kalıyor mu? Süre aşımı: kısa süreli blokaj + zamanlayıcı/mutabakat işinin varlığı doğrulanacak. |
| 4 | Onaylı fiyat sonradan değişmez; T−3 ve T−1 ekranda ve backend'de aynı; sınırlar dahil (18:00 kalkış → 15:00 rezervasyon, 17:00 kabul işlenir, sonrası engellenir) | kısmen. Kesim hesabı `packages/domain` birim testinde: hazır. Ekran/API: doğrulanacak | `GET /customer/trips` yanıtında `bookingCutoffAt` = kalkış −3 sa, `intakeCutoffAt` = kalkış −1 sa mı? Web, mobil ve sohbet aynı değeri gösteriyor mu? Bugünkü (Adana) sefer için T−3 geçmişse `BOOKING_CUTOFF_PASSED` dönüyor mu? |
| 5 | QR/barkodla bırakma ve teslim ayrı olaylar; fark, kısmi kabul, no-show, yetkisiz alıcı test edilir; mobil eşitleme tekrarında tek olay | doğrulanacak (depo ekranı, e-POD, çevrimdışı kuyruk büyük olasılıkla kısmen/yok) | `POST /carrier/reservations/{id}/events` ile DEPO_KABUL → YUKLENDI → VARISTA → TESLIM; aynı olayı aynı `Idempotency-Key` ile tekrar gönder, tek olay kalmalı. Kamera okutma ve çevrimdışı kuyruk sunumda iddia edilmeyecekse söyleme. |
| 6 | Pilot depo randevu limiti; araç kapasitesi ve depo zamanı ayrı doğrulanır; pilot panosu | yok (pilot kapsamı; MVP dışı) | Sunumda "pilot aşaması" olarak anlat. Yönetim panosu: `GET /carrier/dashboard` (doğrulanacak). |
| 7 | Gelmeme kaydı olan firma uygun, kaydı olmayan eşdeğer taleplerin altında sıralanır; sohbet gerekçeyi olay tarihi ve sipariş referansıyla açıklar; zamanında gelen / taşıyıcı kaynaklı iptal gelmeme sayılmaz | doğrulanacak | Seed'de bir firmada doğrulanmış gelmeme kaydı var mı? `GET /carrier/trips/{id}` → `reservations[].priorityRank` ve `verifiedNoShows`. Sohbet: "Bu firmanın yükünü getirmediği oldu mu?" Yanıtta tarih ve sipariş referansı çıkıyor mu? Taşıyıcıya özel Knowledge Base kurulu mu? (doğrulanacak, yoksa `carrier_rules` aracı) |
| 8 | Tek sipariş numarası, tekrar denemede aynı; Q, web ve mobil aynı izleme; müşteri başka firmanın siparişini/gelmeme geçmişini göremez | doğrulanacak. Q: **yok** (bu hesapta Amazon Q Business `AccessDenied`; kendi sohbet arayüzü kullanılıyor) | Aynı `decision` isteğini aynı anahtarla iki kez gönder: aynı `CP-2026-…`. `GET /customer/orders/{no}/tracking` başka firma token'ıyla → 404. |
| 9 | Jüri panosu: planlanan ve fiili ayrı; 8.800 TL ve 7.200 TL örnek değerleri hesap yöntemiyle; Q/AgentCore kanıtı korelasyon kimliğiyle eşleşir; gelmeme önceliği ayrı test kaydıyla | doğrulanacak. Tutar riski: seed'li plan fiyatları (1.250/1.100/950) ile formül fiyatı (taban 1.100) farklı olabilir | `GET /carrier/dashboard` → `grossRevenueMinor`, `variableCostMinor`, `contributionMinor`, `costPerPalletMinor: 20000`. Beklenen: 880000 / 160000 / 720000 (8 palet × 200 TL = 1.600 TL). Farklıysa sunumda "formülle üretilen tutar" diye açıkla. Korelasyon kimliği: hata gövdesinde `correlationId`, CloudWatch'ta aranabilir. |
| 10 | Teslimler: rol/ekran matrisi, tıklanabilir prototip, kaynak repo, OpenAPI ve MCP şemaları, IaC, örnek veri, test çıktıları, dağıtım kılavuzu | kısmen. Kaynak repo, OpenAPI (`packages/contracts/openapi.json`, 33 yol), CDK (`infra/`), örnek veri (seed L1), testler, README: hazır. MCP şeması: yok (AgentCore Gateway kullanılmadı, ajan araçları doğrudan iş API'sini çağırıyor). Tıklanabilir prototip: web/mobil uygulamanın kendisi | `ls packages/contracts/openapi.json infra/lib`; `npm test`; `npm run typecheck`; README yenilendi mi? |

## 2. Altyapı ve canlı ortam

| Madde | Durum | Doğrulama |
|---|---|---|
| Web açılıyor | hazır (HTTP 200, hazırlık anında) | `curl -I https://d1xysc2r88pheq.cloudfront.net` |
| Mobil web `/m/` açılıyor | hazır (HTTP 200, hazırlık anında) | `curl -I https://d1xysc2r88pheq.cloudfront.net/m/` |
| API sağlık | hazır (200) | `curl $API/health` |
| Yeni web/mobil derlemesi CloudFront'ta mı (önbellek) | doğrulanacak | Sunumdan önce son `npm run build:web`, mobil export ve `npm run deploy`; tarayıcıda sert yenile. |
| Seed L1 (9 kiracı, 12 tesis, 10 araç, 14 kullanıcı) | hazır (25.11, `seed:verify` 9/9) | `npm run seed:verify -w @cargopact/db` |
| Demo seferi ve rezervasyon verisi (25/33 başlangıç) | doğrulanacak | `GET /carrier/dashboard` |
| AgentCore Runtime yayında; `/chat` yanıt veriyor | doğrulanacak | Müşteri token'ıyla `POST $API/chat` `{"message":"Merhaba"}` → `reply`. 503 "Agent runtime henüz yapılandırılmadı" ise Runtime yok (`-c agentImageTag=…` ile deploy). |
| Bedrock modeli erişilebilir | hazır (CLI, 25.11): `us.anthropic.claude-sonnet-4-5-20250929-v1:0`; uzmanlar varsayılan olarak Haiku 4.5 kullanıyor, erişim doğrulanacak | Sohbet bir kez çalışırsa kanıtlanır. |
| CI yeşil | doğrulanacak | GitHub Actions son çalıştırma. |

### Token (komut satırı doğrulaması için)

```bash
cd /workshop && set -a && . ./.env.seed && set +a
TOKEN=$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH \
  --client-id "$USER_POOL_CLIENT_ID" \
  --auth-parameters USERNAME=web.musteri@cargopact.example.test,PASSWORD="$SEED_USER_PASSWORD" \
  --query AuthenticationResult.IdToken --output text)
curl -s -H "Authorization: Bearer $TOKEN" $API_URL/me
```

## 3. Güvenlik hızlı kontrolü

Hazırlık anında yapılan tarama (`git grep`, takip edilen dosyalar):

| Kontrol | Sonuç |
|---|---|
| AWS erişim anahtarı (`AKIA…`, `ASIA…`), `aws_secret_access_key`, özel anahtar bloğu, GitHub token (`ghp_…`) | **Bulunmadı** |
| `.env.seed` repoda mı | **Hayır.** `.gitignore` içinde `.env.*` var, `git log --all -- .env.seed` boş. Yalnız `.env.example` (değerler boş) takipte. |
| Demo parolası `Cargopact2026!` | **Repoda var, bilerek:** `apps/web/src/App.tsx` (`DEMO_PASSWORD`), `apps/mobile/src/Login.tsx` (hızlı doldurma düğmeleri), `docs/DEMO_API.md`. Bunlar kurgusal `*.example.test` hesapları. Sunumdan sonra hesapları kapat/parolayı değiştir. İstemci derlemesine gömüldüğü için herkese açık kabul edilmeli. |
| MCP | `.kiro/settings/mcp.json` token'ı ortam değişkeninden okuyor (`${GITHUB_TOKEN}`), sabit değer yok. |
| `USER_PASSWORD_AUTH` | **Açık** (`infra/lib/auth-stack.ts`, seed/smoke ve demo hızlı girişi için). Üretimde kapatılmalı (PROGRESS "Bilinen eksikler"). |
| `selfSignUpEnabled` | **Açık.** Yeni müşteri firmaları `pending` olur ve sefer listesine erişemez (tasarım). Sunumda bahsetme gereği yok; sorulursa söyle. |
| CORS | `allowOrigins: ["*"]` (`infra/lib/api-stack.ts`). Kimlik doğrulama Bearer token ile olduğu için çerez riski yok; üretimde web alan adına daralt. |
| IAM | İş API'si Lambda rolü yalnız `dsql:DbConnect` (DSQL cluster ARN). Chat Lambda yalnız `bedrock-agentcore:InvokeAgentRuntime`. |
| S3 | Site ve uploads bucket'ları `BLOCK_ALL`, SSL zorunlu; erişim OAC / presigned URL. |
| Log'da token | Chat Lambda ID token'ı loglamıyor (yalnız hata adı). `http.test.ts` log sansürünü test ediyor (`password=…` örneği). |
| DSQL | `deletionProtectionEnabled: true`. |
| Demo verisi | Kurgusal: firmalar, adresler, tutarlar. 8.800 / 7.200 TL "kurgusal demo değeri" olarak etiketlenmeli. |

Sunumdan hemen önce tekrar çalıştırılacak komutlar:

```bash
cd /workshop
git grep -n -E "AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|aws_secret_access_key|BEGIN (RSA |EC )?PRIVATE KEY|ghp_[A-Za-z0-9]{20}"
git grep -n "Cargopact2026"
git ls-files | grep -E "\.env"
```

## 4. Prova listesi

- [ ] **Hesaplar, web:** `web.yonetici@…` ve `web.musteri@…` giriş yapıyor; doğru ekran açılıyor (`/me` → rol).
- [ ] **Hesaplar, mobil `/m/`:** `mobil.musteri@…` ve `mobil.yonetici@…` giriş yapıyor. Telefonda ve dar tarayıcı penceresinde denendi.
- [ ] **Başkent:** `user@baskent.example.test` giriş yapıyor (yedek hesap).
- [ ] **Sıfırlama:** `cd /workshop && set -a && . ./.env.seed && set +a && npm run seed -w @cargopact/db` çalışıyor; sonra pano 25/33.
- [ ] **Tam akış bir kez geçildi:** 25 → 28 → 30 → ret → 33 → fiili 33. Her adımın süresi not edildi (toplam ≈7 dk).
- [ ] **Sıfırlama sonrası ikinci geçiş** da çalışıyor (veri tekrar kullanılabilir).
- [ ] **Sohbet:** dört soru önceden soruldu (ısınma). Yanıt süresi < 15 sn.
- [ ] **Kart:** kabul edilen test kartı ve reddedilen `4000000000000002` denendi.
- [ ] **Ağ:** sunum salonunda Wi-Fi + yedek olarak telefondan hotspot. VPN kapalı. CloudFront ve API erişimi ayrı ayrı denendi.
- [ ] **Saat:** demo seferi "yarın 18:00". Sunum günü seed yenilendi mi (T−3 sınırı geçmedi)?
- [ ] **Tarayıcı:** açık sekmeler, kayıtlı parola istemi kapalı, yakınlaştırma %110–125, bildirimler kapalı.
- [ ] **Yedek video:** tüm demo akışının 2–3 dk ekran kaydı hazır, yerel diskte ve ikinci cihazda. Ayrıca 7 ekran görüntüsü (25/33, 28/33, 30/33, ret gerekçesi, 33/33 planlanan, fiili 33/33, sohbet yanıtı).
- [ ] **Slaytlar:** `docs/PRESENTATION.md` sunum aracına aktarıldı; test sayıları güncel çıktıyla değiştirildi.
- [ ] **Rol dağılımı:** kim konuşuyor, kim ekranı yönetiyor, süre tutucu kim.
