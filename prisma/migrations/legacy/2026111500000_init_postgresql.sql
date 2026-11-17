-- Migration: 2026111500000_init
-- Deskripsi: Tabel awal untuk perpustakaran digital SMA NEGERI 1 MAJALENGKA

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabel: categories
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabel: users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nisn VARCHAR(20) UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    class VARCHAR(50),
    whatsapp_number VARCHAR(20),
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'siswa' CHECK (role IN ('siswa', 'pustakawan', 'admin')),
    is_active BOOLEAN DEFAULT true,
    max_books_allowed INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabel: books
CREATE TABLE IF NOT EXISTS books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    author VARCHAR(100) NOT NULL,
    publisher VARCHAR(100),
    year INTEGER,
    ISBN VARCHAR(20) UNIQUE,
    category_id UUID REFERENCES categories(id),
    format VARCHAR(20) NOT NULL CHECK (format IN ('fisik', 'e-book', 'keduanya')),
    total_stock_fisic INTEGER DEFAULT 0,
    stock_fisic INTEGER DEFAULT 0,
    synopsis TEXT,
    stock_ebook INTEGER DEFAULT 0,
    cover_image_url TEXT,
    pdf_e_book_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabel: transactions
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    book_id UUID REFERENCES books(id),
    status VARCHAR(30) DEFAULT 'menunggu_persetujuan' CHECK (status IN ('menunggu_persetujuan', 'dipinjam', 'ditolak', 'dikembalikan', 'terlambat')),
    borrow_date DATE DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    return_date DATE,
    fine_amount DECIMAL(10,2) DEFAULT 0,
    fine_paid_status VARCHAR(20) DEFAULT 'belum_lunas' CHECK (fine_paid_status IN ('lunas', 'belum_lunas')),
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabel: system_settings
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_name VARCHAR(200) DEFAULT 'SMA NEGERI 1 MAJALENGKA',
    school_address TEXT,
    ai_api_key VARCHAR(255),
    fine_per_day DECIMAL(10,2) DEFAULT 1000,
    max_borrow_duration INTEGER DEFAULT 7,
    max_books_per_student INTEGER DEFAULT 3,
    operating_hours_start TIME DEFAULT '07:00:00',
    operating_hours_end TIME DEFAULT '21:00:00',
    whatsapp_api_endpoint TEXT,
    whatsapp_api_token TEXT,
    whatsapp_template_pinjam TEXT,
    whatsapp_template_kembali TEXT,
    whatsapp_template_terlambat TEXT,
    ai_provider VARCHAR(50) DEFAULT 'openai' CHECK (ai_provider IN ('openai', 'gemini', 'anthropic')),
    ai_model VARCHAR(50) DEFAULT 'gpt-4o-mini',
    ai_temperature FLOAT DEFAULT 0.7,
    ai_system_prompt TEXT DEFAULT 'Anda adalah asisten pustakawan SMA yang membantu siswa mencari buku dan informasi perpustakaan. Jawabannya harus selalu relevan dengan literasi, katalog buku, aturan peminjaman, dan denda perpustakaan SMA NEGERI 1 MAJALENGKA. Jangan memberikan jawaban di luar konteks perpustakaan.',
    is_chatbot_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabel: ai_chat_history
CREATE TABLE IF NOT EXISTS ai_chat_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    session_id VARCHAR(100) NOT NULL,
    user_message TEXT NOT NULL,
    ai_response TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert data dummy awal (Seeder)
-- 1. Kategori awal
INSERT INTO categories (name, description, is_active) VALUES
('Fisika', 'Buku pelajaran Fisika SMA', true),
('Matematika', 'Buku pelajaran Matematika SMA', true),
('Sastra', 'Buku Sastra dan Fiction', true),
('Sejarah', 'Buku Sejarah dan Sosial', true),
('Kimia', 'Buku pelajaran Kimia SMA', true),
('Bahasa Inggris', 'Buku Bahasa Inggris', true);

-- 2. Akun Administrator (password sudah di-hash: admin123)
INSERT INTO users (nisn, full_name, class, whatsapp_number, email, password_hash, role, is_active, max_books_allowed) VALUES
('12345678', 'Admin Utama', 'XII', '081234567890', 'admin@sma1majalengka.id', '$2b$10$example.hash.admin123', 'admin', true, 3);

