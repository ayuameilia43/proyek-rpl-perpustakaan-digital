const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const { stubModule, createPool, loadFresh, createReq, createRes } = require("../../helpers");

const pool = createPool();
stubModule("src/config/db", pool);
const controller = loadFresh("src/controllers/userController");

beforeEach(() => {
  pool.calls.length = 0;
  pool.handler = async () => [[]];
});

const validBody = {
  nisn: "33333333",
  full_name: "Citra",
  class: "XI AKL",
  whatsapp_number: "081298765432",
  email: "citra@example.com",
  role: "siswa",
  is_active: "1",
  password: "rahasia123",
};

function userRow(overrides = {}) {
  return {
    id: "u1",
    nisn: "11111111",
    full_name: "Andi",
    class: "X RPL",
    whatsapp_number: "081234567890",
    email: "andi@example.com",
    role: "siswa",
    is_active: 1,
    ...overrides,
  };
}

describe("index", () => {
  test("menampilkan daftar pengguna tanpa filter", async () => {
    pool.handler = async () => [[userRow()]];
    const req = createReq({ query: {} });
    const res = createRes();
    await controller.index(req, res, () => {});
    assert.equal(res.rendered.view, "admin/users/index");
    assert.deepEqual(res.rendered.data.query, { q: "", role: "" });
    assert.deepEqual(res.rendered.data.roles, ["siswa", "pustakawan", "admin"]);
    assert.match(pool.calls[0].sql, /WHERE 1=1/);
  });

  test("menerapkan filter pencarian dan role", async () => {
    const req = createReq({ query: { q: "andi", role: "pustakawan" } });
    const res = createRes();
    await controller.index(req, res, () => {});
    assert.match(pool.calls[0].sql, /full_name LIKE \?/);
    assert.match(pool.calls[0].sql, /role = \?/);
    assert.deepEqual(pool.calls[0].params, ["%andi%", "%andi%", "%andi%", "pustakawan"]);
  });

  test("mengabaikan role tidak valid", async () => {
    const req = createReq({ query: { role: "hacker" } });
    const res = createRes();
    await controller.index(req, res, () => {});
    assert.doesNotMatch(pool.calls[0].sql, /role = \?/);
  });

  test("meneruskan error database", async () => {
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

describe("createForm", () => {
  test("merender form pengguna baru", () => {
    const res = createRes();
    controller.createForm(createReq(), res);
    assert.equal(res.rendered.view, "admin/users/form");
    assert.deepEqual(res.rendered.data.form, { role: "siswa", is_active: "1" });
  });
});

describe("store", () => {
  test("menolak data tidak valid tanpa query", async () => {
    const res = createRes();
    await controller.store(createReq({ body: {} }), res, () => {});
    assert.equal(res.statusCode, 400);
    assert.ok(res.rendered.data.errors.length >= 4);
    assert.equal(pool.calls.length, 0);
  });

  test("menolak NISN atau email duplikat", async () => {
    pool.handler = async () => [[{ nisn: "33333333" }]];
    const res = createRes();
    await controller.store(createReq({ body: validBody }), res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.rendered.data.errors[0], /sudah terdaftar/);
  });

  test("menyimpan pengguna baru", async () => {
    let insertParams;
    let insertSql;
    pool.handler = async (sql, params) => {
      if (sql.includes("INSERT INTO users")) {
        insertSql = sql;
        insertParams = params;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    };
    const res = createRes();
    const req = createReq({ body: validBody });
    await controller.store(req, res, () => {});

    assert.equal(res.redirected, "/admin/users");
    assert.match(req.session.flash.message, /berhasil ditambahkan/);
    assert.match(insertSql, /max_books_allowed\)/);
    assert.equal(insertParams[7], "siswa");
    assert.equal(insertParams[8], 1);
    assert.equal(await bcrypt.compare("rahasia123", insertParams[6]), true);
  });

  test("meneruskan error database", async () => {
    pool.handler = async () => {
      throw new Error("insert failed");
    };
    let received;
    await controller.store(createReq({ body: validBody }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "insert failed");
  });
});

describe("editForm", () => {
  test("mengarahkan bila pengguna tidak ditemukan", async () => {
    const req = createReq({ params: { id: "x" } });
    const res = createRes();
    await controller.editForm(req, res, () => {});
    assert.equal(res.redirected, "/admin/users");
  });

  test("merender form edit dengan data pengguna", async () => {
    pool.handler = async () => [[userRow()]];
    const res = createRes();
    await controller.editForm(createReq({ params: { id: "u1" } }), res, () => {});
    assert.equal(res.rendered.view, "admin/users/form");
    assert.equal(res.rendered.data.isEdit, true);
    assert.equal(res.rendered.data.form.id, "u1");
  });
});

describe("update", () => {
  const updateBody = { ...validBody, password: "" };

  test("menolak validasi dan penonaktifan akun sendiri", async () => {
    const req = createReq({
      params: { id: "admin-1" },
      body: { ...updateBody, full_name: "", is_active: "0" },
      session: { user: { id: "admin-1" } },
    });
    const res = createRes();
    await controller.update(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.ok(res.rendered.data.errors.some((error) => /Nama lengkap/.test(error)));
    assert.ok(res.rendered.data.errors.some((error) => /menonaktifkan akun/.test(error)));
    assert.equal(pool.calls.length, 0);
  });

  test("menolak NISN/email milik pengguna lain", async () => {
    pool.handler = async () => [[{ nisn: "33333333" }]];
    const res = createRes();
    await controller.update(
      createReq({ params: { id: "u1" }, body: updateBody, session: { user: { id: "admin" } } }),
      res,
      () => {}
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.rendered.data.errors[0], /sudah dipakai pengguna lain/);
  });

  test("memperbarui data tanpa mengubah password", async () => {
    let updateParams;
    pool.handler = async (sql, params) => {
      if (sql.startsWith("UPDATE users SET nisn")) {
        updateParams = params;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    };
    const req = createReq({
      params: { id: "u1" },
      body: { ...updateBody, full_name: "Andi Baru" },
      session: { user: { id: "admin" } },
    });
    const res = createRes();
    await controller.update(req, res, () => {});

    assert.equal(res.redirected, "/admin/users");
    assert.match(req.session.flash.message, /berhasil diperbarui/);
    assert.equal(updateParams[1], "Andi Baru");
    assert.equal(updateParams[7], "u1");
    assert.equal(pool.calls.filter((call) => call.sql.includes("password_hash")).length, 0);
  });

  test("memperbarui password bila diisi", async () => {
    let passwordParams;
    pool.handler = async (sql, params) => {
      if (sql.includes("password_hash")) {
        passwordParams = params;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    };
    const req = createReq({
      params: { id: "u1" },
      body: { ...updateBody, password: "passwordbaru" },
      session: { user: { id: "admin" } },
    });
    const res = createRes();
    await controller.update(req, res, () => {});
    assert.equal(await bcrypt.compare("passwordbaru", passwordParams[0]), true);
    assert.deepEqual(passwordParams.slice(1), ["u1"]);
  });

  test("meneruskan error database", async () => {
    pool.handler = async () => {
      throw new Error("update failed");
    };
    let received;
    await controller.update(
      createReq({ params: { id: "u1" }, body: updateBody, session: { user: { id: "admin" } } }),
      createRes(),
      (error) => {
        received = error;
      }
    );
    assert.equal(received.message, "update failed");
  });
});

describe("toggleActive", () => {
  test("mencegah menonaktifkan akun sendiri", async () => {
    const req = createReq({ params: { id: "u1" }, session: { user: { id: "u1" } } });
    const res = createRes();
    await controller.toggleActive(req, res, () => {});
    assert.equal(res.redirected, "/admin/users");
    assert.match(req.session.flash.message, /tidak dapat menonaktifkan akun sendiri/);
    assert.equal(pool.calls.length, 0);
  });

  test("mengarahkan bila pengguna tidak ditemukan", async () => {
    pool.handler = async () => [[]];
    const req = createReq({ params: { id: "u1" }, session: { user: { id: "admin" } } });
    const res = createRes();
    await controller.toggleActive(req, res, () => {});
    assert.equal(res.redirected, "/admin/users");
  });

  test("mengubah status aktif menjadi nonaktif", async () => {
    let updateParams;
    pool.handler = async (sql, params) => {
      if (sql.startsWith("UPDATE users SET is_active")) {
        updateParams = params;
        return [{ affectedRows: 1 }];
      }
      return [[{ is_active: 1, full_name: "Andi" }]];
    };
    const req = createReq({ params: { id: "u2" }, session: { user: { id: "admin" } } });
    const res = createRes();
    await controller.toggleActive(req, res, () => {});
    assert.deepEqual(updateParams, [0, "u2"]);
    assert.match(req.session.flash.message, /kini nonaktif/);
  });

  test("mengubah status nonaktif menjadi aktif", async () => {
    let updateParams;
    pool.handler = async (sql, params) => {
      if (sql.startsWith("UPDATE users SET is_active")) {
        updateParams = params;
        return [{ affectedRows: 1 }];
      }
      return [[{ is_active: 0, full_name: "Andi" }]];
    };
    const req = createReq({ params: { id: "u2" }, session: { user: { id: "admin" } } });
    const res = createRes();
    await controller.toggleActive(req, res, () => {});
    assert.deepEqual(updateParams, [1, "u2"]);
    assert.match(req.session.flash.message, /kini aktif/);
  });

  test("meneruskan error database", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.toggleActive(
      createReq({ params: { id: "u2" }, session: { user: { id: "admin" } } }),
      createRes(),
      (error) => {
        received = error;
      }
    );
    assert.equal(received.message, "db down");
  });
});
