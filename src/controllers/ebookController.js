/**
 * Controller E-Book Reader
 * Menampilkan PDF e-book di dalam halaman web (embedded viewer).
 */
const pool = require("../config/db");

async function show(req, res, next) {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM books WHERE id = ? AND is_active = 1",
      [req.params.id]
    );
    if (!rows.length) {
      req.session.flash = { type: "error", message: "E-book tidak ditemukan." };
      return res.redirect("/katalog");
    }
    const book = rows[0];

    if (!book.pdf_e_book_url) {
      req.session.flash = { type: "error", message: "File PDF untuk buku ini belum tersedia." };
      return res.redirect("/katalog");
    }

    res.render("ebook/reader", { title: "Baca E-Book", book });
  } catch (err) {
    next(err);
  }
}

async function index(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT b.id, b.title, b.author, b.format, b.synopsis, b.cover_image_url, b.pdf_e_book_url, b.stock_ebook,
              c.name AS category_name
       FROM books b
       LEFT JOIN categories c ON c.id = b.category_id
       WHERE b.is_active = 1 AND b.pdf_e_book_url IS NOT NULL AND b.pdf_e_book_url <> ''
       ORDER BY b.title ASC`
    );
    res.render("ebook/index", { title: "E-Book Reader", books: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { index, show };
