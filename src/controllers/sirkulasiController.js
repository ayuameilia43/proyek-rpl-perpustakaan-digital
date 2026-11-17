/**
 * Controller Sirkulasi (Admin & Pustakawan)
 * - Proses peminjaman: setujui / tolak / proses pengembalian.
 * - Kalkulasi denda otomatis: pada pengembalian (jatuh tempo melewati due_date).
 * - Verifikasi pelunasan denda tunai: fine_paid_status = 'lunas'.
 * - Notifikasi WhatsApp ke siswa (try-catch, tidak pernah menggagalkan transaksi).
 */
const pool = require("../config/db");
const { getSettings } = require("../middleware/locals");
const { markOverdue, calculateFine } = require("../services/sirkulasiService");
const WhatsappService = require("../services/WhatsappService");

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function index(req, res, next) {
  try {
    await markOverdue(pool);
    const [pending] = await pool.query(
      `SELECT t.id, t.status, t.borrow_date, t.due_date, t.return_date, t.fine_amount, t.fine_paid_status, t.admin_notes,
              b.title, b.stock_fisic, b.total_stock_fisic, b.format, b.pdf_e_book_url,
              u.id AS user_id, u.full_name, u.nisn, u.class
       FROM transactions t
       JOIN books b ON b.id = t.book_id
       JOIN users u ON u.id = t.user_id
       WHERE t.status = 'menunggu_persetujuan'
       ORDER BY t.created_at ASC`
    );
    const [active] = await pool.query(
      `SELECT t.id, t.status, t.borrow_date, t.due_date, t.return_date, t.fine_amount, t.fine_paid_status,
              b.title, b.stock_fisic, b.total_stock_fisic, b.format, b.pdf_e_book_url,
              u.id AS user_id, u.full_name, u.nisn, u.class
       FROM transactions t
       JOIN books b ON b.id = t.book_id
       JOIN users u ON u.id = t.user_id
       WHERE t.status IN ('dipinjam', 'terlambat')
       ORDER BY t.due_date ASC`
    );
    res.render("admin/peminjaman/index", { title: "Proses Peminjaman", pending, active });
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  const transactionId = req.body.transaction_id;
  try {
    const settings = await getSettings();
    const [tRows] = await pool.query(
      `SELECT t.*, b.format, b.stock_fisic, b.total_stock_fisic, u.whatsapp_number, u.full_name, u.nisn, u.class
       FROM transactions t JOIN books b ON b.id = t.book_id JOIN users u ON u.id = t.user_id WHERE t.id = ?`,
      [transactionId]
    );
    const t = tRows[0];
    if (!t) {
      req.session.flash = { type: "error", message: "Permintaan tidak ditemukan." };
      return res.redirect("/admin/peminjaman");
    }
    if (t.status !== "menunggu_persetujuan") {
      req.session.flash = { type: "error", message: "Permintaan sudah diproses." };
      return res.redirect("/admin/peminjaman");
    }
    if (t.format === "e-book") {
      await pool.query("UPDATE transactions SET status='ditolak', admin_notes='Buku e-book diproses melalui E-Book Reader.' WHERE id=? AND status='menunggu_persetujuan'", [transactionId]);
      req.session.flash = { type: "success", message: "Buku e-book tidak memerlukan approval stok. Disusun ke status diproses." };
      return res.redirect("/admin/peminjaman");
    }
    const duration = Number(settings ? settings.max_borrow_duration : 7);
    if (Number(t.stock_fisic) <= 0) {
      req.session.flash = { type: "error", message: "Stok buku habis, tidak dapat menyetujui peminjaman." };
      return res.redirect("/admin/peminjaman");
    }

    await markOverdue(pool);
    const dueDate = todayPlus(duration);
    await pool.query("UPDATE transactions SET status='dipinjam', due_date=? WHERE id=? AND status='menunggu_persetujuan'", [dueDate, transactionId]);
    await pool.query("UPDATE books SET stock_fisic = stock_fisic - 1 WHERE id = ?", [t.book_id]);

    let waMessage = null;
    let waOk = false;
    try {
      const wa = await WhatsappService.sendPinjam({
        phone: t.whatsapp_number,
        settings,
        nama: t.full_name,
        judul: t.title,
        batas_tanggal: dueDate,
        nisn: t.nisn,
        kelas: t.class,
        context: "approve",
      });
      waOk = !!wa.ok;
      if (!wa.ok) waMessage = wa.message;
    } catch (waErr) {
      waMessage = waErr.message;
    }

    if (waOk) {
      req.session.flash = { type: "success", message: `Pengajuan disetujui. Buku dipinjam, jatuh tempo ${dueDate}. Notifikasi WhatsApp terkirim.` };
    } else {
      req.session.flash = { type: "warning", message: `Pengajuan disetujui (jatuh tempo ${dueDate}), tetapi notifikasi WhatsApp tidak terkirim: ${waMessage}.` };
    }
    return res.redirect("/admin/peminjaman");
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  const transactionId = req.body.transaction_id;
  try {
    const settings = await getSettings();
    const reason = req.body.reason || "Tidak disetujui admin.";
    const [tRows] = await pool.query(
      `SELECT t.*, b.title, u.whatsapp_number, u.full_name, u.nisn, u.class
       FROM transactions t JOIN books b ON b.id = t.book_id JOIN users u ON u.id = t.user_id WHERE t.id = ?`,
      [transactionId]
    );
    const t = tRows[0];

    await pool.query(
      "UPDATE transactions SET status='ditolak', admin_notes=? WHERE id=? AND status='menunggu_persetujuan'",
      [reason, transactionId]
    );

    let waMessage = null;
    let waOk = false;
    if (t) {
      try {
        const wa = await WhatsappService.sendTolak({
          phone: t.whatsapp_number,
          settings,
          nama: t.full_name,
          judul: t.title,
          alasan: reason,
          nisn: t.nisn,
          kelas: t.class,
          context: "reject",
        });
        waOk = !!wa.ok;
        if (!wa.ok) waMessage = wa.message;
      } catch (waErr) {
        waMessage = waErr.message;
      }
    }

    if (waOk) {
      req.session.flash = { type: "success", message: "Pengajuan peminjaman ditolak. Notifikasi WhatsApp terkirim." };
    } else {
      req.session.flash = { type: "warning", message: `Pengajuan peminjaman ditolak, tetapi notifikasi WhatsApp tidak terkirim: ${waMessage}.` };
    }
    return res.redirect("/admin/peminjaman");
  } catch (err) {
    next(err);
  }
}

async function returnBook(req, res, next) {
  const transactionId = req.body.transaction_id;
  try {
    const settings = await getSettings();
    const [tRows] = await pool.query(
      `SELECT t.*, b.format FROM transactions t JOIN books b ON b.id = t.book_id WHERE t.id = ?`,
      [transactionId]
    );
    const t = tRows[0];
    if (!t) {
      req.session.flash = { type: "error", message: "Transaksi tidak ditemukan." };
      return res.redirect("/admin/peminjaman");
    }
    if (t.status === "ditolak") {
      req.session.flash = { type: "error", message: "Tidak dapat mengembalikan buku yang ditolak." };
      return res.redirect("/admin/peminjaman");
    }
    const returnDate = new Date();
    const dueDate = t.due_date;
    const fine = calculateFine(dueDate, returnDate, settings ? settings.fine_per_day : 0);
    const daysLate = dueDate ? Math.max(0, Math.floor((new Date(returnDate) - new Date(dueDate)) / (1000 * 60 * 60 * 24))) : 0;

    const fineStatus = fine > 0 ? "belum_lunas" : "lunas";
    await pool.query(
      "UPDATE transactions SET status='dikembalikan', return_date=?, fine_amount=?, fine_paid_status=? WHERE id=? AND status IN ('dipinjam','terlambat')",
      [returnDate.toISOString().slice(0, 10), fine, fineStatus, transactionId]
    );
    await pool.query("UPDATE books SET stock_fisic = stock_fisic + 1 WHERE id = ?", [t.book_id]);

    req.session.flash = {
      type: "success",
      message: `Buku dikembalikan. Denda keterlambatan: Rp ${Number(fine).toLocaleString("id-ID")} (${daysLate} hari).`,
    };
    return res.redirect("/admin/peminjaman");
  } catch (err) {
    next(err);
  }
}

async function verifyFine(req, res, next) {
  const id = req.params.id;
  try {
    const [rows] = await pool.query("SELECT id FROM transactions WHERE id = ?", [id]);
    if (!rows.length) {
      req.session.flash = { type: "error", message: "Transaksi tidak ditemukan." };
      return res.redirect("/admin/peminjaman");
    }
    await pool.query("UPDATE transactions SET fine_paid_status='lunas' WHERE id = ?", [id]);
    req.session.flash = { type: "success", message: "Pelunasan denda (tunai) telah diverifikasi." };
    return res.redirect("/admin/peminjaman");
  } catch (err) {
    next(err);
  }
}

async function remind(req, res, next) {
  const transactionId = req.body.transaction_id;
  try {
    const settings = await getSettings();
    const [tRows] = await pool.query(
      `SELECT t.*, b.title, u.whatsapp_number, u.full_name, u.nisn, u.class
       FROM transactions t JOIN books b ON b.id = t.book_id JOIN users u ON u.id = t.user_id WHERE t.id = ?`,
      [transactionId]
    );
    const t = tRows[0];
    if (!t) {
      req.session.flash = { type: "error", message: "Transaksi tidak ditemukan." };
      return res.redirect("/admin/peminjaman");
    }
    if (t.status !== "dipinjam" && t.status !== "terlambat") {
      req.session.flash = { type: "error", message: "Pengingat hanya untuk peminjaman aktif atau terlambat." };
      return res.redirect("/admin/peminjaman");
    }

    const daysLate = t.due_date ? Math.max(0, Math.floor((new Date() - new Date(t.due_date)) / (1000 * 60 * 60 * 24))) : 0;
    const fine = daysLate * Number((settings && settings.fine_per_day) || 0);

    let wa;
    try {
      if (t.status === "terlambat") {
        wa = await WhatsappService.sendTerlambat({
          phone: t.whatsapp_number,
          settings,
          nama: t.full_name,
          judul: t.title,
          hari_terlambat: daysLate,
          denda: Number(fine).toLocaleString("id-ID"),
          nisn: t.nisn,
          kelas: t.class,
          context: "remind-terlambat",
        });
      } else {
        wa = await WhatsappService.sendPengingat({
          phone: t.whatsapp_number,
          settings,
          nama: t.full_name,
          judul: t.title,
          batas_tanggal: t.due_date,
          nisn: t.nisn,
          kelas: t.class,
          context: "remind-dipinjam",
        });
      }
    } catch (waErr) {
      wa = { ok: false, message: waErr.message };
    }

    if (wa && wa.ok) {
      req.session.flash = { type: "success", message: `Pengingat WhatsApp terkirim ke ${t.full_name} (${t.title}).` };
    } else {
      req.session.flash = { type: "warning", message: `Pengingat WhatsApp tidak terkirim: ${wa ? wa.message : "gagal"}.` };
    }
    return res.redirect("/admin/peminjaman");
  } catch (err) {
    next(err);
  }
}

module.exports = { index, approve, reject, returnBook, verifyFine, remind };
