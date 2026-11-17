/**
 * Controller Riwayat Peminjaman (khusus Siswa)
 * Menampilkan seluruh riwayat pengajuan pinjam dengan status, tanggal, denda.
 */
const pool = require("../config/db");

async function index(req, res, next) {
  try {
    const user = req.session.user;
    const [rows] = await pool.query(
      `SELECT t.id, t.status, t.borrow_date, t.due_date, t.return_date, t.fine_amount, t.fine_paid_status, t.admin_notes,
              b.title, b.format, b.pdf_e_book_url, b.stock_fisic, b.total_stock_fisic
       FROM transactions t
       JOIN books b ON b.id = t.book_id
       WHERE t.user_id = ?
       ORDER BY t.created_at DESC`,
      [user.id]
    );
    res.render("riwayat/index", { title: "Riwayat Peminjaman", transactions: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { index };
