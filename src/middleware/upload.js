/**
 * Middleware upload file (multer) untuk cover buku & PDF e-book.
 * - Cover  : JPG / PNG / WebP, maks 2 MB
 * - E-Book  : PDF, maks 10 MB
 * File disimpan di public/uploads/covers & public/uploads/ebooks.
 */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
const COVERS_DIR = path.join(UPLOAD_DIR, "covers");
const EBOOKS_DIR = path.join(UPLOAD_DIR, "ebooks");

// Pastikan folder upload tersedia
for (const dir of [COVERS_DIR, EBOOKS_DIR]) fs.mkdirSync(dir, { recursive: true });

const ALLOWED = {
  cover_image: { mimes: ["image/jpeg", "image/png", "image/webp"], exts: [".jpg", ".jpeg", ".png", ".webp"], dir: COVERS_DIR, prefix: "cover" },
  ebook_file: { mimes: ["application/pdf"], exts: [".pdf"], dir: EBOOKS_DIR, prefix: "ebook" },
};

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const cfg = ALLOWED[file.fieldname];
    cb(null, cfg ? cfg.dir : UPLOAD_DIR);
  },
  filename(req, file, cb) {
    const cfg = ALLOWED[file.fieldname] || { prefix: "file", exts: [""] };
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = cfg.exts.includes(ext) ? ext : cfg.exts[0];
    cb(null, `${cfg.prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`);
  },
});

function fileFilter(req, file, cb) {
  const cfg = ALLOWED[file.fieldname];
  if (!cfg) {
    const err = new Error("Field upload tidak dikenal.");
    err.code = "INVALID_FIELD";
    return cb(err);
  }
  const ext = path.extname(file.originalname).toLowerCase();
  if (!cfg.mimes.includes(file.mimetype) || !cfg.exts.includes(ext)) {
    const err = new Error(
      file.fieldname === "cover_image"
        ? "Cover hanya menerima gambar JPG, PNG, atau WebP."
        : "E-book hanya menerima file PDF."
    );
    err.code = "INVALID_TYPE";
    return cb(err);
  }
  cb(null, true);
}

// Batas ukuran global 10 MB (cek ulang per tipe di controller: cover maks 2 MB)
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 2 },
});

const MAX_SIZE = { cover_image: 2 * 1024 * 1024, ebook_file: 10 * 1024 * 1024 };

/** Wrapper: menjalankan upload.fields dan meneruskan error sebagai req.uploadError */
function uploadBookFiles(req, res, next) {
  upload.fields([
    { name: "cover_image", maxCount: 1 },
    { name: "ebook_file", maxCount: 1 },
  ])(req, res, function (err) {
    if (err) {
      req.uploadError = err.code === "LIMIT_FILE_SIZE"
        ? "Ukuran file melebihi batas maksimal."
        : (err.message || "Gagal mengunggah file.");
    }
    next();
  });
}

/** Hapus file lama secara aman (hanya dalam folder upload) */
function removeUpload(relativePath) {
  if (!relativePath || !String(relativePath).startsWith("/uploads/")) return;
  const abs = path.normalize(path.join(PUBLIC_DIR, relativePath));
  if (!abs.startsWith(UPLOAD_DIR)) return; // cegah path traversal
  fs.unlink(abs, () => {});
}

module.exports = { uploadBookFiles, removeUpload, MAX_SIZE, COVERS_DIR, EBOOKS_DIR, UPLOAD_DIR, PUBLIC_DIR };
