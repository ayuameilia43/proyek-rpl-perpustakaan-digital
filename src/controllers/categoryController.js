/**
 * Controller Kategori Buku (Admin & Pustakawan)
 * CRUD kategori dengan penjagaan integritas (kategori dipakai buku tidak bisa dihapus).
 */
const { randomUUID } = require("crypto");
const pool = require("../config/db");

async function index(req, res, next) {
  try {
    const [categories] = await pool.query(
      `SELECT c.*, (SELECT COUNT(*) FROM books b WHERE b.category_id = c.id) AS book_count
       FROM categories c ORDER BY c.name ASC`
    );
    res.render("admin/books/category", {
      title: "Kelola Kategori",
      categories,
      errors: [],
      form: {},
    });
  } catch (err) {
    next(err);
  }
}

async function store(req, res, next) {
  const form = {
    name: (req.body.name || "").trim(),
    description: (req.body.description || "").trim(),
    is_active: req.body.is_active === "1" ? 1 : 0,
  };
  const errors = [];
  if (!form.name) errors.push("Nama kategori wajib diisi.");
  if (form.name.length > 50) errors.push("Nama kategori maksimal 50 karakter.");

  try {
    if (errors.length) {
      const [categories] = await pool.query("SELECT * FROM categories ORDER BY name ASC");
      return res.status(400).render("admin/books/category", { title: "Kelola Kategori", categories, errors, form });
    }
    const [dup] = await pool.query("SELECT id FROM categories WHERE name = ? LIMIT 1", [form.name]);
    if (dup.length) {
      const [categories] = await pool.query("SELECT * FROM categories ORDER BY name ASC");
      errors.push("Nama kategori sudah ada.");
      return res.status(400).render("admin/books/category", { title: "Kelola Kategori", categories, errors, form });
    }
    await pool.query("INSERT INTO categories (id, name, description, is_active) VALUES (?, ?, ?, ?)", [
      randomUUID(), form.name, form.description, form.is_active,
    ]);
    req.session.flash = { type: "success", message: `Kategori "${form.name}" berhasil ditambahkan.` };
    return res.redirect("/admin/kategori");
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  const id = req.params.id;
  const form = {
    name: (req.body.name || "").trim(),
    description: (req.body.description || "").trim(),
    is_active: req.body.is_active === "1" ? 1 : 0,
  };
  const errors = [];
  if (!form.name) errors.push("Nama kategori wajib diisi.");

  try {
    const [rows] = await pool.query("SELECT * FROM categories WHERE id = ?", [id]);
    if (!rows.length) {
      req.session.flash = { type: "error", message: "Kategori tidak ditemukan." };
      return res.redirect("/admin/kategori");
    }
    if (errors.length) {
      const [categories] = await pool.query("SELECT * FROM categories ORDER BY name ASC");
      return res.status(400).render("admin/books/category", { title: "Kelola Kategori", categories, errors, form });
    }
    const [dup] = await pool.query("SELECT id FROM categories WHERE name = ? AND id <> ? LIMIT 1", [form.name, id]);
    if (dup.length) {
      const [categories] = await pool.query("SELECT * FROM categories ORDER BY name ASC");
      errors.push("Nama kategori sudah dipakai.");
      return res.status(400).render("admin/books/category", { title: "Kelola Kategori", categories, errors, form });
    }
    await pool.query("UPDATE categories SET name=?, description=?, is_active=? WHERE id=?", [
      form.name, form.description, form.is_active, id,
    ]);
    req.session.flash = { type: "success", message: `Kategori "${form.name}" berhasil diperbarui.` };
    return res.redirect("/admin/kategori");
  } catch (err) {
    next(err);
  }
}

async function destroy(req, res, next) {
  const id = req.params.id;
  try {
    const [rows] = await pool.query("SELECT * FROM categories WHERE id = ?", [id]);
    if (!rows.length) {
      req.session.flash = { type: "error", message: "Kategori tidak ditemukan." };
      return res.redirect("/admin/kategori");
    }
    const [count] = await pool.query("SELECT COUNT(*) AS total FROM books WHERE category_id = ?", [id]);
    if (count[0].total > 0) {
      req.session.flash = {
        type: "error",
        message: `Kategori "${rows[0].name}" tidak dapat dihapus karena masih dipakai ${count[0].total} buku.`,
      };
      return res.redirect("/admin/kategori");
    }
    await pool.query("DELETE FROM categories WHERE id = ?", [id]);
    req.session.flash = { type: "success", message: `Kategori "${rows[0].name}" berhasil dihapus.` };
    return res.redirect("/admin/kategori");
  } catch (err) {
    next(err);
  }
}

module.exports = { index, store, update, destroy };
