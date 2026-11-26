# CargoPact Agentic Dönüşüm Analizi ve Yol Haritası

**Tarih:** 25 Kasım 2026  
**Amaç:** CargoPact'i yalnızca sohbet eden bir uygulamadan; operasyonu izleyen, eksik bilgiyi tamamlayan, açıklanabilir öneriler üreten ve belirlenmiş sınırlar içinde güvenli işlem yapan bir agentic sisteme dönüştürmek.

## 1. Mevcut durum

CargoPact temel anlamda agentic çalışmaktadır:

- Asistan eksik rezervasyon bilgilerini çok turlu konuşmayla toplar.
- Müşteri adına sefer arama, teklif, rezervasyon, iptal, yetkili alıcı ve takip işlemleri yapabilir.
- Transfer merkezi adına talep onayı/reddi, depo olayları, sefer oluşturma ve istisna kapatma işlemleri yapabilir.
- Yazma işlemleri **önizleme → açık teyit → uygulama** akışından geçer.
- Kimlik, kiracı ve rol asistan tarafından seçilmez; Cognito token'ı ve iş API'si tarafından doğrulanır.
- İş API'si kapasite, fiyat, zaman sınırı, sözleşme, idempotency ve kiracı izolasyonu kurallarının kayıt sahibidir.
- AgentCore Runtime, Memory, Gateway/MCP, taşıyıcıya özel Knowledge Base ve işlem izleri kullanılır.
- Asistan araçları, kullanıcı token'ıyla iş API'sini çağırır. Böylece asistanın erişimi kullanıcının erişimini aşmaz.

Bu yapı yaklaşık **agentic olgunluk seviyesi 2/4** olarak değerlendirilebilir: kullanıcı talebiyle çok adımlı işlem yapabilen ajan vardır; ancak operasyonu sürekli izleyen, kendi görevlerini oluşturan ve sınırlandırılmış özerklikle kapalı döngü çalışan yapı henüz tamamlanmamıştır.

## 2. Hedef agentic çalışma modeli

### 2.1 Rol bazlı ajan takımı

| Ajan | Sorumluluk | Araçları / çıktıları |
|---|---|---|
| **Müşteri Rezervasyon Ajanı** | Yük bilgilerini toplamak, sefer bulmak, teklif/sözleşme sunmak | Arama, teklif, rezervasyon, alıcı, iptal, takip |
| **Kapasite Planlama Ajanı** | Talepleri kapasite ve katkıya göre karşılaştırmak | Yük kombinasyonu önerisi, sıralama ve açıklama |
| **Operasyon İstisna Ajanı** | Gecikme, gelmeme, ölçüm farkı, hasar ve yeniden planlamayı izlemek | İstisna özeti, çözüm seçenekleri, bildirim |
| **Depo Ajanı** | Kabul, ölçüm, yükleme, varış ve teslim sürecini yönlendirmek | Sonraki doğru olay, QR/palet, e-POD |
| **Finans ve Mutabakat Ajanı** | Ödeme defteri, iptal kesintisi ve iade tutarlılığını kontrol etmek | Mutabakat raporu, iade/kesinti önizlemesi |
| **Sürdürülebilirlik Ajanı** | Karbon tahminini ve yöntemini açıklamak | Yük/sefer karbon özeti, alternatif senaryo karşılaştırması |
| **Yönetici Ajanı** | Diğer ajanların sonuçlarını tek operasyon özeti olarak sunmak | KPI, kapasite, risk, katkı ve eylem özeti |

Her ajan ayrı bir model veya container olmak zorunda değildir. Aynı model, rol bazlı sistem talimatı ve araç izinleriyle birden fazla uzman olarak çalışabilir. Ajan ayrımı teknik gösteriş için değil, yetki ve iş sorumluluğu sınırları için yapılmalıdır.

### 2.2 Deterministik hesap, agentic açıklama

Aşağıdaki kararlar LLM tarafından hesaplanmamalıdır:

- kapasite uygunluğu
- palet/kg/m³ sınırları
- T−3 ve T−1 zaman kuralları
- fiyat ve iptal tutarı
- ödeme/iade bakiyesi
- sözleşme parmak izi
- karbon formülü
- sipariş durum geçişleri

Bu sonuçlar deterministik servislerde hesaplanmalı; ajan doğru servisi çağırmalı, sonucu açıklamalı ve gerekiyorsa kullanıcıdan teyit istemelidir.

