# CargoPact – Canlı Demo Senaryosu (≈7 dk)

Kaynaklar: `docs/PROJECT_PLAN.md` §5, `docs/DEMO_API.md`. Demo seferi: `DNC-DEMO-GEB-ANK` (Dinçer Gebze Transfer Merkezi → Dinçer Ankara Dağıtım Merkezi, yarın 18:00). Tüm veriler kurgusaldır.

> **Durum işareti:** ⚠️ **DOĞRULANACAK** = adım, başka ekiplerin bitirmekte olduğu bir özelliğe bağlı. Provada mutlaka denenmeli. Bu belge yazılırken (git `9e42c55`) API'de rezervasyon/onay/depo olayı uçları ve ajan Runtime'ı henüz repoda tamamlanmış görünmüyordu.

## 0. Hazırlık (sunumdan 15 dk önce)

| Cihaz | Ne açık | Hesap |
|---|---|---|
| **Dizüstü, tarayıcı sekmesi A** | Web transfer merkezi: https://d1xysc2r88pheq.cloudfront.net | `web.yonetici@cargopact.example.test` (Dinçer Lojistik) |
| **Dizüstü, sekme B (gizli pencere)** | Web müşteri: https://d1xysc2r88pheq.cloudfront.net | `web.musteri@cargopact.example.test` (Marmara Ambar) |
| **Telefon (veya dizüstü dar pencere)** | Mobil müşteri: https://d1xysc2r88pheq.cloudfront.net/m/ | `mobil.musteri@cargopact.example.test` (Anadolu Parsiyel) |
| **Yedek** | Sekme C (başka gizli pencere) | `user@baskent.example.test` (Başkent Nakliye) |
| Mobil taşıyıcı (isteğe bağlı) | `/m/` ikinci tarayıcı | `mobil.yonetici@cargopact.example.test` |

Parola hepsinde: `Cargopact2026!` (giriş ekranlarında hızlı doldurma düğmesi var).

1. Demo verisini sıfırla (aşağıdaki §Sıfırlama). 25/33 görünmeli.
2. Tüm hesaplara önceden giriş yap, sayfaları açık bırak (Cognito token süresi dolmasın diye sunumdan hemen önce yenile).
3. Kart numarası hazır: simüle sağlayıcı. `4000000000000002` reddedilir; başka geçerli test numarası kullan (ör. `4000056655665556`, son kullanma 09/28, CVC 314). ⚠️ Kabul edilen numarayı provada doğrula.
4. Ekranı tek dizüstüne çıkar: sekme A büyük, B ve C hızlı geçiş.

## Sıfırlama (her prova ve sunumdan önce)

```bash
cd /workshop && set -a && . ./.env.seed && set +a && npm run demo:reset
```

Beklenen: seed idempotent; ana veri geri gelir. ⚠️ Demo seferi ve rezervasyonları temizleyen "reset" yalnız seed'in L2 katmanı tamamlandıysa çalışır (steering: L2–L4 diğer spec'lerle). Provada sonrasında jüri panosunun **25/33** gösterdiğini doğrula. Gerekirse `npm run seed:reset -w @cargopact/db` sonra `npm run demo:reset`.

## Zaman çizelgesi

| Dk | Bölüm | Cihaz |
|---|---|---|
| 0:00–0:45 | 1. Jüri panosu: 25/33 | Web yönetici |
| 0:45–2:00 | 2. Marmara 3 palet / 1.500 kg → onay → 28/33 | Web müşteri + web yönetici |
| 2:00–3:15 | 3. Anadolu 2 palet / 1.200 kg, kaporalı, mobil → onay → 30/33 | Mobil + web yönetici |
| 3:15–4:30 | 4. Başkent 3 palet / 2.600 kg reddi, sonra 1.900 kg → 33/33 planlanan | Başkent + web yönetici |
| 4:30–5:15 | 5. Depo olayları → fiili 33/33 | Web yönetici |
| 5:15–5:45 | 6. Sipariş numarasıyla takip | Web müşteri / mobil |
| 5:45–7:00 | 7. Asistan: müşteri ve taşıyıcı soruları | Web müşteri + web yönetici |

