# CargoPact
## Ürün ve uygulama planı · Web, mobil ve transfer operasyonu

**25 Kasım 2026 · Dinçer Teknoloji · v1.3**  
**Kullanım:** Ürün, tasarım, operasyon ve Kiro/geliştirme ekibi için başlangıç şartnamesi. Plan, Dinçer’in mevcut depo transferinde kullanılabilir kapasiteyi müşteri yükleriyle doldurma modelini esas alır.

> Not: Bu belge kullanıcı tarafından sağlanan orijinal plandır (v1.3). Plandan sapan ekip kararları `.kiro/steering/decisions.md` ve `docs/PROGRESS.md` içinde tutulur: çoklu taşıyıcı, ilişkisel veritabanı (Aurora DSQL), dinamik fiyat, ödeme/iptal, Amazon Q Business yerine kendi sohbet arayüzü + AgentCore.

## 1. Ürün fikri

**CargoPact, Dinçer’in zaten planlanmış depo transferlerinde kalan palet alanını yayınlayıp farklı müşterilerin uygun yüklerini aynı araca birleştirir.** Transfer merkezi “Aracım var, yük ekle” ile kapasiteyi açar ve uygun müşteri başvurularını planına ekler. Müşteri yükünü Dinçer’in çıkış transfer merkezine getirir ve kendisi veya yetkili alıcısı varış deposundan teslim alır. Her gönderinin ayrı rezervasyon, izleme ve teslim kaydı vardır.

CargoPact’in çekirdeği **Dinçer’in onaylı seferinden başlayan kapasite yayını, çok firmalı yük birleştirme ve iki depo arasında izlenebilir teslim** akışıdır. İlk sürümde hizmet tanımlı araç profilleriyle ve istiflenmeyen standart paletlerle sunulur. Kapıdan alım veya teslim, açık taşıyıcı pazarı, ara durak ve ürünün tetiklediği yeni seferler ilk sürüm kapsamı dışındadır.

### Hedefler ve başarı ölçütü

| Hedef | Ölçüm |
|---|---|
| Kullanılabilir alanı satılabilir kılmak | Yüklenmiş dış palet pozisyonu / satışa açılmış pozisyon. Payda yayımlanan kapasite sürümüne bağlıdır. |
| Müşteriye öngörülebilir depo–depo hizmeti | Teklif → onay dönüşümü, başvuru–onay süresi, zamanında bırakma, zamanında teslim alma, hasar ve no-show. |
| İç transferi korumak | İç yük rezervi ihlali ve çift rezervasyon sayısı için hedef 0. Zamanında kalkış ve iç transfer SLA’sı pilot öncesi bazla izlenir. |
| Ek katkıyı ölçmek | Tahsil edilen hizmet bedeli eksi ek elleçleme, sigorta, işlem, depo, ilave taşıma ve istisna maliyetleri. Planlanan tutar ayrıca gösterilir. |

Doluluk oranlarını palet, kg ve m³ için ayrı göster. “FTL seviyesinde palet doluluğu” araca fiilen yüklenen palet pozisyonlarından hesaplanır. Çevresel fayda, müşterinin alternatif gönderim senaryosu ile proje ek emisyonu doğrulandığında hesaplanabilir.

## 2. Pazar örnekleri ve literatürden ürün kararları

Pazar örnekleri belirli özellikleri değerlendirmek için kullanıldı. CargoPact’in ürün kapsamını Dinçer’in açtığı kapasite, müşteri rezervasyonu, çıkış deposuna bırakma ve varış deposundan teslim alma akışları belirler.

