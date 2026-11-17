/**
 * Controller Pengajuan Peminjaman (khusus Siswa)
 * Membuat transaksi berstatus "menunggu_persetujuan" setelah melewati aturan bisnis.
 */
const { randomUUID } = require("crypto");
const pool = require("../config/db");
const { getSettings } = require("../middleware/locals");
const { getUserBorrowStats, evaluateBook } = require("../services/borrowRules");

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

async function store(req, res, next) {
  const user = req.session.user;

  // Hanya siswa yang boleh mengajukan
  if (user.role !== "siswa") {
    req.session.flash = { type: "error", message: "Hanya akun siswa yang dapat mengajukan peminjaman." };
    return res.redirect("/katalog");
  }

  const bookId = req.body.book_id || "";
  if (!bookId) {
    req.session.flash = { type: "error", message: "Buku tidak valid." };
    return res.redirect("/katalog");
  }

  try {
    const [rows] = await pool.query("SELECT * FROM books WHERE id = ? AND is_active = 1", [bookId]);
    if (!rows.length) {
      req.session.flash = { type: "error", message: "Buku tidak ditemukan." };
      return res.redirect("/katalog");
    }
    const book = rows[0];

    // Aturan bisnis
    const stats = await getUserBorrowStats(user.id);
    const evalResult = evaluateBook(book, stats);
    if (!evalResult.allowed) {
      req.session.flash = { type: "error", message: "Tidak dapat mengajukan: " + evalResult.reasons.join(" ") };
      return res.redirect("/katalog/" + book.id);
    }

    // Duplikat pengajuan yang masih menunggu
    const [dup] = await pool.query(
      "SELECT id FROM transactions WHERE user_id=? AND book_id=? AND status='menunggu_persetujuan' LIMIT 1",
      [user.id, book.id]
    );
    if (dup.length) {
      req.session.flash = { type: "error", message: "Anda sudah mengajukan buku ini dan masih menunggu persetujuan." };
      return res.redirect("/katalog/" + book.id);
    }

    const settings = await getSettings();
    const duration = Number(settings ? settings.max_borrow_duration : 7);
    const today = new Date();
    const due = new Date();
    due.setDate(due.getDate() + duration);

    await pool.query(
      `INSERT INTO transactions (id, user_id, book_id, status, borrow_date, due_date, fine_amount, fine_paid_status)
       VALUES (?, ?, ?, 'menunggu_persetujuan', ?, ?, 0, 'belum_lunas')`,
      [randomUUID(), user.id, book.id, dateStr(today), dateStr(due)]
    );

    req.session.flash = {
      type: "success",
      message: `Pengajuan peminjaman "${book.title}" berhasil dikirim. Menunggu persetujuan pustakawan.`,
    };
    return res.redirect("/riwayat");
  } catch (err) {
    next(err);
  }
}

module.exports = { store };
