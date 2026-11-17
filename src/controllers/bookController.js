/**
 * Controller Kelola Koleksi Buku (Admin & Pustakawan)
 * CRUD buku (fisik & e-book), upload cover gambar & PDF, kategori.
 * Menangani validasi tipe/ukuran file, placeholder, dan pembersihan file lama.
 */
const { randomUUID } = require("crypto");
const pool = require("../config/db");
const { removeUpload, MAX_SIZE } = require("../middleware/upload");

const FORMATS = ["fisik", "e-book", "keduanya"];

async function getCategories() {
  const [rows] = await pool.query("SELECT * FROM categories WHERE is_active = 1 ORDER BY name ASC");
  return rows;
}

async function index(req, res, next) {
  try {
    const q = (req.query.q || "").trim();
    const cat = req.query.category || "";
    const fmt = req.query.format || "";
    const params = [];
    let where = "WHERE 1=1";
    if (q) {
      where += " AND (b.title LIKE ? OR b.author LIKE ? OR b.ISBN LIKE ?)";
      params.push("%" + q + "%", "%" + q + "%", "%" + q + "%");
    }
    if (cat) { where += " AND b.category_id = ?"; params.push(cat); }
    if (fmt && FORMATS.includes(fmt)) { where += " AND b.format = ?"; params.push(fmt); }

    const [books] = await pool.query(
      `SELECT b.*, c.name AS category_name
       FROM books b LEFT JOIN categories c ON c.id = b.category_id
       ${where} ORDER BY b.created_at DESC`,
      params
    );
    const categories = await getCategories();
    res.render("admin/books/index", {
      title: "Kelola Koleksi Buku",
      books,
      categories,
      query: { q, category: cat, format: fmt },
      formats: FORMATS,
    });
  } catch (err) {
    next(err);
  }
}

function createForm(req, res, next) {
  getCategories()
    .then((categories) => {
      res.render("admin/books/form", {
        title: "Tambah Buku",
        isEdit: false,
        errors: [],
        form: { format: "fisik", total_stock_fisic: 0, stock_fisic: 0, stock_ebook: 0 },
        categories,
        formats: FORMATS,
      });
    })
    .catch(next);
}

async function editForm(req, res, next) {
  try {
    const [rows] = await pool.query("SELECT * FROM books WHERE id = ?", [req.params.id]);
    if (!rows.length) {
      req.session.flash = { type: "error", message: "Buku tidak ditemukan." };
      return res.redirect("/admin/koleksi");
    }
    const categories = await getCategories();
    res.render("admin/books/form", {
      title: "Edit Buku",
      isEdit: true,
      errors: [],
      form: rows[0],
      categories,
      formats: FORMATS,
    });
  } catch (err) {
    next(err);
  }
}

function validateBook(body, isEdit) {
  const errors = [];
  const form = {
    title: (body.title || "").trim(),
    author: (body.author || "").trim(),
    publisher: (body.publisher || "").trim(),
    year: body.year ? Number(body.year) : null,
    ISBN: (body.ISBN || "").trim(),
    category_id: body.category_id || "",
    format: body.format || "",
    total_stock_fisic: Number(body.total_stock_fisic || 0),
    stock_fisic: Number(body.stock_fisic || 0),
    stock_ebook: Number(body.stock_ebook || 0),
    synopsis: body.synopsis || "",
  };
  if (!form.title) errors.push("Judul buku wajib diisi.");
  if (!form.author) errors.push("Pengarang wajib diisi.");
  if (!form.ISBN) errors.push("ISBN wajib diisi.");
  if (!form.category_id) errors.push("Kategori wajib dipilih.");
  if (!FORMATS.includes(form.format)) errors.push("Format buku tidak valid.");
  if (form.year && (!Number.isInteger(form.year) || form.year < 1900 || form.year > 2100)) errors.push("Tahun terbit tidak valid.");
  if (!Number.isInteger(form.total_stock_fisic) || form.total_stock_fisic < 0) errors.push("Total stok fisik harus bilangan >= 0.");
  if (!Number.isInteger(form.stock_fisic) || form.stock_fisic < 0) errors.push("Stok fisik harus bilangan >= 0.");
  if (form.stock_fisic > form.total_stock_fisic) errors.push("Stok fisik tidak boleh melebihi total stok.");
  if (!Number.isInteger(form.stock_ebook) || form.stock_ebook < 0) errors.push("Kuota e-book harus bilangan >= 0.");
  return { form, errors };
}

