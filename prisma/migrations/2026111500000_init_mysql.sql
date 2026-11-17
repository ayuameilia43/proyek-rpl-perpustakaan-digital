-- Migration: 2026111500000_init_mysql
-- Deskripsi: Tabel awal Perpustakaan Digital SMA NEGERI 1 MAJALENGKA (MySQL 8+)
-- Jalankan: mysql -u root perpustakaan_sma < prisma/migrations/2026111500000_init_mysql.sql

SET NAMES utf8mb4;

-- Tabel: categories
CREATE TABLE IF NOT EXISTS categories (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(50) NOT NULL,
    description TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabel: users
CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    nisn VARCHAR(20) UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    class VARCHAR(50),
    whatsapp_number VARCHAR(20),
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('siswa', 'pustakawan', 'admin') DEFAULT 'siswa',
    is_active TINYINT(1) DEFAULT 1,
    max_books_allowed INT DEFAULT 3,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabel: books
CREATE TABLE IF NOT EXISTS books (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    title VARCHAR(200) NOT NULL,
    author VARCHAR(100) NOT NULL,
    publisher VARCHAR(100),
    year INT,
    ISBN VARCHAR(20) UNIQUE,
    category_id CHAR(36),
    format ENUM('fisik', 'e-book', 'keduanya') NOT NULL,
    total_stock_fisic INT DEFAULT 0,
    stock_fisic INT DEFAULT 0,
    synopsis TEXT,
    stock_ebook INT DEFAULT 0,
    cover_image_url TEXT,
    pdf_e_book_url TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_books_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabel: transactions
CREATE TABLE IF NOT EXISTS transactions (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36),
    book_id CHAR(36),
    status ENUM('menunggu_persetujuan', 'dipinjam', 'ditolak', 'dikembalikan', 'terlambat') DEFAULT 'menunggu_persetujuan',
    borrow_date DATE,
    due_date DATE NOT NULL,
    return_date DATE,
    fine_amount DECIMAL(10,2) DEFAULT 0,
    fine_paid_status ENUM('lunas', 'belum_lunas') DEFAULT 'belum_lunas',
    admin_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_trx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_trx_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabel: system_settings
CREATE TABLE IF NOT EXISTS system_settings (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    school_name VARCHAR(200) DEFAULT 'SMA NEGERI 1 MAJALENGKA',
    school_address TEXT,
    ai_api_key VARCHAR(255),
    fine_per_day DECIMAL(10,2) DEFAULT 1000,
    max_borrow_duration INT DEFAULT 7,
    max_books_per_student INT DEFAULT 3,
    operating_hours_start TIME DEFAULT '07:00:00',
    operating_hours_end TIME DEFAULT '21:00:00',
    whatsapp_api_endpoint TEXT,
    whatsapp_api_token TEXT,
    whatsapp_template_pinjam TEXT,
    whatsapp_template_kembali TEXT,
    whatsapp_template_terlambat TEXT,
    ai_provider ENUM('gemini', 'grok', 'nvidia') DEFAULT 'gemini',
    ai_model VARCHAR(50) DEFAULT 'gemini-2.5-flash',
    ai_temperature FLOAT DEFAULT 0.7,
    ai_system_prompt TEXT,
    is_chatbot_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabel: ai_chat_history
CREATE TABLE IF NOT EXISTS ai_chat_history (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36),
    session_id VARCHAR(100) NOT NULL,
    user_message TEXT NOT NULL,
    ai_response TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
