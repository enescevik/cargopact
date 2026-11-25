# Tasks – Platform Temeli

Gereksinim numaraları `requirements.md` ile eşleşir (ör. 2.1 = Gereksinim 2, madde 1).

- [ ] 1. Paket iskeleti
  - [ ] 1.1 `packages/contracts` oluştur; `packages/shared` içeriğini taşı, web/mobil/api içe aktarmalarını güncelle (4.1)
  - [ ] 1.2 `packages/domain` ve `packages/db` paketlerini oluştur (workspaces, tsconfig, typecheck script'i)
  - [ ] 1.3 Test altyapısı (vitest) ve `npm run test` kökte
- [ ] 2. Veritabanı katmanı (`packages/db`)
  - [ ] 2.1 IAM token ile bağlantı havuzu (`@aws-sdk/dsql-signer`, TLS, token yenileme) (2.4)
  - [ ] 2.2 `withTx` ve `40001` yeniden deneme + `ConflictError`; ≤3000 satır koruması (3.2)
  - [ ] 2.3 Migrasyon çalıştırıcı: tek-DDL dosyalar, checksum, `CREATE INDEX ASYNC` iş takibi, `db:migrate` (2.3)
  - [ ] 2.4 Migrasyon 0001: `cargopact_app` rolü ve IAM eşlemesi; 0002: platform kiracısı; çekirdek tablolar (tenants, users, memberships, audit_log, idempotency_keys, schema_migrations) ve async indeksler (2.1, 2.2, 5.2)
  - [ ] 2.5 `audit_log` için `cargopact_app` yetkisini yalnız INSERT/SELECT olarak ver ve davranışı gerçek cluster'da doğrula (5.2)
  - [ ] 2.6 Entegrasyon testleri: FK, OCC yeniden deneme, 3000 satır sınırı (3.2)
- [ ] 3. Kimlik, yetki ve API çatısı (`services/api`)
  - [ ] 3.1 Yönlendirici, hata modeli, correlationId, yapılandırılmış log (4.2, 4.3)
  - [ ] 3.2 `AuthContext`: JWT sub → users/memberships, `x-tenant-id` seçimi, rol matrisi (1.1, 1.3)
  - [ ] 3.3 `TenantScope` repository yardımcısı; kiracı sızıntısı testleri (1.2)
  - [ ] 3.4 İlk giriş akışı: users + pending müşteri kiracısı; onaysız firma erişim kısıtı (1.4)
  - [ ] 3.5 Idempotency katmanı (aynı işlemde anahtar + yanıt saklama, hash uyuşmazlığı 422) (3.1)
  - [ ] 3.6 Denetim yardımcısı (`audit()`) (5.1)
  - [ ] 3.7 `GET /me`, `GET /health`; zod doğrulama (4.4)
- [ ] 4. Sözleşme
  - [ ] 4.1 OpenAPI 3 belgesi (me, hata şemaları, ortak parametreler) ve zod şemalarından tip üretimi (4.1)
  - [ ] 4.2 Sözleşme testi: yanıtların şemaya uyumu
- [ ] 5. Altyapı (CDK)
  - [ ] 5.1 `api` Lambda (esbuild), `ANY /{proxy+}` JWT authorizer, `dsql:DbConnect` yalnız bu cluster'a (8)
  - [ ] 5.2 `STAGE` ve `DSQL_ENDPOINT` ortamı; `cdk synth` temiz
- [ ] 6. Doğrulama
  - [ ] 6.1 Tüm testler + typecheck + synth geçer
  - [ ] 6.2 `docs/PROGRESS.md` ve steering güncelle
