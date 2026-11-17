/**
 * Middleware proteksi rute berbasis autentikasi & role.
 * - requireAuth  : wajib login
 * - guestOnly    : hanya untuk yang belum login (login/register)
 * - requireStaff : hanya admin & pustakawan (menu Operasional)
 * - requireAdmin : hanya admin (menu Administrasi Sistem)
 */

function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: "error", message: "Silakan login terlebih dahulu." };
    return res.redirect("/login");
  }
  next();
}

function guestOnly(req, res, next) {
  if (req.session.user) return res.redirect("/dashboard");
  next();
}

function isStaff(user) {
  return user && (user.role === "admin" || user.role === "pustakawan");
}

function requireStaff(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  if (!isStaff(req.session.user)) {
    return res.status(403).render("errors/403", { layout: "layouts/auth", title: "Akses Ditolak" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  if (req.session.user.role !== "admin") {
    return res.status(403).render("errors/403", { layout: "layouts/auth", title: "Akses Ditolak" });
  }
  next();
}

module.exports = { requireAuth, guestOnly, requireStaff, requireAdmin, isStaff };
