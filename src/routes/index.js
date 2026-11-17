/**
 * Rute utama aplikasi.
 * Pengelompokan mengikuti sidebar: Utama, Fitur AI, Operasional Pustakawan, Administrasi Sistem.
 * Proteksi role: requireAuth (semua), requireStaff (Operasional), requireAdmin (Administrasi Sistem).
 */
const express = require("express");
const router = express.Router();
const { requireAuth, requireStaff, requireAdmin } = require("../middleware/auth");
const dashboard = require("../controllers/dashboardController");
const { placeholder } = require("../controllers/pageController");
const userController = require("../controllers/userController");
const settingsController = require("../controllers/settingsController");
const aiConfigController = require("../controllers/aiConfigController");
const bookController = require("../controllers/bookController");
const categoryController = require("../controllers/categoryController");
const { uploadBookFiles } = require("../middleware/upload");
const { verifyCsrf } = require("../middleware/csrf");
const catalog = require("../controllers/catalogController");
const ebook = require("../controllers/ebookController");
const peminjaman = require("../controllers/peminjamanController");
const sirkulasi = require("../controllers/sirkulasiController");
const riwayat = require("../controllers/riwayatController");
const laporan = require("../controllers/laporanController");
const aiController = require("../controllers/aiController");
const profilController = require("../controllers/profilController");

// Root: arahkan sesuai status login
router.get("/", (req, res) => res.redirect(req.session.user ? "/dashboard" : "/login"));

// Auth (login/register/logout)
router.use(require("./authRoutes"));

// ===== UTAMA (Siswa & Administrator) =====
router.get("/dashboard", requireAuth, dashboard.index);
router.get("/katalog", requireAuth, catalog.index);
router.get("/katalog/:id", requireAuth, catalog.show);
router.get("/ebook", requireAuth, ebook.index);
router.get("/ebook/:id", requireAuth, ebook.show);
router.post("/peminjaman", requireAuth, peminjaman.store);
router.get("/riwayat", requireAuth, riwayat.index);
router.get("/profil", requireAuth, profilController.index);
router.post("/profil", requireAuth, verifyCsrf, profilController.updateProfile);
router.post("/profil/password", requireAuth, verifyCsrf, profilController.updatePassword);

// ===== FITUR AI (Siswa & Administrator) =====
router.get("/rekomendasi", requireAuth, aiController.recommend);
router.post("/ai/chat", requireAuth, aiController.chat);
router.post("/api/ai/chat/stream", requireAuth, aiController.streamChat);

// ===== OPERASIONAL PUSTAKAWAN (Admin & Pustakawan) =====
router.get("/admin/peminjaman", requireStaff, sirkulasi.index);
router.post("/admin/peminjaman/approve", requireStaff, verifyCsrf, sirkulasi.approve);
router.post("/admin/peminjaman/reject", requireStaff, verifyCsrf, sirkulasi.reject);
router.post("/admin/peminjaman/return", requireStaff, verifyCsrf, sirkulasi.returnBook);
router.post("/admin/peminjaman/:id/verify-fine", requireStaff, verifyCsrf, sirkulasi.verifyFine);
router.post("/admin/peminjaman/remind", requireStaff, verifyCsrf, sirkulasi.remind);
router.get("/admin/koleksi", requireStaff, bookController.index);
router.get("/admin/koleksi/create", requireStaff, bookController.createForm);
router.post("/admin/koleksi", requireStaff, uploadBookFiles, verifyCsrf, bookController.store);
router.get("/admin/koleksi/:id/edit", requireStaff, bookController.editForm);
router.post("/admin/koleksi/:id", requireStaff, uploadBookFiles, verifyCsrf, bookController.update);
router.post("/admin/koleksi/:id/delete", requireStaff, bookController.destroy);
// Kategori
router.get("/admin/kategori", requireStaff, categoryController.index);
router.post("/admin/kategori", requireStaff, categoryController.store);
router.post("/admin/kategori/:id", requireStaff, categoryController.update);
router.post("/admin/kategori/:id/delete", requireStaff, categoryController.destroy);
router.get("/admin/laporan", requireStaff, laporan.index);
router.get("/admin/laporan/export/csv", requireStaff, laporan.exportCsv);
router.get("/admin/laporan/print", requireStaff, laporan.print);

// ===== ADMINISTRASI SISTEM (Khusus Admin) =====
// User Management
router.get("/admin/users", requireAdmin, userController.index);
router.get("/admin/users/create", requireAdmin, userController.createForm);
router.post("/admin/users", requireAdmin, userController.store);
router.get("/admin/users/:id/edit", requireAdmin, userController.editForm);
router.post("/admin/users/:id", requireAdmin, userController.update);
router.post("/admin/users/:id/toggle", requireAdmin, userController.toggleActive);
// System Settings
router.get("/admin/settings", requireAdmin, settingsController.index);
router.post("/admin/settings", requireAdmin, settingsController.update);
router.post("/admin/settings/test-wa", requireAdmin, settingsController.testWa);
// Konfigurasi AI
router.get("/admin/ai", requireAdmin, aiConfigController.index);
router.post("/admin/ai", requireAdmin, aiConfigController.update);
router.post("/admin/ai/test", requireAdmin, aiConfigController.test);
router.post("/admin/ai/models", requireAdmin, verifyCsrf, aiConfigController.models);

module.exports = router;
