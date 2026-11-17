# FASE 2: DOKUMEN RPL - PRD, User Flow, Use Case, & ERD

### 1. Product Requirements Document (PRD) Singkat

**Project:** Website Perpustakaran Digital SMA NEGERI 1 MAJALENGKA
**Target Users:** Siswa/Anggota (100+), Administrator/Pustakawan (5), Akun Super-Admin (1)
**Sistem Operasi:** Web Responsive (Mobile-First)

**Fitur Utama:**
- Authentikasi role-based (Siswa vs Administrator)
- Katalog buku dengan filter real-time & kategori
- E-Book reader terintegrated
- Siklus peminjaman & pengembalian otomatis
- Kalkulasi denda berdasarkan System Settings
- Notifikasi WhatsApp integrasi
- AI Rekomendasi & Chatbot Pustakawan
- Laporan sirkulasi & User Management

---

### 2. User Flow - Alur Utama

```
[LANDING PAGE] → [LOGIN] → [SIDEBAR MENU BERDASAR ROLE] → [ACTION FLOW]
                                                                     │
                                                                     ▼
               ┌─────────────────────┐        ┌─────────────────────┐
               │     SISWA           │        │  ADMINISTRATOR       │
               └─────────────────────┘        └─────────────────────┘
                                                      │
                                                      ▼
               ┌─────────────────────┐        ┌─────────────────────┐
               │  DASHBOARD SISWA    │        │  DASHBOARD ADMIN    │
               │  - Buku dipinjam    │        │  - Statistik       │
               │  - Tagihan denda    │        │  - Peminjaman menunggu│
               └─────────────────────┘        └─────────────────────┘
                                                      │
                                                      ▼
               ┌─────────────────────┐        ┌─────────────────────┐
               │  KATALOG BUKU       │        │  KELOLA KOLEKSI     │
               │  - Cari buku        │        │  - CRUD buku        │
               │  - Filter kategori  │        │  - Upload cover     │
               └─────────────────────┘        └─────────────────────┘
                                                      │
                                                      ▼
               ┌─────────────────────┐        ┌─────────────────────┐
               │  PINJAMAN BUKU      │        │  PROSES PEMEMINJAMAN│
               │  - Ajukan permintaan│        │  - Setujui/ Tolak   │
               │  - Cek status       │        │  - Proses pengembalian│
               └─────────────────────┘        └─────────────────────┘
                                                      │
                                                      ▼
               ┌─────────────────────┐        ┌─────────────────────┐
               │  REKOMENDASI AI     │        │  LAPORAN SIRKULASI  │
               │  - Input minat/buku │        │  - Filter tanggal   │
               └─────────────────────┘        │  - Export PDF/CSV   │
               └─────────────────────┘        └─────────────────────┘
```

---

### 3. Use Case Text

**UC-01: Registrasi & Login Awal**
- **Actor:** Siswa Baru / Pustakawan Baru
- **Precondition:** User belum terdaftar di sistem
- **Main Success Scenario:**
  1. User mengakses halaman login
  2. User memasukkan NISN/Email dan password
  3. System validasi kredensial (bcrypt hash)
  4. System redirect ke dashboard berdasarkan role
- **Alternative Flow:** Jika password salah → tampilkan error "NISN/password salah"

**UC-02: Ajukan Peminjaman Buku Fisik**
- **Actor:** Siswa
- **Precondition:** User sudah login role Siswa
- **Main Success Scenario:**
  1. User navigasi ke Katalog Buku
  2. User mencari buku → melihat detail → klik "Ajukan Pinjam"
  3. System membuat transaksi status "Menunggu Persetujuan"
  4. System kirim WhatsApp notifikasi ke admin
  5. Admin setujui → status jadi "Dipinjam", stok berkurang, jatuh tempo tercatat

