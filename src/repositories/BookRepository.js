const pool = require("../config/db");

class BookRepository {
  async findActiveCatalog({ limit = 40 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 100);
    const [rows] = await pool.query(
      `SELECT id, title, author, format, synopsis, total_stock_fisic, stock_fisic, stock_ebook
       FROM books
       WHERE is_active = 1
       ORDER BY created_at DESC
       LIMIT ?`,
      [safeLimit]
    );
    return rows || [];
  }
}

module.exports = BookRepository;
