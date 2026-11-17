/**
 * Controller Autentikasi
 * - Login memakai NISN ATAU Email
 * - Registrasi khusus akun Siswa baru
 * - Password diverifikasi dengan bcrypt
 */
const bcrypt = require("bcrypt");
const { randomUUID } = require("crypto");
const pool = require("../config/db");

// Halaman login
function getLogin(req, res) {
  res.render("auth/login", { layout: "layouts/auth", title: "Masuk" });
}

// Proses login (NISN atau Email)
async function postLogin(req, res) {
  const identifier = (req.body.identifier || "").trim();
  const password = req.body.password || "";

  if (!identifier || !password) {
    req.session.flash = { type: "error", message: "NISN/Email dan password wajib diisi." };
    return res.redirect("/login");
  }

  try {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE nisn = ? OR email = ? LIMIT 1",
      [identifier, identifier]
    );
    const user = rows[0];

    if (!user) {
      req.session.flash = { type: "error", message: "Akun tidak ditemukan. Periksa NISN/Email Anda." };
      return res.redirect("/login");
    }
    if (!user.is_active) {
      req.session.flash = { type: "error", message: "Akun Anda dinonaktifkan. Hubungi pustakawan." };
      return res.redirect("/login");
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      req.session.flash = { type: "error", message: "Password salah. Silakan coba lagi." };
      return res.redirect("/login");
    }

    // Simpan data minimal ke session
    req.session.user = {
      id: user.id,
      nisn: user.nisn,
      full_name: user.full_name,
      role: user.role,
      class: user.class,
      email: user.email,
      whatsapp_number: user.whatsapp_number,
    };
    req.session.flash = { type: "success", message: `Selamat datang, ${user.full_name}!` };
    return res.redirect("/dashboard");
  } catch (err) {
    console.error("Login error:", err);
    req.session.flash = { type: "error", message: "Terjadi kesalahan pada server." };
    return res.redirect("/login");
  }
}

// Halaman registrasi siswa
function getRegister(req, res) {
  res.render("auth/register", {
    layout: "layouts/auth",
    title: "Daftar Akun Siswa",
    errors: [],
    form: {},
  });
}

// Proses registrasi siswa
async function postRegister(req, res) {
  const form = {
    nisn: (req.body.nisn || "").trim(),
    full_name: (req.body.full_name || "").trim(),
    class: (req.body.class || "").trim(),
    whatsapp_number: (req.body.whatsapp_number || "").trim(),
    email: (req.body.email || "").trim().toLowerCase(),
  };
  const password = req.body.password || "";
  const confirm = req.body.confirm_password || "";

  const errors = [];
  if (!form.nisn) errors.push("NISN wajib diisi.");
  if (!/^[0-9]{4,20}$/.test(form.nisn)) errors.push("NISN harus berupa angka (4-20 digit).");
  if (!form.full_name) errors.push("Nama lengkap wajib diisi.");
  if (!form.class) errors.push("Kelas wajib diisi.");
  if (!form.email) errors.push("Email wajib diisi.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.push("Format email tidak valid.");
  if (!/^[0-9+\-\s]{8,20}$/.test(form.whatsapp_number)) errors.push("Nomor WhatsApp tidak valid.");
  if (password.length < 6) errors.push("Password minimal 6 karakter.");
  if (password !== confirm) errors.push("Konfirmasi password tidak cocok.");

  if (errors.length) {
    return res.status(400).render("auth/register", {
      layout: "layouts/auth",
      title: "Daftar Akun Siswa",
      errors,
      form,
    });
  }

  try {
    const [dup] = await pool.query(
      "SELECT nisn, email FROM users WHERE nisn = ? OR email = ? LIMIT 1",
      [form.nisn, form.email]
    );
    if (dup.length) {
      errors.push("NISN atau Email sudah terdaftar. Gunakan data lain.");
      return res.status(400).render("auth/register", {
        layout: "layouts/auth",
        title: "Daftar Akun Siswa",
        errors,
        form,
      });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (id, nisn, full_name, class, whatsapp_number, email, password_hash, role, is_active, max_books_allowed)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'siswa', 1, 3)`,
      [randomUUID(), form.nisn, form.full_name, form.class, form.whatsapp_number, form.email, hash]
    );

    req.session.flash = { type: "success", message: "Registrasi berhasil! Silakan login dengan NISN atau Email." };
    return res.redirect("/login");
  } catch (err) {
    console.error("Register error:", err);
    errors.push("Terjadi kesalahan pada server. Coba lagi.");
    return res.status(500).render("auth/register", {
      layout: "layouts/auth",
      title: "Daftar Akun Siswa",
      errors,
      form,
    });
  }
}

// Logout
function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
}

module.exports = { getLogin, postLogin, getRegister, postRegister, logout };