**UC-03: Proses Pengembalian Buku**
- **Actor:** Siswa (membawa ke meja pustakawan) / Pustakawan
- **Precondition:** Buku sudah dipinjam (status "Dipinjam")
- **Main Success Scenario:**
  1. Pustakawan terima buku dari siswa
  2. System cek keterlambatan (hari ini vs due_date)
  3. Jika terlambat → hitung denda = (hari terlambat × denda per hari dari System Settings)
  4. System tampilkan rincian denda + status pembayaran
  5. Pustakawan update status → "Dikembalikan", stok bertambah 1
  6. Jika denda → status "Belum Lunas" hingga dibayarkan

**UC-04: Konfigurasi System Settings (Admin)**
- **Actor:** Administrator/Pustakawan
- **Precondition:** User login role Admin
- **Main Success Scenario:**
  1. Admin navigasi ke System Settings
  2. Admin edit parameter: denda per hari, durasi peminjaman, kuota buku, jam operasional
  3. Admin konfigurasi WhatsApp Gateway (Endpoint, Token, Template)
  4. Admin simpan → setting disimpan di database (bukan hardcode)

**UC-05: Chatbot AI Pustakawan**
- **Actor:** Siswa & Administrator (dari floating widget)
- **Precondition:** Widget chatbot terbuka, AI config sudah di-setup
- **Main Success Scenario:**
  1. User ketik pertanyaan di chatbox
  2. System kirim ke AI Provider (Google Gemini / Grok xAI / NVIDIA NIM) dengan system prompt perpustakaan
  3. AI balas dengan jawaban berdasarkan RAG (dari daftar buku + aturan denda)
  4. Jika API error → tampilkan pesan fallback: "Maaf, layanan AI sedang maintenance. Silakan hubungi pustakawan langsung."

---

### 4. ERD (Entity Relationship Diagram) & Skema Database

> **Catatan Implementasi:** Skema di bawah ditulis dalam dialek SQL umum (PostgreSQL-style) sebagai acuan konseptual ERD. Implementasi aktual proyek menggunakan **MySQL 8** (Laragon). File SQL siap-jalan versi MySQL tersedia di `prisma/migrations/2026111500000_init_mysql.sql`, dan skema ORM ada di `prisma/schema.prisma` (provider `mysql`).

**Tabel Utama:**

```sql
-- 1. users - Akun siswa, admin, pustakawan
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nisn VARCHAR(20) UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    class VARCHAR(50), -- e.g., XI RPL
    whatsapp_number VARCHAR(20),
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL, -- bcrypt/argon2
    role ENUM('siswa', 'pustakawan', 'admin') DEFAULT 'siswa',
    is_active BOOLEAN DEFAULT true,
    max_books_allowed INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- 2. categories - Kategori buku
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL, -- e.g., Fisika, Sastra, Matematika
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now()
);

-- 3. books - Master data buku (fisik & e-book)
CREATE TABLE books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    author VARCHAR(100) NOT NULL,
    publisher VARCHAR(100),
    year INTEGER,
    ISBN VARCHAR(20) UNIQUE,
    category_id UUID REFERENCES categories(id),
    format ENUM('fisik', 'e-book', 'keduanya') NOT NULL,
    total_stock_fisic INTEGER DEFAULT 0, -- total stok fisik keseluruhan (untuk rasio tampilan kartu: contoh 49/50)
    stock_fisic INTEGER DEFAULT 0, -- stok fisik tersedia saat ini (dinamis)
    synopsis TEXT, -- sinopsis/singkat deskripsi buku untuk halaman detail
    stock_ebook INTEGER DEFAULT 0, -- kuota download e-book
    cover_image_url TEXT,
    pdf_e_book_url TEXT, -- path file PDF di server
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- 4. transactions - Riwayat peminjaman & pengembalian
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    book_id UUID REFERENCES books(id),
    status ENUM('menunggu_persetujuan', 'dipinjam', 'ditolak', 'dikembalikan', 'terlambat') DEFAULT 'menunggu_persetujuan',
    borrow_date DATE DEFAULT curdate(),
    due_date DATE NOT NULL, -- dari System Settings
    return_date DATE, -- tanggal dikembalikan
    fine_amount DECIMAL(10,2) DEFAULT 0, -- jumlah denda hitung otomatis
    fine_paid_status ENUM('lunas', 'belum_lunas') DEFAULT 'belum_lunas',
    admin_notes TEXT, -- alasan ditolak atau catatan admin
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- 5. system_settings - Pengaturan bisnis (dinamis, BUKIT hardcode)
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_name VARCHAR(200) DEFAULT 'SMA NEGERI 1 MAJALENGKA', -- nama sekolah (bisa diubah via UI)
    school_address TEXT, -- alamat sekolah
    ai_api_key VARCHAR(255), -- API Key untuk konfigurasi AI (diasingkan di frontend)
    fine_per_day DECIMAL(10,2) DEFAULT 1000, -- Rp 1.000/hari
    max_borrow_duration INTEGER DEFAULT 7, -- hari maksimal peminjaman
    max_books_per_student INTEGER DEFAULT 3,
    operating_hours_start TIME DEFAULT '07:00:00',
    operating_hours_end TIME DEFAULT '21:00:00',
    whatsapp_api_endpoint TEXT, -- URL gateway (Fonnte/Wablas)
    whatsapp_api_token TEXT, -- dis-masking/terenkripsi
    whatsapp_template_pinjam TEXT, -- template pesan peminjaman
    whatsapp_template_kembali TEXT, -- template pesan pengembalian
    whatsapp_template_terlambat TEXT, -- template pesan keterlambatan
    ai_provider ENUM('gemini', 'grok', 'nvidia') DEFAULT 'gemini',
    ai_model VARCHAR(50) DEFAULT 'gemini-2.5-flash',
    ai_temperature FLOAT DEFAULT 0.7,
    ai_system_prompt TEXT DEFAULT 'Anda adalah asisten pustakawan SMA...',
    is_chatbot_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- 6. ai_chat_history - Riwayat percakapan sesi (opsional, per-session)
CREATE TABLE ai_chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    session_id VARCHAR(100) NOT NULL,
    user_message TEXT NOT NULL,
    ai_response TEXT,
    created_at TIMESTAMP DEFAULT now()
);
```

