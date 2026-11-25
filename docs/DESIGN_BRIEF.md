# ChatGPT'ye verilecek tasarım istemi

Aşağıdaki bloğu olduğu gibi ChatGPT'ye yapıştırın. Bir seferde tüm ekranlar uzun gelebilir; ChatGPT yarıda keserse "Devam et: Bölüm 4'ten" yazın. Çıktıyı almak için iki yol: (A) görsel mock'lar için "ekranları görsel olarak üret", (B) tıklanabilir prototip için "tek dosyalık HTML/CSS prototip üret". Önce B ile akışı doğrulamanızı öneririm.

---

```
Rolün: kıdemli ürün tasarımcısı (UX/UI). Görevin: "CargoPact" adlı lojistik uygulaması için web (masaüstü) ve mobil (telefon) ekran tasarımları hazırlamak. Arayüz dili TÜRKÇE.

## 1. Ürün
CargoPact, taşıyıcı firmaların (Dinçer Lojistik, Siva gibi) planlı depo-depo transfer seferlerinde boş kalan palet alanını yayınladığı ve müşterilerin (Marmara Ambar, Anadolu Parsiyel, Başkent Nakliye gibi küçük nakliyeci/ambar/yük sahibi) kendi rotalarına uygun araçta yer ayırttığı bir pazar yeridir. Kapıdan alım/teslim YOK: müşteri paletlerini çıkış transfer merkezine kendisi getirir, araç varış dağıtım merkezine taşır, müşteri veya yetkili alıcısı varış deposundan teslim alır.

## 2. Roller ve platformlar
- Müşteri: web + mobil
- Taşıyıcı planlamacı: web (ağırlıklı) + mobil (kısa işlemler)
- Taşıyıcı depo personeli: mobil (ağırlıklı, kamera ile QR/barkod okutma) + web (iş listesi)
- Yönetim/jüri: web panosu (salt okunur)

## 3. Tasarım ilkeleri
- Net, sakin, kurumsal lojistik hissi. Yoğun veri ama okunaklı. WCAG AA kontrast, en az 44px dokunma alanı (mobil).
- Durumlar yalnız renkle değil METİN ETİKETİYLE de gösterilir.
- Üç kapasite göstergesi AYRI: palet, kg, m³. Planlanan / bloke / fiili doluluk karıştırılmaz.
- İki depo (çıkış ve varış) ve iki saat her zaman görünür: "Son rezervasyon (T−3)" ve "Çıkış deposu son kabul (T−1)". Varış alım penceresi ayrı.
- Fiyat sabit gösterilir ama dinamiktir: kartta toplam fiyat, palet başı fiyat ve küçük "Fiyat neden böyle?" açılır bilgisi (talep yoğunluğu ↑/↓, kalkışa kalan süre). Teklif geçerlilik süresi geri sayım ile gösterilir.
- Müşteri ekranlarında başka firmaların verisi, öncelik sırası veya gelmeme geçmişi ASLA görünmez.
- Her ekran için şu durumlar tasarlanmalı: boş, yükleniyor (skeleton), hata, başarı, ret/süre doldu. Mobilde çevrimdışı: "Bekliyor – sunucu teyidi yok" rozeti.
- Sipariş durumları (sıralı): Teklif → Taşıyıcı onayı bekliyor → Onaylı → Depoda kabul edildi → Araca yüklendi → Yolda → Varışta teslime hazır → Teslim edildi. Yan durumlar: Süresi doldu, Reddedildi, İptal, Eksik/Hasar, Yeniden planlandı.
- Sipariş numarası biçimi: CP-2026-000123.

## 4. İstenen ekranlar
### Müşteri (web + mobil)
1. Giriş / kayıt (e-posta, doğrulama kodu)
2. Ana sayfa: "Palet gönder", "Rezervasyonlarım", "Depodan teslim al"
3. Sefer arama: çıkış/varış depo, tarih, palet adedi; sonuç kartları (rota, kalkış, kalan palet, fiyat, son rezervasyon saati)
4. Yük beyanı (mobilde 3 adım): palet adedi ve ölçü profili, brüt kg, m³, ürün sınıfı, yetkili alıcı
5. Teklif özeti: fiyat dökümü, "Fiyat neden böyle?", iki depo, saatler, iptal koşulları özeti, ödeme planı (tamamı / kapora+kalan), teklifi kabul et → süreli blokaj
6. Ödeme (simüle): kart formu, kapora/tamamı seçimi, onay ekranı
7. Rezervasyonlarım listesi ve detay: durum zaman çizgisi, sipariş numarası, QR, "depoya nasıl giderim?", ödeme durumu, iptal et düğmesi (iptal ücreti ve iade tutarı önizlemeli onay penceresi)
8. Yük takibi (sipariş numarasıyla): palet bazlı durum, son güncelleme saati
9. Teslim alma: QR, yetkili alıcı doğrulama, e-POD / teslim belgesi
10. Bildirimler

### Taşıyıcı planlamacı (web + mobil)
11. Ana sayfa: birincil düğme "Aracım var, yük ekle", yaklaşan seferler
12. Sefer yayınlama: sefer seç/oluştur, araç, iç yük, satışa açılacak palet/kg/m³, tampon, taban fiyat ve alt/üst fiyat sınırı, T−3/T−1 saatleri, depo kabul penceresi
13. Sefer detayı: Gebze → Ankara başlığı, üst kısımda kalkış/kesim saatleri, üç ayrı kapasite çubuğu, altta "uygun talepler" ve "inceleme bekleyenler" tabloları, ret gerekçesi
14. Onay kuyruğu: talep kartı (firma, palet, kg, m³, uygunluk sonucu, öncelik nedeni, doğrulanmış gelmeme sayısı), Onayla / Reddet (gerekçe zorunlu) teyit penceresi
15. Taşıyıcı sohbet asistanı paneli (örnek: "Bu seferde kime öncelik verelim?")
16. İstisna listesi: gelmeme, geç bırakma, ölçüm farkı, hasar
17. Ödeme ve iptal politikası ayarı (iptal dilimleri tablosu, kapora oranı)

### Depo personeli (mobil ağırlıklı)
18. İş listesi (kabul / yükleme / teslim sekmeleri)
19. Kamera ile QR/barkod okutma ekranı (okutma sonucu: başarılı / tekrar okutma / bulunamadı)
20. Palet kabul: ölçü ve kg girişi, beyanla fark uyarısı, fotoğraf, kabul / kısmi kabul / reddet
21. Yükleme: sefer manifesti, okutulan/kalan palet sayacı
22. Varışta teslim: alıcı doğrulama, palet bazlı teslim, imza/fotoğraf (e-POD)
23. Çevrimdışı kuyruk göstergesi

### Yönetim / jüri panosu (web)
24. 33 pozisyonlu araç şeması (iç yük gri, her müşteri farklı desen+etiket), planlanan ve fiili doluluk ayrı
25. Gelir ve net katkı kartları, olay zaman çizgisi
26. Sohbet/ajan işlem izi tablosu (korelasyon kimliği)

## 5. Örnek veri (ekranlarda kullan)
Sefer: Gebze Transfer Merkezi → Ankara Dağıtım Merkezi, kalkış 18:00. Son rezervasyon 15:00, son kabul 17:00. 33 pozisyon, 25 iç palet, satışa açık 8 palet / 5.000 kg / 12 m³.
- Marmara Ambar: 3 palet, 1.500 kg, 3.750 TL
- Anadolu Parsiyel: 2 palet, 1.200 kg, 2.200 TL
- Başkent Nakliye: 3 palet, 2.600 kg → REDDEDİLDİ (toplam ağırlık sınırı aşılıyor); sonra 3 palet, 1.900 kg, 2.850 TL onaylandı
Taşıyıcılar: Dinçer Lojistik, Siva Taşımacılık.

## 6. Tasarım sistemi (ayrıca teslim et)
- Renk belirteçleri (birincil, ikincil, nötr, durum renkleri: başarı/uyarı/hata/bilgi/bekliyor), tipografi ölçeği, boşluk ve köşe yarıçapı, gölge, ikon seti önerisi.
- Bileşenler: kapasite çubuğu, sefer kartı, teklif kartı, durum rozeti, zaman çizgisi, tablo, form alanları, modal, toast, boş durum, QR kutusu, geri sayım.
- Belirteçleri JSON olarak ver (tokens.json): color, typography, spacing, radius.

## 7. Çıktı biçimi
Her ekran için: ekran adı, hedef platform (web/mobil), amaç, yerleşim açıklaması (bölge bölge), bileşen listesi, tüm durumlar (boş/yükleniyor/hata/başarı/ret), ekranlar arası gezinme. Önce bir bilgi mimarisi ve gezinme haritası ver, sonra ekranları sırayla üret, en sonda tasarım sistemini ver.
[SEÇ: A) Her ekran için görsel mock üret. / B) Tüm akışı tıklanabilir tek dosyalık HTML+CSS+JS prototip olarak üret (mobil ve masaüstü görünüm geçişli).]
```
