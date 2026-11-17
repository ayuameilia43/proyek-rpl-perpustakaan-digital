/**
 * WhatsappService
 * Integrasi WhatsApp Gateway (standar Fonnte API & kompatibel umum):
 *   POST {endpoint}
 *   Headers: Content-Type: application/json, Authorization: <token>
 *   Body:    { target: "628xxxxxxxxxx", message: "isi pesan", countryCode: "62" }
 *
 * Catatan:
 * - Fonnte membalas HTTP 200 dengan { status: false, reason: "..." } saat gagal,
 *   sehingga status body WAJIB diperiksa (bukan hanya kode HTTP).
 * - Semua fungsi dibungkus try-catch dan mengembalikan status aman, sehingga
 *   kegagalan notifikasi tidak pernah menggagalkan transaksi database.
 */
const DEFAULT_TEMPLATES = {
  pinjam:
    "Halo {nama}, pengajuan peminjaman buku *{judul}* di Perpustakaan Digital SMA Negeri 1 Majalengka telah *DISETUJUI*.\n" +
    "Batas pengembalian: {batas_tanggal}\n" +
    "Silakan ambil buku di meja pustakawan. Terima kasih!",
  kembali:
    "Halo {nama}, terima kasih telah mengembalikan buku *{judul}*.\n" +
    "Tanggal kembali: {tanggal_kembali}\n" +
    "Semoga bermanfaat dan kami tunggu kunjungan Anda berikutnya.",
  terlambat:
    "Halo {nama}, pengingat dari Perpustakaan Digital SMA Negeri 1 Majalengka:\n" +
    "Buku *{judul}* yang Anda pinjam telah melewati batas waktu.\n" +
    "Keterlambatan: {hari_terlambat} hari\n" +
    "Estimasi denda: Rp {denda}\n" +
    "Mohon segera mengembalikan buku tersebut.",
  tolak:
    "Halo {nama}, pengajuan peminjaman buku *{judul}* belum dapat disetujui.\n" +
    "Alasan: {alasan}\n" +
    "Silakan hubungi meja pustakawan untuk informasi lebih lanjut.",
  pengingat:
    "Halo {nama}, pengingat dari Perpustakaan Digital SMA Negeri 1 Majalengka:\n" +
    "Buku *{judul}* yang Anda pinjam jatuh tempo pada {batas_tanggal}.\n" +
    "Mohon dikembalikan tepat waktu agar tidak terkena denda.",
};

/**
 * Membersihkan & menormalisasi nomor HP tujuan ke format gateway (628xxxxxxxxxx).
 * 08xxx / 0811 / +62xxx / 62xxx / "0811-2345-6789" -> "6281123456789"
 */
function normalizePhone(phone) {
  let p = String(phone || "").trim();
  if (!p) return "";
  p = p.replace(/[^0-9+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (p && !p.startsWith("62")) p = "62" + p;
  return p;
}

/**
 * Mengganti placeholder {nama}, {judul}, {batas_tanggal}, {denda}, ... dengan data transaksi.
 * Placeholder yang tidak dikenal dibiarkan apa adanya agar mudah dideteksi.
 */
function renderTemplate(template, params) {
  const p = params || {};
  const aliases = {
    nama: p.nama !== undefined ? p.nama : p.student_name,
    judul: p.judul !== undefined ? p.judul : p.judul_buku !== undefined ? p.judul_buku : p.book_title,
    judul_buku: p.judul_buku !== undefined ? p.judul_buku : p.book_title,
    batas_tanggal: p.batas_tanggal !== undefined ? p.batas_tanggal : p.due_date,
    tanggal_kembali: p.tanggal_kembali !== undefined ? p.tanggal_kembali : p.return_date,
    hari_terlambat: p.hari_terlambat !== undefined ? p.hari_terlambat : p.days_late,
    denda: p.denda !== undefined ? p.denda : p.fine_amount,
    nisn: p.nisn,
    kelas: p.kelas,
    alasan: p.alasan !== undefined ? p.alasan : p.reason,
  };
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const value = aliases[key];
    return value === undefined || value === null || value === "" ? match : String(value);
  });
}

function logResult(context, target, ok, message) {
  const tag = "[WhatsApp]";
  if (ok) {
    console.log(`${tag} [${context}] ${target} -> BERHASIL (${message})`);
  } else {
    console.warn(`${tag} [${context}] ${target} -> GAGAL: ${message}`);
  }
}