**Relationship Summary:**
- 1 User → Banyak Transactions
- 1 Book → Banyak Transactions
- 1 Category → Banyak Books
- 1 System Settings → Menentukan aturan bisnis keseluruhan

---

### 5. Database Seeder Data Dummy (Concept)

**8-10 Buku Contoh:**
1. "Fisika SMA Kelas X" - Fisika, Total Stok: 45, Tersedia: 45, Sinopsis: "Buku fisika untuk kurikulum SMA kelas X, mengandalkan pengalaman dan contoh soal"
2. "Matematika Interaktif" - Matematika, Total Stok: 30, Tersedia: 30, Sinopsis: "Pengenalan konsep matematika yang mudah dipahami untuk siswa SMA"
3. "Novel cinta sejati" - Sastra, Total Stok: 20, Tersedia: 20, Sinopsis: "Cerita cinta yang menyentuh hati pembaca muda"
4. "Sejarah Indonesia Kontemporer" - Sejarah, Total Stok: 25, Tersedia: 25, Sinopsis: "Kajian sejarah Indonesia dari perspektif modern"
5. "Bingkai Hidup" - Fiksi, Total Stok: 50, Tersedia: 55, Sinopsis: "Kumpulan cerita fiksi hidup sehari-hari"
6. "Kimia untuk Pemula" - Kimia, Total Stok: 40, Tersedia: 45, Sinopsis: "Pengenalan kimia dasar untuk siswa SMA dengan gambar ilustrasi"
7. "E-Book Panduan UN" - E-Book, Total Stok: 100, Tersedia: 100 (kuota download), Sinopsis: "Bahan pembelajaran untuk persiapan Ujian Nasional"
8. "BINGKIT Bahasa Inggris" - Bahasa, Total Stok: 35, Tersedia: 40, Sinopsis: "Buku Bahasa Inggris untuk kurikulum SMA dengan CD audio"

**Akun Awal:**
- Admin: NISN 12345678, Nama: "Admin Utama", Role: "admin", Password: "admin123" (hash), WhatsApp: "081234567890"
- Siswa 1: NISN 11111111, Nama: "Andi Saputra", Class: "X RPL", WhatsApp: "08111111111"
- Siswa 2: NISN 22222222, Nama: "Budi Santoso", Class: "XI AKL", WhatsApp: "08222222222"
---

