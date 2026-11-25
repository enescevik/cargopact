# CargoPact – Hackathon Sunumu

Toplam süre önerisi: 3 dk slayt + 7 dk canlı demo (`docs/DEMO_SCRIPT.md`) + 2 dk mühendislik/Kiro + soru-cevap. Her slaytta 3–5 madde ve konuşmacı notu vardır. Sayılar `docs/PROGRESS.md` ve `docs/PROJECT_PLAN.md` kaynaklıdır; "doğrulanacak" işaretli olanlar sunumdan önce güncel çıktıyla teyit edilmeli.

---

## Slayt 1: Problem

**Boş kalan palet alanı**
- Taşıyıcılar depo-depo transferlerini zaten yapıyor. Araçlarda palet pozisyonları boş gidiyor.
- Küçük nakliyeci ve ambar, aynı güzergâhta yer bulmak için telefon ve e-postayla pazarlık yapıyor.
- Taşıyıcı için "boş yer" tek başına satılabilir değil: ağırlık, ölçü, ürün uyumu ve kalkış saati kısıtları var.
- Sonuç: kapasite satılmıyor, iç transfer riske girmeden birleştirme yapılamıyor.

**Konuşmacı notu:** "Aynı araç Gebze'den Ankara'ya gidiyor, 33 pozisyonun 8'i boş. O 8 paleti kimin, ne zamana kadar, hangi kurallarla alabileceği bugün telefonla çözülüyor. CargoPact bunu tek kayıt sistemine taşıyor."

---

## Slayt 2: Çözüm

**CargoPact: planlı depo transferinde palet alanı yayınla, yükü birleştir, izle**
- Taşıyıcı "Aracım var, yük ekle" ile satışa açık palet/kg/m³ değerini yayınlar.
- Müşteri sefer arar, fiyatı görür, yer ayırır. Taşıyıcı onaylar, sipariş numarası (`CP-2026-000123`) üretilir.
- Müşteri yükünü çıkış transfer merkezine getirir, varış merkezinden kendisi veya yetkili alıcısı teslim alır.
- Web, mobil ve sohbet asistanı aynı backend'e bağlanır, aynı değerleri gösterir.

**Konuşmacı notu:** "Kapıdan alım, açık pazar ve ara durak kapsam dışı. Dar tuttuk: depo-depo, standart palet. Sistem kayıt sahibi olduğu alanlarda teklif, blokaj, onay, ödeme ve müşteri deneyimi; sefer TMS'te, depo hareketi WMS'te kalır."

---

## Slayt 3: Canlı demo

**Gebze → Ankara, 33 pozisyon, 25 iç palet**
- 25/33 → Marmara 3 palet → 28/33 → Anadolu 2 palet (mobil, kaporalı) → 30/33.
- Başkent 3 palet / 2.600 kg: ağırlık nedeniyle reddedilir (22.300 kg > 22.000 kg). Kapasite değişmez.
- Başkent 3 palet / 1.900 kg: onay, 33/33 planlanan. Depo olaylarıyla fiili 33/33.
- Sipariş numarasıyla takip ve asistan soruları (müşteri ve taşıyıcı).

**Konuşmacı notu:** Demoya geç. Süre 7 dk. Takılırsan `DEMO_SCRIPT.md` fallback'lerini uygula. Demo verileri kurgusaldır; ekranda "demo" işaretleri var.

---

## Slayt 4: Nasıl çalışıyor (iş kuralları)

**Roller ve zaman sınırları**
- **Roller:** müşteri, taşıyıcı planlamacı, depo personeli, yönetim/jüri. Kiracı kimliği JWT üyeliğinden gelir, istemciden alınmaz.
- **T = planlanan kalkış.** Yer ayırma ve kesin rezervasyon en geç **T−3 saat**; çıkış deposu fiziksel kabul **T−1 saat** (sınırlar dahil). Sunucu saatiyle doğrulanır.
- **Uygunluk:** palet + brüt kg + ölçü/yükseklik + m³ + ürün uyumu + zaman penceresi + iç yük rezervi. Boş pozisyon tek başına yetmez.
- **Dinamik fiyat:** `fiyat = taban(palet) × talepKatsayısı × zamanKatsayısı`, taşıyıcı bazlı `[taban×alt, taban×üst]` aralığına kırpılır. Talep arttıkça katsayı artar, kalkışa yaklaşıp kapasite doluysa düşüş uygulanmaz. Fiyat sunucuda hesaplanır, aynı girdi aynı fiyatı verir, hesap dökümü yanıtla gelir.
- **Öncelik / no-show:** doğrulanmış gelmeme kaydı olan firma uygun talepler arasında daha düşük önceliktedir, eşitlikte başvuru sırası. Zamanında iptal ve taşıyıcı kaynaklı aksama gelmeme sayılmaz. Müşteri başka firmanın geçmişini görmez.

