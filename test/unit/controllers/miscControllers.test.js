const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { stubModule, createPool, loadFresh, createReq, createRes } = require("../../helpers");

const pool = createPool();
stubModule("src/config/db", pool);
const categoryController = loadFresh("src/controllers/categoryController");
const dashboardController = loadFresh("src/controllers/dashboardController");
const ebookController = loadFresh("src/controllers/ebookController");
const riwayatController = loadFresh("src/controllers/riwayatController");
const { placeholder } = loadFresh("src/controllers/pageController");

const category = { id: "c1", name: "Fisika", description: "Ilmu", is_active: 1 };

beforeEach(() => {
  pool.calls.length = 0;
  pool.handler = async () => [[]];
});

describe("categoryController", () => {
  test("index menampilkan kategori dengan jumlah buku", async () => {
    pool.handler = async () => [[{ ...category, book_count: 2 }]];
    const res = createRes();
    await categoryController.index(createReq(), res, () => {});
    assert.equal(res.rendered.view, "admin/books/category");
    assert.equal(res.rendered.data.categories[0].book_count, 2);
  });

  test("index meneruskan error", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await categoryController.index(createReq(), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });

  test("store menolak nama kosong dan terlalu panjang", async () => {
    pool.handler = async () => [[]];
    const res = createRes();
    await categoryController.store(
      createReq({ body: { name: "x".repeat(51), is_active: "1" } }),
      res,
      () => {}
    );
    assert.equal(res.statusCode, 400);
    assert.ok(res.rendered.data.errors.some((error) => /maksimal 50/.test(error)));

    const res2 = createRes();
    await categoryController.store(createReq({ body: {} }), res2, () => {});
    assert.ok(res2.rendered.data.errors.some((error) => /wajib diisi/.test(error)));
  });

  test("store menolak nama duplikat", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("SELECT id FROM categories")) return [[{ id: "c1" }]];
      return [[]];
    };
    const res = createRes();
    await categoryController.store(
      createReq({ body: { name: "Fisika", is_active: "1" } }),
      res,
      () => {}
    );
    assert.equal(res.statusCode, 400);
    assert.ok(res.rendered.data.errors.includes("Nama kategori sudah ada."));
  });

  test("store menyimpan kategori baru", async () => {
    let insertParams;
    pool.handler = async (sql, params) => {
      if (sql.includes("INSERT INTO categories")) {
        insertParams = params;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    };
    const req = createReq({ body: { name: "Fisika", description: "Ilmu", is_active: "1" } });
    const res = createRes();
    await categoryController.store(req, res, () => {});
    assert.equal(res.redirected, "/admin/kategori");
    assert.match(req.session.flash.message, /berhasil ditambahkan/);
    assert.equal(insertParams[1], "Fisika");
    assert.equal(insertParams[3], 1);
  });

  test("update mengarahkan bila kategori tidak ditemukan", async () => {
    const res = createRes();
    await categoryController.update(
      createReq({ params: { id: "c1" }, body: { name: "Fisika" } }),
      res,
      () => {}
    );
    assert.equal(res.redirected, "/admin/kategori");
  });

  test("update menolak nama duplikat", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("SELECT * FROM categories")) return [[category]];
      if (sql.includes("SELECT id FROM categories")) return [[{ id: "c2" }]];
      return [[]];
    };
    const res = createRes();
    await categoryController.update(
      createReq({ params: { id: "c1" }, body: { name: "Kimia", is_active: "1" } }),
      res,
      () => {}
    );
    assert.equal(res.statusCode, 400);
    assert.ok(res.rendered.data.errors.includes("Nama kategori sudah dipakai."));
  });

  test("update menyimpan perubahan", async () => {
    let updateParams;
    pool.handler = async (sql, params) => {
      if (sql.includes("SELECT * FROM categories")) return [[category]];
      if (sql.includes("SELECT id FROM categories")) return [[]];
      if (sql.startsWith("UPDATE categories")) {
        updateParams = params;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    };
    const req = createReq({
      params: { id: "c1" },
      body: { name: "Fisika Baru", description: "Baru", is_active: "0" },
    });
    const res = createRes();
    await categoryController.update(req, res, () => {});
    assert.equal(res.redirected, "/admin/kategori");
    assert.deepEqual(updateParams, ["Fisika Baru", "Baru", 0, "c1"]);
  });

  test("destroy mengarahkan bila tidak ditemukan", async () => {
    const res = createRes();
    await categoryController.destroy(createReq({ params: { id: "c1" } }), res, () => {});
    assert.equal(res.redirected, "/admin/kategori");
  });

  test("destroy menolak kategori yang masih dipakai", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("SELECT * FROM categories")) return [[category]];
      if (sql.includes("COUNT(*) AS total")) return [[{ total: 3 }]];
      return [[]];
    };
    const req = createReq({ params: { id: "c1" } });
    const res = createRes();
    await categoryController.destroy(req, res, () => {});
    assert.match(req.session.flash.message, /tidak dapat dihapus/);
    assert.equal(pool.calls.some((call) => call.sql.startsWith("DELETE")), false);
  });

  test("destroy menghapus kategori yang tidak dipakai", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("SELECT * FROM categories")) return [[category]];
      if (sql.includes("COUNT(*) AS total")) return [[{ total: 0 }]];
      return [{ affectedRows: 1 }];
    };
    const req = createReq({ params: { id: "c1" } });
    const res = createRes();
    await categoryController.destroy(req, res, () => {});
    assert.ok(pool.calls.some((call) => call.sql.startsWith("DELETE")));
    assert.match(req.session.flash.message, /berhasil dihapus/);
  });
});