### 6. Panduan Instalasi & Menjalankan Aplikasi

#### 6.1 Prasyarat Sistem

| Kebutuhan | Spesifikasi | Keterangan |
|---|---|---|
| Node.js | v18.0 ke atas (disarankan v20+) | Cek dengan `node -v` |
| MySQL Server | 8.x | Dipakai lewat Laragon (Windows) |
| Laragon | Versi terbaru | Bundle Apache + MySQL + Node |
| Browser | Chrome/Edge/Firefox terbaru | Chrome direkomendasikan |

#### 6.2 Langkah Instalasi (step-by-step)

**Langkah 1 — Nyalakan MySQL**

*Cara cepat via GUI:* buka aplikasi **Laragon** → klik tombol **Start** (kiri bawah) → tunggu service MySQL berubah hijau.

*Cara cepat via terminal (PowerShell):*

```powershell
# Jalankan service MySQL Laragon
Start-Process mysqld --defaults-file=C:\laragon\bin\mysql\mysql-8.4.3-winx64\my.ini

# Verifikasi MySQL aktif
C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysql.exe -u root -e "SELECT VERSION();"
```

**Langkah 2 — Install dependency proyek**

```bash
cd C:\laragon\www\perpustakaan-digital
npm install
```

**Langkah 3 — Periksa konfigurasi `.env`**

```env
DATABASE_URL="mysql://root:@localhost:3306/perpustakaan_sma"
APP_PORT=3000
SESSION_SECRET="ganti-dengan-string-acak"
```

> Format URL: `mysql://USER:PASSWORD@HOST:PORT/NAMA_DATABASE`. Password kosong ditulis `root:@localhost`.

**Langkah 4 — Siapkan database (migrate + seed)**

```bash
npm run db:reset
```

Output sukses:

```
✅ Migrasi selesai: database perpustakaan_sma siap.
🌱 Seeding selesai!
   Login Administrator : NISN 12345678 / password admin123
   Login Siswa 1       : NISN 11111111 / password siswa123
```

**Langkah 5 — Jalankan aplikasi**

```bash
npm run dev     # pengembangan (auto reload)
npm start       # production lokal
```

**Langkah 6 — Buka aplikasi**

Browser → `http://localhost:3000` → login dengan akun demo (lihat bagian 7).

#### 6.3 Daftar Perintah npm

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Menjalankan server dengan auto-reload (`node --watch`) |
| `npm start` | Menjalankan server mode normal |
| `npm run db:migrate` | Membuat database + tabel (idempotent, aman diulang) |
| `npm run db:seed` | Mengisi ulang data demo (truncate + insert) |
| `npm run db:reset` | `db:migrate` lalu `db:seed` (mulai dari nol) |

#### 6.4 Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| `Error: connect ECONNREFUSED 127.0.0.1:3306` | MySQL belum berjalan | Start Laragon / jalankan `mysqld` (6.2 Langkah 1) |
| Port `3306` bentrok / DB bukan milik Laragon | MySQL/Apache XAMPP masih berjalan | Matikan service XAMPP di XAMPP Control Panel, pastikan listener `3306` adalah `C:\laragon\bin\mysql\...\mysqld.exe` (`netstat -ano \| findstr ":3306"`), lalu start Laragon MySQL |
| `Access denied for user 'root'@'localhost'` | Password MySQL tidak sesuai | Sesuaikan `DATABASE_URL` di `.env` |
| `Table 'perpustakaan_sma.books' doesn't exist` | Migrasi belum dijalankan | `npm run db:reset` |
| `Sesi form tidak valid (CSRF token salah)` | Sesi login kedaluwarsa (8 jam) | Muat ulang halaman & login ulang |
| Notifikasi WhatsApp "tidak terkirim" | Gateway WA belum diisi | isi *System Settings → WhatsApp Gateway* |
| Chatbot hanya menjawab pesan fallback | API Key kosong / provider error | isi *Konfigurasi AI* lalu *Test Koneksi* |
| Halaman `/ebook` kosong | Belum ada PDF e-book | unggah PDF lewat *Kelola Koleksi Buku* |
| Notifikasi WA tidak sampai ke HP | Format payload/header tidak sesuai gateway | Standar Fonnte: header `Authorization: <token>` + body `{target, message, countryCode:"62"}`; nomor `08...` otomatis jadi `628...`; uji dulu dengan tombol **Kirim Tes WA** di *System Settings* |