---

## 1. Jüri panosu (0:00–0:45) · Web yönetici

**Tıkla**
1. Sekme A → giriş yapılmış, transfer merkezi ekranı. Sol menü / ana sayfa: **Jüri panosu** (veya `Dashboard`).
2. Demo seferini seç: Gebze → Ankara (`DNC-DEMO-GEB-ANK`).

**Ne söyle**
> "CargoPact, taşıyıcının zaten planlanmış depo transferinde boş kalan paleti satışa açar. Bu Gebze–Ankara seferinde 33 pozisyon var, 25'i Dinçer'in kendi yükü. 8 palet, 5.000 kg ve 12 m³ satışa açık. Palet, kg ve m³ doluluğu ayrı izleniyor."

**Beklenen ekran:** 33 pozisyon şeması (11×3), 25 gri iç yük, **25/33 planlanan**, aktüel 25/33. Brüt tutar 0 TL. "Satışa açık: 8 palet / 5.000 kg / 12 m³". Saat çipleri: son rezervasyon T−3 = 15:00, çıkış deposu son kabul T−1 = 17:00.

**Fallback:** Pano açılmazsa `Seferler` listesinden seferi aç; kapasite çubukları aynı veriyi gösterir. API çökmüşse `https://765h182ijf.execute-api.us-east-1.amazonaws.com/health` 200 dönüyor mu bak; dönmüyorsa §Genel yedek planına geç.

---

## 2. Marmara Ambar: 3 palet, 1.500 kg (0:45–2:00) · Web müşteri → Web yönetici

⚠️ **DOĞRULANACAK:** teklif, rezervasyon ve onay uçları (`/customer/trips/{id}/quote`, `/customer/reservations`, `/carrier/reservations/{id}/decision`).

**Tıkla (sekme B, Marmara Ambar)**
1. **Sefer ara** → Gebze → Ankara, yarın. Kartta fiyat, kalkış, kalan palet, "Son rezervasyon (T−3) 15:00" ve "Çıkış deposu son kabul (T−1) 17:00" görünür.
2. Kartı aç → Palet: **3**, brüt kg: **1.500**, ürün sınıfı **GENEL** → **Teklif al**.
3. "Fiyat neden böyle?" kutusunu aç (taban, talep katsayısı, zaman katsayısı, sınır).
4. Ödeme planı **Tamamı** → test kartı → **Yer ayır**.

**Ne söyle**
> "Fiyatı backend hesaplıyor, istemci fiyat gönderemez. Aynı girdi aynı fiyatı verir. Teklif önizlemesi kapasiteyi değiştirmez, ancak 'Yer ayır' dediğimde süreli blokaj açılıyor. Durum: taşıyıcı onayı bekliyor."

**Beklenen ekran:** başvuru referansı `BV-…`, durum "Taşıyıcı onayı bekliyor", blokaj bitiş saati. Müşteri başka firmanın kaydını görmez.

**Tıkla (sekme A, Dinçer)**
5. Seferi yenile → **Bekleyen talepler**: Marmara Ambar, 3 palet / 1.500 kg, "Uygun". Kartta **Müşteri geçmişi: 10 sonuçlanmış talep, 2 doğrulanmış gelmeme** uyarısı görünür.
6. **Knowledge Base yorumunu göster** → panelde taşıyıcıya özel kural açıklaması ve `ozet-olaylar.md` kaynak adı görünür. Sayılar işlem API'sinden gelir; KB yalnız kuralı yorumlar.
7. **Onayla**.

