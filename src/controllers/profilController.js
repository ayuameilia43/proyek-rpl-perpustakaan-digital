/**
 * Controller Profil / Pengaturan Akun (semua role yang login)
 * - Edit Profil: nama lengkap, kelas (siswa), email, nomor WhatsApp.
 *   NISN & role bersifat read-only demi keamanan akun.
 * - Ubah Password: wajib menyertakan password lama (diverifikasi bcrypt).
 */
const bcrypt = require("bcrypt");
const pool = require("../config/db");

const ROLE_LABEL = { siswa: "Siswa", pustakawan: "Pustakawan", admin: "Administrator" };

/**
 * Normalisasi nomor WhatsApp ke format lokal 08xxxxxxxxxx.
 * 628123456789 / +628123456789 / "0812-3456-789" -> 08123456789
 */
function normalizeWa(value) {
  let p = String(value || "").trim();
  p = p.replace(/[\s\-().]/g, "");
  if (p.startsWith("+62")) p = "0" + p.slice(3);
  else if (p.startsWith("62")) p = "0" + p.slice(2);
  return p;
}

function isValidWa(phone) {
  return /^08[0-9]{8,14}$/.test(String(phone || ""));
}

function renderForm(res, { tab, profile, errors, form, status }) {
  return res.status(status || 200).render("profil/index", {
    title: "Pengaturan Akun",
    tab,
    profile,
    errors,
    form,
    roleLabel: ROLE_LABEL[profile.role] || profile.role,
  });
}

async function index(req, res, next) {
  try {
    const [rows] = await pool.query(
      "SELECT id, nisn, full_name, class, email, whatsapp_number, role FROM users WHERE id = ?",
      [req.session.user.id]
    );
    const profile = rows[0];
    if (!profile) {
      req.session.flash = { type: "error", message: "Data akun tidak ditemukan." };
      return res.redirect("/dashboard");
    }
    const tab = req.query.tab === "password" ? "password" : "profil";
    return renderForm(res, { tab, profile, errors: [], form: profile });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const sessionUser = req.session.user;
    const [rows] = await pool.query(
      "SELECT id, nisn, full_name, class, email, whatsapp_number, role FROM users WHERE id = ?",
      [sessionUser.id]
    );
    const profile = rows[0];
    if (!profile) {
      req.session.flash = { type: "error", message: "Data akun tidak ditemukan." };
      return res.redirect("/dashboard");
    }

    const form = {
      full_name: (req.body.full_name || "").trim(),
      class: (req.body.class || "").trim(),
      email: (req.body.email || "").trim().toLowerCase(),
      whatsapp_number: normalizeWa(req.body.whatsapp_number),
    };

    const errors = [];
    if (!form.full_name) errors.push("Nama lengkap wajib diisi.");
    else if (form.full_name.length < 3) errors.push("Nama lengkap minimal 3 karakter.");
    if (!form.email) errors.push("Email wajib diisi.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.push("Format email tidak valid.");
    if (profile.role === "siswa" && !form.class) errors.push("Kelas wajib diisi.");
    if (!form.whatsapp_number) errors.push("Nomor WhatsApp wajib diisi.");
    else if (!isValidWa(form.whatsapp_number)) {
      errors.push("Nomor WhatsApp tidak valid. Gunakan format 08xxxxxxxxxx (contoh: 081234567890).");
    }

    if (!errors.length) {
      const [dup] = await pool.query("SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1", [
        form.email,
        profile.id,
      ]);
      if (dup.length) errors.push("Email tersebut sudah digunakan oleh akun lain.");
    }

    if (errors.length) {
      return renderForm(res, {
        tab: "profil",
        profile,
        errors,
        form: Object.assign({}, profile, form),
        status: 400,
      });
    }

    await pool.query(
      "UPDATE users SET full_name = ?, class = ?, email = ?, whatsapp_number = ? WHERE id = ?",
      [form.full_name, form.class, form.email, form.whatsapp_number, profile.id]
    );

    // Perbarui session agar header/nama langsung berubah tanpa logout
    sessionUser.full_name = form.full_name;
    sessionUser.email = form.email;
    sessionUser.class = form.class;
    sessionUser.whatsapp_number = form.whatsapp_number;

    req.session.flash = { type: "success", message: "Profil berhasil diperbarui." };
    return res.redirect("/profil");
  } catch (err) {
    next(err);
  }
}

async function updatePassword(req, res, next) {
  try {
    const sessionUser = req.session.user;
    const [rows] = await pool.query(
      "SELECT id, nisn, full_name, class, email, whatsapp_number, role, password_hash FROM users WHERE id = ?",
      [sessionUser.id]
    );
    const profile = rows[0];
    if (!profile) {
      req.session.flash = { type: "error", message: "Data akun tidak ditemukan." };
      return res.redirect("/dashboard");
    }

    const oldPassword = req.body.old_password || "";
    const newPassword = req.body.new_password || "";
    const confirmPassword = req.body.confirm_password || "";

    const errors = [];
    if (!oldPassword) errors.push("Password lama wajib diisi.");
    if (!newPassword) errors.push("Password baru wajib diisi.");
    else if (newPassword.length < 6) errors.push("Password baru minimal 6 karakter.");
    if (newPassword !== confirmPassword) errors.push("Konfirmasi password baru tidak cocok.");

    if (!errors.length) {
      const match = await bcrypt.compare(oldPassword, profile.password_hash);
      if (!match) errors.push("Password lama tidak sesuai.");
    }

    if (errors.length) {
      return renderForm(res, { tab: "password", profile, errors, form: profile, status: 400 });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, profile.id]);

    req.session.flash = { type: "success", message: "Password berhasil diubah. Gunakan password baru saat login berikutnya." };
    return res.redirect("/profil?tab=password");
  } catch (err) {
    next(err);
  }
}

module.exports = { index, updateProfile, updatePassword, normalizeWa, isValidWa };
