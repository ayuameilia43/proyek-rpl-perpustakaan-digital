const pool = require("../config/db");

class UserRepository {
  async findProfileById(userId) {
    if (!userId) return null;
    const [rows] = await pool.query(
      `SELECT id, nisn, full_name, class, email, whatsapp_number, role, max_books_allowed
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  }
}

module.exports = UserRepository;