describe("dashboardController", () => {
  test("dashboard siswa memuat pinjaman aktif, pending, denda, dan buku terbaru", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("FROM transactions t JOIN books b")) {
        return [[{ id: "t1", due_date: "2026-01-10" }]];
      }
      if (sql.includes("COUNT(*) AS total")) return [[{ total: 2 }]];
      if (sql.includes("SUM(fine_amount)")) return [[{ total: 3000 }]];
      if (sql.includes("FROM books WHERE is_active")) return [[{ id: "b1" }]];
      return [[]];
    };
    const res = createRes();
    await dashboardController.index(
      createReq({ session: { user: { id: "u1", role: "siswa" } } }),
      res,
      () => {}
    );
    assert.equal(res.rendered.data.role, "siswa");
    assert.equal(res.rendered.data.pendingCount, 2);
    assert.equal(res.rendered.data.unpaidFine, 3000);
    assert.equal(typeof res.rendered.data.activeLoans[0].days_left, "number");
  });

  test("dashboard staf memuat statistik dan daftar pending", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("FROM transactions t JOIN users u")) return [[{ id: "t1" }]];
      return [[{ total_titles: 8, active_loans: 2, overdue: 1 }]];
    };
    const res = createRes();
    await dashboardController.index(
      createReq({ session: { user: { id: "u1", role: "admin" } } }),
      res,
      () => {}
    );
    assert.equal(res.rendered.data.role, "admin");
    assert.equal(res.rendered.data.stats.total_titles, 8);
    assert.equal(res.rendered.data.pendingList.length, 1);
  });

  test("meneruskan error", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await dashboardController.index(
      createReq({ session: { user: { id: "u1", role: "siswa" } } }),
      createRes(),
      (error) => {
        received = error;
      }
    );
    assert.equal(received.message, "db down");
  });
});

describe("ebookController", () => {
  test("index menampilkan daftar e-book", async () => {
    pool.handler = async () => [[{ id: "b1", title: "Ebook" }]];
    const res = createRes();
    await ebookController.index(createReq(), res, () => {});
    assert.equal(res.rendered.view, "ebook/index");
    assert.equal(res.rendered.data.books.length, 1);
  });

  test("show mengarahkan bila e-book tidak ditemukan", async () => {
    const res = createRes();
    await ebookController.show(createReq({ params: { id: "x" } }), res, () => {});
    assert.equal(res.redirected, "/katalog");
  });

  test("show mengarahkan bila PDF belum tersedia", async () => {
    pool.handler = async () => [[{ id: "b1", pdf_e_book_url: null }]];
    const res = createRes();
    await ebookController.show(createReq({ params: { id: "b1" } }), res, () => {});
    assert.equal(res.redirected, "/katalog");
  });

  test("show merender reader", async () => {
    pool.handler = async () => [[{ id: "b1", pdf_e_book_url: "/uploads/ebooks/a.pdf" }]];
    const res = createRes();
    await ebookController.show(createReq({ params: { id: "b1" } }), res, () => {});
    assert.equal(res.rendered.view, "ebook/reader");
  });

  test("meneruskan error", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await ebookController.index(createReq(), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("riwayatController", () => {
  test("menampilkan riwayat pengguna", async () => {
    pool.handler = async () => [[{ id: "t1", title: "Fisika" }]];
    const res = createRes();
    await riwayatController.index(
      createReq({ session: { user: { id: "u1" } } }),
      res,
      () => {}
    );
    assert.equal(res.rendered.view, "riwayat/index");
    assert.equal(res.rendered.data.transactions.length, 1);
    assert.deepEqual(pool.calls[0].params, ["u1"]);
  });

  test("meneruskan error", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await riwayatController.index(createReq({ session: { user: { id: "u1" } } }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("pageController.placeholder", () => {
  test("merender judul dan deskripsi", () => {
    const res = createRes();
    placeholder("Fitur Baru", "Deskripsi")(createReq(), res);
    assert.equal(res.rendered.data.title, "Fitur Baru");
    assert.equal(res.rendered.data.description, "Deskripsi");
  });

  test("memakai deskripsi default", () => {
    const res = createRes();
    placeholder("Fitur Baru")(createReq(), res);
    assert.match(res.rendered.data.description, /fase pengembangan/);
  });
});
