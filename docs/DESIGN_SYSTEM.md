# CargoPact Tasarım Sistemi (ChatGPT tasarım oturumunda kararlaştırılan yön)

**Karar:** "03 Modern" alternatifin yerleşimi + "01 Premium" alternatifin boşluk, ince çizgi ve tipografi özeni.
- Modern: kobalt mavisi, mint vurgu, güçlü tipografi, belirgin işlem alanları; web'de sağda sabit rezervasyon özeti, mobilde altta sabit fiyat + birincil düğme.
- Premium: porselen (sıcak beyaz) zemin, ince şampanya tonlu ayırıcı çizgiler, geniş boşluklar, rota ve ana başlıklarda serif yazı (yalnız başlıklarda; yoğun tablo/metin sans-serif).
- Hiyerarşi: önce yapılacak işlem, sonra karar için gereken bilgi, sonra yardımcı detay.
- Web: yatay üst gezinme (müşteri) · operasyon (transfer merkezi) ekranlarında sol menü kabul edilebilir.
- Mobil: alt sekme çubuğu, metin etiketli ikonlar, en az 44px dokunma alanı.

## Belirteçler (tokens)
```json
{
  "color": {
    "cobalt":   { "900": "#0B1A4A", "800": "#13277A", "700": "#1D3AB8", "600": "#2547E0", "500": "#3B5BFF", "100": "#E7ECFF", "50": "#F3F5FF" },
    "mint":     { "600": "#12A675", "500": "#2FD39A", "200": "#BDF3DD", "100": "#E3FAF1" },
    "porcelain":"#F7F5F0",
    "surface":  "#FFFFFF",
    "champagne":{ "line": "#E6DDCB", "500": "#C9B78F" },
    "ink":      { "900": "#0E1222", "700": "#2B3145", "500": "#5B6275", "300": "#9AA0AE" },
    "status":   { "success": "#12A675", "warning": "#C98A06", "danger": "#C8372D", "info": "#2547E0", "pending": "#7A5AF8", "neutral": "#5B6275" }
  },
  "font": {
    "display": "'Fraunces', 'Georgia', serif",
    "sans": "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    "mono": "'JetBrains Mono', ui-monospace, monospace"
  },
  "radius": { "sm": 8, "md": 12, "lg": 18, "xl": 24, "pill": 999 },
  "space":  [4, 8, 12, 16, 20, 24, 32, 40, 56, 72],
  "shadow": { "card": "0 1px 2px rgba(14,18,34,.04), 0 8px 24px rgba(14,18,34,.06)", "float": "0 12px 40px rgba(19,39,122,.18)" }
}
```

## Bileşen kuralları
- **Durum rozeti:** renk + metin (asla yalnız renk). Bekleyen mor, onaylı mint, ret/iptal kırmızı, uyarı amber.
- **Kapasite çubuğu:** palet, kg, m³ için üç ayrı çubuk. Segmentler: iç yük (ink-300 desenli), onaylı (cobalt-600), bloke (cobalt-100 çizgili), kalan (boş). Altında "28 / 33 planlanan · 1 bloke" metni.
- **33 pozisyon şeması (jüri):** 11×3 ızgara; iç yük gri, her müşteri farklı renk + baş harf etiketi; planlanan ve fiili ayrı sekme.
- **Fiyat:** büyük toplam (serif değil, sans, 600 ağırlık), altında palet başı; "Fiyat neden böyle?" açılır kutu (talep ↑/↓, kalkışa kalan süre).
- **Saatler:** "Son rezervasyon (T−3) 15:00" ve "Çıkış deposu son kabul (T−1) 17:00" her kartta ayrı çip.
- **Rota başlığı:** "Gebze → Ankara" serif, büyük; altında tesis adları sans küçük.
- Boş / yükleniyor (skeleton) / hata / başarı durumları her listede.