## 3. En yüksek öncelik: kalıcı agent command durumu

Mevcut önizleme ve teyit durumunun bir bölümü Runtime sürecinin belleğinde tutulmaktadır. Runtime yeniden başlarsa veya oturum başka bir mikro-VM'e geçerse bu durum kaybolabilir.

Her agentic işlem için DSQL'de `agent_commands` kaydı önerilir:

```text
COLLECTING_INPUT
  → PREVIEWED
  → AWAITING_CONFIRMATION
  → EXECUTING
  → SUCCEEDED
  → FAILED
  → COMPENSATED
  → CANCELLED
```

Önerilen alanlar:

- `commandId`
- kullanıcı, kiracı ve rol
- işlem tipi
- toplanan alanlar ve eksik alanlar
- önizleme gövdesi
- önizleme SHA-256 değeri
- teyit zamanı ve teyit mesajı
- idempotency anahtarı
- araç çağrıları ve correlation ID
- sonuç veya hata
- telafi/geri alma durumu

Kullanıcı teyidi, tam olarak gördüğü önizlemenin hash'iyle eşleşmelidir. Fiyat, sefer sürümü, sözleşme veya uygunluk değişmişse eski teyit geçersiz sayılmalı ve yeni önizleme gösterilmelidir.

## 4. Proaktif operasyon ajanları

Agentic sistem yalnız kullanıcı mesajı beklememelidir. EventBridge olayları ve zaman kuralları görev üretmelidir.

### T−24 saat

- Düşük doluluğu belirle.
- Uygun bekleyen yükleri bul.
- Fiyat basamağı değişikliği öner.
- Planlamacıya “Bu taleplerle doluluk %76'dan %94'e çıkar” özeti gönder.

### T−3 yaklaşırken

- Süresi dolacak blokajları belirle.
- Kesinleşmemiş talepleri planlamacıya bildir.
- Düşük dolulukta son fiyat indirimi öner.

### T−1 yaklaşırken

- Henüz depoya gelmeyen onaylı yükleri belirle.
- Müşteriye uyarı gönder.
- Operasyona olası gelmeme listesi hazırla.

### Depo ölçüm farkı

- Uygunluğu yeniden çalıştır.
- Tam kabul, kısmi kabul ve ret seçeneklerini karşılaştır.
- Kapasite ve finansal etkileri göster.
- Planlamacı teyidiyle uygula.

### Araç değişikliği

- Bütün bekleyen/onaylı talepleri yeniden değerlendir.
- Etkilenen müşterileri ve alternatif seferleri bul.
- Yeniden planlama paketi oluştur.

### Varışta teslim alınmayan yük

- Müşteri ve yetkili alıcıyı bilgilendir.
- Depoda bekleme süresini hesapla.
- İstisna kuyruğuna görev aç.

İlk aşamada bu ajanlar öneri ve bildirim üretmelidir. Otomatik yazma yalnız düşük riskli, geri alınabilir işlemlerde açılmalıdır.

## 5. Özerklik seviyeleri

| Seviye | Davranış | CargoPact örneği |
|---|---|---|
| **A0 – Bilgi** | Yalnız okur ve açıklar | Sipariş nerede? |
| **A1 – Taslak** | Plan hazırlar, işlem yapmaz | Yük kombinasyonu önerisi |
| **A2 – Teyitli işlem** | Önizleme ve kullanıcı teyidi sonrası yazar | Rezervasyon, onay, ret, teslim |
| **A3 – Politika içinde otomatik** | Önceden belirlenmiş sınırlar içinde kendi uygular | Süresi dolan blokajı bırakma, bildirim |
| **A4 – İnsan zorunlu** | Asla otomatik uygulanmaz | Büyük iade, hasar tazmini, yüksek değerli onay |

Önerilen eşleme:

- Rezervasyon: A2
- Taşıyıcı onayı/ret: A2
- Depo kabul/yükleme/teslim: A2
- Blokaj süresi dolması: A3
- Uyarı ve bildirim: A3
- Ödeme/iade: A2; tutar eşiği üstünde A4
- Hasar tazmini: A4

## 6. Deterministik rol ve niyet yönlendirmesi

Rol seçimi model tarafından yapılmamalıdır:

```text
JWT /me
  ├── customer_user → Customer Agent
  ├── carrier_planner → Planning Agent
  ├── carrier_warehouse → Warehouse Agent
  ├── carrier_admin → Supervisor + Planning + Finance
  └── admin_viewer → Reporting Agent
```

