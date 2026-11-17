/**
 * Controller Laporan Sirkulasi (Admin & Pustakawan)
 * - Riwayat transaksi dengan filter rentang tanggal.
 * - Export CSV.
 * - Tampilan print-friendly untuk keperluan dokumentasi RPL.
 */
const pool = require("../config/db");

async function index(req, res, next) {
  try {
    const from = req.query.from || "";
    const to = req.query.to || "";
    const params = [];
    let where = "WHERE 1=1";
    if (from) { where += " AND DATE(t.created_at) >= ?"; params.push(from); }
    if (to) { where += " AND DATE(t.created_at) <= ?"; params.push(to); }

    const [rows] = await pool.query(
      `SELECT t.id, t.status, t.borrow_date, t.due_date, t.return_date, t.fine_amount, t.fine_paid_status,
              b.title, b.format, b.stock_fisic, b.total_stock_fisic, u.full_name, u.nisn, u.class
       FROM transactions t
       JOIN books b ON b.id = t.book_id
       JOIN users u ON u.id = t.user_id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT 500`,
      params
    );

    const [sum] = await pool.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(t.fine_amount),0) AS fines FROM transactions t ${where}`,
      params
    );

    res.render("admin/laporan/index", { title: "Laporan Sirkulasi", rows, from, to, total: sum[0].total, fines: sum[0].fines });
  } catch (err) {
    next(err);
  }
}

async function exportCsv(req, res, next) {
  try {
    const from = req.query.from || "";
    const to = req.query.to || "";
    const params = [];
    let where = "WHERE 1=1";
    if (from) { where += " AND DATE(t.created_at) >= ?"; params.push(from); }
    if (to) { where += " AND DATE(t.created_at) <= ?"; params.push(to); }

    const [rows] = await pool.query(
      `SELECT t.id, t.status, t.borrow_date, t.due_date, t.return_date, t.fine_amount, t.fine_paid_status,
              b.title, b.format, b.stock_fisic, b.total_stock_fisic, u.full_name, u.nisn, u.class
       FROM transactions t
       JOIN books b ON b.id = t.book_id
       JOIN users u ON u.id = t.user_id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT 2000`,
      params
    );

    const header = ["id", "status", "borrow_date", "due_date", "return_date", "fine_amount", "fine_paid_status", "title", "format", "stock_fisic", "total_stock_fisic", "full_name", "nisn", "class"];
    const escape = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.id, r.status, r.borrow_date, r.due_date, r.return_date, r.fine_amount, r.fine_paid_status,
          r.title, r.format, r.stock_fisic, r.total_stock_fisic, r.full_name, r.nisn, r.class,
        ].map(escape).join(",")
      );
    }
    const csv = lines.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="laporan-sirkulasi.csv"');
    res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
}

async function print(req, res, next) {
  try {
    const from = req.query.from || "";
    const to = req.query.to || "";
    const params = [];
    let where = "WHERE 1=1";
    if (from) { where += " AND DATE(t.created_at) >= ?"; params.push(from); }
    if (to) { where += " AND DATE(t.created_at) <= ?"; params.push(to); }
    const [rows] = await pool.query(
      `SELECT t.id, t.status, t.borrow_date, t.due_date, t.return_date, t.fine_amount, t.fine_paid_status,
              b.title, b.format, b.stock_fisic, b.total_stock_fisic, u.full_name, u.nisn, u.class
       FROM transactions t
       JOIN books b ON b.id = t.book_id
       JOIN users u ON u.id = t.user_id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT 500`,
      params
    );
    res.render("admin/laporan/print", { title: "Laporan Sirkulasi", rows, from, to });
  } catch (err) {
    next(err);
  }
}

module.exports = { index, exportCsv, print };
