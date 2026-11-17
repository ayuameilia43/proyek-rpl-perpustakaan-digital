const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { stubModule, createPool, loadFresh, createReq, createRes } = require("../../helpers");

const pool = createPool();
const state = {
  settings: { max_borrow_duration: 7 },
  stats: { activeCount: 0, overdueCount: 0, limit: 3 },
  evaluation: { allowed: true, reasons: [] },
};

stubModule("src/config/db", pool);
stubModule("src/middleware/locals", { getSettings: async () => state.settings });
stubModule("src/services/borrowRules", {
  getUserBorrowStats: async () => state.stats,
  evaluateBook: () => state.evaluation,
});
const controller = loadFresh("src/controllers/peminjamanController");

const book = { id: "b1", title: "Fisika", format: "fisik", stock_fisic: 1, is_active: 1 };

beforeEach(() => {
  pool.calls.length = 0;
  state.settings = { max_borrow_duration: 7 };
  state.evaluation = { allowed: true, reasons: [] };
  pool.handler = async (sql) => {
    if (sql.includes("SELECT * FROM books")) return [[book]];
    if (sql.includes("SELECT id FROM transactions")) return [[]];
    return [[]];
  };
});

function reqFor(overrides = {}) {
  return createReq({
    body: { book_id: "b1" },
    session: { user: { id: "u1", role: "siswa" } },
    ...overrides,
  });
}

describe("peminjaman.store", () => {
  test("menolak pengguna selain siswa", async () => {
    const req = reqFor({ session: { user: { id: "u1", role: "admin" } } });
    const res = createRes();
    await controller.store(req, res, () => {});
    assert.equal(res.redirected, "/katalog");
    assert.match(req.session.flash.message, /Hanya akun siswa/);
    assert.equal(pool.calls.length, 0);
  });

  test("menolak book_id kosong", async () => {
    const req = reqFor({ body: {} });
    const res = createRes();
    await controller.store(req, res, () => {});
    assert.equal(res.redirected, "/katalog");
    assert.match(req.session.flash.message, /Buku tidak valid/);
  });

  test("menolak buku tidak ditemukan", async () => {
    pool.handler = async () => [[]];
    const req = reqFor();
    const res = createRes();
    await controller.store(req, res, () => {});
    assert.equal(res.redirected, "/katalog");
    assert.match(req.session.flash.message, /Buku tidak ditemukan/);
  });

  test("menolak pengajuan yang tidak lolos aturan bisnis", async () => {
    state.evaluation = {
      allowed: false,
      reasons: ["Stok fisik sedang habis.", "Batas maksimal peminjaman (3 buku) telah tercapai."],
    };
    const req = reqFor();
    const res = createRes();
    await controller.store(req, res, () => {});
    assert.equal(res.redirected, "/katalog/b1");
    assert.match(req.session.flash.message, /Stok fisik sedang habis/);
    assert.match(req.session.flash.message, /Batas maksimal/);
  });

  test("mencegah pengajuan duplikat yang masih menunggu", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("SELECT * FROM books")) return [[book]];
      if (sql.includes("SELECT id FROM transactions")) return [[{ id: "t1" }]];
      return [[]];
    };
    const req = reqFor();
    const res = createRes();
    await controller.store(req, res, () => {});
    assert.equal(res.redirected, "/katalog/b1");
    assert.match(req.session.flash.message, /sudah mengajukan buku ini/);
  });

  test("membuat transaksi menunggu persetujuan dengan durasi dari settings", async () => {
    let insertParams;
    pool.handler = async (sql, params) => {
      if (sql.includes("SELECT * FROM books")) return [[book]];
      if (sql.includes("SELECT id FROM transactions")) return [[]];
      if (sql.includes("INSERT INTO transactions")) {
        insertParams = params;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    };
    state.settings = { max_borrow_duration: 10 };
    const req = reqFor();
    const res = createRes();
    await controller.store(req, res, () => {});

    assert.equal(res.redirected, "/riwayat");
    assert.match(req.session.flash.message, /berhasil dikirim/);
    assert.match(insertParams[0], /^[0-9a-f-]{36}$/);
    assert.deepEqual(insertParams.slice(1, 3), ["u1", "b1"]);
    const borrow = new Date(insertParams[3]);
    const due = new Date(insertParams[4]);
    assert.equal(Math.round((due - borrow) / (1000 * 60 * 60 * 24)), 10);
    assert.match(pool.calls.at(-1).sql, /'menunggu_persetujuan'/);
  });

  test("meneruskan error database", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.store(reqFor(), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});