/**
 * Mengirim satu pesan WhatsApp.
 * @returns {Promise<{ok:boolean, skipped?:boolean, message:string, raw?:string, data?:object}>}
 */
async function send({ phone, message, settings, context }) {
  const endpoint = settings ? settings.whatsapp_api_endpoint : null;
  const token = settings ? settings.whatsapp_api_token : null;
  const target = normalizePhone(phone);
  const ctx = context || "umum";

  if (!endpoint) {
    const msg = "Endpoint WhatsApp Gateway belum diisi (System Settings > WhatsApp Gateway).";
    logResult(ctx, target || "-", false, msg);
    return { ok: false, skipped: true, message: msg };
  }
  if (!token) {
    const msg = "Token WhatsApp Gateway belum diisi (System Settings > WhatsApp Gateway).";
    logResult(ctx, target || "-", false, msg);
    return { ok: false, skipped: true, message: msg };
  }
  if (!target) {
    const msg = "Nomor WhatsApp tujuan kosong atau tidak valid.";
    logResult(ctx, "-", false, msg);
    return { ok: false, skipped: true, message: msg };
  }
  if (!message) {
    const msg = "Isi pesan WhatsApp kosong.";
    logResult(ctx, target, false, msg);
    return { ok: false, skipped: true, message: msg };
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({ target: target, message: message, countryCode: "62" }),
    });
    const raw = await res.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = {}; }

    const reason = data.reason || data.message || data.detail || data.error || raw || "";

    if (!res.ok) {
      const msg = `HTTP ${res.status} dari gateway: ${String(reason).slice(0, 300)}`;
      logResult(ctx, target, false, msg);
      return { ok: false, message: msg, raw, data, status: res.status };
    }

    if (data && data.status === false) {
      const msg = String(reason).slice(0, 300) || "Gateway menolak permintaan tanpa keterangan.";
      logResult(ctx, target, false, msg);
      return { ok: false, message: msg, raw, data, status: res.status };
    }

    const msg = String(reason || "Berhasil dikirim").slice(0, 200);
    logResult(ctx, target, true, msg);
    return { ok: true, message: msg, raw, data, status: res.status };
  } catch (err) {
    const msg = "Gagal menghubungi WhatsApp Gateway: " + err.message;
    logResult(ctx, target, false, msg);
    return { ok: false, message: msg };
  }
}

async function sendPinjam({ phone, settings, nama, judul, batas_tanggal, nisn, kelas, context }) {
  const template = (settings && settings.whatsapp_template_pinjam) || DEFAULT_TEMPLATES.pinjam;
  const message = renderTemplate(template, { nama, judul, judul_buku: judul, batas_tanggal, tanggal_kembali: batas_tanggal, nisn, kelas });
  return send({ phone, message, settings, context: context || "pinjam" });
}

async function sendKembali({ phone, settings, nama, judul, tanggal_kembali, nisn, kelas, context }) {
  const template = (settings && settings.whatsapp_template_kembali) || DEFAULT_TEMPLATES.kembali;
  const message = renderTemplate(template, { nama, judul, judul_buku: judul, tanggal_kembali, nisn, kelas });
  return send({ phone, message, settings, context: context || "kembali" });
}

async function sendTerlambat({ phone, settings, nama, judul, hari_terlambat, denda, nisn, kelas, context }) {
  const template = (settings && settings.whatsapp_template_terlambat) || DEFAULT_TEMPLATES.terlambat;
  const message = renderTemplate(template, { nama, judul, judul_buku: judul, hari_terlambat, denda, nisn, kelas });
  return send({ phone, message, settings, context: context || "terlambat" });
}

async function sendTolak({ phone, settings, nama, judul, alasan, nisn, kelas, context }) {
  const template = (settings && settings.whatsapp_template_pinjam) || DEFAULT_TEMPLATES.tolak;
  const message = renderTemplate(template, { nama, judul, judul_buku: judul, alasan });
  return send({ phone, message, settings, context: context || "tolak" });
}

async function sendPengingat({ phone, settings, nama, judul, batas_tanggal, nisn, kelas, context }) {
  const template = (settings && settings.whatsapp_template_pinjam) || DEFAULT_TEMPLATES.pengingat;
  const message = renderTemplate(template, { nama, judul, judul_buku: judul, batas_tanggal });
  return send({ phone, message, settings, context: context || "pengingat" });
}

module.exports = {
  send,
  sendPinjam,
  sendKembali,
  sendTerlambat,
  sendTolak,
  sendPengingat,
  normalizePhone,
  renderTemplate,
  DEFAULT_TEMPLATES,
};
