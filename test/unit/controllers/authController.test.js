const { test, describe, before, beforeEach, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const { stubModule, createPool, loadFresh, createReq, createRes } = require("../../helpers");

const pool = createPool();
stubModule("src/config/db", pool);
const controller = loadFresh("src/controllers/authController");

const originalError = console.error;
let passwordHash;

before(async () => {
  passwordHash = await bcrypt.hash("secret123", 4);
});

beforeEach(() => {
  pool.calls.length = 0;
  pool.handler = async () => [[]];
  console.error = () => {};
});

afterEach(() => {
  console.error = originalError;
});

after(() => {
  console.error = originalError;
});

function userRow(overrides = {}) {
  return {
    id: "u1",
    nisn: "11111111",
    full_name: "Andi Saputra",
    role: "siswa",
    class: "X RPL",
    email: "andi@example.com",
    whatsapp_number: "081234567890",
    password_hash: passwordHash,
    is_active: 1,
    ...overrides,
  };
}

describe("getLogin / getRegister", () => {
  test("merender halaman login", () => {
    const res = createRes();
    controller.getLogin(createReq(), res);
    assert.equal(res.rendered.view, "auth/login");
    assert.equal(res.rendered.data.title, "Masuk");
  });

  test("merender halaman registrasi dengan form kosong", () => {
    const res = createRes();
    controller.getRegister(createReq(), res);
    assert.equal(res.rendered.view, "auth/register");
    assert.deepEqual(res.rendered.data.errors, []);
    assert.deepEqual(res.rendered.data.form, {});
  });
});

describe("postLogin", () => {
  test("menolak identifier atau password kosong tanpa query", async () => {
    const req = createReq({ body: { identifier: " ", password: "" } });
    const res = createRes();
    await controller.postLogin(req, res);
    assert.equal(res.redirected, "/login");
    assert.match(req.session.flash.message, /wajib diisi/);
    assert.equal(pool.calls.length, 0);
  });

  test("menolak akun yang tidak ditemukan", async () => {
    pool.handler = async () => [[]];
    const req = createReq({ body: { identifier: "999", password: "x" } });
    const res = createRes();
    await controller.postLogin(req, res);
    assert.equal(res.redirected, "/login");
    assert.match(req.session.flash.message, /Akun tidak ditemukan/);
  });

  test("menolak akun nonaktif", async () => {
    pool.handler = async () => [[userRow({ is_active: 0 })]];
    const req = createReq({ body: { identifier: "11111111", password: "secret123" } });
    const res = createRes();
    await controller.postLogin(req, res);
    assert.equal(res.redirected, "/login");
    assert.match(req.session.flash.message, /dinonaktifkan/);
  });

  test("menolak password salah", async () => {
    pool.handler = async () => [[userRow()]];
    const req = createReq({ body: { identifier: "11111111", password: "salah" } });
    const res = createRes();
    await controller.postLogin(req, res);
    assert.equal(res.redirected, "/login");
    assert.match(req.session.flash.message, /Password salah/);
    assert.equal(req.session.user, undefined);
  });

  test("login berhasil dengan NISN mengisi session minimal", async () => {
    pool.handler = async () => [[userRow()]];
    const req = createReq({ body: { identifier: "11111111", password: "secret123" } });
    const res = createRes();
    await controller.postLogin(req, res);

    assert.equal(res.redirected, "/dashboard");
    assert.deepEqual(req.session.user, {
      id: "u1",
      nisn: "11111111",
      full_name: "Andi Saputra",
      role: "siswa",
      class: "X RPL",
      email: "andi@example.com",
      whatsapp_number: "081234567890",
    });
    assert.match(req.session.flash.message, /Selamat datang, Andi Saputra/);
    assert.deepEqual(pool.calls[0].params, ["11111111", "11111111"]);
  });

  test("menangani error database saat login", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    const req = createReq({ body: { identifier: "11111111", password: "secret123" } });
    const res = createRes();
    await controller.postLogin(req, res);
    assert.equal(res.redirected, "/login");
    assert.match(req.session.flash.message, /kesalahan pada server/);
  });
});

describe("postRegister", () => {
  const validBody = {
    nisn: "33333333",
    full_name: "Citra",
    class: "XI AKL",
    whatsapp_number: "081298765432",
    email: "citra@example.com",
    password: "rahasia123",
    confirm_password: "rahasia123",
  };

  test("menampilkan seluruh error validasi", async () => {
    const req = createReq({
      body: {
        nisn: "abc",
        full_name: "",
        class: "",
        whatsapp_number: "12",
        email: "bukan-email",
        password: "123",
        confirm_password: "456",
      },
    });
    const res = createRes();
    await controller.postRegister(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.rendered.view, "auth/register");
    const errors = res.rendered.data.errors;
    assert.ok(errors.some((error) => /NISN harus berupa angka/.test(error)));
    assert.ok(errors.some((error) => /Nama lengkap wajib/.test(error)));
    assert.ok(errors.some((error) => /Kelas wajib/.test(error)));
    assert.ok(errors.some((error) => /Nomor WhatsApp/.test(error)));
    assert.ok(errors.some((error) => /Format email/.test(error)));
    assert.ok(errors.some((error) => /Password minimal/.test(error)));
    assert.ok(errors.some((error) => /Konfirmasi password/.test(error)));
    assert.equal(pool.calls.length, 0);
  });

  test("menolak NISN atau email duplikat", async () => {
    pool.handler = async () => [[{ nisn: "33333333", email: "citra@example.com" }]];
    const req = createReq({ body: validBody });
    const res = createRes();
    await controller.postRegister(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.rendered.data.errors[0], /sudah terdaftar/);
  });

  test("menyimpan pengguna baru dengan password ter-hash", async () => {
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
    const req = createReq({ body: { ...validBody, email: "  CITRA@example.com " } });
    const res = createRes();
    await controller.postRegister(req, res);

    assert.equal(res.redirected, "/login");
    assert.match(req.session.flash.message, /Registrasi berhasil/);
    assert.match(insertParams[0], /^[0-9a-f-]{36}$/);
    assert.equal(insertParams[1], "33333333");
    assert.equal(insertParams[5], "citra@example.com");
    assert.match(insertSql, /'siswa'/);
    assert.equal(await bcrypt.compare("rahasia123", insertParams[6]), true);
  });

  test("menangani error database saat registrasi", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    const req = createReq({ body: validBody });
    const res = createRes();
    await controller.postRegister(req, res);
    assert.equal(res.statusCode, 500);
    assert.match(res.rendered.data.errors.at(-1), /kesalahan pada server/);
  });
});

describe("logout", () => {
  test("menghancurkan session, menghapus cookie, lalu redirect", () => {
    let destroyed = false;
    const req = createReq({
      session: {
        destroy(callback) {
          destroyed = true;
          callback();
        },
      },
    });
    const res = createRes();
    controller.logout(req, res);
    assert.equal(destroyed, true);
    assert.equal(res.clearedCookie, "connect.sid");
    assert.equal(res.redirected, "/login");
  });
});