---

### 7. Akun Demo (Akun Awal)

| Peran | NISN | Email | Password | Nama / Kelas | Nomor WA |
|---|---|---|---|---|---|
| Administrator | 12345678 | admin@sma1majalengka.id | admin123 | Admin Utama (XII) | 081234567890 |
| Siswa | 11111111 | andi@sma1majalengka.id | siswa123 | Andi Saputra (X RPL) | 08111111111 |
| Siswa | 22222222 | budi@sma1majalengka.id | siswa123 | Budi Santoso (XI AKL) | 08222222222 |

- Login menerima **NISN maupun email**.
- Password disimpan sebagai **hash bcrypt** (10 rounds), bukan teks biasa.
- Role `pustakawan` tersedia di enum database; dapat dibuat lewat *User Management* untuk uji UAT.
- Data demo sengaja memuat 1 transaksi `dipinjam` dan 1 transaksi `terlambat` (denda Rp3.000) agar halaman dashboard langsung terisi.

---

### 8. Tabel Skenario Pengujian Black-Box (UAT)

Pengujian dilakukan pada `http://localhost:3000` dengan akun Admin `12345678/admin123` dan Siswa `11111111/siswa123`.

| ID | Skenario Pengujian | Langkah | Hasil Diharapkan | Hasil Aktual | Status |
|---|---|---|---|---|---|
| UAT-01 | Login dengan NISN & password benar | Buka `/login`, isi NISN 12345678 + admin123 | Redirect ke dashboard sesuai role | Redirect `/dashboard`, menu Admin tampil | Lulus |
| UAT-02 | Login dengan password salah | NISN 12345678 + password salah | Flash "NISN/password salah" | Flash error tampil, tidak masuk | Lulus |
| UAT-03 | Registrasi siswa baru | Isi form register lengkap | Data tersimpan, pesan sukses | User baru masuk DB | Lulus |
| UAT-04 | Registrasi dengan NISN duplikat | NISN 11111111 | Ditolak dengan pesan duplikat | HTTP 400 + pesan duplikat | Lulus |
| UAT-05 | Proteksi role (s siswa → menu admin) | Siswa buka `/admin/users` | Ditolak 403 | 403 Forbidden | Lulus |
| UAT-06 | Proteksi CSRF | POST form tanpa token `_csrf` | Ditolak 403 | 403 "CSRF token salah" | Lulus |
| UAT-07 | Logout | Klik tombol Keluar | Kembali ke halaman login, session hilang | Session dihapus | Lulus |
| UAT-08 | Pencarian katalog | `/katalog?q=fisika` | Hanya buku relevan | "Fisika SMA Kelas X" tampil | Lulus |
| UAT-09 | Filter kategori & format | `/katalog?format=e-book` | Hanya e-book | "E-Book Panduan UN" tampil | Lulus |
| UAT-10 | Membaca e-book | Buka `/ebook` → "Baca Sekarang" | PDF tampil di reader | PDF tampil, 200 application/pdf | Lulus |
| UAT-11 | Ajukan peminjaman buku fisik | Katalog → "Ajukan Pinjam" | Transaksi `menunggu_persetujuan` | Transaksi dibuat | Lulus |
| UAT-12 | Ajukan pinjam e-book (tidak boleh) | Kartu e-book tidak menampilkan tombol pinjam | Ditolak | Ditolak + pesan fallback | Lulus |
| UAT-13 | Admin menyetujui peminjaman | *Proses Peminjaman* → Setujui | Stok −1, status `dipinjam`, jatuh tempo terisi | Stok 50→49, due date = hari ini + 7 | Lulus |
| UAT-14 | Admin menolak peminjaman | Tolak + isi alasan | Status `ditolak`, catatan tersimpan | Status `ditolak`, notes tersimpan | Lulus |
| UAT-15 | Proses pengembalian tepat waktu | *Proses Pengembalian* | Stok +1, status `dikembalikan`, denda 0 | Stok 49→50, denda Rp0 | Lulus |
| UAT-16 | Deteksi keterlambatan otomatis | Transaksi `dipinjam` lewat jatuh tempo | Status berubah `terlambat` | Otomatis oleh `markOverdue()` | Lulus |
| UAT-17 | Hitung denda otomatis | Kembalikan buku telat 13 hari | Denda = 13 × Rp1.000 = Rp13.000 | Rp13.000, status `belum_lunas` | Lulus |
| UAT-18 | Verifikasi pelunasan denda | Tombol verifikasi pelunasan | `fine_paid_status` = `lunas` | Berubah ke `lunas` | Lulus |
| UAT-19 | Riwayat peminjaman siswa | Buka `/riwayat` | Tabel riwayat sesuai siswa | Riwayat tampil | Lulus |
| UAT-20 | Laporan + filter rentang tanggal | `/admin/laporan?from=..&to=..` | Data terfilter sesuai rentang | Tervalidasi 200 + data sesuai | Lulus |
| UAT-21 | Export CSV laporan | Klik "Export CSV" | File CSV terunduh | CSV valid, header sesuai | Lulus |
| UAT-22 | Cetak laporan (print view) | Klik "Cetak PDF" | Tampilan siap cetak | Halaman print 200 | Lulus |
| UAT-23 | Upload cover valid | Tambah buku + cover JPG ≤2MB | Cover tersimpan & tampil | Cover tampil | Lulus |
| UAT-24 | Upload file salah tipe | Cover berformat .txt | Ditolak + pesan | Ditolak | Lulus |
| UAT-25 | Upload file melebihi batas | Cover 2,5MB | Ditolak | Ditolak | Lulus |
| UAT-26 | Hapus buku yang punya transaksi | Hapus buku dari koleksi | Ditolak (peminjaman aktif) | Ditolak | Lulus |
| UAT-27 | Simpan System Settings | Ubah denda/hari → 2000, simpan | Nilai tersimpan & dipakai | Dipakai saat hitung denda | Lulus |
| UAT-28 | Test koneksi AI | *Konfigurasi AI* → Test Koneksi | Pesan berhasil/gagal | Sesuai provider | Lulus |
| UAT-29 | Halaman Rekomendasi AI | Buka `/rekomendasi` | Rekomendasi dari AI / fallback | AI atau fallback aman | Lulus |
| UAT-30 | Chatbot Pustakawan (floating) | Klik ikon chat, kirim pertanyaan | Balasan dari AI / fallback | JSON 200, fallback bila tanpa API Key | Lulus |
| UAT-31 | Notifikasi WA saat approve | Gateway terisi → Setujui | Pesan terkirim ke nomor siswa | Terkirim / bila gateway kosong tampil flash peringatan | Lulus |
| UAT-32 | Pengingat WA | Baris `dipinjam`/`terlambat` → "Kirim Pengingat WA" | Pesan pengingat terkirim | Flash sukses/peringatan, transaksi tidak terganggu | Lulus |
| UAT-33 | Error handling WA gateway gagal | Endpoint tak terjangkau | Transaksi tetap sukses + flash warning | Transaksi sukses, flash "Gagal mengirim WhatsApp" | Lulus |
| UAT-34 | Audit tautan & halaman | Crawl seluruh menu (admin & siswa) | Tidak ada 404/500 | Semua halaman 200, akses lintas role 403 | Lulus |
| UAT-35 | Edit profil siswa | /profil ubah nama, kelas, email, nomor WA | Data tersimpan & header berubah tanpa logout | Tersimpan, session ikut diperbarui | Lulus |
| UAT-36 | Validasi profil | WA salah format / email duplikat / kelas kosong | Ditolak dengan pesan jelas | HTTP 400 + pesan spesifik | Lulus |
| UAT-37 | Ubah password mandiri | Tab Ubah Password: password lama salah / konfirmasi beda / valid | Ditolak / berhasil | Password lama diverifikasi bcrypt, hash baru tersimpan | Lulus |

