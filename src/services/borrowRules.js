/**
 * Aturan bisnis peminjaman buku fisik.
 * Dipakai oleh Katalog (status tombol) dan proses pengajuan pinjam.
 */
const pool = require("../config/db");
const { getSettings } = require("../middleware/locals");

/** Statistik peminjaman aktif seorang siswa */
async function getUserBorrowStats(userId) {
  const [[active]] = await pool.query(
    "SELECT COUNT(*) AS c FROM transactions WHERE user_id = ? AND status IN ('dipinjam','terlambat')",
    [userId]
  );
  const [[overdue]] = await pool.query(
    "SELECT COUNT(*) AS c FROM transactions WHERE user_id = ? AND status = 'terlambat'",
    [userId]
  );
  const settings = await getSettings();
  return {
    activeCount: Number(active.c),
    overdueCount: Number(overdue.c),
    limit: Number(settings ? settings.max_books_per_student : 3),
  };
}

/** Evaluasi kelayakan meminjam sebuah buku (fungsi murni, tanpa query) */
function evaluateBook(book, stats) {
  const reasons = [];

  if (book.format === "e-book") {
    reasons.push("Buku ini hanya tersedia sebagai e-book. Silakan buka lewat E-Book Reader.");
  } else if (Number(book.stock_fisic) <= 0) {
    reasons.push("Stok fisik sedang habis.");
  }

  if (stats.overdueCount > 0) {
    reasons.push("Anda memiliki peminjaman yang terlambat. Kembalikan dahulu sebelum meminjam.");
  }

  if (stats.activeCount >= stats.limit) {
    reasons.push(`Batas maksimal peminjaman (${stats.limit} buku) telah tercapai.`);
  }

  return { allowed: reasons.length === 0, reasons };
}

module.exports = { getUserBorrowStats, evaluateBook };