| Muadil | Kaynağın gösterdiği uygulama | CargoPact’e aktarım |
|---|---|---|
| **TIMOCOM** | Taşıma ilanı ve araç kapasitesi ilanı; kapalı iş ortağı ağı seçeneği. | Kapasite kartında rota, tarih, kalan palet ve zaman penceresi. Pilot ilanları onaylı firmalara görünür. [TIMOCOM](https://www.timocom.co.uk/services/freight-exchange) |
| **Quicargo** | Boş kapasiteyi kullanma fikri ve paletli grupaj. Firma kendi tarihçesinde açık platformdan dijital taşıma organizatörlüğüne geçtiğini anlatır. | Standart palet, anlaşılır ölçü/ürün formu ve rezervasyon özeti. Quicargo’nun güncel iş modeli CargoPact’in depo–depo modelinin muadili olarak varsayılmaz. [Quicargo tarihçe](https://quicargo.com/about-us/) · [Gönderi kapsamı](https://quicargo.com/faq/) |
| **Palletways** | Depolar ve hub’lar üzerinden palet ağı, takip kimliği ve sevk belgesi. | Barkod ve teslim olay zinciri için referans. Müşterinin iki uçta kendi taşımasını üstlenmesi CargoPact’in ürün kararıdır. [Palletways SSS](https://www.palletways.com/faqs/) |

| Literatür / standart | CargoPact tasarım kararı |
|---|---|
| Van Belle, Valckenaers ve Cattrysse (2012), *Cross-docking: State of the art* | Kabul ve taşıma planı, varış/kalkış bağlantısı, depo kapasitesi ve gecikme riskini birlikte ele alır. MVP’de çıkış kabul penceresi, yükleme sırası ve varış alım penceresi ilk sınıf veridir. CargoPact bu çalışmadan kabul ve yükleme planlamasını alır. Varış deposunda müşteri alımına kadar geçen bekleme ayrıca yönetilir. [Makale](https://www.sciencedirect.com/science/article/pii/S0305048312000060) |
| Cruijssen, Cools ve Dullaert (2007), *Horizontal cooperation in logistics: Opportunities and impediments* | Farklı firmalar arasındaki iş birliğinin uygulama engelleri, pilotta net ticari/operasyon sorumluluğu ve firma bazlı veri erişimi tasarımını destekler. [Makale](https://doi.org/10.1016/j.tre.2005.09.007) |
| Bortfeldt ve Wäscher (2013), *Constraints in container loading* | Nominal boş pozisyon tek başına yüklenebilirliği göstermez. Ölçü, ağırlık dağılımı ve istif kuralları değerlendirilir. MVP standart palet ve depo son onayıyla ilerler. [Makale](https://doi.org/10.1016/j.ejor.2012.12.006) |
| GS1 Logistic Label Guideline | Demo için CargoPact palet kimliği/QR. Kurum standardı ve WMS uyumluysa pilotta tekil lojistik birim kimliği SSCC ile eşleştirilir. [GS1 yönergesi](https://ref.gs1.org/guidelines/logistic-label/) |

### 2.1 Araştırmadan ürün işlerine aktarılan öneriler

| Uygulama önerisi | Teslim | Doğrulama |
|---|---|---|
| **Sefer kapasitesiyle depo kapasitesini birlikte planla.** Cross-docking literatüründeki zaman penceresi ve kaynak planlamasını kullan. [Van Belle vd.](https://doi.org/10.1016/j.omega.2012.01.005) | MVP’de rezervasyon son saati (T−3), çıkış deposu kabul son saati (T−1) ve varış deposu alım penceresi ayrı alanlar olsun. Pilot sürümde depo/rampa slot limiti ve varış bekletme alanı tanımlansın. | Araçta yer olsa bile dolu kabul penceresi için o saat verilmez. Gecikme veya alınmayan yük operasyon kuyruğuna düşer. Kabul gecikmesi ve alım süresi ölçülür. |
| **Palet sayısının yanında fiziksel yüklenebilirliği doğrula.** Kapasite ve konteyner yerleşim kısıtlarını birlikte ele al. [Bortfeldt ve Wäscher](https://doi.org/10.1016/j.ejor.2012.12.006) | MVP’de palet adedi, brüt kg, ölçü/yükseklik, m³ ve ürün uyumu kontrolü. Depo ölçümü beyanla ayrı saklanır. Farkta yeniden değerlendirme ve yükleme öncesi yerleşim/ağırlık dağılımı için yetkili onay. | Üç pozisyon boşken ağır yük reddedilir. Depoda ölçüm değişirse uygunluk tekrar çalışır. İç transfer kapasitesine dokunulmaz. |
| **Çok firmalı birleştirmeyi açıklanabilir yap.** Kurumlar arası iş birliği literatürünü rol, veri paylaşımı ve iş sorumluluğuna uygula. [Cruijssen vd.](https://doi.org/10.1016/j.tre.2005.09.007) | MVP’de mevcut taahhütler korunur. Doğrulanmış gelmeme geçmişi olan uygun adaylar daha düşük öncelikte gösterilir. Aynı öncelik düzeyinde başvuru sırası kullanılır. Planlamacı seçim ve gerekçe kaydeder. Pilot sonrasında optimizasyon gerekirse mevcut yönteme karşı offline test edilir. | Aynı girdiler aynı aday sırasını üretir. Farklı firmaların teklifleri birbirine görünmez. Optimizasyon kararı doluluk, net katkı ve zamanında kalkış verileriyle verilir. |
| **Palet bazında teslim kanıtı oluştur.** GS1 lojistik etiket standardı, fiziksel birimle elektronik kaydın aynı kimlik üzerinden eşleşmesine referans verir. [GS1](https://ref.gs1.org/guidelines/logistic-label/) | MVP’de tekil palet kimliğiyle kabul, yükleme, varış ve teslim olayları. Pilot sırasında WMS ile SSCC uyumluluğu doğrulanır. Teslim yetkisi palet kodundan ayrı kontrol edilir. | Aynı barkod tekrar okutulduğunda çift hareket oluşmaz. Kısmi teslimde hangi paletin, ne zaman, kime verildiği görülebilir. |
| **Talep, teslim ve istisna döngüsünü birlikte ölç.** Sipariş karşılama çalışmasındaki firmalar arası süreç bakışını rezervasyondan teslim kanıtına taşı. [Croxton](https://doi.org/10.1108/09574090310806512) | MVP’de iptal, no-show, geç bırakma, ölçüm farkı, hasar ve teslim alınmama için durum, sorumlu, neden ve bildirim tanımlanır. Pilot panosunda sefer ve rezervasyon bazlı süreler gösterilir. | Ret, iptal veya kısmi kabul sonrası müşteri ve Dinçer doğru durumu görür. Çift kapasite iadesi veya ikinci teslim olayı oluşmaz. |

Bu eşlemeler kaynaklardan türetilen CargoPact tasarım kararlarıdır. İlk pilotta benzer gün/saat ve depo çiftlerinde iç transferin zamanında kalkışını, kabul süresini ve ek katkıyı başlangıç verisiyle karşılaştır. Yük birleştirmenin etkisini planlanan ve fiili palet doluluğu üzerinden ayrı raporla.

## 3. Roller ve uçtan uca akış

| Rol | Web ve mobil yetkileri |
|---|---|
| **Müşteri / yük sahibi** | Onaylı firma adına sefer arar, kendi yükünü beyan eder, teklif kabul eder, kendi sevkiyatını izler ve yetkili alıcıyı kaydeder. Küçük nakliyeci ve ambar bu rolde yük sahibi olabilir. |
| **Tedarikçi / Dinçer transfer merkezi** | Planlamacı seferi yayımlar, uygun yükleri öneri kuyruğundan seçer ve onaylar. Depo personeli kendi tesisinde kabul, barkod, yükleme, varış ve teslimi işler. Bunlar aynı rol alanında yetkileri ayrı alt rollerdir. |
| **Yönetim / jüri görünümü** | Yalnız yetkili özetleri okur. Demo görünümü kurgusal kayıtlarla gösterilir. |

1. **Aracım var, yük ekle.** Planlamacı TMS’den gelen seferi seçer veya demo ortamında sefer kaydı açar. Kalkış ve varış deposu, araç, iç yük, limitler, tampon, rezervasyon son saati ve depo kabul penceresini görür. Satışa açılan palet/kg/m³ tutarını onaylar.
2. **Müşteri yükünü tanımlar.** Çıkış ve varış, tarih, palet adedi, ölçü profili, brüt kg, m³ ve ürün sınıfını girer. İzinli seferler fiyat, son bırakma saati ve alım penceresiyle listelenir. Teklif kayıtlı koşullar üzerinden hesaplanır.
3. **Geçici yer ayırma ve Dinçer onayı.** Müşteri teklifi ve ilgili ticari koşulu kabul ettiğinde sistem süreli blokaj açar. Dinçer “Yük ekle” ekranında bekleyen talepleri ve birleştirme önerisini görür. Sistem ölçü, kg, m³, ürün, zaman ve iç kapasiteyi tekrar kontrol eder. Dinçer onayladığında rezervasyon kesinleşir ve müşteriye tekil **CargoPact sipariş numarası** verilir. Müşteri bu numarayla web, mobil ve Q üzerinden yükünü takip eder. Yer ayırma ve kesin rezervasyon işlemleri en geç T−3 saatte tamamlanır. Ret, iptal ve süre aşımı bir kez kapasiteyi iade eder.
4. **Bırakma ve konsolidasyon.** Müşteri yalnız çıkış merkezine gelir. Depocu referans/QR ile kaydı bulur, her paleti ölçer ve barkodlar. Paletin çıkış deposundaki kabul kaydı en geç T−1 saatte tamamlanır. Uyuşmazlıkta inceleme veya kısmi kabul kaydı açılır. Uygun yük, aynı araçta diğer firmaların yükleriyle planlanıp okutularak yüklenir.
5. **Taşıma ve teslim.** Araç varış deposuna ulaşınca paletler okutulur. Müşteri veya yetkili alıcı bildirim alıp depoya gelir. QR kaydı buldurur, teslim yetkisi ayrıca doğrulanır. Palet bazında e-POD ve teslim zamanı kaydedilir.

Temel durumlar: `TEKLIF → DINÇER_ONAYI_BEKLIYOR → ONAYLI → DEPO_KABUL → YUKLENDI → VARISTA → TESLIM`. Süresi doldu, ret, iptal, eksik/hasar ve yeniden planlama ayrı geçişlerdir. Ekranlarda bloke, onaylı ve fiili yük birbirine karıştırılmaz. TMS sefer ve WMS depo hareketi için iş sahibi sistemlerdir. CargoPact teklif, blokaj, onay ve müşteri deneyiminin kayıt sahibidir.

### 3.1 Kalkışa bağlı işlem sınırları

**T**, aracın sefer kaydındaki planlanan kalkış saatidir.

| İşlem | Son saat | Kural |
|---|---|---|
| Yer ayırma ve rezervasyon | **T−3 saat** | Geçici yer ayırma ve kesin rezervasyon bu saate kadar yapılabilir. Sınır geçince yeni yer ayrılmaz ve bekleyen rezervasyon kesinleşmez. Geçici blokaj süresi rezervasyon sınırını aşamaz. |
| Çıkış deposu yük kabulü | **T−1 saat** | Paletin fiziksel kabulü ve kabul kaydı bu saate kadar tamamlanır. Bu saatten sonra yük o sefer için standart kabul akışında işlenmez ve gecikme operasyon ekibine iletilir. |

Sınır anları dahildir. Örneğin araç **18.00**’de kalkacaksa en geç **15.00**’te yer ayrılır veya rezervasyon kesinleşir. Çıkış deposu kabulü en geç **17.00**’de tamamlanır. Varış deposundan teslim alma, kendi alım penceresine göre yürür.

### 3.2 Gelmeme geçmişi ve Dinçer öncelik sırası

- **Gelmeme (no-show)**, onaylı siparişe ait yükün T−1 sınırına kadar çıkış deposuna getirilmediğinin operasyon kayıtlarıyla doğrulanmasıdır. Zamanında bildirilmiş iptal, Dinçer kaynaklı aksama, zamanında gelmiş ancak inceleme bekleyen yük, geç gelen yük ve ölçüm farkı kendi neden kodlarıyla ayrı kaydedilir.
- Uygun talepler arasında **doğrulanmış gelmeme kaydı olan firmaya öncelik verilmez**. MVP varsayımı olarak firmanın mevcut doğrulanmış geçmişi kullanılır. Aynı öncelik düzeyinde başvuru sırası geçerlidir. Kesinleşmiş siparişler ve geçerli blokajlar korunur. Firma uygun kapasite kalırsa değerlendirilebilir. Dinçer yetkili seçiminin gerekçesi denetim izine yazılır.
- Dinçer operasyon ekranı ve Dinçer Q, düşük önceliği açıklarken doğrulanmış adet, tarih ve sipariş referansını gösterir. Geçmiş yoksa “doğrulanmış gelmeme kaydı yok” der. Müşteri deneyimi diğer firmalara ait geçmişi veya öncelik sırasını göstermez.
- **Dinçer’e özel Knowledge Base** gelmeme kurallarını, istisnaları ve firma bazlı doğrulanmış olay özetlerini içerir. Sunucu yetkiyi doğrular ve firma kimliğiyle filtreli arama yapar. Güncel adet, tarih ve öncelik işlem API’sinden doğrulanır. Özetin dizinde bulunmaması, gelmeme olmadığı anlamına gelmez. Ham evrak ve gereksiz kişisel veri indekslenmez.

### 3.3 Sipariş numarası ve yük takibi

Dinçer onayı öncesinde başvuru referansı gösterilir. Onay işlemi kesin rezervasyonu ve tekil sipariş numarasını aynı işlemde kaydeder. Başarılı yanıt ve bildirim, örneğin **CP-2026-000123**, çıkış deposu, T−1 son kabul saati ve varış deposu alım penceresini içerir. Aynı onay yeniden işlendiğinde aynı numara döner.

Sipariş numarasıyla sorgulama müşteriye son doğrulanmış durumu, güncelleme saatini ve sıradaki adımı verir. **Onaylandı → çıkış deposunda kabul edildi → araca yüklendi → yolda → varış deposunda teslime hazır → teslim edildi.** Hasar, eksik palet ve kısmi teslim olayları ilgili palete bağlı görünür. Müşteri yalnız kendi firmasının siparişini sorgular. Canlı araç konumu ancak doğrulanmış araç takip kaynağı bağlanırsa gösterilir.

## 4. Web ve mobil tasarım kapsamı

Her iki rolde web ve mobil ana akışları desteklenir. Web planlama ve karşılaştırma ağırlıklı geniş ekran; mobil sahadaki kısa işlemler ve müşteri takibi ağırlıklı tasarlanır.

| Kullanıcı | React web | React Native mobil |
|---|---|---|
| Müşteri | Sefer ara, yük beyanı, teklif karşılaştır, rezervasyonlar, sipariş numarasıyla yük takibi ve teslim belgesi | Üç adımlı yük formu, teklif ve yer ayırma, QR, “depoya nasıl giderim?”, sevkiyat durumu ve bildirim |
| Dinçer planlamacı | “Aracım var, yük ekle”, tablo, kapasite çubukları, uygunluk ve ret gerekçesi, onay kuyruğu, istisna ve manifest | Sefer listesi, kalan palet/kg/m³, uygunluk ve gelmeme geçmişi özeti, yetkiye bağlı onay/ret ve öncelikli uyarılar |
| Dinçer depo | Kabul ve teslim iş listesi, barkod arama, fark/hasar, toplu hazırlık ve kapanış | Kamera ile okutma, ölçüm ve fotoğraf, kabul/yükleme/teslim, çevrimdışı bekleyen işlem göstergesi |
| Yönetim/jüri | 33 pozisyon şeması, yük grupları, brüt tutar, durum zaman çizgisi, araç çağrısı/işlem izi | Salt okunur özet ve sefer durumları |

**Q konuşma örnekleri**

| Q rolü | Örnek istek | Beklenen çıktı |
|---|---|---|
| Müşteri | “Gebze’den Ankara’ya 3 palet yüküm var. Bu seferde yer ayır.” | Eksik beyanı tamamlatır, teklif ve son saatleri gösterir. Yazma teyidi sonrası başvuru referansı ve onay bekliyor durumu döner. |
| Dinçer | “Bu seferde kime öncelik verelim? Bu firmanın yükünü getirmediği oldu mu?” | Adayları öncelik sırasıyla verir. İç Knowledge Base’teki kuralı ve canlı API’nin doğruladığı geçmişi açıklar. Yetkili onay ayrı teyit formuyla işlenir. |
| Müşteri | “CP-2026-000123 numaralı yüküm nerede? Ne zaman alabilirim?” | Son doğrulanmış durum, olay saati ve varsa varış deposu alım penceresi. |

**Ekran taslağı:** Dinçer ana sayfasında birincil düğme “Aracım var, yük ekle”. Sefer ayrıntısında üstte Gebze → Ankara ve kalkış/kesim saatleri, ortada üç ayrı kapasite göstergesi, altta uygun ve inceleme bekleyen talepler. Müşteri ana sayfasında “Palet gönder”, “Rezervasyonlarım” ve “Depodan teslim al”. Teklif ve rezervasyon kartları toplam fiyatı, iki depoyu, son rezervasyon saatini ve çıkış deposu son kabul saatini ayrı gösterir. Renkli durumlara metin etiketi ekle. Mobilde ağ bağlantısı yoksa ölçüm taslağı ve okutma bekleyebilir; sunucu teyidi gelene kadar onay, kapasite ve teslim işlemi “bekliyor” görünür. Tekrar eşitleme idempotent olmalıdır.

**Tasarım teslimi:** iki rol için masaüstü ve telefon wireframe’leri, ortak renk/typography/durum belirteçleri, tıklanabilir prototip ve boş/yükleniyor/hata/ret/başarı durumları. MVP’de somut ilk ekran seti: müşteri arama, teklif ve takip; transfer merkezi sefer yayınlama, yük ekleme ve onay; depo okutma/teslim; jüri panosu.

## 5. Örnek sefer ve jüri gösterimi

Kurgusal Gebze → Ankara seferi 33 pozisyon, 25 iç palet, 17.000 kg iç yük ve 22.000 kg azami demo yüküyle başlar. 8 palet, 5.000 kg ve 12 m³ satışa açılır.

| Olay | Sonuç |
|---|---|
| Marmara Ambar, 3 palet ve 1.500 kg | Onay sonrası 28/33 planlanan doluluk. 1.250 TL/palet, toplam 3.750 TL. |
| Anadolu Parsiyel, 2 palet ve 1.200 kg | Onay sonrası 30/33. 1.100 TL/palet, toplam 2.200 TL. |
| Başkent Nakliye, 3 palet ve 2.600 kg | Toplam 22.300 kg olacağı için ret. Kalan 3 pozisyon değişmez. |
| Başkent Nakliye, 3 palet ve 1.900 kg | Onay sonrası 33/33 planlanan, 21.600 kg toplam. 950 TL/palet, toplam 2.850 TL. |
| Depo kabulü ve yükleme | 33/33 fiili palet doluluğu, üç ayrı firma/rezervasyon ve toplam 8 dış palet. |
| Varış | Üç yetkili alıcı ayrı kayıtlarla paletlerini teslim alır. |

Kurgusal brüt rezervasyon tutarı 8.800 TL. Palet başına 200 TL örnek değişken giderle 7.200 TL ek katkı, ek yakıt ve diğer gerçekleşen maliyetler hariç. Jüri ekranı önce 25/33’ü, sonra 28 ve 30’u, üçüncü ağırlık reddini ve son olarak fiili 33/33’ü gösterir. Bir müşteri mobil, bir Dinçer planlamacı web, bir depo çalışanı mobil ve iki tarafın Q örnekleri canlı sıraya alınır.

## 6. React ve AWS uygulama mimarisi

**Önerilen varsayılan:** TypeScript monorepo. `apps/web` React + Vite, `apps/mobile` React Native + Expo, `packages/contracts` OpenAPI türleri ve API istemcisi, `packages/domain` alanlar ve ortak doğrulama şemaları, `packages/tokens` tasarım belirteçleri. API ve ajan kodu seçilen workshop şablonuna göre ayrı paketlerde durabilir. İş kuralları sunucu tarafında uygulanır. Web ve native bileşenleri ihtiyaca göre ayrı yazılır. Öncelikle ortak sözleşme, tipler, doğrulama, yerelleştirme ve tasarım belirteçleri paylaşılır. Web için CI tarayıcı testleri, mobil için iki platformda gerçek cihaz QR/kamera ve bildirim testleri çalıştırılır. [Expo monorepo](https://docs.expo.dev/guides/monorepos/) · [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/)

| Katman | Uygulama |
|---|---|
| Web / mobil yayın | Web için Amplify Hosting veya S3 + CloudFront. Mobil için iOS/Android Expo development build ve iç test dağıtımı, pilotta ilgili mağaza/kurum dağıtımı. |
| Kimlik | Cognito veya onaylı kurumsal OIDC. Müşteri firma, Dinçer ise rol ve depo kapsamıyla filtrelenir. Tüm istemciler sunucu yetkisi altında çalışır. |
| İş API’si | API Gateway + Lambda. Sefer yayınlama, uygunluk ve fiyat, hold, onay, depo ve teslim olayları. `tenantId` ve rol doğrulanmış kimlik/üyelikten türetilir. |
| Veri | DynamoDB. Sefer sürümü ve kapasite, quote, hold, rezervasyon, sipariş numarası, palet, hareket, doğrulanmış gelmeme olayı, kanıt ve audit. Koşullu transaction çift rezervasyonu önler ve aynı çağrıda outbox kaydı oluşturur. |
| Olay ve evrak | EventBridge ve gerekiyorsa SQS/DLQ. Hold süresi uygulama tarafından doğrulanır, Scheduler veya mutabakat Lambda’sı kapasiteyi serbest bırakır. Özel S3 bucket’ı e-POD ve depo fotoğraflarını taşır. |
| Amazon Q Business | İki ayrı deneyim ve eklenti kapsamı. CargoPact terminolojisinde müşteri firmanın Q’su teklif/rezervasyon, Dinçer Q’su sefer/öneri/onay araçlarını görür. Q yazma çağrısında kullanıcı formu teyit eder. Backend iş koşullarını ve yetkiyi tekrar denetler. |
| Dinçer Knowledge Base | Amazon Bedrock Knowledge Bases, gelmeme kuralları ve erişimi kısıtlı firma özetleri için kullanılır. AgentCore Gateway’deki Dinçer aracı yetkili Retrieval çağrısını ve canlı geçmiş API’sini birlikte kullanır. [AWS Retrieval API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_Retrieve.html) |
| Bedrock ve AgentCore | Strands custom agent AgentCore Runtime’da çalışır. AgentCore Gateway, MCP ile salt okunur/öneri Lambda araçlarını sunar. Dinçer Q’nun öneri isteği veya portal isteği Runtime’a yönlenebilir. Ajan olası yük grubunu açıklar. Rezervasyon yazımı güvenilir iş API’sinde yapılır. |
| İzleme ve entegrasyon | CloudWatch korelasyon kimliği ve iş audit’i. Pilot için TMS yayın adaptörü, WMS/palet olay adaptörü ve ERP/cari-finans entegrasyonu. Demo veri ve simülasyonlar işaretlenir. |

**Çağrı yolları:** web/mobil veya Q rol eklentisi → API Gateway → Lambda → DynamoDB. Dinçer önerisi → Runtime (Bedrock + Strands) → AgentCore Gateway → yetkili araç Lambda’sı → canlı sefer snapshot’ı. API Gateway ürünün HTTP girişidir. AgentCore Gateway ajanın MCP aracına açılan kapıdır. Q Business hesap/bölge ve Türkçe işlem akışı ortamda doğrulanır. Türkçe Q kabul testi sınırlı kalırsa İngilizce Q komutlarıyla canlı entegrasyonu ve Türkçe React arayüzünü göster. Q Developer/Kiro geliştirme için kullanılabilir.

**API sözleşme örnekleri:** `POST /operations/trips/{id}/publish`, `GET /customer/trips`, `GET /customer/quotes/preview`, `POST /customer/reservations`, `GET /customer/reservations/{id}`, `GET /customer/orders/{orderNumber}/tracking`, `GET /operations/customers/{companyId}/attendance`, `GET /operations/trips/{id}/proposal`, `POST /operations/reservations/{id}/decision`, `POST /warehouse/pallets/{id}/events`. Önizleme kapasite değiştirmez. Kuralları paylaşan portal ve Q kanalları ayrı istemci kimlikleriyle aynı backend’e gider. Backend fiyat ve teklif süresini belirler. Son rezervasyon ve kabul saatlerini planlanan kalkıştan sırasıyla 3 ve 1 saat çıkararak hesaplar. Web, mobil ve Q aynı değerleri gösterir. API, yazma işlemi sırasında sunucu saatiyle sınırı doğrular. Onay, geçerli teklif/blokaj ve kayıt sürümüne bağlıdır. Aynı isteğin tekrarı tek mutasyon üretir.

[AWS Q yazma teyidi](https://docs.aws.amazon.com/amazonq/latest/qbusiness-ug/using-custom-plugin.html) · [AWS Q dil desteği](https://docs.aws.amazon.com/amazonq/latest/qbusiness-ug/supported-languages.html) · [AgentCore Gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-create.html) · [DynamoDB transaction](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transactions.html)

## 7. Geliştirme fazları

| Faz | Çıktı | Geçiş ölçütü |
|---|---|---|
| **Ürün ve pilot keşfi** | Pilot rota/depo, TMS alanları, kabul ve kapasite matrisi, müşteri sözleşmesi/finans/sigorta kararları. Muadil ve literatür bulgularına göre iki rol için dört tasarım akışı. | Operasyon ve ürün sahibi sefer yayınlama, yük ekleme, bırakma ve teslim senaryolarını teyit eder. |
| **Tasarım ve prototip** | React web ve native mobil için iki rolün ekranları, tıklanabilir akış, ortak tasarım belirteçleri ve kritik durumlar. | Müşteri iki depoyu ve saatleri doğru yorumlar. Dinçer yetkilisi seferi açıp uygun yükü bulabilir. |
| **MVP iş çekirdeği** | Kimlik, sefer yayını, kapasite, fiyat, rezervasyon, Dinçer onayı, depo olayları, API sözleşmesi, örnek veri. | Çift rezervasyon, erişim izolasyonu, cut-off ve 3+2+3 senaryosu API testinden geçer. |
| **Web/mobil ve Q entegrasyonu** | İki rol için React kanalları, Q eklentileri, Bedrock/AgentCore öneri aracı, operasyon ve jüri panosu. | Mobil veya web ve Q aynı kayıtları günceller, sonuç diğer kanalda görünür. Native kamera testi ve gerçek Q işlem izi doğrulanır. |
| **Kontrollü pilot** | Bir koridor, referans müşteriler, gerçek TMS/WMS entegrasyonu, kapasitesi tanımlı depo randevusu, depo eğitimi, destek ve geri alma prosedürü. | Önceden belirlenmiş KPI bazları ve saha koşullarıyla sefer/depoda uçtan uca işlem ölçülür. |
| **Yaygınlaştırma** | Yeni depo çiftleri, faturalama ve mutabakat, izleme ve operasyon kapasitesi planı. Gerekirse yük kombinasyonu optimizasyonu. | Yeni koridor ancak depo, finans ve hizmet ölçütleri pilot verisinde karşılandığında açılır. |

**İş sahipleri:** Ürün ve Operasyon kapsam/müşteri modeli, Tasarım iki rolün deneyimi, Web/Mobil ekipleri istemciler, Platform ekibi AWS/kimlik/API, Data ekibi TMS veri uygunluğu ve KPI, Depo ekipleri okutma ve kabul, Finans/Hukuk/Sigorta canlı ticari koşulların sahibidir.

## 8. Geçme kriterleri ve teslim listesi

- Dinçer planlamacısı web ve mobilde yetkili seferi yayımlar. “Aracım var, yük ekle” ekranı aday yükü ve ret sebebini gösterir. Araç değişiminde etkilenmiş talepler yeniden değerlendirilir.
- Müşteri her iki kanalda sefer bulur, kg/m³ ve palet bilgisiyle teklif alır, ayırır ve kendi rezervasyonunu izler. Başka firmanın kaydını göremez.
- Üç ayrı firma 3+2+3 aynı seferde birleştirilir. Aşırı ağırlık ve yetersiz hacim talepleri kapasiteyi değiştirmez. Son yer için iki eşzamanlı istekte yalnız biri kapasiteyi alır. Süresi dolan blokaj bir kez serbest kalır.
- Onaylı rezervasyon fiyatı yeni tarife diliminden etkilenmez. T−3 ve T−1 sınırları ekranla backend’de aynıdır. Kalkış 18.00 ise 15.00’teki rezervasyon ve 17.00’deki çıkış deposu kabulü, diğer koşullar uygunsa işlenir. 15.00’i geçen yer ayırma veya kesin rezervasyon ve 17.00’yi geçen standart yük kabulü engellenir. Sözleşme/finans pilot koşulları uygulanır.
- QR/barkodla bırakma ve teslim ayrı olaylardır. Fark, kısmi kabul, no-show ve yetkisiz alıcı test edilir. Mobil eşitleme tekrarında tek olay yazılır.
- Pilot depo randevu limitinde son uygun zaman başka rezervasyondan korunur. Araç kapasitesi ve depo zamanı ayrı doğrulanır. Pilot panosu baz veriye göre zamanında kalkış, bekleme ve net katkıyı ölçer.
- Doğrulanmış gelmeme kaydı olan firma, uygun ve kaydı bulunmayan eşdeğer taleplerin altında sıralanır. Dinçer Q gerekçeyi olay tarihi ve sipariş referansıyla açıklar. Zamanında gelen veya Dinçer kaynaklı iptal edilen yük gelmeme sayılmaz.
- Dinçer onayı tek sipariş numarası üretir ve tekrar denemede aynı numara döner. Q, web ve mobil aynı izleme durumunu gösterir. Müşteri Q başka firmaya ait siparişi veya gelmeme geçmişini açamaz.
- Jüri panosunda planlanan ve fiili doluluk ayrıdır. 8.800 TL ve 7.200 TL örnek değerleri hesap yöntemiyle gösterilir. Q ve AgentCore kanıtı korelasyon kimliğiyle kayıtla eşleştirilebilir. Gelmeme önceliği, 3+2+3 doluluk senaryosundan ayrı bir test kaydıyla gösterilir.
- Teslimler: rol ve ekran matrisi, tıklanabilir web/mobil tasarım prototipi, kaynak repo, OpenAPI ve MCP şemaları, IaC, üç firma örnek veri seti, test çıktıları, dağıtım kılavuzu ve pilot takip panosu.

**Pilot öncesi açık kararlar:** ilk gerçek depo çifti, TMS’de satılabilir seferin sahibi ve kapasite güncelleme sıklığı, depo çalışma pencereleri ve tamponlar, palet ve ürün profili, fiyat tabanı, müşteri ve alıcı yetkisi, iptal/hasar sorumluluğu, ödeme ve fatura entegrasyonu, Q ortamı ve dış müşteri kimlik akışı. Demo varsayımları pilot parametresi olarak doğrudan kullanılmaz.
