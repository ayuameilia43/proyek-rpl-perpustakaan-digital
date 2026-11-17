/**
 * Konfigurasi koneksi database MySQL (connection pool).
 * DATABASE_URL dibaca dari .env dengan format:
 *   mysql://USER:PASSWORD@HOST:PORT/NAMA_DATABASE
 */
const mysql = require("mysql2/promise");
require("dotenv").config();

function parseDbUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
  };
}

const pool = mysql.createPool(parseDbUrl(process.env.DATABASE_URL));

module.exports = pool;
