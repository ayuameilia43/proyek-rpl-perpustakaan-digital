/**
 * Controller Katalog Buku (Siswa & Administrator)
 * Pencarian, filter kategori & format, kartu buku, detail, dan status kelayakan pinjam.
 */
const pool = require("../config/db");
const { getUserBorrowStats, evaluateBook } = require("../services/borrowRules");

const FORMATS = ["fisik", "e-book", "keduanya"];

async function getCategories() {
  const [rows] = await pool.query("SELECT * FROM categories WHERE is_active = 1 ORDER BY name ASC");
  return rows;
}

async function index(req, res, next) {
  try {
    const q = (req.query.q || "").trim();
    const category = req.query.category || "";
    const format = req.query.format || "";

    const params = [];
    let where = "WHERE b.is_active = 1";
    if (q) {
      where += " AND (b.title LIKE ? OR b.author LIKE ? OR b.ISBN LIKE ?)";
      params.push("%" + q + "%", "%" + q + "%", "%" + q + "%");
    }
    if (category) { where += " AND b.category_id = ?"; params.push(category); }
    if (format && FORMATS.includes(format)) { where += " AND b.format = ?"; params.push(format); }

    const [books] = await pool.query(
      `SELECT b.*, c.name AS category_name
       FROM books b LEFT JOIN categories c ON c.id = b.category_id
       ${where} ORDER BY b.created_at DESC`,
      params
    );

    const categories = await getCategories();
    const user = req.session.user;
    const isStudent = user.role === "siswa";
    const stats = isStudent ? await getUserBorrowStats(user.id) : null;

    // Hitung status tombol pinjam per buku
    books.forEach((b) => {
      if (!isStudent) {
        b.borrow = { allowed: false, reasons: [], hidden: true };
      } else {
        b.borrow = evaluateBook(b, stats);
      }
    });

    res.render("catalog/index", {
      title: "Katalog Buku",
      books,
      categories,
      query: { q, category, format },
      formats: FORMATS,
      stats,
      isStudent,
    });
  } catch (err) {
    next(err);
  }
}

async function show(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT b.*, c.name AS category_name FROM books b
       LEFT JOIN categories c ON c.id = b.category_id WHERE b.id = ? AND b.is_active = 1`,
      [req.params.id]
    );
    if (!rows.length) {
      req.session.flash = { type: "error", message: "Buku tidak ditemukan." };
      return res.redirect("/katalog");
    }
    const book = rows[0];
    const user = req.session.user;
    const isStudent = user.role === "siswa";
    const stats = isStudent ? await getUserBorrowStats(user.id) : null;
    book.borrow = isStudent ? evaluateBook(book, stats) : { allowed: false, reasons: [], hidden: true };

    // Cek apakah siswa sudah mengajukan buku ini (masih menunggu)
    let alreadyPending = false;
    if (isStudent) {
      const [p] = await pool.query(
        "SELECT id FROM transactions WHERE user_id=? AND book_id=? AND status='menunggu_persetujuan' LIMIT 1",
        [user.id, book.id]
      );
      alreadyPending = p.length > 0;
    }

    res.render("catalog/show", {
      title: book.title,
      book,
      stats,
      isStudent,
      alreadyPending,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { index, show };
