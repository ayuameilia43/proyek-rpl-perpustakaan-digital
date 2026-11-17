const pool = require("../config/db");

class TransactionRepository {
  async findByUserIdWithBook(userId) {
    if (!userId) return [];
    const [rows] = await pool.query(
      `SELECT t.id, t.status, t.borrow_date, t.due_date, t.return_date, t.fine_amount,
              t.fine_paid_status, t.admin_notes, b.title, b.author, b.format
       FROM transactions t
       JOIN books b ON b.id = t.book_id
       WHERE t.user_id = ?
       ORDER BY t.created_at DESC`,
      [userId]
    );
    return rows || [];
  }
}

module.exports = TransactionRepository;