**Konuşmacı notu:** Varsayılan fiyat politikası (placeholder): taban 1.100 TL/palet, alt %80, üst %150. Katsayılar taşıyıcı parametresidir, sabit kod değil.

---

## Slayt 5: Mimari

**Sunucusuz AWS, `us-east-1`**
- **İstemci ve dağıtım:** React + Vite web, Expo mobil (`/m/`), S3 (özel bucket) + CloudFront.
- **Kimlik ve API:** Amazon Cognito (JWT) → API Gateway HTTP API (JWT authorizer) → AWS Lambda (Node.js 22, TypeScript, esbuild).
- **Veri:** Aurora DSQL (PG16 uyumlu, IAM token, parola yok). Dosyalar için S3, presigned URL.
- **Yapay zeka:** Amazon Bedrock (Claude) + Bedrock AgentCore Runtime ve Memory, Strands Agents ile çoklu ajan (orkestratör + müşteri/taşıyıcı uzmanı), ajan imajı ECR'da.
- **Altyapı ve teslim:** AWS CDK (TypeScript), GitHub Actions (CI + OIDC ile deploy).

**Konuşmacı notu:** Diyagram: `docs/ARCHITECTURE.md` (a). Sohbet yolu: web/mobil → API Gateway → chat Lambda → AgentCore Runtime → Strands ajanları → iş API'si, kullanıcının kendi token'ıyla. Ajan yazma yapmaz; yetki ve kiracı kontrolü backend'de kalır. Not: AgentCore Runtime'ın canlı durumu doğrulanacak.

---

## Slayt 6: Mühendislik kalitesi

**Doğrulanmış, ölçülmüş**
- **Çift rezervasyon engeli:** DSQL snapshot isolation altında her değişmez tek bir sıcak satırla korunur (`trip_capacity`). Gerçek DSQL'de entegrasyon testi: 6 eşzamanlı istek → 1 kazanan (diğerleri `40001` → yeniden dene).
- **Idempotency:** yazma uçları `Idempotency-Key` ister. Aynı istek tek mutasyon, farklı gövde 422. Sipariş numarası tekrarda aynı döner.
- **Kiracı izolasyonu:** `tenantId` JWT üyeliğinden türer; repository'ler kiracı parametresini zorunlu alır. Smoke testi kiracı sızıntısı ve rol 403'lerini kontrol eder.
- **Sözleşme testleri:** OpenAPI 3 belgesi zod şemalarından üretilir (33 yol, 25.11.2026). Testler: belge güncel mi, tüm yazma uçları `Idempotency-Key` istiyor mu, yönlendirici ile belge birebir mi. Canlı yanıtlar şemaya karşı doğrulanır (32/32).
- **Test sayıları** (`docs/PROGRESS.md`, 25.11.2026; sunumdan önce güncel çıktıyla doğrulanacak): `smoke-master-data` 38/38, birim 21, DSQL entegrasyon 4/4. Son yerel `npm test` çalıştırması: openapi 2, db 5, domain 20, api 9 test geçti.

**Konuşmacı notu:** "DSQL'de yabancı anahtar var ama trigger, dizi kolonu ve SERIAL yok, indeks yalnız ASYNC, bir işlemde tek DDL. Bunları gerçek cluster'da denedik ve steering dosyasına yazdık. Böylece her ajan ve geliştirici aynı doğrulanmış bilgiyle çalıştı."

---

## Slayt 7: Kiro ile geliştirme

