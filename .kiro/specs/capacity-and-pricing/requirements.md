# Requirements – Kapasite Yayını ve Dinamik Fiyat

## Giriş
Taşıyıcı planlamacının sefer kapasitesini yayınlaması, müşterinin uygun seferleri araması ve sunucuda hesaplanan dinamik fiyatla teklif önizlemesi.

## Gereksinimler

### 1. Sefer yayınlama ("Aracım var, yük ekle")
**Kullanıcı hikayesi:** Taşıyıcı planlamacı olarak boş kapasiteyi satışa açmak istiyorum.
1. WHEN planlamacı sefer yayınlarsa THEN sistem çıkış/varış deposu, kalkış zamanı (T), araç profili, tesisler ve araç (master-data-and-seed spec'inden), toplam pozisyon, iç yük (palet/kg), satışa açılan palet/kg/m³, tampon, fiyat tabanı ve alt/üst sınırı kaydedecek.
2. IF satışa açılan miktar (toplam − iç yük − tampon) kapasiteyi aşarsa THEN sistem yayını reddedecek ve nedeni gösterecek.
3. Sistem T−3 (rezervasyon son saati) ve T−1 (çıkış deposu son kabul) değerlerini kalkıştan türetecek; varış alım penceresi ayrı alan olacak.
4. WHEN araç veya kapasite değişirse THEN kapasite sürümü artacak ve etkilenen bekleyen talepler yeniden değerlendirilecek.
5. Planlamacı yalnız kendi taşıyıcısının seferlerini yayınlayıp düzenleyebilecek.

### 2. Kapasite muhasebesi
1. Sistem her sefer için palet, kg ve m³ boyutlarında ayrı ayrı: satışa açık, bloke, onaylı, fiili yüklenen miktarları tutacak.
2. Kalan kapasite = satışa açık − bloke − onaylı. Üç boyutun herhangi biri yetersizse sefer talep için uygun değildir.
3. İç yük rezervine hiçbir koşulda dokunulmayacak.

### 3. Sefer arama
1. WHEN onaylı müşteri çıkış/varış/tarih/palet adedi ile ararsa THEN sistem yalnız yayında, T−3 sınırı geçmemiş ve yeterli kalan kapasitesi olan seferleri; fiyat, saatler ve iki depo bilgisiyle listeleyecek.
2. Arama kapasite değiştirmeyecek.

### 4. Dinamik fiyat
1. Fiyat sunucuda `taban × talepKatsayısı × zamanKatsayısı` olarak hesaplanacak ve taşıyıcının alt/üst sınırına kırpılacak; istemci fiyat gönderemeyecek.
2. WHILE doluluk (onaylı + bloke) / satışa açık oranı yükseldikçe THEN talep katsayısı basamaklı artacak.
3. WHILE kalkışa (T−3) kalan süre azalır ve doluluk eşiğin altındaysa THEN zaman katsayısı kademeli düşecek; doluluk eşiğin üstündeyse düşüş uygulanmayacak.
4. Aynı girdi (sefer sürümü, talep, saat) aynı fiyatı üretecek (deterministik; saat girdi olarak verilir).
5. Teklif yanıtı hesaplama dökümünü (taban, talep, zaman, sınır) ve geçerlilik süresini içerecek.
6. Teklif önizleme kapasite değiştirmeyecek.

### 5. Uygunluk
1. WHEN talep değerlendirilirse THEN palet adedi, brüt kg (toplam azami yük dahil), m³, ürün sınıfı uyumu ve zaman pencereleri kontrol edilecek; ret gerekçesi kodla ve metinle dönecek.
2. Koli beyanlarında kapasite ve fiyat, master-data-and-seed spec'indeki palet eşdeğeri üzerinden hesaplanacak; sefer paletlenmemiş koli kabul etmiyorsa talep reddedilecek.
3. Örnek kabul: 3+2+3 senaryosunda 22.300 kg talebi (azami 22.000) reddedilecek ve kalan kapasite değişmeyecek.
