/**
 * Controller User Management (khusus Administrator)
 * Kelola akun Siswa & Pustakawan: daftar, tambah, edit, reset password, aktif/nonaktif.
 */
const bcrypt = require("bcrypt");
const { randomUUID } = require("crypto");
const pool = require("../config/db");

const ROLES = ["siswa", "pustakawan", "admin"];

async function index(req, res, next) {
  try {
    const q = (req.query.q || "").trim();
    const role = req.query.role || "";
    const params = [];
    let where = "WHERE 1=1";
    if (q) {
      where += " AND (full_name LIKE ? OR nisn LIKE ? OR email LIKE ?)";
      params.push("%" + q + "%", "%" + q + "%", "%" + q + "%");
    }
    if (role && ROLES.includes(role)) {
      where += " AND role = ?";
      params.push(role);
    }
    const [users] = await pool.query(
      `SELECT id, nisn, full_name, class, whatsapp_number, email, role, is_active, created_at
       FROM users ${where} ORDER BY role ASC, full_name ASC`,
      params
    );
    res.render("admin/users/index", {
      title: "User Management",
      users,
      query: { q, role },
      roles: ROLES,
    });
  } catch (err) {
    next(err);
  }
}

function createForm(req, res) {
  res.render("admin/users/form", {
    title: "Tambah Pengguna",
    isEdit: false,
    errors: [],
    form: { role: "siswa", is_active: "1" },
    roles: ROLES,
  });
}

async function store(req, res, next) {
  const form = {
    nisn: (req.body.nisn || "").trim(),
    full_name: (req.body.full_name || "").trim(),
    class: (req.body.class || "").trim(),
    whatsapp_number: (req.body.whatsapp_number || "").trim(),
    email: (req.body.email || "").trim().toLowerCase(),
    role: (req.body.role || "siswa").trim(),
    is_active: req.body.is_active === "1" ? 1 : 0,
  };
  const password = req.body.password || "";
  const errors = validate(form, password, false);

  if (errors.length) {
    return res.status(400).render("admin/users/form", {
      title: "Tambah Pengguna", isEdit: false, errors, form, roles: ROLES,
    });
  }

  try {
    const [dup] = await pool.query(
      "SELECT nisn, email FROM users WHERE nisn = ? OR email = ? LIMIT 1",
      [form.nisn, form.email]
    );
    if (dup.length) {
      errors.push("NISN atau Email sudah terdaftar.");
      return res.status(400).render("admin/users/form", {
        title: "Tambah Pengguna", isEdit: false, errors, form, roles: ROLES,
      });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (id, nisn, full_name, class, whatsapp_number, email, password_hash, role, is_active, max_books_allowed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 3)`,
      [randomUUID(), form.nisn, form.full_name, form.class, form.whatsapp_number, form.email, hash, form.role, form.is_active]
    );
    req.session.flash = { type: "success", message: `Akun "${form.full_name}" berhasil ditambahkan.` };
    return res.redirect("/admin/users");
  } catch (err) {
    next(err);
  }
}

async function editForm(req, res, next) {
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [req.params.id]);
    if (!rows.length) {
      req.session.flash = { type: "error", message: "Pengguna tidak ditemukan." };
      return res.redirect("/admin/users");
    }
    res.render("admin/users/form", {
      title: "Edit Pengguna",
      isEdit: true,
      errors: [],
      form: rows[0],
      roles: ROLES,
    });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  const id = req.params.id;
  const form = {
    nisn: (req.body.nisn || "").trim(),
    full_name: (req.body.full_name || "").trim(),
    class: (req.body.class || "").trim(),
    whatsapp_number: (req.body.whatsapp_number || "").trim(),
    email: (req.body.email || "").trim().toLowerCase(),
    role: (req.body.role || "siswa").trim(),
    is_active: req.body.is_active === "1" ? 1 : 0,
  };
  const password = req.body.password || "";
  const errors = validate(form, password, true);

  // Cegah admin menonaktifkan akunnya sendiri
  if (id === req.session.user.id && form.is_active === 0) {
    errors.push("Anda tidak dapat menonaktifkan akun yang sedang digunakan.");
  }

  if (errors.length) {
    return res.status(400).render("admin/users/form", {
      title: "Edit Pengguna", isEdit: true, errors, form: { ...form, id }, roles: ROLES,
    });
  }

  try {
    const [dup] = await pool.query(
      "SELECT nisn, email FROM users WHERE (nisn = ? OR email = ?) AND id <> ? LIMIT 1",
      [form.nisn, form.email, id]
    );
    if (dup.length) {
      errors.push("NISN atau Email sudah dipakai pengguna lain.");
      return res.status(400).render("admin/users/form", {
        title: "Edit Pengguna", isEdit: true, errors, form: { ...form, id }, roles: ROLES,
      });
    }

    await pool.query(
      `UPDATE users SET nisn=?, full_name=?, class=?, whatsapp_number=?, email=?, role=?, is_active=? WHERE id=?`,
      [form.nisn, form.full_name, form.class, form.whatsapp_number, form.email, form.role, form.is_active, id]
    );

    // Reset password opsional saat edit
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, id]);
    }

    req.session.flash = { type: "success", message: `Data "${form.full_name}" berhasil diperbarui.` };
    return res.redirect("/admin/users");
  } catch (err) {
    next(err);
  }
}

async function toggleActive(req, res, next) {
  const id = req.params.id;
  if (id === req.session.user.id) {
    req.session.flash = { type: "error", message: "Anda tidak dapat menonaktifkan akun sendiri." };
    return res.redirect("/admin/users");
  }
  try {
    const [rows] = await pool.query("SELECT is_active, full_name FROM users WHERE id = ?", [id]);
    if (!rows.length) {
      req.session.flash = { type: "error", message: "Pengguna tidak ditemukan." };
      return res.redirect("/admin/users");
    }
    const nextActive = rows[0].is_active ? 0 : 1;
    await pool.query("UPDATE users SET is_active = ? WHERE id = ?", [nextActive, id]);
    req.session.flash = {
      type: "success",
      message: `Akun "${rows[0].full_name}" kini ${nextActive ? "aktif" : "nonaktif"}.`,
    };
    return res.redirect("/admin/users");
  } catch (err) {
    next(err);
  }
}

// Validasi umum (dipakai create & edit)
function validate(form, password, isEdit) {
  const errors = [];
  if (!/^[0-9]{4,20}$/.test(form.nisn)) errors.push("NISN harus angka 4-20 digit.");
  if (!form.full_name) errors.push("Nama lengkap wajib diisi.");
  if (!form.class) errors.push("Kelas wajib diisi.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.push("Email tidak valid.");
  if (!/^[0-9+\-\s]{8,20}$/.test(form.whatsapp_number)) errors.push("Nomor WhatsApp tidak valid.");
  if (!ROLES.includes(form.role)) errors.push("Role tidak valid.");
  if (!isEdit && password.length < 6) errors.push("Password minimal 6 karakter.");
  if (isEdit && password && password.length < 6) errors.push("Password baru minimal 6 karakter.");
  return errors;
}

module.exports = { index, createForm, store, editForm, update, toggleActive };
