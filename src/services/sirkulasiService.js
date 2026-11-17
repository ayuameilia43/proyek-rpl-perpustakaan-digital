/**
 * Sirkulasi Service
 * - markOverdue(): menandai transaksi 'dipinjam' yang melewati due_date sebagai 'terlambat'.
 * - calculateFine(): denda = jumlah hari terlambat * nominal denda per hari (dari System Settings).
 */
async function markOverdue(pool) {
  const [res] = await pool.query(
    "UPDATE transactions SET status = 'terlambat' WHERE status = 'dipinjam' AND due_date < CURDATE()"
  );
  return Number(res && res.affectedRows ? res.affectedRows : 0);
}

function calculateFine(dueDate, returnDate, finePerDay) {
  if (!dueDate) return 0;
  if (!returnDate) return 0;
  const d = new Date(dueDate);
  const r = new Date(returnDate);
  d.setHours(0, 0, 0, 0);
  r.setHours(0, 0, 0, 0);
  const days = Math.floor((r - d) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 0;
  const parsed = Number(finePerDay);
  const perDay = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  return Math.round(days * perDay * 100) / 100;
}

module.exports = { markOverdue, calculateFine };
