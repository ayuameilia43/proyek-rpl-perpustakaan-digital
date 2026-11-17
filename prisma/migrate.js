/**
 * Migration Runner - Perpustakaan Digital SMA NEGERI 1 MAJALENGKA
 * Menjalankan file SQL migration ke MySQL tanpa perlu tool tambahan.
 * Jalankan: node prisma/migrate.js
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

function parseDbUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    charset: "utf8mb4",
    multipleStatements: true,
  };
}

async function main() {
  const cfg = parseDbUrl(process.env.DATABASE_URL);
  const migrationsDir = path.join(__dirname, "migrations");
  const sqlFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const conn = await mysql.createConnection(cfg);
  console.log(`⚙️  Menjalankan migration ke ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database} ...`);
  for (const file of sqlFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`   → ${file}`);
    await conn.query(sql);
  }
  await conn.end();
  console.log("✓ Migration selesai. Semua tabel siap digunakan.");
}

main().catch((e) => {
  console.error("❌ Migration gagal:", e.message);
  process.exit(1);
});
