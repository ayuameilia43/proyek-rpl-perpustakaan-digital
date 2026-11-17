# Laporan Teknis Pengujian & CI/CD

Perpustakaan Digital SMA Negeri 1 Majalengka

---

## 1. Ringkasan Eksekutif

Pengujian otomatis dan pipeline CI berhasil diimplementasikan tanpa menambah dependency framework pengujian baru. Seluruh pengujian memakai **Node.js built-in test runner** (`node:test` + `node:assert/strict`) dan **built-in coverage** Node.js 24.

| Metrik | Hasil |
|---|---|
| Total test | **450** |
| Total suite | **103** |
| Test lulus | **450 / 450 (100%)** |
| Test gagal | **0** |
| Coverage lines | **97.61%** (target 70%) |
| Coverage branches | **89.92%** (target 60%) |
| Coverage functions | **92.83%** (target 70%) |
| Waktu eksekusi | ± 3,9 detik |
| Database/API eksternal | Tidak dipanggil (mock/stub) |

Status: **seluruh test lulus dan seluruh coverage threshold terpenuhi**.

---

## 2. Audit Kondisi Awal

| Area | Temuan |
|---|---|
| Automated test | Tidak tersedia |
| `package.json` script `test` | Placeholder `"Error: no test specified"` |
| CI/CD | Tidak ada `.github/workflows` |
| Test framework | Tidak ada Jest/Supertest/Mocha |
| Testability bootstrap | `src/index.js` langsung membuat server dan middleware |
| Dokumentasi pengujian | Hanya UAT manual di `docs/RPL-DOKUMENTASI.md` |
| Risiko utama | Regresi alur auth, sirkulasi, denda, role access, AI, dan WhatsApp tidak terdeteksi otomatis |

Audit menyimpulkan bahwa pengujian harus mencakup lapisan controller, service, middleware, repository, AI provider, serta integrasi HTTP dasar.

---

## 3. Strategi Pengujian

### 3.1 Tooling

- **Test runner:** `node:test`
- **Assertion:** `node:assert/strict`
- **Coverage:** `--experimental-test-coverage`
- **HTTP integration:** `fetch` bawaan Node.js dan `app.listen(0)`
- **Isolasi modul:** `require.cache` stubbing melalui `test/helpers/index.js`
- **Tidak menambah dependency:** tidak ada Jest, Supertest, c8, atau nock

### 3.2 Application factory

`src/index.js` dipecah menjadi:

- `src/app.js` — `createApp()` untuk membangun Express app tanpa membuka port.
- `src/index.js` — bootstrap server (`app.listen`).

Perubahan ini memungkinkan integration test menjalankan aplikasi pada port acak tanpa mengubah perilaku produksi.

### 3.3 Isolasi database dan layanan eksternal

- Pool MySQL diganti fake pool melalui `stubModule("src/config/db", pool)`.
- WhatsApp dan AI provider memakai `fetch` yang distub; tidak ada request keluar nyata.
- `test/setup.js` menyediakan `NODE_ENV=test`, `SESSION_SECRET`, dan `DATABASE_URL` dummy.
- Setiap file test memuat modul dengan `loadFresh()` agar state tidak bocor antar-test.

### 3.4 Level pengujian

| Level | Cakupan |
|---|---|
| Unit | Service, middleware, repository, AI provider, formatter, utility |
| Controller | Validasi input, redirect, render, flash message, error propagation |
| Integration | Login, CSRF, session, role guard, logout, 404, render halaman admin |
| Contract internal | Payload provider AI, SSE event, template WhatsApp |

---

## 4. Struktur Test

