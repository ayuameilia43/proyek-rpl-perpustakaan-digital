# Perpustakaan Digital — SMA NEGERI 1 MAJALENGKA
Nama : Ayu Amelia Fahlevi
NIM  : 41257094
Tema Topik Kelompok : "AI-Based Digital Learning Resource Ecosystem"
Aplikasi Perpustakaan Digital SMA Negeri 1 Majalengka merupakan sistem berbasis web yang dikembangkan untuk mempermudah pengelolaan perpustakaan sekolah secara digital. Aplikasi ini menyediakan fitur pengelolaan buku, katalog digital, pencarian buku, peminjaman, pengembalian, perhitungan denda, serta riwayat transaksi anggota. Selain itu, aplikasi dilengkapi integrasi Artificial Intelligence (AI) berupa AI Book Recommendation untuk memberikan rekomendasi buku dan AI Virtual Librarian sebagai chatbot yang membantu menjawab pertanyaan pengguna terkait layanan perpustakaan. Administrator juga dapat mengatur provider, model, dan API Key AI melalui halaman konfigurasi. Dengan fitur tersebut, pengelolaan perpustakaan menjadi lebih praktis, terstruktur, dan interaktif.
**Link Video Progres 1, Progres 2, & Video Final Demo :** [Tonton Video Demo di Youtube] (https://youtu.be/EKynZxXYs64)

> **Tagline:** Katalog, peminjaman, denda otomatis, laporan sirkulasi, notifikasi WhatsApp, dan asisten AI dalam satu aplikasi.

---

## 1. Fitur Utama

| Modul | Deskripsi |
|---|---|
| Autentikasi | Login memakai NISN/email, bcrypt hash, register siswa, session + CSRF token |
| Role-Based Access Control | Menu berbeda untuk Siswa, Pustakawan, dan Administrator |
| Katalog Buku | Pencarian (judul/ISBN/pengarang), filter kategori & format, kartu buku |
| E-Book Reader | Daftar e-book & pembaca PDF bawaan browser (iframe) |
| Peminjaman | Ajukan pinjam → persetujuan admin → stok & jatuh tempo otomatis |ss
| Denda Otomatis | Deteksi keterlambatan, hitung denda = hari terlambat × nominal/hari, verifikasi pelunasan |
| Riwayat Peminjaman | Riwayat lengkap siswa per transaksi |
| Laporan Sirkulasi | Filter rentang tanggal, export CSV, tampilan siap cetak PDF |
| WhatsApp Service | Notifikasi approve/reject/pengingat, aman jika gateway belum dikonfigurasi |
| AI | Halaman Rekomendasi AI + floating Chatbot Pustakawan dengan konteks katalog |
| Manajemen Data | CRUD buku (upload cover & PDF), kategori, user, System Settings, Konfigurasi AI |
| Pengaturan Akun | `/profil` untuk semua role: edit profil (nama, kelas, email, nomor WA) & ubah password |

---

## 2. Tech Stack

| Komponen | Teknologi |
|---|---|
| Backend | Node.js + Express 5 (CommonJS) |
| Template | EJS + express-ejs-layouts (Server-Side Rendering) |
| Styling | Tailwind CSS (CDN) — responsif mobile-first |
| Database | MySQL 8 (Laragon) via `mysql2` |
| ORM/Schema | Prisma Schema (referensi) + SQL migration manual |
| Auth | bcrypt + express-session + CSRF token homemade |
| Upload | multer (cover JPG/PNG/WebP ≤2MB, PDF e-book ≤10MB) |
| Keamanan | helmet, validasi input, proteksi role per route |

---

## 3. Prasyarat

1. **Node.js** v18 atau lebih baru (disarankan v20+).
2. **Laragon** (Windows) yang sudah ter-install **MySQL 8** (jalankan service MySQL lewat Laragon).
3. Git (opsional) dan text editor (VS Code).

> **Catatan (jika XAMPP masih terpasang):** jangan jalankan MySQL/Apache XAMPP bersamaan dengan Laragon agar port `3306` (MySQL) dan `80/443` tidak bentrok. Matikan service MySQL/Apache di XAMPP Control Panel, atau hentikan prosesnya sebelum menyalakan Laragon. Proyek ini dikonfigurasi 100% untuk Laragon.

---

## 4. Cara Instalasi & Menjalankan

### 4.1 Menyalakan MySQL (Laragon)

**Cara A — lewat GUI:** buka Laragon → klik **Start** (All) → pastikan service MySQL hijau.

**Cara B — lewat terminal (PowerShell/CMD):**

```powershell
# Menyalakan MySQL Laragon (jalankan sebagai Terminal Laragon / PowerShell)
Start-Process mysqld --defaults-file=C:\laragon\bin\mysql\mysql-8.4.3-winx64\my.ini

# Memastikan MySQL hidup
C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysql.exe -u root -e "SELECT VERSION();"
```

### 4.2 Install dependency

```bash
cd C:\laragon\www\perpustakaan-digital
npm install
```

### 4.3 Konfigurasi `.env`

Файл `.env` sudah tersedia. Pastikan nilai `DATABASE_URL` sesuai mesin Anda:

```env
DATABASE_URL="mysql://root:@localhost:3306/perpustakaan_sma"
```

> Format: `mysql://USER:PASSWORD@HOST:PORT/NAMA_DATABASE`. Bila password kosong, tulis `root:@localhost`.

### 4.4 Siapkan database (migrate + seed)

```bash
npm run db:reset
```

Perintah ini menjalankan 2 langkah:

1. `prisma/migrate.js` → membuat database `perpustakaan_sma` (bila belum ada) dan seluruh tabel dari `prisma/migrations/2026111500000_init_mysql.sql`.
2. `prisma/seed.js` → mengisi data demo: 6 kategori, 8 buku, 1 admin, 2 siswa, System Settings, dan 2 transaksi contoh.

### 4.5 Menjalankan aplikasi

```bash
npm run dev     # mode pengembangan (auto-reload, nodemon/watch)
# atau
npm start       # mode produksi lokal
```

Buka browser: **http://localhost:3000**

---

## 5. Akun Demo

| Peran | NISN | Email | Password | Nama |
|---|---|---|---|---|
| Administrator | `12345678` | admin@sma1majalengka.id | `admin123` | Admin Utama |
| Siswa 1 | `11111111` | andi@sma1majalengka.id | `siswa123` | Andi Saputra (X RPL) |
| Siswa 2 | `22222222` | budi@sma1majalengka.id | `siswa123` | Budi Santoso (XI AKL) |

> Login dapat memakai **NISN** maupun **email**. Password tersimpan sebagai hash bcrypt.

---

## 6. Perintah npm

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Jalankan server dengan auto-reload (`node --watch`) |
| `npm start` | Jalankan server (`node src/index.js`) |
| `npm run db:migrate` | Buat database + tabel dari file migration SQL |
| `npm run db:seed` | Isi/reset data demo (truncate lalu insert) |
| `npm run db:reset` | Migration + seed berurutan (untuk mulai dari nol) |
| `npm test` | Menjalankan seluruh unit & integration test |
| `npm run test:watch` | Menjalankan test dalam mode watch |
| `npm run test:coverage` | Menjalankan test + laporan coverage + threshold |

---

## 7. Struktur Folder

```
perpustakaan-digital/
├── src/
│   ├── index.js                 # Entry point Express (middleware, session, CSRF, layout)
│   ├── config/db.js             # Koneksi pool mysql2
│   ├── middleware/              # auth.js, csrf.js, locals.js, upload.js
│   ├── controllers/             # auth, dashboard, catalog, ebook, peminjaman,
│   │                            # sirkulasi, riwayat, laporan, ai, user, settings, aiConfig
│   ├── services/                # AiService, WhatsappService, borrowRules, sirkulasiService
│   └── routes/                  # index.js (semua rute) + authRoutes.js
├── views/
│   ├── layouts/                 # main.ejs (sidebar+header), auth.ejs
│   ├── partials/                # sidebar, header, flash, chatbot, book-cover
│   ├── auth/ dashboard/ catalog/ ebook/ riwayat/ ai/
│   └── admin/                   # users, settings, ai, books, peminjaman, laporan
├── prisma/
│   ├── schema.prisma            # Skema database (referensi ORM)
│   ├── migrations/              # SQL migration siap pakai
│   ├── migrate.js               # Runner migration
│   └── seed.js                  # Seeder data demo
├── public/                      # css/js statis, uploads (cover & ebook), images, pdf
├── docs/RPL-DOKUMENTASI.md      # PRD, User Flow, Use Case, ERD, UAT, panduan-installed
└── .env                         # Konfigurasi lokal (jangan di-commit)
```

---

## 8. Konfigurasi Dinamis (System Settings)

Seluruh aturan bisnis disimpan di tabel `system_settings` dan dapat diubah lewat UI (tidak hardcode):

- Denda per hari, durasi peminjaman, kuota buku per siswa, jam operasional
- WhatsApp Gateway: endpoint, token (dis-masking), template pesan (pinjam/kembali/terlambat)
- Konfigurasi AI: provider (Google Gemini / Grok xAI / NVIDIA NIM), model, temperature, API Key (dis-masking), status chatbot, system prompt

### Format Integrasi WhatsApp (standar Fonnte & kompatibel umum)

`src/services/WhatsappService.js` mengirim request seperti ini:

```http
POST {whatsapp_api_endpoint}          # contoh: https://api.fonnte.com/send
Content-Type: application/json
Authorization: {whatsapp_api_token}    # token mentah (tanpa "Bearer")

{ "target": "6281234567890", "message": "isi pesan", "countryCode": "62" }
```

- Nomor tujuan otomatis dinormalisasi: `0812-3456-7890` → `6281234567890` (spasi/strip/+62 dibersihkan).
- Placeholder template diganti otomatis sebelum dikirim:
  `{nama}`, `{judul}` / `{judul_buku}`, `{batas_tanggal}`, `{tanggal_kembali}`, `{hari_terlambat}`, `{denda}`, `{nisn}`, `{kelas}`, `{alasan}`.
- Gateway Fonnte membalas HTTP 200 dengan `{ "status": false, "reason": "..." }` saat gagal — alasan asli itu ditampilkan di flash message.
- Tersedia tombol **"Kirim Tes WA"** di *System Settings* untuk menguji gateway tanpa menunggu transaksi.
- Hasil setiap pengiriman (berhasil/gagal + alasannya) dicetak ke console server, contoh: `[WhatsApp] [approve] 628111111111 -> BERHASIL (success! message in queue)`.

> API Key dan token WhatsApp **tidak pernah** dikirim ke frontend; penyembunyian memakai masking (`••••••xxxx`).

---

## 9. Pengujian

Pengujian otomatis memakai Node.js built-in test runner (tanpa framework tambahan):

```bash
npm test
npm run test:coverage
```

Pipeline CI tersedia di `.github/workflows/ci.yml` dan berjalan pada setiap push/PR.
Laporan lengkap strategi, hasil, coverage, dan batasan pengujian tersedia di
[`docs/TESTING.md`](docs/TESTING.md).

Dokumen skenario pengujian black-box (UAT) manual tetap tersedia di
[`docs/RPL-DOKUMENTASI.md`](docs/RPL-DOKUMENTASI.md) bagian **Skenario Pengujian Black-Box (UAT)**.

---

## 10. Dokumentasi Lain

- [`docs/RPL-DOKUMENTASI.md`](docs/RPL-DOKUMENTASI.md) — PRD, User Flow, Use Case, ERD, panduan instalasi, tabel UAT.
- `prisma/migrations/2026111500000_init_mysql.sql` — definisi tabel MySQL.



---

**Dibuat untuk Tugas Besar RPL — Perpustakaan Digital SMA NEGERI 1 MAJALENGKA.**
