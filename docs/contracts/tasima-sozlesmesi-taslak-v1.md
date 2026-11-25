# CargoPact Depo–Depo Paylaşımlı Taşıma Sözleşmesi

**TASLAK – Sürüm 1.0-taslak · Hukuki inceleme yapılmamıştır · Yalnız hackathon demosu içindir**

## 1. Taraflar
**Gönderen (Müşteri):** {{customerName}}
**Taşıyıcı:** {{carrierName}}
**Aracı platform:** CargoPact (sipariş, kapasite ve kayıt hizmeti verir; taşıma işini üstlenmez)

## 2. Konu ve kapsam
2.1. Bu sözleşme, Gönderen'in aşağıdaki yükünün Taşıyıcı'nın planlı seferinde, çıkış transfer merkezinden varış dağıtım merkezine taşınmasını düzenler.
2.2. Kapıdan alım ve kapıya teslim **kapsam dışıdır**. Yükü çıkış deposuna getirmek ve varış deposundan teslim almak Gönderen'in sorumluluğundadır.

| Alan | Değer |
|---|---|
| Sefer | {{tripReference}} |
| Güzergâh | {{originName}} → {{destinationName}} |
| Planlanan kalkış | {{departure}} |
| Son rezervasyon (T−3) | {{bookingCutoff}} |
| Çıkış deposu son kabul (T−1) | {{intakeCutoff}} |
| Varış deposu alım penceresi | {{pickupWindow}} |
| Yük | {{pallets}} palet · {{grossKg}} kg · {{volumeM3}} m³ · {{productClass}} |
| Navlun | {{unitPrice}} / palet · toplam **{{totalPrice}}** (KDV hariç, demo) |
| Ödeme planı | {{paymentPlan}} |

## 3. Gönderen'in yükümlülükleri
3.1. Yük, istiflenmeyen standart paletlere yüklenmiş, sağlam ve etiketlenmiş olarak teslim edilir. Paletlenmemiş koli kabul edilmez.
3.2. Palet adedi, brüt ağırlık, hacim ve ürün sınıfı beyanı doğru olmalıdır. Tehlikeli madde (ADR) ancak Taşıyıcı açıkça kabul ederse taşınır.
3.3. Yük en geç **Çıkış deposu son kabul (T−1)** saatine kadar çıkış deposuna getirilir. Bu saatten sonra gelen yük o sefere alınmayabilir.
3.4. Varış deposunda yük yalnız Gönderen'in bildirdiği **yetkili alıcıya** ve **teslim kodu** doğrulanarak teslim edilir. Teslim kodunun gizliliğinden Gönderen sorumludur.

## 4. Taşıyıcı'nın yükümlülükleri
4.1. Onaylanan yükü belirtilen seferde, iç transfer yüküyle birlikte ve yük güvenliğini sağlayarak taşır.
4.2. Kabul, yükleme, varış ve teslim olaylarını palet bazında kaydeder; teslimde elektronik teslim belgesi (e-POD) düzenler.
4.3. Sefer iptali veya araç değişikliği halinde Gönderen'i gecikmeksizin bilgilendirir.

## 5. Depo kabulü ve ölçüm
5.1. Taşıyıcı yükü çıkış deposunda ölçer. Ölçüm beyandan ayrı kaydedilir.
5.2. Fark %3 tolerans içindeyse yük kabul edilir. Fark araç kapasitesini aşıyorsa yük **incelemeye** alınır; Taşıyıcı kısmi kabul veya ret kararı verebilir. Kabul edilmeyen paletlerin bedeli iptal koşullarına göre iade edilir.
5.3. Birim fiyat onay anında sabitlenir; toplam bedel yalnız kabul edilen palet adedi değişirse değişir.

## 6. Ödeme
6.1. **Tamamı peşin** planında toplam bedel taşıyıcı onayında tahsil edilir. **Kapora** planında bedelin %30'u onayda, kalanı depo kabulünde tahsil edilir.
6.2. Onay öncesi iptal, ret veya süre aşımında tahsilat yapılmaz; provizyon serbest bırakılır.

## 7. İptal ve gelmeme
| İptal zamanı (kalkışa kalan süre) | İade |
|---|---|
| 24 saatten fazla | %100 |
| 24 saat ile T−3 arası | %50 |
| T−3 sonrası veya yük getirilmezse (gelmeme) | %0 |

7.1. Taşıyıcı kaynaklı iptal veya aksamada Gönderen'e tam iade yapılır ve bu durum gelmeme sayılmaz.
7.2. Doğrulanmış gelmeme kaydı, Gönderen'in ileriki taleplerinde öncelik sırasını düşürebilir.

## 8. Hasar, eksik ve sorumluluk
8.1. Hasar veya eksiklik teslim sırasında tutanağa geçirilir; görünmeyen hasarlar teslimden itibaren 7 gün içinde yazılı bildirilir.
8.2. Taşıyıcı'nın sorumluluğu, Türk Ticaret Kanunu'nun yük taşıma hükümleri çerçevesinde ve kanuni üst sınırlarla sınırlıdır. Kesin sınırlar ve sigorta koşulları pilot öncesinde hukuken belirlenecektir.

## 9. Kişisel veriler
Taraflar yalnız taşıma, teslim ve faturalama için gerekli kişisel verileri (yetkili alıcı adı ve telefonu gibi) 6698 sayılı KVKK'ya uygun işler.

## 10. Uyuşmazlık
Bu taslakta uyuşmazlık çözüm yeri ve uygulanacak hukuk henüz belirlenmemiştir.

## 11. Onay
Gönderen adına **{{signerName}}**, bu sözleşmeyi CargoPact üzerinden {{acceptedAt}} tarihinde elektronik olarak onaylamıştır.
Sözleşme parmak izi (SHA-256): `{{contractHash}}`
