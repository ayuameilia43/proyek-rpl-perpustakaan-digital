/**
 * Application factory - Perpustakaan Digital SMA NEGERI 1 MAJALENGKA
 * Memisahkan perakitan Express dari proses listen agar aplikasi dapat diuji
 * (unit/integration test) tanpa membuka port atau membutuhkan database nyata.
 */
require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const expressLayouts = require("express-ejs-layouts");
const helmet = require("helmet");

const { csrfToken, verifyCsrf } = require("./middleware/csrf");
const { loadLocals } = require("./middleware/locals");
const { errorHandler } = require("./middleware/errorHandler");
const mainRoutes = require("./routes/index");

function createApp() {
  const app = express();

  // ===== View engine (EJS + layout) =====
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(expressLayouts);
  app.set("layout", "layouts/main");

  // ===== Middleware keamanan & parser =====
  // CSP dimatikan agar Tailwind CDN & script inline bisa jalan (dev).
  // Untuk produksi, aktifkan CSP dengan daftar sumber yang diizinkan.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));

  // ===== Session (menyimpan status login & CSRF token) =====
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 8, // 8 jam
      },
    })
  );

  // ===== CSRF + data global untuk view =====
  app.use(csrfToken);
  app.use(verifyCsrf);
  app.use(loadLocals);

  // ===== Rute =====
  app.use("/", mainRoutes);

  // ===== 404 =====
  app.use((req, res) => {
    res.status(404).render("errors/404", { layout: "layouts/auth", title: "404 - Tidak Ditemukan" });
  });

  // ===== Error handler =====
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