İkinci yönlendirme niyete göre yapılabilir:

```text
rezervasyon / iptal / takip → müşteri ajanı
kapasite / talep / sefer    → planlama ajanı
kabul / yükleme / teslim    → depo ajanı
ödeme / iade / katkı        → finans ajanı
karbon / sürdürülebilirlik  → karbon ajanı
```

Modelin bütün araçları serbestçe çağırması yerine rol × niyet × izin tablosu kullanılmalıdır.

## 7. Araç katmanı ve Gateway

Her agent aracı ortak bir komut sözleşmesi izlemelidir:

```json
{
  "operation": "reservation.create",
  "riskLevel": "A2",
  "requiresConfirmation": true,
  "idempotencyKey": "...",
  "input": {},
  "preview": {},
  "result": {},
  "audit": {
    "correlationId": "...",
    "actorId": "...",
    "tenantId": "..."
  }
}
```

Araçların iki AgentCore Gateway hedefinde ayrılması önerilir:

- **Read Gateway:** arama, takip, KPI, Knowledge Base ve karbon.
- **Command Gateway:** rezervasyon, onay, iptal ve depo olayları.

Command Gateway gereksinimleri:

- rol bazlı tool allowlist
- idempotency anahtarı
- önizleme hash'i
- teyit kaydı
- API tarafında yeniden yetkilendirme
- PII temizlenmiş log
- belirli Lambda/OpenAPI kaynaklarına daraltılmış IAM

AgentCore Gateway, REST API veya Lambda hedeflerini MCP araçlarına dönüştürebilir. Gateway hedefi oluşturma sırası ve güvenlik ayrıntıları için [AgentCore Gateway dokümantasyonuna](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway.html) bakın.

## 8. Bellek katmanları

### İş verisi: Aurora DSQL

Kesin kaynak her zaman DSQL olmalıdır:

- kapasite ve fiyat
- teklif/rezervasyon durumu
- sözleşme ve teyit hash'i
- ödeme ve iade
- teslim kodu
- karbon değeri

Ajan belleğindeki bir kopya, bu değerler için güvenilir kaynak sayılmamalıdır.

### Kısa dönem bellek: AgentCore Memory

- bu konuşmada verilen rota, palet, kg ve ürün sınıfı
- seçilen sefer
- bekleyen işlem ve command ID
- son görülen önizleme hash'i

### Uzun dönem tercih belleği

- sık kullanılan rota
- varsayılan ürün sınıfı
- sık kullanılan yetkili alıcı
- peşin/kapora tercihi
- bildirim tercihleri

Uzun dönem belleğe ödeme kartı, teslim kodu, başka müşteri bilgisi veya hassas sözleşme verisi yazılmamalıdır. Memory TTL'i minimum iş ihtiyacına göre ayarlanmalıdır. Ayrıntı: [AgentCore Memory dokümantasyonu](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html).

## 9. Açıklanabilir yük optimizasyonu

LLM'den “hangi yükleri seçmeliyim?” hesabını doğrudan yapması istenmemelidir. Deterministik bir optimizasyon aracı önerilir:

```text
propose_load_plan(
  tripId,
  objective = "contribution" | "occupancy" | "on_time_probability"
)
```

Kısıtlar:

- palet, kg ve m³
- ürün uyumu
- zaman pencereleri
- iç yük rezervi
- depo slotu
- no-show önceliği
- minimum katkı
- ağırlık dağılımı

Ajan, aracın ürettiği 2–3 alternatifi açıklamalıdır. Örneğin:

> Marmara + Anadolu + Başkent kombinasyonu 8 paleti dolduruyor. Başkent'in ilk yükü ağırlık sınırını aştığı için dışarıda bırakıldı. Plan 8.800 TL brüt ve 7.200 TL tahmini katkı oluşturuyor.

İlk sürümde kural tabanlı arama yeterlidir. Sonraki sürümde OR-Tools veya integer programming kullanılabilir.

## 10. Agent kalite değerlendirmesi

### Altın test seti

En az 50 senaryo önerilir:

