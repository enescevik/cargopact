# İlerleme (son güncelleme: 25.11.2026)

## Tamamlandı
- [x] Monorepo iskeleti: web (Vite), mobil (Expo), shared, API Lambda, agents (Strands), CDK (Auth, Data, Agents, Api, Web), CI.
- [x] Kiro knowledge base: steering (product, domain, tech, structure, decisions).
- [x] AWS erişimi doğrulandı (CLI). Çalışan Bedrock modeli: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`. Amazon Q Business erişilemiyor.
- [x] Karar: sabit fiyat + dinamik hesaplama; simüle ödeme sağlayıcı; iptal politikası önerisi kabul.
- [x] Plan `docs/` altına alındı, spec yapısı kuruldu (requirements taslakları).

## Sürüyor
- [x] Altı spec'in requirements onayı alındı
- [x] master-data-and-seed requirements onayı (koli kararı A işlendi)
- [x] platform-foundation + master-data-and-seed design yazıldı (DSQL davranışları gerçek cluster'da doğrulandı, geçici cluster silindi)
- [ ] design + tasks onayı, ardından uygulama

## Spec durumu
| Spec | Requirements | Design | Tasks | Uygulama |
|---|---|---|---|---|
| platform-foundation | onaylı | taslak | taslak | – |
| capacity-and-pricing | onaylı | – | – | – |
| reservation-and-approval | onaylı | – | – | – |
| payments-and-cancellation | onaylı | – | – | – |
| warehouse-and-tracking | onaylı | – | – | – |
| master-data-and-seed | onaylı | taslak | taslak | – |
| agents-and-chat | onaylı | – | – | – |

## Henüz deploy edilmedi
AWS'ye hiçbir kaynak deploy edilmedi. Hesapta başkasına ait bir DSQL cluster'ı var (dokunulmadı).

## Açık kararlar
`.kiro/steering/decisions.md` dosyasına bakın.