-- 3. Akun Siswa
INSERT INTO users (nisn, full_name, class, whatsapp_number, email, password_hash, role, is_active, max_books_allowed) VALUES
('11111111', 'Andi Saputra', 'X RPL', '08111111111', 'andi@sma1majalengka.id', '$2b$10$example.hash.andi123', 'siswa', true, 3),
('22222222', 'Budi Santoso', 'XI AKL', '08222222222', 'budi@sma1majalengka.id', '$2b$10$example.hash.budi123', 'siswa', true, 3);

-- 4. Data Buku Awal (8 buku)
INSERT INTO books (title, author, publisher, year, ISBN, category_id, format, total_stock_fisic, stock_fisic, synopsis, stock_ebook, cover_image_url, pdf_e_book_url, is_active) VALUES
('Fisika SMA Kelas X', 'Guru Subject', 'Penerbit Sekolah', 2023, '978-602-12345-0', (SELECT id FROM categories WHERE name = 'Fisika'), 'fisik', 45, 45, 'Buku fisika untuk kurikulum SMA kelas X, mengandalkan pengalaman dan contoh soal', 0, '/images/fisika_x.jpg', NULL, true),
('Matematika Interaktif', 'Guru Subject', 'Penerbit Sekolah', 2023, '978-602-12345-1', (SELECT id FROM categories WHERE name = 'Matematika'), 'fisik', 30, 30, 'Pengenalan konsep matematika yang mudah dipahami untuk siswa SMA', 0, '/images/matematika.jpg', NULL, true),
('Novel Cinta Sejati', 'Tere Liye', 'Penerbit Gramedia', 2022, '978-602-12345-2', (SELECT id FROM categories WHERE name = 'Sastra'), 'fisik', 20, 20, 'Cerita cinta yang menyentuh hati pembaca muda', 0, '/images/cinta.jpg', NULL, true),
('Sejarah Indonesia Kontemporer', 'Andi Ahmad', 'Penerbit Erlangga', 2023, '978-602-12345-3', (SELECT id FROM categories WHERE name = 'Sejarah'), 'fisik', 25, 25, 'Kajian sejarah Indonesia dari perspektif modern', 0, '/images/sejarah.jpg', NULL, true),
('Kimia untuk Pemula', 'Rina Sari', 'Penerbit Yrama Widya', 2023, '978-602-12345-4', (SELECT id FROM categories WHERE name = 'Kimia'), 'fisik', 40, 45, 'Pengenalan kimia dasar untuk siswa SMA dengan gambar ilustrasi', 0, '/images/kimia.jpg', NULL, true),
('Bingkai Hidup', 'Tere Liye', 'Penerbit Serambi', 2021, '978-602-12345-5', (SELECT id FROM categories WHERE name = 'Sastra'), 'fisik', 50, 55, 'Kumpulan cerita fiksi hidup sehari-hari', 0, '/images/bingkai.jpg', NULL, true),
('E-Book Panduan UN', 'Tim SPMB', 'BOS Online', 2024, 'UN-2024', (SELECT id FROM categories WHERE name = 'Bahasa Inggris'), 'e-book', 100, 100, 'Bahan pembelajaran untuk persiapan Ujian Nasional (download PDF)', 100, NULL, '/pdf/UN-guide.pdf', true),
('BINGKIT Bahasa Inggris', 'H. Mawardi', 'Penerbit Erlangga', 2023, '978-602-12345-6', (SELECT id FROM categories WHERE name = 'Bahasa Inggris'), 'fisik', 35, 40, 'Buku Bahasa Inggris untuk kurikulum SMA dengan CD audio', 0, '/images/bingkit.jpg', NULL, true);

-- 5. Set default system settings
INSERT INTO system_settings (school_name, school_address, fine_per_day, max_borrow_duration, max_books_per_student) VALUES
('SMA NEGERI 1 MAJALENGKA', 'Jl. Pahlawan No. 1, Majalengka', 1000, 7, 3);