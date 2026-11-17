const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { stubModule, createPool, loadFresh, createReq, createRes } = require("../../helpers");

const pool = createPool();
const removed = [];
const uploadStub = {
  MAX_SIZE: { cover_image: 2 * 1024 * 1024, ebook_file: 10 * 1024 * 1024 },
  removeUpload: (path) => removed.push(path),
};

stubModule("src/config/db", pool);
stubModule("src/middleware/upload", uploadStub);
const controller = loadFresh("src/controllers/bookController");

const categories = [{ id: "c1", name: "Fisika" }];
const book = {
  id: "b1",
  title: "Fisika",
  author: "Ani",
  publisher: "Erlangga",
  year: 2020,
  ISBN: "123",
  category_id: "c1",
  format: "fisik",
  total_stock_fisic: 5,
  stock_fisic: 3,
  stock_ebook: 0,
  synopsis: "Buku",
  cover_image_url: "/uploads/covers/old.jpg",
  pdf_e_book_url: null,
};

const validBody = {
  title: "Fisika",
  author: "Ani",
  publisher: "Erlangga",
  year: "2020",
  ISBN: "123",
  category_id: "c1",
  format: "fisik",
  total_stock_fisic: "5",
  stock_fisic: "3",
  stock_ebook: "0",
  synopsis: "Buku",
};

beforeEach(() => {
  pool.calls.length = 0;
  removed.length = 0;
  pool.handler = async (sql) => {
    if (sql.includes("FROM categories")) return [categories];
    return [[]];
  };
});

function files(overrides = {}) {
  return {
    cover_image: [{ fieldname: "cover_image", filename: "cover-1.jpg", size: 1000 }],
    ebook_file: [{ fieldname: "ebook_file", filename: "ebook-1.pdf", size: 2000 }],
    ...overrides,
  };
}

describe("index", () => {
  test("menampilkan buku dengan filter pencarian, kategori, dan format", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("FROM categories")) return [categories];
      return [[book]];
    };
    const req = createReq({ query: { q: "fisika", category: "c1", format: "fisik" } });
    const res = createRes();
    await controller.index(req, res, () => {});
    assert.equal(res.rendered.view, "admin/books/index");
    assert.equal(res.rendered.data.query.q, "fisika");
    const bookQuery = pool.calls.find((call) => call.sql.includes("FROM books b"));
    assert.match(bookQuery.sql, /b.title LIKE \?/);
    assert.match(bookQuery.sql, /b.category_id = \?/);
    assert.match(bookQuery.sql, /b.format = \?/);
    assert.deepEqual(bookQuery.params, ["%fisika%", "%fisika%", "%fisika%", "c1", "fisik"]);
  });

  test("mengabaikan format tidak valid", async () => {
    const req = createReq({ query: { format: "audio" } });
    await controller.index(req, createRes(), () => {});
    const bookQuery = pool.calls.find((call) => call.sql.includes("FROM books b"));
    assert.doesNotMatch(bookQuery.sql, /b.format = \?/);
  });

  test("meneruskan error", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.index(createReq(), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("createForm dan editForm", () => {
  test("merender form tambah buku", async () => {
    const res = createRes();
    await controller.createForm(createReq(), res, () => {});
    assert.equal(res.rendered.view, "admin/books/form");
    assert.equal(res.rendered.data.isEdit, false);
    assert.equal(res.rendered.data.form.format, "fisik");
  });

  test("createForm meneruskan error", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.createForm(createReq(), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });

  test("editForm mengarahkan bila buku tidak ada", async () => {
    const res = createRes();
    await controller.editForm(createReq({ params: { id: "x" } }), res, () => {});
    assert.equal(res.redirected, "/admin/koleksi");
  });

  test("editForm merender data buku", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("FROM categories")) return [categories];
      return [[book]];
    };
    const res = createRes();
    await controller.editForm(createReq({ params: { id: "b1" } }), res, () => {});
    assert.equal(res.rendered.data.isEdit, true);
    assert.equal(res.rendered.data.form.id, "b1");
  });
});