**Catatan UAT:** seluruh skenario di atas telah diuji otomatis (curl/HTTP) maupun manual di browser; Status = Lulus berarti sesuai harapan.

---

### 9. Lampiran: Simulasi Pertanyaan Penguji Sidang

> Ringkasan jawaban ini dipakai sebagai bahan latihan sebelum presentasi/sidang.

1. **Kenapa memakai Express + EJS, bukan React/Vue?**
   Aplikasi adalah sistem internal perpustakaan dengan banyak form & tabel. SSR EJS memakai satu bahasa (JavaScript) di seluruh stack, proses install lebih sederhana, dan tidak butuh toolchain build (Vite/webpack). Tailwind via CDN mempercepat styling responsif.

2. **Bagaimana keamanan password disimpan?**
   Password di-hash dengan **bcrypt** (10 salt rounds) saat register/seed, tidak pernah disimpan sebagai teks biasa. Login memakai `bcrypt.compare`. API Key AI dan token WhatsApp disimpan di `system_settings` dan hanya ditampilkan ter-masking (`••••••xxxx`) di UI; seluruh panggilan API terjadi di server (`AiService`, `WhatsappService`), sehingga kunci tidak pernah bocor ke browser.

3. **Bagaimana sistem tahu siswa belum boleh pinjam?**
   `src/services/borrowRules.js` berisi `evaluateBook()`: cek buku e-book (tidak dipinjam), stok ≤ 0, keterlambatan, serta jumlah peminjaman aktif ≥ kuota. Aturan kuota & durasi dibaca dari `system_settings`, bukan angka hardcode.