function fileTooLarge(req) {
  if (!req.files) return null;
  for (const [field, arr] of Object.entries(req.files)) {
    if (arr && arr.length && arr[0].size > MAX_SIZE[field]) {
      return field === "cover_image"
        ? "Ukuran cover maksimal 2 MB."
        : "Ukuran file PDF maksimal 10 MB.";
    }
  }
  return null;
}

function saveFilesIfAny(req) {
  const result = {};
  if (req.files) {
    if (req.files.cover_image && req.files.cover_image[0]) {
      result.cover_image_url = "/uploads/covers/" + req.files.cover_image[0].filename;
    }
    if (req.files.ebook_file && req.files.ebook_file[0]) {
      result.pdf_e_book_url = "/uploads/ebooks/" + req.files.ebook_file[0].filename;
    }
  }
  return result;
}

function deleteUploaded(req) {
  if (!req.files) return;
  for (const arr of Object.values(req.files)) {
    if (arr && arr[0]) removeUpload("/uploads/" + (arr[0].fieldname === "cover_image" ? "covers/" : "ebooks/") + arr[0].filename);
  }
}

async function store(req, res, next) {
  const { form, errors } = validateBook(req.body, false);
  if (req.uploadError) errors.push(req.uploadError);
  const sizeErr = fileTooLarge(req);
  if (sizeErr) errors.push(sizeErr);

  const files = saveFilesIfAny(req);
  if ((form.format === "e-book" || form.format === "keduanya") && !files.pdf_e_book_url) {
    errors.push("File PDF wajib diunggah untuk buku format e-book.");
  }

  try {
    const categories = await getCategories();
    if (errors.length) {
      deleteUploaded(req);
      return res.status(400).render("admin/books/form", {
        title: "Tambah Buku", isEdit: false, errors, form: { ...form, ...req.body }, categories, formats: FORMATS,
      });
    }

    const [cat] = await pool.query("SELECT id FROM categories WHERE id = ?", [form.category_id]);
    if (!cat.length) {
      errors.push("Kategori tidak ditemukan.");
      deleteUploaded(req);
      return res.status(400).render("admin/books/form", {
        title: "Tambah Buku", isEdit: false, errors, form, categories, formats: FORMATS,
      });
    }

    const [dup] = await pool.query("SELECT ISBN FROM books WHERE ISBN = ? LIMIT 1", [form.ISBN]);
    if (dup.length) {
      errors.push("ISBN sudah terdaftar.");
      deleteUploaded(req);
      return res.status(400).render("admin/books/form", {
        title: "Tambah Buku", isEdit: false, errors, form, categories, formats: FORMATS,
      });
    }

    await pool.query(
      `INSERT INTO books (id, title, author, publisher, year, ISBN, category_id, format, total_stock_fisic, stock_fisic, synopsis, stock_ebook, cover_image_url, pdf_e_book_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [randomUUID(), form.title, form.author, form.publisher, form.year, form.ISBN, form.category_id, form.format,
       form.total_stock_fisic, form.stock_fisic, form.synopsis, form.stock_ebook,
       files.cover_image_url || null, files.pdf_e_book_url || null]
    );

    req.session.flash = { type: "success", message: `Buku "${form.title}" berhasil ditambahkan.` };
    return res.redirect("/admin/koleksi");
  } catch (err) {
    deleteUploaded(req);
    next(err);
  }
}

async function update(req, res, next) {
  const id = req.params.id;
  try {
    const [rows] = await pool.query("SELECT * FROM books WHERE id = ?", [id]);
    if (!rows.length) {
      req.session.flash = { type: "error", message: "Buku tidak ditemukan." };
      return res.redirect("/admin/koleksi");
    }
    const existing = rows[0];

    const { form, errors } = validateBook(req.body, true);
    if (req.uploadError) errors.push(req.uploadError);
    const sizeErr = fileTooLarge(req);
    if (sizeErr) errors.push(sizeErr);

    const newFiles = saveFilesIfAny(req);
    const finalCover = newFiles.cover_image_url || existing.cover_image_url;
    const finalPdf = newFiles.pdf_e_book_url || existing.pdf_e_book_url;

    if ((form.format === "e-book" || form.format === "keduanya") && !finalPdf) {
      errors.push("File PDF wajib ada untuk buku format e-book.");
    }

    const categories = await getCategories();
    if (errors.length) {
      deleteUploaded(req);
      return res.status(400).render("admin/books/form", {
        title: "Edit Buku", isEdit: true, errors, form: { ...form, id, ...req.body }, categories, formats: FORMATS,
      });
    }

    const [dup] = await pool.query("SELECT ISBN FROM books WHERE ISBN = ? AND id <> ? LIMIT 1", [form.ISBN, id]);
    if (dup.length) {
      errors.push("ISBN sudah dipakai buku lain.");
      deleteUploaded(req);
      return res.status(400).render("admin/books/form", {
        title: "Edit Buku", isEdit: true, errors, form: { ...form, id }, categories, formats: FORMATS,
      });
    }

    await pool.query(
      `UPDATE books SET title=?, author=?, publisher=?, year=?, ISBN=?, category_id=?, format=?, total_stock_fisic=?, stock_fisic=?, synopsis=?, stock_ebook=?, cover_image_url=?, pdf_e_book_url=? WHERE id=?`,
      [form.title, form.author, form.publisher, form.year, form.ISBN, form.category_id, form.format,
       form.total_stock_fisic, form.stock_fisic, form.synopsis, form.stock_ebook, finalCover, finalPdf, id]
    );

    // Bersihkan file lama yang diganti
    if (newFiles.cover_image_url && existing.cover_image_url) removeUpload(existing.cover_image_url);
    if (newFiles.pdf_e_book_url && existing.pdf_e_book_url) removeUpload(existing.pdf_e_book_url);

    req.session.flash = { type: "success", message: `Buku "${form.title}" berhasil diperbarui.` };
    return res.redirect("/admin/koleksi");
  } catch (err) {
    deleteUploaded(req);
    next(err);
  }
}

async function destroy(req, res, next) {
  const id = req.params.id;
  try {
    const [rows] = await pool.query("SELECT * FROM books WHERE id = ?", [id]);
    if (!rows.length) {
      req.session.flash = { type: "error", message: "Buku tidak ditemukan." };
      return res.redirect("/admin/koleksi");
    }
    const book = rows[0];

    const [trx] = await pool.query("SELECT COUNT(*) AS total FROM transactions WHERE book_id = ?", [id]);
    if (trx[0].total > 0) {
      req.session.flash = {
        type: "error",
        message: `Buku "${book.title}" tidak dapat dihapus karena memiliki riwayat peminjaman (${trx[0].total} transaksi).`,
      };
      return res.redirect("/admin/koleksi");
    }

    await pool.query("DELETE FROM books WHERE id = ?", [id]);
    if (book.cover_image_url) removeUpload(book.cover_image_url);
    if (book.pdf_e_book_url) removeUpload(book.pdf_e_book_url);

    req.session.flash = { type: "success", message: `Buku "${book.title}" berhasil dihapus.` };
    return res.redirect("/admin/koleksi");
  } catch (err) {
    next(err);
  }
}

module.exports = { index, createForm, store, editForm, update, destroy };
