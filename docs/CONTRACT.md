# Taşıma sözleşmesi kabulü (TASLAK)

Metin: `docs/contracts/tasima-sozlesmesi-taslak-v1.md` (kod `TASIMA`, sürüm `1.0-taslak`). **Hukuki inceleme yapılmamıştır; yalnız hackathon demosu içindir.**

## Akış
1. Müşteri rezervasyondan önce `POST /customer/trips/{id}/contract-preview` ile sunucuda doldurulmuş metni ve `renderedHash` değerini görür.
2. `POST /customer/reservations` gövdesi `contract: { version, renderedHash, signerName, accepted: true }` taşır. Hash, sunucunun aynı girdilerle ürettiğiyle eşleşmezse istek reddedilir (`CONTRACT_NOT_ACCEPTED` / değişmişse `CONTRACT_STALE`) ve kapasite değişmez.
3. Asistan: önizleme özeti sözleşme başlığını, sürümü, TASLAK uyarısını, önemli maddeleri, kısa hash'i ve "Onaylamanız, bu taslak sözleşmeyi <ad> adına elektronik olarak kabul etmeniz anlamına gelir." cümlesini gösterir. Teyit kapısı (`_gate`) anahtarına `renderedHash` dahildir; sözleşme değişirse yeniden teyit gerekir.

## Kabulde saklananlar
İmzalayan adı, kullanıcı, zaman, sürüm, SHA-256 hash (render edilmiş metin), IP ve user-agent.

## Hukuki not
Bu, **basit elektronik kabul** kaydıdır. 5070 sayılı Elektronik İmza Kanunu kapsamında **nitelikli elektronik imza** değildir ve ona eşdeğer ispat gücü iddia edilmez. Pilotta sözleşme metni, sorumluluk sınırları, uyuşmazlık yeri ve ispat yöntemi hukuken incelenmeli; gerekirse nitelikli e-imza veya e-imza sağlayıcısı entegrasyonu değerlendirilmelidir.