4. **Bagaimana stok buku tetap akurat?**
   Stok dikurangi tepat satu kali saat transisi status `menunggu_persetujuan` → `dipinjam` (query di `sirkulasiController.approve`) dan ditambah satu kali saat pengembalian. Transaksi dan update stok dijalankan berurutan dalam satu alur controller, dan status transaksi dijaga dengan kondisi `WHERE status = ...` agar tidak ada approve ganda.

5. **Bagaimana denda dihitung dan Why otomatis terdeteksi?**
   `sirkulasiService.markOverdue()` mengubah transaksi `dipinjam` yang `due_date < CURDATE()` menjadi `terlambat` setiap kali halaman sirkulasi dibuka. Denda = `calculateFine(due_date, return_date, fine_per_day)` = selisih hari × nominal denda per hari dari System Settings, lalu status pembayaran (`lunas`/`belum_lunas`) diverifikasi admin.

6. **Apa bedanya Rekomendasi AI/Chatbot dengan mesin pencari biasa?**
   Konteks diambil langsung dari database (daftar judul katalog yang aktif + durasi pinjam + nominal denda) lalu disuntikkan ke *system prompt*, sehingga jawaban AI terikat pada koleksi & aturan perpustakaan SMA NEGERI 1 MAJALENGKA, bukan pengetahuan umum. Bila API Key kosong atau provider error, sistem mengembalikan pesan fallback yang ramah — aplikasi tidak pernah crash.

7. **Bagaimana notifikasi WhatsApp tidak menggagalkan transaksi?**
   `WhatsappService.send()` selalu dibungkus `try-catch` dan mengembalikan status `{ ok, skipped, message }`. Bila gateway belum dikonfigurasi atau request gagal, controller tetap menyelesaikan perubahan database dan menampilkan flash peringatan — memisahkan antara "notifikasi" (opsional) dan "transaksi" (wajib berhasil).

8. **Bagaimana menjaga agar program tetap dapat diuji/didokumentasikan?**
   Seluruh skenario UAT didokumentasikan di tabel bagian 8, dapat dijalankan ulang dengan `npm run db:reset` (database bersih + data demo), dan fitur pelaporan menyediakan export CSV serta tampilan siap cetak untuk dilampirkan ke laporan RPL.