**Ne söyle**
> "Onay ekranı müşterinin geçmiş sonuçlarını işlem verisinden getiriyor: Marmara Ambar'ın 10 sonuçlanmış talebinin 2'sinde onaylı yük zamanında depoya getirilmemiş. Knowledge Base bu sayıları üretmiyor; taşıyıcıya özel öncelik kuralını ve istisnaları açıklıyor. Bu bir karar desteğidir, otomatik ret değildir. Onayda sistem uygunluğu ayrıca yeniden kontrol ediyor: palet, brüt kg, m³, ürün, zaman ve iç yük rezervi."

**Beklenen ekran:** Geçmiş uyarısı, Knowledge Base kaynaklı kısa kural yorumu, ardından `CP-2026-00xxxx` sipariş numarası (aynı onay tekrarında aynı numara), pano **28/33**, onaylı 3 palet, brüt tutar artar.

**Fallback:** Müşteri formu hata verirse mobil ekrandan aynı isteği yap. Onay butonu hata verirse sekmeyi yenile; onay idempotent olduğu için yeniden basmak çift sipariş üretmez, aynı numara döner. Hiçbiri çalışmazsa önceden çekilmiş ekran görüntüsü / video (§Genel yedek planı).

---

## 3. Anadolu Parsiyel: 2 palet, 1.200 kg, mobil, kaporalı (2:00–3:15) · Mobil → Web yönetici

⚠️ **DOĞRULANACAK:** mobilde kapora (`deposit`) planı seçimi ve mobil onay ekranı.

**Tıkla (telefon, `/m/`, Anadolu Parsiyel)**
1. **Palet gönder** → Gebze → Ankara seferini seç.
2. Palet: **2**, kg: **1.200** → teklif.
3. Ödeme planı: **Kapora** (%30 şimdi, kalan T−1 öncesi) → kart → **Yer ayır**.

**Ne söyle**
> "Aynı backend, aynı kurallar: mobil, web ve sohbet aynı hesaplanmış değerleri gösteriyor. Bu firma kapora planını seçti, yüzde 30 şimdi, kalan kalkıştan bir saat önce."

**Beklenen ekran:** durum "Taşıyıcı onayı bekliyor", ödeme: provizyon, kapora tutarı.