```
test/
├── setup.js
├── helpers/index.js
├── integration/
│   └── app.test.js
└── unit/
    ├── ai/
    │   ├── AiOrchestrator.test.js
    │   ├── AiProviderRegistry.test.js
    │   ├── BaseAiProvider.test.js
    │   ├── Formatters.test.js
    │   ├── LibraryContextBuilder.test.js
    │   ├── PersonalIntentDetector.test.js
    │   ├── ProviderCatalog.test.js
    │   ├── ProviderHttpClient.test.js
    │   ├── ReplyBuilders.test.js
    │   └── providers.test.js
    ├── controllers/
    │   ├── aiConfigController.test.js
    │   ├── aiController.test.js
    │   ├── authController.test.js
    │   ├── bookController.test.js
    │   ├── catalogController.test.js
    │   ├── laporanController.test.js
    │   ├── miscControllers.test.js
    │   ├── peminjamanController.test.js
    │   ├── profilController.test.js
    │   ├── settingsController.test.js
    │   ├── sirkulasiController.test.js
    │   └── userController.test.js
    ├── errors/AppError.test.js
    ├── middleware/
    │   ├── auth.test.js
    │   ├── csrf.test.js
    │   ├── errorHandler.test.js
    │   ├── locals.test.js
    │   └── upload.test.js
    ├── repositories/repositories.test.js
    ├── services/
    │   ├── borrowRules.test.js
    │   ├── sirkulasiService.test.js
    │   └── WhatsappService.test.js
    └── utils/sse.test.js
```

`miscControllers.test.js` mencakup `categoryController`, `dashboardController`, `ebookController`, `riwayatController`, dan `pageController`.

---

## 5. Matriks Pengujian terhadap Kebutuhan

| Kebutuhan | Test utama | Level |
|---|---|---|
| Login NISN/email, password bcrypt, akun nonaktif | `authController.test.js`, `integration/app.test.js` | Unit + Integration |
| Register siswa, validasi, duplikasi | `authController.test.js` | Unit |
| Session, cookie, CSRF, logout | `csrf.test.js`, `integration/app.test.js` | Unit + Integration |
| RBAC siswa/pustakawan/admin | `auth.test.js`, `integration/app.test.js` | Unit + Integration |
| CRUD buku, upload, ISBN unik, stok | `bookController.test.js` | Unit |
| Katalog, pencarian, filter, status pinjam | `catalogController.test.js` | Unit |
| Pengajuan peminjaman & aturan kuota | `peminjamanController.test.js`, `borrowRules.test.js` | Unit |
| Approve/reject, stok, WhatsApp | `sirkulasiController.test.js` | Unit |
| Pengembalian, denda, verifikasi denda | `sirkulasiController.test.js`, `sirkulasiService.test.js` | Unit |
| Laporan, filter tanggal, CSV, cetak | `laporanController.test.js` | Unit |
| Profil dan ubah password | `profilController.test.js` | Unit |
| User management & proteksi akun sendiri | `userController.test.js` | Unit |
| System settings & masking token | `settingsController.test.js` | Unit |
| Konfigurasi AI & test koneksi | `aiConfigController.test.js`, `providers.test.js` | Unit |
| Chatbot, SSE, abort, fallback | `aiController.test.js`, `AiOrchestrator.test.js` | Unit |
| Rekomendasi AI | `aiController.test.js`, `AiOrchestrator.test.js` | Unit |
| WhatsApp gateway & template | `WhatsappService.test.js` | Unit |
| Repository & caching settings | `repositories.test.js` | Unit |
| SSE utility | `sse.test.js` | Unit |
| Halaman 404 dan error handling | `errorHandler.test.js`, `integration/app.test.js` | Unit + Integration |

---

## 6. Hasil Coverage

Ringkasan `npm run test:coverage`:

| File/Area | Lines | Branches | Functions |
|---|---:|---:|---:|
| **Seluruh `src`** | **97.61%** | **89.92%** | **92.83%** |
| `src/app.js` | 100% | 75% | 100% |
| Semua controller | 92–100% | 76–100% | 100% |
| `middleware/auth.js`, `csrf.js`, `errorHandler.js`, `locals.js` | 100% | 100% | 100% |
| `middleware/upload.js` | 57.78% | 100% | 33.33% |
| Semua repository | 100% | 100% | 100% |
| `borrowRules.js`, `sirkulasiService.js` | 100% | 100% | 100% |
| `WhatsappService.js` | 94.76% | 82.86% | 80% |
| `src/utils/sse.js` | 100% | 100% | 100% |
| AI orchestrator & provider | 80–100% | 74–100% | 50–100% |