**Bağlamı yönet, işi paralelleştir**
- **Steering bilgi tabanı:** `.kiro/steering/` altında ürün, alan kuralları, teknik yığın, dizin yapısı ve açık kararlar. Her oturumda yüklenir; doğrulanmış DSQL davranışları ve zaman sınırları (T−3 / T−1) burada.
- **Spec-driven akış:** her özellik `.kiro/specs/<ad>/` altında requirements (EARS) → design → tasks; her aşama onay ister. Yedi spec: platform-foundation, master-data-and-seed, capacity-and-pricing, reservation-and-approval, payments-and-cancellation, warehouse-and-tracking, agents-and-chat.
- **Paralel alt ajanlar:** backend, web, mobil ve AI ajanları eşzamanlı yazıldı; ortak sözleşme `docs/DEMO_API.md` ve `packages/contracts`.
- **Karar kaydı:** `decisions.md` plandan sapmaları (DSQL, çoklu taşıyıcı, dinamik fiyat, simüle ödeme) açıkça tutar.

**Konuşmacı notu:** Spec durumu için `docs/PROGRESS.md` tablosuna bak: platform-foundation ve master-data-and-seed uygulandı; diğerlerinin uygulama durumunu sunumdan önce güncelle (doğrulanacak).

---

## Slayt 8: İş etkisi (kurgusal demo değerleri)

**Aynı araç, üç firma**
- **Kurgusal örnek:** 3 + 2 + 3 = 8 dış palet, 33/33 doluluk, 21.600 kg toplam.
- **Brüt rezervasyon tutarı: 8.800 TL** (Marmara 3.750 TL, Anadolu 2.200 TL, Başkent 2.850 TL).
- **Ek katkı: 7.200 TL**, palet başına 200 TL örnek değişken gider düşülünce. Ek yakıt ve diğer gerçekleşen maliyetler hariç.
- Ölçütler: satışa açılan pozisyonun yüklenen oranı, iç transfer rezerv ihlali (hedef 0), çift rezervasyon (hedef 0), no-show.

**Konuşmacı notu:** "Bu rakamlar kurgusal demo değerleridir, pilot parametresi değildir." Not: canlı demoda formülle üretilen fiyatlar bu tutardan farklı olabilir; plan tutarları seed'deki sipariş kayıtlarıyla gösterilir (`capacity-and-pricing/design.md` §6). Ekrandaki sayıyı provada kontrol et.

---

## Slayt 9: Yol haritası

**Bu hackathon → pilot**
- **Amazon Q Business bu hesapta kullanılamıyor** (`AccessDenied`). Kendi sohbet arayüzümüz + AgentCore ile yürütüldü; Quick/Q sonradan ek kanal olarak bağlanabilir.
- **Sıradaki:** gerçek ödeme sağlayıcı (şimdi simüle `PaymentProvider` arayüzü arkasında), TMS sefer ve WMS palet olayı entegrasyonu, taşıyıcıya özel Bedrock Knowledge Base (gelmeme kuralları, firma özetleri).
- **Güvenlik sertleştirme:** demo için açık `USER_PASSWORD_AUTH` ve CORS `*` kapatılır/daraltılır.
- **Pilot:** tek koridor, gerçek depo çifti, KPI bazları (zamanında kalkış, kabul süresi, net katkı).

**Konuşmacı notu:** Açık kararlar `.kiro/steering/decisions.md` içinde. Koli kabulü bu sürümde yok: müşteri kolilerini kendi paletler.

---

## Slayt 10: Teşekkürler / Sorular

- Canlı adresler: web `https://d1xysc2r88pheq.cloudfront.net`, mobil `https://d1xysc2r88pheq.cloudfront.net/m/`.
- Kaynak: GitHub deposu (README, `docs/`, `.kiro/`).
- Jüri soruları için yedek: `docs/ARCHITECTURE.md`, `docs/REVIEW_CHECKLIST.md`.

**Konuşmacı notu:** Muhtemel sorular: (1) Çift rezervasyon nasıl engelleniyor → slayt 6 + sıra diyagramı. (2) Ajan yanlış veri uydurursa → araç çıktısı veridir, yazma yetkisi yok, hata olursa dürüstçe bildirir. (3) Gerçek ödeme → yol haritası. (4) Neden DSQL → çok bölgeli, sunucusuz, PG uyumlu; kısıtlarını denedik.
