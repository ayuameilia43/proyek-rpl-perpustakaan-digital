/**
 * Proteksi CSRF sederhana berbasis session.
 * - csrfToken : membuat token unik per session & menyediakannya ke view (res.locals.csrfToken)
 * - verifyCsrf: memvalidasi token pada setiap request POST
 */
const crypto = require("crypto");

function csrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function verifyCsrf(req, res, next) {
  // Untuk form multipart (upload file), body baru tersedia setelah multer.
  // Rute upload akan memanggil verifyCsrf lagi setelah uploadBookFiles.
  if (req.method === "POST" && (req.headers["content-type"] || "").startsWith("multipart/")) {
    return next();
  }
  if (req.method === "POST") {
    const token = req.body && req.body._csrf;
    if (!token || token !== req.session.csrfToken) {
      return res.status(403).send("Sesi form tidak valid (CSRF token salah). Muat ulang halaman lalu coba lagi.");
    }
  }
  next();
}

module.exports = { csrfToken, verifyCsrf };