- Eksik alanları doğru soruyor mu?
- Daha önce verilen bilgiyi tekrar soruyor mu?
- Teyitten önce yazma yapıyor mu?
- Aynı teyit ikinci kayıt açıyor mu?
- Başka kiracının verisini açıyor mu?
- T−3/T−1 saatlerini doğru söylüyor mu?
- Alternatif seçilmemişken karbon tasarrufu iddia ediyor mu?
- Sözleşme/fiyat değişince yeniden onay istiyor mu?
- Uygun olmayan yükü rezerve ediyor mu?
- Teslim kodunu taşıyıcıya veya loga sızdırıyor mu?

### Değerlendiriciler

AgentCore Evaluations için uygun yerleşik değerlendiriciler:

- Goal Success Rate
- Tool Parameter Accuracy
- Tool Selection Accuracy
- Correctness
- Faithfulness
- Context Relevance
- Instruction Following

CargoPact'e özel değerlendiriciler:

- `NoWriteWithoutConfirmation`
- `NoCrossTenantDisclosure`
- `CutoffAccuracy`
- `PricingAccuracy`
- `CarbonClaimSafety`
- `ContractAcceptanceIntegrity`

CI içinde altın veri setinin tamamı; üretimde trafiğin %5–10'u değerlendirilmelidir. Ayrıntı: [AgentCore Evaluations dokümantasyonu](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/evaluations.html).

## 11. İzlenebilirlik ve alarmlar

Mevcut correlation ID ve tool-call tablolarına ek olarak AgentCore Evaluations için OTEL izlerinde şu alanlar bulunmalıdır:

- kullanıcı girdisi
- ajan çıktısı
- araç adı ve girdi/çıktısı
- her adımın gecikmesi
- token kullanımı
- command ID, teyit ve sonuç

ADOT SDK kullanılmalıdır. AgentCore çağrı/gecikme/hata metriklerini otomatik yayınlar; token kullanımı ayrıca ölçülmelidir. Ayrıntı: [AgentCore Observability dokümantasyonu](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability.html).

Önerilen alarmlar:

- araç hata oranı > %5
- asistan p95 > 8 saniye
- teyitsiz yazma denemesi > 0
- tenant ihlali > 0
- başarısız rezervasyon oranı > %10
- goal success < %90

## 12. Harness ve Runtime kararı

AgentCore Harness model, prompt, araç, beceri ve belleği yapılandırmayla yönetir; özel container ve agent loop ihtiyacını azaltır. Ayrıntı: [AgentCore Harness dokümantasyonu](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness.html).

CargoPact için öneri:

- **İşlemsel ana ajanı mevcut AgentCore Runtime'da tutun.** Kod tabanlı teyit kapısı, özel durum makinesi ve telafi işlemleri tam kontrol gerektirir.
- **Salt okunur yardımcı ajanlar Harness'a taşınabilir:** karbon açıklaması, KPI yorumlama, Knowledge Base soru-cevap, rapor özeti.
- Sırf “çok ajanlı” görünmek için her rolü ayrı container'a bölmeyin.

## 13. Uygulama sırası

### Sprint 1 – Güvenilir agentic işlem

1. `agent_commands` tablosu ve kalıcı önizleme/teyit durumu.
2. Read ve Command Gateway ayrımı.
3. Rol × araç izin matrisi.
4. Ajan regresyon test seti.
5. AgentCore Evaluations ve OTEL izleri.

### Sprint 2 – Proaktif operasyon

1. T−24, T−3 ve T−1 EventBridge görevleri.
2. İstisna ajanı.
3. Otomatik bildirimler.
4. Araç değişiminde alternatif plan önerisi.
5. Düşük dolulukta fiyat basamağı önerisi.

### Sprint 3 – Optimizasyon

1. Deterministik yük kombinasyonu servisi.
2. Katkı/doluluk/SLA hedefleri.
3. Planlamacıya açıklanabilir alternatifler.
4. Sonuçların offline karşılaştırması.

### Sprint 4 – Sınırlandırılmış özerklik

1. Düşük riskli işlemlerde otomatik uygulama.
2. Tutar ve risk eşiklerine göre insan onayı.
3. Başarısız işlem için telafi/geri alma akışları.
4. Online kalite ve güvenlik alarmları.

## 14. Önerilen ilk iş

İlk uygulanması gereken iş, **kalıcı `agent_commands` ve teyit durumu**dur. Mevcut sistemdeki en büyük agentic risk, teyit ve eksik alan toplama durumunun Runtime sürecinde tutulmasıdır. Bu katman kalıcı hale geldikten sonra proaktif operasyon ajanları güvenle eklenebilir.