Coverage threshold yang dikonfigurasi:

```text
lines    >= 70%
branches >= 60%
functions >= 70%
```

Pipeline akan gagal bila salah satu threshold tidak terpenuhi.

---

## 7. Perintah Pengujian

```powershell
npm test                # seluruh unit + integration test
npm run test:watch      # mode watch
npm run test:coverage   # test + coverage + threshold
```

Bukti eksekusi terakhir:

```text
tests 450
suites 103
pass 450
fail 0
all files: 97.61% lines | 89.92% branches | 92.83% functions
```

---

## 8. CI/CD

Workflow: `.github/workflows/ci.yml`

Trigger:

- Push ke semua branch
- Pull request
- Manual (`workflow_dispatch`)

Job:

1. **Unit & Integration Tests**
   - `actions/checkout@v4`
   - `actions/setup-node@v4` dengan Node.js `24.x`
   - `npm ci`
   - `npm test`
2. **Coverage Threshold**
   - `npm ci`
   - `npm run test:coverage`

Karakteristik:

- Tidak membutuhkan service MySQL karena database dimock.
- Tidak membutuhkan API key AI/WhatsApp.
- Menggunakan cache npm.
- Concurrency membatalkan run lama pada ref yang sama.
- Timeout 10 menit per job.

Verifikasi lokal: seluruh perintah CI telah dijalankan dengan exit code `0`. File workflow menggunakan action resmi GitHub dan sintaks YAML standar.

---

## 9. Perubahan Produksi yang Menyertai Pengujian

| File | Perubahan | Alasan |
|---|---|---|
| `src/app.js` | Ekstraksi `createApp()` | Integration test tanpa membuka port pada import |
| `src/index.js` | Hanya bootstrap/listener | Memisahkan konfigurasi app dan server |
| `src/controllers/bookController.js` | `createForm` mengembalikan promise | Error dan render dapat di-await secara deterministik |
| `src/services/sirkulasiService.js` | Nominal denda non-numerik/negatif menjadi 0 | Mencegah hasil `NaN` |
| `src/middleware/auth.js` | `isStaff` selalu mengembalikan boolean | Kontrak fungsi konsisten |
| `src/services/ai/ProviderHttpClient.js` | Pesan error mentah di-trim | Pesan error lebih bersih |

Tidak ada perubahan kontrak route, schema database, atau tampilan.

---

## 10. Keterbatasan dan Rekomendasi

1. **Upload middleware** belum diuji sampai I/O multer nyata; saat ini yang diuji adalah helper dan perilaku controller. Rekomendasi: tambah integration test multipart dengan file fixture.
2. **E2E browser** belum tersedia. Alur UI nyata (JavaScript chatbot, iframe PDF) sebaiknya diuji dengan Playwright bila dibutuhkan.
3. **Database nyata** belum diuji; test memakai fake pool. Rekomendasi: job opsional dengan MySQL service untuk smoke test migration/seed.
4. **Load/security testing** belum dicakup. Rekomendasi: rate-limit test, header security test, dan uji beban endpoint katalog/AI.
5. **Provider AI eksternal** hanya diuji dengan mock. Kontrak API nyata dapat berubah; pantau saat upgrade model/provider.

---

## 11. Kesimpulan

Pengujian otomatis telah mencakup mayoritas logika bisnis, controller, middleware, repository, layanan AI, WhatsApp, dan integrasi HTTP dasar. Dengan **450 test lulus**, coverage di atas threshold, serta CI yang berjalan pada setiap push/PR, risiko regresi dapat ditekan secara signifikan dan kualitas rilis menjadi lebih terukur.