describe("store", () => {
  test("menolak data wajib yang kosong", async () => {
    const res = createRes();
    await controller.store(createReq({ body: {} }), res, () => {});
    assert.equal(res.statusCode, 400);
    assert.ok(res.rendered.data.errors.some((error) => /Judul buku wajib/.test(error)));
    assert.ok(res.rendered.data.errors.some((error) => /Pengarang wajib/.test(error)));
    assert.ok(res.rendered.data.errors.some((error) => /ISBN wajib/.test(error)));
    assert.ok(res.rendered.data.errors.some((error) => /Kategori wajib/.test(error)));
    assert.ok(res.rendered.data.errors.some((error) => /Format buku tidak valid/.test(error)));
  });

  test("memvalidasi tahun dan stok", async () => {
    const res = createRes();
    await controller.store(
      createReq({
        body: {
          ...validBody,
          year: "1800",
          total_stock_fisic: "2",
          stock_fisic: "5",
          stock_ebook: "-1",
        },
      }),
      res,
      () => {}
    );
    const errors = res.rendered.data.errors;
    assert.ok(errors.some((error) => /Tahun terbit tidak valid/.test(error)));
    assert.ok(errors.some((error) => /Stok fisik tidak boleh melebihi/.test(error)));
    assert.ok(errors.some((error) => /Kuota e-book/.test(error)));
  });

  test("menolak e-book tanpa file PDF", async () => {
    const res = createRes();
    await controller.store(
      createReq({ body: { ...validBody, format: "e-book" } }),
      res,
      () => {}
    );
    assert.ok(res.rendered.data.errors.some((error) => /File PDF wajib diunggah/.test(error)));
  });

  test("menyertakan error upload dan ukuran file", async () => {
    const res = createRes();
    await controller.store(
      createReq({
        body: { ...validBody, format: "e-book" },
        uploadError: "Gagal upload",
        files: {
          cover_image: [{ fieldname: "cover_image", filename: "c.jpg", size: 3 * 1024 * 1024 }],
        },
      }),
      res,
      () => {}
    );
    const errors = res.rendered.data.errors;
    assert.ok(errors.includes("Gagal upload"));
    assert.ok(errors.includes("Ukuran cover maksimal 2 MB."));
    assert.ok(errors.some((error) => /File PDF wajib/.test(error)));
    assert.ok(removed.length > 0);
  });

  test("menolak kategori yang tidak ditemukan", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("FROM categories") && sql.includes("is_active")) return [categories];
      if (sql.includes("SELECT id FROM categories WHERE id")) return [[]];
      return [[]];
    };
    const res = createRes();
    await controller.store(createReq({ body: validBody }), res, () => {});
    assert.equal(res.statusCode, 400);
    assert.ok(res.rendered.data.errors.includes("Kategori tidak ditemukan."));
  });

  test("menolak ISBN duplikat", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("FROM categories")) return [categories];
      if (sql.includes("SELECT id FROM categories WHERE id")) return [[{ id: "c1" }]];
      if (sql.includes("SELECT ISBN FROM books")) return [[{ ISBN: "123" }]];
      return [[]];
    };
    const res = createRes();
    await controller.store(createReq({ body: validBody }), res, () => {});
    assert.equal(res.statusCode, 400);
    assert.ok(res.rendered.data.errors.includes("ISBN sudah terdaftar."));
  });

  test("menyimpan buku baru beserta file", async () => {
    let insertParams;
    pool.handler = async (sql, params) => {
      if (sql.includes("FROM categories")) return [categories];
      if (sql.includes("SELECT id FROM categories WHERE id")) return [[{ id: "c1" }]];
      if (sql.includes("SELECT ISBN FROM books")) return [[]];
      if (sql.includes("INSERT INTO books")) {
        insertParams = params;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    };
    const res = createRes();
    const req = createReq({
      body: { ...validBody, format: "keduanya" },
      files: files(),
    });
    await controller.store(req, res, () => {});

    assert.equal(res.redirected, "/admin/koleksi");
    assert.match(req.session.flash.message, /berhasil ditambahkan/);
    assert.equal(insertParams[1], "Fisika");
    assert.equal(insertParams[12], "/uploads/covers/cover-1.jpg");
    assert.equal(insertParams[13], "/uploads/ebooks/ebook-1.pdf");
    assert.equal(removed.length, 0);
  });

  test("meneruskan error database dan membersihkan file", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("FROM categories")) return [categories];
      if (sql.includes("SELECT id FROM categories WHERE id")) return [[{ id: "c1" }]];
      if (sql.includes("SELECT ISBN FROM books")) return [[]];
      throw new Error("insert failed");
    };
    let received;
    await controller.store(
      createReq({ body: validBody, files: files({ ebook_file: undefined }) }),
      createRes(),
      (error) => {
        received = error;
      }
    );
    assert.equal(received.message, "insert failed");
    assert.ok(removed.length > 0);
  });
});