**Tıkla (onay: mobil taşıyıcı hesabıyla veya web yöneticiyle)**
4. `mobil.yonetici@cargopact.example.test` ile `/m/` → bekleyen talep → **Onayla**. (Zaman kısıtlıysa web sekme A'da onayla.)

**Beklenen ekran:** sipariş numarası, pano **30/33**, ödeme: kapora tahsil edildi, kalan tutar "due" olarak görünür.

**Fallback:** Telefon bağlantısı kötüyse aynı akışı dizüstünde `/m/` adresinde dar pencerede yap. Mobil taşıyıcı ekranı hazır değilse onayı sekme A'da yap, mobil müşteri ekranında durumun değiştiğini göster.

---

## 4. Başkent Nakliye: ağırlık reddi, sonra 1.900 kg (3:15–4:30) · Başkent → Web yönetici

⚠️ **DOĞRULANACAK:** uygunluk gerekçelerinin (`MAX_GROSS_EXCEEDED`) ekranda gösterilmesi.

**Tıkla (sekme C, Başkent)**
1. Seferi aç → Palet **3**, kg **2.600** → **Teklif al**.
2. Ekran "Uygun değil" gösterir. Gerekçe listesini oku.

**Ne söyle**
> "3 pozisyon boş görünüyor, ama 17.000 iç yük artı 1.500 artı 1.200 artı 2.600 kg, 22.300 kg eder; azami yük 22.000 kg. Nominal boş pozisyon yeterli değil. Sistem reddediyor ve kapasiteye dokunmuyor."

**Beklenen ekran:** `MAX_GROSS_EXCEEDED` (ve `INSUFFICIENT_KG`) gerekçesi Türkçe mesajla. Pano hâlâ 30/33; hiçbir blokaj eklenmedi.

**Tıkla**
3. Kg değerini **1.900** yap → teklif → **Yer ayır** (palet 3).
4. Sekme A → bekleyen talep, Başkent Nakliye, 3 palet / 1.900 kg → **Onayla**.

**Beklenen ekran:** sipariş numarası, pano **33/33 planlanan**, toplam brüt 21.600 kg, brüt tutar. Plan: 8.800 TL. ⚠️ Canlıda tutar formül çıktısına bağlıdır; plan değerleri (1.250/1.100/950 TL/palet) seed ile yazılmış kayıtsa 8.800 TL görünür, formülle üretildiyse farklı olabilir (bkz. `capacity-and-pricing/design.md` §6). Provada ekrandaki tutarı ve söylenecek cümleyi netleştir.

**Ne söyle**
> "Aynı firma, düzeltilmiş 1.900 kg yükle kabul edildi. Araç şimdi planlanan olarak dolu, ama bu henüz fiilen yüklendiği anlamına gelmiyor."

**Fallback:** Kg doğrulaması beklenen kodu vermezse (ör. yalnız `INSUFFICIENT_KG`), gerekçe metnini olduğu gibi oku ve ağırlık kuralını sözlü anlat. Başkent hesabı girmezse `user@baskent...` parolasını yeniden dene, olmazsa seed'i yenile.

**Eşzamanlılık (isteğe bağlı 15 sn):** "Son yer için iki istek aynı anda gelse, Aurora DSQL üzerinde 6 eşzamanlı istekten yalnız 1'i kazanıyor, entegrasyon testimizde kanıtladık." (`npm run test:integration`, canlıda gösterme.)

---

## 5. Depo olayları → fiili 33/33 (4:30–5:15) · Web yönetici

⚠️ **DOĞRULANACAK:** depo olayı uçları (`POST /carrier/reservations/{id}/events`) ve web/mobil depo ekranı.

**Tıkla (sekme A)**
1. Her üç rezervasyon için sırayla: **Depo kabul** → **Yüklendi** (gerekirse palet QR/kod okutma ekranı).
2. Panoda **Planlanan / Fiili** sekmesini değiştir.

**Ne söyle**
> "Planlanan, bloke ve fiili doluluk karışmıyor. Palet çıkış deposunda kabul edilip araca yüklendikçe fiili sayaç artıyor. Aynı okutma tekrarlanırsa çift hareket oluşmaz."

**Beklenen ekran:** fiili **33/33**, üç firma ayrı renk/baş harf, toplam 8 dış palet. Zaman çizelgesi olayları listeler.

**Fallback:** Olay uçları hazır değilse planlanan 33/33 ekranını gösterip "fiili yükleme aynı modelle çalışıyor, kabul/yükleme olayları depo ekranından girilir" de ve `warehouse-and-tracking` gereksinimlerini aç. Olay sırası hatası (`INVALID_TRANSITION`) çıkarsa önce `DEPO_KABUL`, sonra `YUKLENDI` sırasını izle.

---

## 6. Sipariş numarasıyla takip (5:15–5:45) · Web müşteri veya mobil

**Tıkla**
1. Sekme B (Marmara) → **Rezervasyonlarım** veya **Takip** → sipariş numarasını (`CP-2026-…`) gir.

**Ne söyle**
> "Müşteri yalnız kendi firmasının siparişini görür. Başka firmanın numarasını girerse 404 alır. Son doğrulanmış durum, güncelleme saati ve sıradaki adım görünür."

**Beklenen ekran:** adımlar (Onaylandı → Çıkış deposunda kabul edildi → Araca yüklendi → …), palet kodları `CP-2026-…-P1`.

**Fallback:** Takip sayfası boşsa Rezervasyonlarım listesindeki kartın olay zaman çizelgesini göster (`events`).

---

## 7. Asistan soruları (5:45–7:00) · Web müşteri ve Web yönetici

⚠️ **DOĞRULANACAK:** AgentCore Runtime yayında mı? Sunum öncesi `POST /chat` ile deneyin. Bu repo durumunda `CargoPact-Agents` yığınında Runtime ayrı bir deploy adımıdır (`-c agentImageTag=...`); `chat` Lambda'sı `AGENT_RUNTIME_ARN` boşsa 503 döner.

**Müşteri (sekme B, sohbet paneli)**
- "Gebze'den Ankara'ya yarın 3 palet göndermek istiyorum, hangi sefer uygun?"
- "CP-2026-… numaralı yüküm nerede?"

**Taşıyıcı (sekme A, sohbet paneli)**
- "Bu seferde bekleyen taleplerde kime öncelik verelim?"
- "Başkent Nakliye'nin yükünü getirmediği oldu mu? Öncelik kuralı nedir?"

**Ne söyle**
> "Asistan, orkestratör ajan ve müşteri/taşıyıcı uzman ajanlardan oluşuyor. Araçları, sorgulayan kullanıcının kendi token'ıyla backend'i çağırıyor, yani yetki ve kiracı sınırı sohbette de aynı. Rezervasyon veya onay gibi yazma işlemlerini ajan yapmaz, kullanıcıyı onay formuna yönlendirir."

**Beklenen yanıt (içerik):**
- Müşteri: uygun sefer, fiyat, kalan palet, T−3/T−1 saatleri. Sipariş durumu ve sıradaki adım.
- Taşıyıcı: bekleyen talepler `priorityRank` sırasıyla, doğrulanmış gelmeme sayısı ve gerekçe. Kural: doğrulanmış gelmeme kaydı olan firma uygun talepler arasında daha düşük önceliktedir, eşitlikte başvuru sırası. Zamanında bildirilmiş iptal, taşıyıcı kaynaklı aksama, geç gelen veya ölçüm farkı gelmeme sayılmaz. Müşteri başka firmanın geçmişini göremez.
- ⚠️ Taşıyıcıya özel Knowledge Base'in kurulu olup olmadığı doğrulanacak; kurulu değilse kural metni `carrier_rules` aracından gelir.

**Fallback**
- Yanıt 10 sn'den uzun sürerse (Lambda zaman aşımı 26 sn): "Model yanıtı hazırlarken izleme ekranına bakalım" de, §6 takip ekranını göster, yanıt gelince dön.
- Sohbet 503 / "Asistana şu an ulaşılamıyor" derse: ekran görüntüsünü göster; öncelik sırasını web yönetici ekranındaki `priorityRank` ve `verifiedNoShows` alanlarından göster.
- Soruları önceden bir kez sor; oturum belleği (AgentCore Memory) ısınmış olur, ilk çağrı soğuk başlangıç nedeniyle yavaş olabilir.

---

## Kapanış (7:00)

> "Gördüğünüz her sayı sunucuda hesaplandı: fiyat, uygunluk, kesim saatleri ve doluluk. Aynı sistem web, mobil ve sohbette aynı kaydı güncelliyor. Plan örneğinde 8.800 TL brüt ve 200 TL/palet değişken gider sonrası 7.200 TL ek katkı, kurgusal demo değerleridir."

## Genel yedek planı

1. **Önceden kaydedilmiş 2–3 dk ekran videosu** (bu belgenin tüm adımları). İnternet/AWS sorunu olursa videoyu oynat.
2. **Ekran görüntüleri:** 25/33, 28/33, 30/33, ret gerekçesi, 33/33 planlanan, fiili 33/33, sohbet yanıtı.
3. Tek adım takılırsa: o adımın fallback'ini uygula, geri kalanı atla, sürenin kalanında §Kapanış'a git. Hatayı gizleme; "bu adımı önceden kaydettik" de.
4. Veri bozulursa: §Sıfırlama komutunu çalıştır (~1 dk) ve baştan başla.
