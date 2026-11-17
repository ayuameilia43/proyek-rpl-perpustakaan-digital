/**
 * Seeder Database - Perpustakaan Digital SMA NEGERI 1 MAJALENGKA
 * Database : MySQL (Laragon)
 * Driver   : mysql2/promise
 * Fungsi   : Mengisi data dummy awal (kategori, 8 buku, 1 admin, 2 siswa,
 *            system settings, dan 2 contoh transaksi untuk uji dashboard).
 * Jalankan : node prisma/seed.js
 */

require("dotenv").config();
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const { randomUUID } = require("crypto");

// Ubah DATABASE_URL (mysql://user:pass@host:port/db) menjadi config mysql2
function parseDbUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    charset: "utf8mb4",
    multipleStatements: false,
  };
}

async function main() {
  const cfg = parseDbUrl(process.env.DATABASE_URL);
  const conn = await mysql.createConnection(cfg);
  console.log(`ðŸŒ± Terhubung ke MySQL: ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}\n`);

  // Bersihkan data lama agar seeding bisa diulang (fresh)
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const t of ["ai_chat_history", "transactions", "books", "users", "categories", "system_settings"]) {
    await conn.query(`TRUNCATE TABLE \`${t}\``);
  }
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  console.log("âœ“ Tabel lama dibersihkan (fresh seed)\n");

  // 1. Kategori
  const categories = [
    ["Fisika", "Buku pelajaran Fisika SMA"],
    ["Matematika", "Buku pelajaran Matematika SMA"],
    ["Sastra", "Buku Sastra dan Fiksi"],
    ["Sejarah", "Buku Sejarah dan Sosial"],
    ["Kimia", "Buku pelajaran Kimia SMA"],
    ["Bahasa Inggris", "Buku Bahasa Inggris"],
  ];
  const catId = {};
  for (const [name, desc] of categories) {
    const id = randomUUID();
    catId[name] = id;
    await conn.query(
      "INSERT INTO categories (id, name, description, is_active) VALUES (?, ?, ?, 1)",
      [id, name, desc]
    );
    console.log(`âœ“ Kategori: ${name}`);
  }

  // 2. Akun (password di-hash bcrypt)
  const adminHash = await bcrypt.hash("admin123", 10);
  const siswaHash = await bcrypt.hash("siswa123", 10);

  const adminId = randomUUID();
  const siswa1Id = randomUUID();
  const siswa2Id = randomUUID();

  await conn.query(
    `INSERT INTO users (id, nisn, full_name, class, whatsapp_number, email, password_hash, role, is_active, max_books_allowed)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 1, 3)`,
    [adminId, "12345678", "Admin Utama", "XII", "081234567890", "admin@sma1majalengka.id", adminHash]
  );
  await conn.query(
    `INSERT INTO users (id, nisn, full_name, class, whatsapp_number, email, password_hash, role, is_active, max_books_allowed)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'siswa', 1, 3)`,
    [siswa1Id, "11111111", "Andi Saputra", "X RPL", "08111111111", "andi@sma1majalengka.id", siswaHash]
  );
  await conn.query(
    `INSERT INTO users (id, nisn, full_name, class, whatsapp_number, email, password_hash, role, is_active, max_books_allowed)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'siswa', 1, 3)`,
    [siswa2Id, "22222222", "Budi Santoso", "XI AKL", "08222222222", "budi@sma1majalengka.id", siswaHash]
  );
  console.log("âœ“ Akun: Admin Utama (admin), Andi Saputra & Budi Santoso (siswa)");

  // 3. Buku (8 judul)
  const books = [
    ["Fisika SMA Kelas X", "Guru Mata Pelajaran", "Penerbit Sekolah", 2023, "978-602-12345-0", "Fisika", "fisik", 50, 50, "Buku fisika kurikulum SMA kelas X dengan contoh soal dan pembahasan.", 0, "/images/fisika_x.svg", null],
    ["Matematika Interaktif", "Guru Mata Pelajaran", "Penerbit Sekolah", 2023, "978-602-12345-1", "Matematika", "fisik", 35, 35, "Pengenalan konsep matematika yang mudah dipahami untuk siswa SMA.", 0, "/images/matematika.svg", null],
    ["Novel Cinta Sejati", "Tere Liye", "Gramedia", 2022, "978-602-12345-2", "Sastra", "fisik", 20, 20, "Cerita cinta yang menyentuh hati pembaca muda.", 0, "/images/cinta.svg", null],
    ["Sejarah Indonesia Kontemporer", "Andi Ahmad", "Erlangga", 2023, "978-602-12345-3", "Sejarah", "fisik", 30, 30, "Kajian sejarah Indonesia dari perspektif modern.", 0, "/images/sejarah.svg", null],
    ["Kimia untuk Pemula", "Rina Sari", "Yrama Widya", 2023, "978-602-12345-4", "Kimia", "fisik", 45, 45, "Pengenalan kimia dasar untuk siswa SMA dengan gambar ilustrasi.", 0, "/images/kimia.svg", null],
    ["Bingkai Hidup", "Tere Liye", "Serambi", 2021, "978-602-12345-5", "Sastra", "fisik", 55, 55, "Kumpulan cerita fiksi tentang kehidupan sehari-hari.", 0, "/images/bingkai.svg", null],
    ["E-Book Panduan Ujian Nasional", "Tim SPMB", "BOS Online", 2024, "UN-2024", "Bahasa Inggris", "e-book", 0, 0, "Bahan pembelajaran persiapan Ujian Nasional dalam format PDF.", 100, null, "/pdf/UN-guide.pdf"],
    ["BINGKIT Bahasa Inggris", "H. Mawardi", "Erlangga", 2023, "978-602-12345-6", "Bahasa Inggris", "fisik", 40, 40, "Buku Bahasa Inggris kurikulum SMA dilengkapi latihan soal.", 0, "/images/bingkit.svg", null],
  ];
  const bookId = {};
  for (const b of books) {
    const id = randomUUID();
    bookId[b[0]] = id;
    await conn.query(
      `INSERT INTO books
        (id, title, author, publisher, year, ISBN, category_id, format, total_stock_fisic, stock_fisic, synopsis, stock_ebook, cover_image_url, pdf_e_book_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [id, b[0], b[1], b[2], b[3], b[4], catId[b[5]], b[6], b[7], b[8], b[9], b[10], b[11], b[12]]
    );
    console.log(`âœ“ Buku: ${b[0]} (${b[6]})`);
  }

  // 4. System Settings (aturan bisnis default)
  await conn.query(
    `INSERT INTO system_settings
      (id, school_name, school_address, fine_per_day, max_borrow_duration, max_books_per_student,
       operating_hours_start, operating_hours_end, ai_provider, ai_model, ai_temperature, ai_system_prompt, is_chatbot_active)
     VALUES (?, ?, ?, 1000, 7, 3, '07:00:00', '21:00:00', 'gemini', 'gemini-2.5-flash', 0.7, ?, 1)`,
    [
      randomUUID(),
      "SMA NEGERI 1 MAJALENGKA",
      "Jl. Pahlawan No. 1, Majalengka",
      "Anda adalah asisten pustakawan SMA yang membantu siswa mencari buku dan informasi perpustakaan. Jawaban harus relevan dengan literasi, katalog buku, aturan peminjaman, dan denda perpustakaan SMA NEGERI 1 MAJALENGKA.",
    ]
  );
  console.log("âœ“ System Settings default (denda Rp1.000/hari, durasi 7 hari, kuota 3 buku)");

  // 5. Contoh transaksi (untuk uji dashboard & sirkulasi)
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const dueSoon = new Date(today); dueSoon.setDate(today.getDate() + 5);
  const overdueBorrow = new Date(today); overdueBorrow.setDate(today.getDate() - 10);
  const overdueDue = new Date(today); overdueDue.setDate(today.getDate() - 3);

  await conn.query(
    `INSERT INTO transactions (id, user_id, book_id, status, borrow_date, due_date, fine_amount, fine_paid_status)
     VALUES (?, ?, ?, 'dipinjam', ?, ?, 0, 'belum_lunas')`,
    [randomUUID(), siswa1Id, bookId["Fisika SMA Kelas X"], iso(today), iso(dueSoon)]
  );
  await conn.query(
    `INSERT INTO transactions (id, user_id, book_id, status, borrow_date, due_date, fine_amount, fine_paid_status)
     VALUES (?, ?, ?, 'terlambat', ?, ?, 3000, 'belum_lunas')`,
    [randomUUID(), siswa2Id, bookId["Novel Cinta Sejati"], iso(overdueBorrow), iso(overdueDue)]
  );
  console.log("âœ“ 2 contoh transaksi (1 dipinjam, 1 terlambat dengan denda Rp3.000)");

  await conn.end();

  console.log("\nðŸŒ± Seeding selesai!\n");
  console.log("   Login Administrator : NISN 12345678 / password admin123");
  console.log("   Login Siswa 1       : NISN 11111111 / password siswa123");
  console.log("   Login Siswa 2       : NISN 22222222 / password siswa123");
}

main().catch((e) => {
  console.error("âŒ Error saat seeding:", e.message);
  process.exit(1);
});

