/**
 * Entry point server - Perpustakaan Digital SMA NEGERI 1 MAJALENGKA
 * Merakit aplikasi dari factory lalu menjalankan HTTP listener.
 */
require("dotenv").config();
const { createApp } = require("./app");

const app = createApp();
const PORT = process.env.APP_PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n📚 Perpustakaan Digital SMA NEGERI 1 MAJALENGKA`);
  console.log(`🚀 Server berjalan di: ${process.env.APP_URL || "http://localhost:" + PORT}`);
  console.log(`🗄️  Database: MySQL (${(process.env.DATABASE_URL || "").split("@")[1] || "-"})\n`);
});
