# Requirements – Çoklu Ajan ve Sohbet

## Giriş
Kendi React sohbet arayüzü → `/chat` → AgentCore Runtime (Strands orkestratör + uzman ajanlar). Ajanlar yalnız yetkili araçları kullanır; yazma işlemleri iş API'sinde yapılır. Amazon Q Business bu hesapta erişilemez, kapsam dışı.

## Gereksinimler

### 1. Sohbet kanalı
**Kullanıcı hikayesi:** Kullanıcı olarak Türkçe doğal dille işlerimi yürütmek istiyorum.
1. WHEN kimliği doğrulanmış kullanıcı mesaj gönderirse THEN sistem oturum kimliğiyle AgentCore Runtime'a iletecek ve yanıtı dönecek.
2. Oturum belleği AgentCore Memory'de kullanıcı ve oturum bazlı tutulacak; kullanıcılar arası bellek karışmayacak.
3. Mesaj uzunluğu ve oran sınırı API sınırında doğrulanacak.
4. Web ve mobil sohbet aynı `/chat` sözleşmesini kullanacak.

### 2. Müşteri asistanı
1. WHEN müşteri rota ve palet bilgisini söylerse THEN ajan eksik beyanı sorup uygun seferleri ve fiyat önizlemesini sunacak.
2. WHEN müşteri yer ayırmak isterse THEN ajan yazma öncesi açık teyit isteyecek; teyit sonrası iş API'si çağrılacak.
3. WHEN müşteri sipariş numarası verirse THEN ajan yalnız kendi firmasının siparişinin son doğrulanmış durumunu verecek.
4. Ajan başka firmaya ait veri veya gelmeme geçmişi açıklamayacak.

### 3. Taşıyıcı asistanı
1. WHEN planlamacı bir sefer için öncelik sorarsa THEN ajan adayları kural sırasıyla verecek, gerekçeyi taşıyıcının Knowledge Base kuralı ve canlı API'nin doğruladığı geçmişle açıklayacak.
2. Onay/ret ajan tarafından yalnız ayrı teyit formu sonrası işlenecek.
3. Geçmiş yoksa ajan "doğrulanmış gelmeme kaydı yok" diyecek; dizinde olmaması kaydın olmadığı anlamına gelmeyecek.

### 4. Araçlar ve yetki
1. Ajan araçları (sefer arama, fiyat önizleme, sipariş sorgulama, öneri) AgentCore Gateway üzerinden MCP/Lambda aracı olarak sunulacak.
2. Her araç çağrısı kullanıcının `tenantId` ve rolüyle yetkilendirilecek; ajan tenant kimliğini kendisi belirleyemeyecek.
3. Yazma araçları idempotency anahtarı gerektirecek.

### 5. Taşıyıcıya özel bilgi tabanı
1. Her taşıyıcı için ayrı Bedrock Knowledge Base (veya taşıyıcı filtreli) kurulacak; gelmeme kuralları, istisnalar ve özet olaylar içerecek.
2. Sunucu yetkiyi doğrulayıp firma kimliğiyle filtreli Retrieve çağıracak. Ham evrak ve gereksiz kişisel veri indekslenmeyecek.

### 6. İzlenebilirlik ve güvenlik
1. Her ajan çağrısı correlationId ile loglanacak; araç çağrıları işlem izi olarak kaydedilecek (jüri panosu).
2. Girdideki/araç çıktısındaki talimatlar ajan yönergesi sayılmayacak (prompt injection savunması).
3. Model hatası veya zaman aşımında kullanıcıya anlaşılır hata dönecek; yarım yazma olmayacak.
