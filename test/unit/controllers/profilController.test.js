const { test, describe, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const { stubModule, createPool, loadFresh, createReq, createRes } = require("../../helpers");

const pool = createPool();
stubModule("src/config/db", pool);
const controller = loadFresh("src/controllers/profilController");

let passwordHash;
const profile = {
  id: "u1",
  nisn: "11111111",
  full_name: "Andi",
  class: "X RPL",
  email: "andi@example.com",
  whatsapp_number: "081234567890",
  role: "siswa",
};

before(async () => {
  passwordHash = await bcrypt.hash("passwordlama", 4);
});

beforeEach(() => {
  pool.calls.length = 0;
  pool.handler = async (sql) => {
    if (sql.includes("password_hash")) return [[{ ...profile, password_hash: passwordHash }]];
    if (sql.includes("SELECT id FROM users")) return [[]];
    if (sql.includes("SELECT id, nisn")) return [[profile]];
    return [{ affectedRows: 1 }];
  };
});

describe("normalizeWa dan isValidWa", () => {
  test("menormalkan berbagai format nomor", () => {
    assert.equal(controller.normalizeWa("628123456789"), "08123456789");
    assert.equal(controller.normalizeWa("+628123456789"), "08123456789");
    assert.equal(controller.normalizeWa("0812-3456.789"), "08123456789");
    assert.equal(controller.normalizeWa(" 0812 3456 789 "), "08123456789");
    assert.equal(controller.normalizeWa(""), "");
  });

  test("memvalidasi format nomor lokal", () => {
    assert.equal(controller.isValidWa("081234567890"), true);
    assert.equal(controller.isValidWa("0812345678"), true);
    assert.equal(controller.isValidWa("0812345"), false);
    assert.equal(controller.isValidWa("628123456789"), false);
    assert.equal(controller.isValidWa(""), false);
  });
});

describe("index", () => {
  test("mengarahkan bila profil tidak ditemukan", async () => {
    pool.handler = async () => [[]];
    const req = createReq({ session: { user: { id: "u1" } } });
    const res = createRes();
    await controller.index(req, res, () => {});
    assert.equal(res.redirected, "/dashboard");
  });

  test("merender tab profil", async () => {
    const res = createRes();
    await controller.index(createReq({ session: { user: { id: "u1" } } }), res, () => {});
    assert.equal(res.rendered.view, "profil/index");
    assert.equal(res.rendered.data.tab, "profil");
    assert.equal(res.rendered.data.roleLabel, "Siswa");
  });

  test("merender tab password", async () => {
    const res = createRes();
    await controller.index(
      createReq({ query: { tab: "password" }, session: { user: { id: "u1" } } }),
      res,
      () => {}
    );
    assert.equal(res.rendered.data.tab, "password");
  });

  test("meneruskan error", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.index(createReq({ session: { user: { id: "u1" } } }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("updateProfile", () => {
  test("mengarahkan bila profil tidak ditemukan", async () => {
    pool.handler = async () => [[]];
    const req = createReq({ session: { user: { id: "u1" } } });
    const res = createRes();
    await controller.updateProfile(req, res, () => {});
    assert.equal(res.redirected, "/dashboard");
  });

  test("menampilkan seluruh error validasi profil", async () => {
    const req = createReq({
      body: { full_name: "A", class: "", email: "salah", whatsapp_number: "123" },
      session: { user: { id: "u1" } },
    });
    const res = createRes();
    await controller.updateProfile(req, res, () => {});
    assert.equal(res.statusCode, 400);
    const errors = res.rendered.data.errors;
    assert.ok(errors.some((error) => /minimal 3 karakter/.test(error)));
    assert.ok(errors.some((error) => /Kelas wajib/.test(error)));
    assert.ok(errors.some((error) => /Format email/.test(error)));
    assert.ok(errors.some((error) => /Nomor WhatsApp tidak valid/.test(error)));
  });

  test("menolak email yang dipakai akun lain", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("SELECT id, nisn")) return [[profile]];
      if (sql.includes("SELECT id FROM users")) return [[{ id: "other" }]];
      return [[]];
    };
    const req = createReq({
      body: {
        full_name: "Andi Baru",
        class: "X RPL",
        email: "baru@example.com",
        whatsapp_number: "081234567890",
      },
      session: { user: { id: "u1" } },
    });
    const res = createRes();
    await controller.updateProfile(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.rendered.data.errors[0], /sudah digunakan/);
  });

  test("memperbarui profil dan session", async () => {
    let updateParams;
    pool.handler = async (sql, params) => {
      if (sql.includes("SELECT id, nisn")) return [[profile]];
      if (sql.includes("SELECT id FROM users")) return [[]];
      if (sql.startsWith("UPDATE users")) {
        updateParams = params;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    };
    const req = createReq({
      body: {
        full_name: "Andi Baru",
        class: "XI RPL",
        email: "BARU@example.com",
        whatsapp_number: "+62 812-3456-7890",
      },
      session: { user: { id: "u1" } },
    });
    const res = createRes();
    await controller.updateProfile(req, res, () => {});

    assert.equal(res.redirected, "/profil");
    assert.match(req.session.flash.message, /berhasil diperbarui/);
    assert.deepEqual(updateParams, ["Andi Baru", "XI RPL", "baru@example.com", "081234567890", "u1"]);
    assert.equal(req.session.user.full_name, "Andi Baru");
    assert.equal(req.session.user.class, "XI RPL");
    assert.equal(req.session.user.email, "baru@example.com");
  });

  test("meneruskan error database", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.updateProfile(
      createReq({ session: { user: { id: "u1" } }, body: {} }),
      createRes(),
      (error) => {
        received = error;
      }
    );
    assert.equal(received.message, "db down");
  });
});

describe("updatePassword", () => {
  test("mengarahkan bila profil tidak ditemukan", async () => {
    pool.handler = async () => [[]];
    const req = createReq({ session: { user: { id: "u1" } } });
    const res = createRes();
    await controller.updatePassword(req, res, () => {});
    assert.equal(res.redirected, "/dashboard");
  });

  test("memvalidasi field password", async () => {
    const req = createReq({
      body: { old_password: "", new_password: "123", confirm_password: "456" },
      session: { user: { id: "u1" } },
    });
    const res = createRes();
    await controller.updatePassword(req, res, () => {});
    assert.equal(res.statusCode, 400);
    const errors = res.rendered.data.errors;
    assert.ok(errors.some((error) => /Password lama wajib/.test(error)));
    assert.ok(errors.some((error) => /minimal 6 karakter/.test(error)));
    assert.ok(errors.some((error) => /tidak cocok/.test(error)));
  });

  test("menolak password lama yang salah", async () => {
    const req = createReq({
      body: { old_password: "salah", new_password: "passwordbaru", confirm_password: "passwordbaru" },
      session: { user: { id: "u1" } },
    });
    const res = createRes();
    await controller.updatePassword(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.ok(res.rendered.data.errors.includes("Password lama tidak sesuai."));
  });

  test("menyimpan hash password baru", async () => {
    let passwordParams;
    pool.handler = async (sql, params) => {
      if (sql.includes("UPDATE users SET password_hash")) {
        passwordParams = params;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("password_hash")) return [[{ ...profile, password_hash: passwordHash }]];
      return [[]];
    };
    const req = createReq({
      body: {
        old_password: "passwordlama",
        new_password: "passwordbaru",
        confirm_password: "passwordbaru",
      },
      session: { user: { id: "u1" } },
    });
    const res = createRes();
    await controller.updatePassword(req, res, () => {});

    assert.equal(res.redirected, "/profil?tab=password");
    assert.equal(await bcrypt.compare("passwordbaru", passwordParams[0]), true);
    assert.deepEqual(passwordParams.slice(1), ["u1"]);
  });

  test("meneruskan error database", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.updatePassword(createReq({ session: { user: { id: "u1" } } }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});
