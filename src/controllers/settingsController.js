/**
 * Controller System Settings (khusus Administrator)
 * Mengelola aturan bisnis perpustakaan (dinamis, tersimpan di database):
 * denda per hari, durasi pinjam, kuota buku, jam operasional, WhatsApp Gateway.
 */
const pool = require("../config/db");
const { getSettings, clearSettingsCache } = require("../middleware/locals");
const WhatsappService = require("../services/WhatsappService");

function mask(value) {
  if (!value) return "";
  const s = String(value);
  return "••••••" + s.slice(-4);
}

async function index(req, res, next) {
  try {
    const settings = await getSettings();
    res.render("admin/settings/index", {
      title: "System Settings",
      settings,
      errors: [],
      form: settings,
      maskedToken: mask(settings.whatsapp_api_token),
    });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const current = await getSettings();
    const form = {
      school_name: (req.body.school_name || "").trim(),
      school_address: (req.body.school_address || "").trim(),
      fine_per_day: req.body.fine_per_day,
      max_borrow_duration: req.body.max_borrow_duration,
      max_books_per_student: req.body.max_books_per_student,
      operating_hours_start: (req.body.operating_hours_start || "").trim(),
      operating_hours_end: (req.body.operating_hours_end || "").trim(),
      whatsapp_api_endpoint: (req.body.whatsapp_api_endpoint || "").trim(),
      whatsapp_template_pinjam: req.body.whatsapp_template_pinjam || "",
      whatsapp_template_kembali: req.body.whatsapp_template_kembali || "",
      whatsapp_template_terlambat: req.body.whatsapp_template_terlambat || "",
    };
    const newToken = (req.body.whatsapp_api_token || "").trim();

    const errors = [];
    if (!form.school_name) errors.push("Nama sekolah wajib diisi.");
    const fine = Number(form.fine_per_day);
    if (form.fine_per_day === "" || isNaN(fine) || fine < 0) errors.push("Denda per hari harus angka >= 0.");
    const dur = Number(form.max_borrow_duration);
    if (!Number.isInteger(dur) || dur < 1) errors.push("Durasi pinjam minimal 1 hari.");
    const quota = Number(form.max_books_per_student);
    if (!Number.isInteger(quota) || quota < 1) errors.push("Kuota buku minimal 1.");
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
    if (!timeRe.test(form.operating_hours_start)) errors.push("Jam buka tidak valid (HH:MM).");
    if (!timeRe.test(form.operating_hours_end)) errors.push("Jam tutup tidak valid (HH:MM).");

    if (errors.length) {
      return res.status(400).render("admin/settings/index", {
        title: "System Settings",
        settings: current,
        errors,
        form,
        maskedToken: mask(current.whatsapp_api_token),
      });
    }

    // Token WA: jika dikosongkan, pertahankan token lama
    const tokenToSave = newToken ? newToken : current.whatsapp_api_token;

    await pool.query(
      `UPDATE system_settings SET
        school_name=?, school_address=?, fine_per_day=?, max_borrow_duration=?, max_books_per_student=?,
        operating_hours_start=?, operating_hours_end=?, whatsapp_api_endpoint=?, whatsapp_api_token=?,
        whatsapp_template_pinjam=?, whatsapp_template_kembali=?, whatsapp_template_terlambat=?
       WHERE id=?`,
      [
        form.school_name, form.school_address, fine, dur, quota,
        form.operating_hours_start, form.operating_hours_end, form.whatsapp_api_endpoint, tokenToSave,
        form.whatsapp_template_pinjam, form.whatsapp_template_kembali, form.whatsapp_template_terlambat,
        current.id,
      ]
    );

    clearSettingsCache();
    req.session.flash = { type: "success", message: "Pengaturan sistem berhasil disimpan." };
    return res.redirect("/admin/settings");
  } catch (err) {
    next(err);
  }
}

// Tombol "Test Kirim WhatsApp" - mengirim pesan uji ke gateway & menampilkan alasan error asli
async function testWa(req, res, next) {
  try {
    const current = await getSettings();
    const target = (req.body.test_number || "").trim();
    const tokenOverride = (req.body.test_token || "").trim();
    const customMessage = (req.body.test_message || "").trim();

    const settings = {
      whatsapp_api_endpoint: current.whatsapp_api_endpoint,
      whatsapp_api_token: tokenOverride || current.whatsapp_api_token,
      whatsapp_template_pinjam: current.whatsapp_template_pinjam,
      whatsapp_template_kembali: current.whatsapp_template_kembali,
      whatsapp_template_terlambat: current.whatsapp_template_terlambat,
    };

    let message = customMessage;
    if (!message) {
      message = WhatsappService.renderTemplate(
        WhatsappService.DEFAULT_TEMPLATES.pinjam,
        { nama: "Uji Coba", judul: "Buku Contoh", batas_tanggal: new Date().toISOString().slice(0, 10) }
      );
    }

    const result = await WhatsappService.send({
      phone: target,
      message,
      settings,
      context: "test-kirim",
    });

    if (result.ok) {
      req.session.flash = {
        type: "success",
        message: `Pesan uji berhasil dikirim ke ${WhatsappService.normalizePhone(target)}. Respons gateway: ${result.message}`,
      };
    } else {
      req.session.flash = {
        type: "error",
        message: `Gagal mengirim pesan uji: ${result.message}`,
      };
    }
    return res.redirect("/admin/settings");
  } catch (err) {
    next(err);
  }
}

module.exports = { index, update, testWa };
