const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { stubModule, createPool, loadFresh, createReq, createRes } = require("../../helpers");

const pool = createPool();
const state = {
  stats: { activeCount: 1, overdueCount: 0, limit: 3 },
  evaluation: { allowed: true, reasons: [] },
  statsCalls: 0,
};

stubModule("src/config/db", pool);
stubModule("src/services/borrowRules", {
  getUserBorrowStats: async () => {
    state.statsCalls += 1;
    return state.stats;
  },
  evaluateBook: () => state.evaluation,
});
const controller = loadFresh("src/controllers/catalogController");

const categories = [{ id: "c1", name: "Fisika" }];
const books = [
  { id: "b1", title: "Fisika", format: "fisik", stock_fisic: 2, is_active: 1 },
  { id: "b2", title: "Ebook", format: "e-book", stock_fisic: 0, is_active: 1 },
];

beforeEach(() => {
  pool.calls.length = 0;
  state.statsCalls = 0;
  state.evaluation = { allowed: true, reasons: [] };
  pool.handler = async (sql) => {
    if (sql.includes("FROM categories")) return [categories];
    if (sql.includes("SELECT id FROM transactions")) return [[]];
    return [books];
  };
});

describe("index", () => {
  test("menghitung status pinjam untuk siswa", async () => {
    const req = createReq({ session: { user: { id: "u1", role: "siswa" } } });
    const res = createRes();
    await controller.index(req, res, () => {});
    assert.equal(res.rendered.view, "catalog/index");
    assert.equal(res.rendered.data.isStudent, true);
    assert.equal(res.rendered.data.books[0].borrow.allowed, true);
    assert.equal(state.statsCalls, 1);
  });

  test("menyembunyikan tombol pinjam untuk staf", async () => {
    const req = createReq({ session: { user: { id: "u1", role: "admin" } } });
    const res = createRes();
    await controller.index(req, res, () => {});
    assert.equal(res.rendered.data.isStudent, false);
    assert.equal(res.rendered.data.books[0].borrow.hidden, true);
    assert.equal(state.statsCalls, 0);
  });

  test("menerapkan filter pencarian, kategori, dan format", async () => {
    const req = createReq({
      query: { q: "fisika", category: "c1", format: "e-book" },
      session: { user: { id: "u1", role: "siswa" } },
    });
    await controller.index(req, createRes(), () => {});
    const query = pool.calls.find((call) => call.sql.includes("FROM books b"));
    assert.match(query.sql, /b.title LIKE \?/);
    assert.match(query.sql, /b.category_id = \?/);
    assert.match(query.sql, /b.format = \?/);
    assert.deepEqual(query.params, ["%fisika%", "%fisika%", "%fisika%", "c1", "e-book"]);
  });

  test("mengabaikan format tidak valid", async () => {
    const req = createReq({
      query: { format: "pdf" },
      session: { user: { id: "u1", role: "siswa" } },
    });
    await controller.index(req, createRes(), () => {});
    const query = pool.calls.find((call) => call.sql.includes("FROM books b"));
    assert.doesNotMatch(query.sql, /b.format = \?/);
  });

  test("meneruskan error", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.index(
      createReq({ session: { user: { id: "u1", role: "siswa" } } }),
      createRes(),
      (error) => {
        received = error;
      }
    );
    assert.equal(received.message, "db down");
  });
});

describe("show", () => {
  test("mengarahkan bila buku tidak ditemukan", async () => {
    pool.handler = async () => [[]];
    const req = createReq({ params: { id: "x" }, session: { user: { id: "u1", role: "siswa" } } });
    const res = createRes();
    await controller.show(req, res, () => {});
    assert.equal(res.redirected, "/katalog");
    assert.match(req.session.flash.message, /tidak ditemukan/);
  });

  test("menampilkan detail untuk siswa beserta status pengajuan", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("SELECT id FROM transactions")) return [[{ id: "t1" }]];
      return [[books[0]]];
    };
    const req = createReq({ params: { id: "b1" }, session: { user: { id: "u1", role: "siswa" } } });
    const res = createRes();
    await controller.show(req, res, () => {});
    assert.equal(res.rendered.view, "catalog/show");
    assert.equal(res.rendered.data.isStudent, true);
    assert.equal(res.rendered.data.alreadyPending, true);
    assert.equal(res.rendered.data.book.borrow.allowed, true);
  });

  test("menampilkan detail untuk staf tanpa data pinjam", async () => {
    pool.handler = async () => [[books[0]]];
    const req = createReq({ params: { id: "b1" }, session: { user: { id: "u1", role: "pustakawan" } } });
    const res = createRes();
    await controller.show(req, res, () => {});
    assert.equal(res.rendered.data.isStudent, false);
    assert.equal(res.rendered.data.alreadyPending, false);
    assert.equal(res.rendered.data.book.borrow.hidden, true);
  });

  test("meneruskan error", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.show(
      createReq({ params: { id: "b1" }, session: { user: { id: "u1", role: "siswa" } } }),
      createRes(),
      (error) => {
        received = error;
      }
    );
    assert.equal(received.message, "db down");
  });
});