describe("update", () => {
  test("mengarahkan bila buku tidak ditemukan", async () => {
    const res = createRes();
    await controller.update(createReq({ params: { id: "x" } }), res, () => {});
    assert.equal(res.redirected, "/admin/koleksi");
  });

  test("menolak data tidak valid", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("FROM categories")) return [categories];
      if (sql.includes("SELECT * FROM books")) return [[book]];
      return [[]];
    };
    const res = createRes();
    await controller.update(
      createReq({ params: { id: "b1" }, body: { ...validBody, title: "" } }),
      res,
      () => {}
    );
    assert.equal(res.statusCode, 400);
    assert.ok(res.rendered.data.errors.some((error) => /Judul buku wajib/.test(error)));
  });

  test("memperbarui tanpa mengganti file", async () => {
    let updateParams;
    pool.handler = async (sql, params) => {
      if (sql.includes("FROM categories")) return [categories];
      if (sql.includes("SELECT * FROM books")) return [[book]];
      if (sql.includes("SELECT ISBN FROM books")) return [[]];
      if (sql.startsWith("UPDATE books SET")) {
        updateParams = params;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    };
    const res = createRes();
    const req = createReq({ params: { id: "b1" }, body: validBody });
    await controller.update(req, res, () => {});

    assert.equal(res.redirected, "/admin/koleksi");
    assert.equal(updateParams[11], "/uploads/covers/old.jpg");
    assert.equal(updateParams[12], null);
    assert.equal(removed.length, 0);
  });

  test("mengganti file dan menghapus file lama", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("FROM categories")) return [categories];
      if (sql.includes("SELECT * FROM books")) return [[book]];
      if (sql.includes("SELECT ISBN FROM books")) return [[]];
      return [[]];
    };
    const res = createRes();
    await controller.update(
      createReq({ params: { id: "b1" }, body: validBody, files: files() }),
      res,
      () => {}
    );
    assert.deepEqual(removed, ["/uploads/covers/old.jpg"]);
  });

  test("menolak ISBN milik buku lain", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("FROM categories")) return [categories];
      if (sql.includes("SELECT * FROM books")) return [[book]];
      if (sql.includes("SELECT ISBN FROM books")) return [[{ ISBN: "123" }]];
      return [[]];
    };
    const res = createRes();
    await controller.update(createReq({ params: { id: "b1" }, body: validBody }), res, () => {});
    assert.equal(res.statusCode, 400);
    assert.ok(res.rendered.data.errors.includes("ISBN sudah dipakai buku lain."));
  });
});

describe("destroy", () => {
  test("mengarahkan bila buku tidak ditemukan", async () => {
    const res = createRes();
    await controller.destroy(createReq({ params: { id: "x" } }), res, () => {});
    assert.equal(res.redirected, "/admin/koleksi");
  });

  test("menolak menghapus buku yang memiliki transaksi", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("SELECT * FROM books")) return [[book]];
      if (sql.includes("COUNT(*) AS total")) return [[{ total: 2 }]];
      return [[]];
    };
    const req = createReq({ params: { id: "b1" } });
    const res = createRes();
    await controller.destroy(req, res, () => {});
    assert.equal(res.redirected, "/admin/koleksi");
    assert.match(req.session.flash.message, /tidak dapat dihapus/);
    assert.equal(pool.calls.some((call) => call.sql.startsWith("DELETE")), false);
  });

  test("menghapus buku dan file terkait", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("SELECT * FROM books")) return [[book]];
      if (sql.includes("COUNT(*) AS total")) return [[{ total: 0 }]];
      return [{ affectedRows: 1 }];
    };
    const req = createReq({ params: { id: "b1" } });
    const res = createRes();
    await controller.destroy(req, res, () => {});
    assert.equal(res.redirected, "/admin/koleksi");
    assert.match(req.session.flash.message, /berhasil dihapus/);
    assert.deepEqual(removed, ["/uploads/covers/old.jpg"]);
  });

  test("meneruskan error database", async () => {
    pool.handler = async () => {
      throw new Error("delete failed");
    };
    let received;
    await controller.destroy(createReq({ params: { id: "b1" } }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "delete failed");
  });
});
