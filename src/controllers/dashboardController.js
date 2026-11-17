/**
 * Controller Dashboard
 * Menampilkan ringkasan berbeda untuk Siswa vs Administrator/Pustakawan.
 */
const pool = require("../config/db");

// Hitung selisih hari (due - today)
function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

async function index(req, res, next) {
  try {
    const user = req.session.user;

    if (user.role === "siswa") {
      const [activeLoans] = await pool.query(
        `SELECT t.id, t.status, t.borrow_date, t.due_date, t.fine_amount, t.fine_paid_status,
                b.title, b.author, b.cover_image_url
         FROM transactions t JOIN books b ON b.id = t.book_id
         WHERE t.user_id = ? AND t.status IN ('dipinjam','terlambat')
         ORDER BY t.due_date ASC`,
        [user.id]
      );
      activeLoans.forEach((l) => (l.days_left = daysUntil(l.due_date)));

      const [[pending]] = await pool.query(
        "SELECT COUNT(*) AS total FROM transactions WHERE user_id = ? AND status = 'menunggu_persetujuan'",
        [user.id]
      );
      const [[fine]] = await pool.query(
        `SELECT COALESCE(SUM(fine_amount),0) AS total FROM transactions
         WHERE user_id = ? AND fine_paid_status = 'belum_lunas' AND fine_amount > 0`,
        [user.id]
      );
      const [latestBooks] = await pool.query(
        "SELECT id, title, author, format, cover_image_url FROM books WHERE is_active = 1 ORDER BY created_at DESC LIMIT 4"
      );

      return res.render("dashboard/index", {
        title: "Dashboard",
        role: "siswa",
        activeLoans,
        pendingCount: pending.total,
        unpaidFine: Number(fine.total),
        latestBooks,
      });
    }

    // Administrator / Pustakawan
    const [[stats]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM books) AS total_titles,
         (SELECT COALESCE(SUM(total_stock_fisic),0) FROM books) AS total_physical,
         (SELECT COUNT(*) FROM books WHERE stock_ebook > 0) AS total_ebooks,
         (SELECT COUNT(*) FROM transactions WHERE status IN ('dipinjam','terlambat')) AS active_loans,
         (SELECT COUNT(*) FROM transactions WHERE status = 'menunggu_persetujuan') AS pending,
         (SELECT COUNT(*) FROM transactions WHERE status = 'terlambat') AS overdue,
         (SELECT COALESCE(SUM(fine_amount),0) FROM transactions WHERE fine_paid_status = 'lunas') AS fines_collected,
         (SELECT COUNT(*) FROM users WHERE role = 'siswa') AS total_students`
    );
    const [pendingList] = await pool.query(
      `SELECT t.id, t.borrow_date, u.full_name, u.class, b.title
       FROM transactions t JOIN users u ON u.id = t.user_id JOIN books b ON b.id = t.book_id
       WHERE t.status = 'menunggu_persetujuan' ORDER BY t.created_at ASC LIMIT 5`
    );

    return res.render("dashboard/index", {
      title: "Dashboard",
      role: "admin",
      stats,
      pendingList,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { index };
