const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { stubModule, createPool, loadFresh } = require("../../helpers");

const pool = createPool();
let settings = { max_books_per_student: 3 };

stubModule("src/config/db", pool);
stubModule("src/middleware/locals", {
  getSettings: async () => settings,
  loadLocals: (req, res, next) => next(),
  clearSettingsCache: () => {},
});

const { evaluateBook, getUserBorrowStats } = loadFresh("src/services/borrowRules");

describe("evaluateBook", () => {
  const stats = { activeCount: 0, overdueCount: 0, limit: 3 };

  test("mengizinkan peminjaman buku fisik yang tersedia", () => {
    const result = evaluateBook({ format: "fisik", stock_fisic: 2 }, stats);
    assert.deepEqual(result, { allowed: true, reasons: [] });
  });

  test("menolak e-book untuk peminjaman fisik", () => {
    const result = evaluateBook({ format: "e-book", stock_fisic: 5 }, stats);
    assert.equal(result.allowed, false);
    assert.match(result.reasons[0], /hanya tersedia sebagai e-book/);
  });

  test("menolak saat stok fisik habis", () => {
    const result = evaluateBook({ format: "fisik", stock_fisic: 0 }, stats);
    assert.equal(result.allowed, false);
    assert.match(result.reasons[0], /Stok fisik sedang habis/);
  });

  test("menolak saat siswa memiliki pinjaman terlambat", () => {
    const result = evaluateBook(
      { format: "fisik", stock_fisic: 1 },
      { activeCount: 1, overdueCount: 1, limit: 3 }
    );
    assert.equal(result.allowed, false);
    assert.match(result.reasons[0], /terlambat/);
  });

  test("menolak saat kuota peminjaman tercapai", () => {
    const result = evaluateBook(
      { format: "fisik", stock_fisic: 1 },
      { activeCount: 3, overdueCount: 0, limit: 3 }
    );
    assert.equal(result.allowed, false);
    assert.match(result.reasons[0], /Batas maksimal peminjaman \(3 buku\)/);
  });

  test("menggabungkan semua alasan penolakan", () => {
    const result = evaluateBook(
      { format: "e-book", stock_fisic: 0 },
      { activeCount: 3, overdueCount: 2, limit: 3 }
    );
    assert.equal(result.allowed, false);
    assert.equal(result.reasons.length, 3);
  });

  test("stok bertipe string dikonversi ke angka", () => {
    const result = evaluateBook({ format: "fisik", stock_fisic: "0" }, stats);
    assert.equal(result.allowed, false);
  });
});

describe("getUserBorrowStats", () => {
  beforeEach(() => {
    pool.calls.length = 0;
    settings = { max_books_per_student: 5 };
    pool.handler = async (sql) => {
      if (sql.includes("status = 'terlambat'")) return [[{ c: 2 }]];
      return [[{ c: 4 }]];
    };
  });

  test("menghitung pinjaman aktif, terlambat, dan limit dari settings", async () => {
    const result = await getUserBorrowStats("user-1");
    assert.deepEqual(result, { activeCount: 4, overdueCount: 2, limit: 5 });
    assert.equal(pool.calls.length, 2);
    assert.deepEqual(pool.calls[0].params, ["user-1"]);
  });

  test("memakai limit default 3 saat settings tidak tersedia", async () => {
    settings = null;
    const result = await getUserBorrowStats("user-1");
    assert.equal(result.limit, 3);
  });
});
