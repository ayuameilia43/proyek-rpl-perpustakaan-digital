const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { stubModule, createPool, loadFresh, createReq, createRes } = require("../../helpers");
const realWhatsapp = require("../../../src/services/WhatsappService");

const pool = createPool();
const state = {
  settings: {
    id: "s1",
    school_name: "SMA Test",
    school_address: "Jl. Test",
    fine_per_day: 1000,
    max_borrow_duration: 7,
    max_books_per_student: 3,
    operating_hours_start: "07:00",
    operating_hours_end: "21:00",
    whatsapp_api_endpoint: "https://wa.test/send",
    whatsapp_api_token: "abcdef1234",
    whatsapp_template_pinjam: "Pinjam",
    whatsapp_template_kembali: "Kembali",
    whatsapp_template_terlambat: "Terlambat",
  },
  clearCalls: 0,
  waCalls: [],
  waResult: { ok: true, message: "sent" },
};

stubModule("src/config/db", pool);
stubModule("src/middleware/locals", {
  getSettings: async () => {
    if (state.getSettingsError) throw state.getSettingsError;
    return state.settings;
  },
  clearSettingsCache: () => {
    state.clearCalls += 1;
  },
});
stubModule("src/services/WhatsappService", {
  ...realWhatsapp,
  async send(payload) {
    state.waCalls.push(payload);
    return state.waResult;
  },
});
const controller = loadFresh("src/controllers/settingsController");

const validBody = {
  school_name: "SMA Test",
  school_address: "Jl. Test",
  fine_per_day: "1000",
  max_borrow_duration: "7",
  max_books_per_student: "3",
  operating_hours_start: "07:00",
  operating_hours_end: "21:00",
  whatsapp_api_endpoint: "https://wa.test/send",
  whatsapp_api_token: "",
  whatsapp_template_pinjam: "Pinjam",
  whatsapp_template_kembali: "Kembali",
  whatsapp_template_terlambat: "Terlambat",
};

beforeEach(() => {
  pool.calls.length = 0;
  state.clearCalls = 0;
  state.waCalls = [];
  state.waResult = { ok: true, message: "sent" };
  state.getSettingsError = null;
  pool.handler = async () => [{ affectedRows: 1 }];
});

describe("index", () => {
  test("merender settings dengan token disamarkan", async () => {
    const res = createRes();
    await controller.index(createReq(), res, () => {});
    assert.equal(res.rendered.view, "admin/settings/index");
    assert.equal(res.rendered.data.maskedToken, "••••••1234");
  });

  test("meneruskan error pembacaan settings", async () => {
    state.getSettingsError = new Error("db down");
    let received;
    await controller.index(createReq(), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("update", () => {
  test("menolak nilai yang tidak valid", async () => {
    const res = createRes();
    await controller.update(
      createReq({
        body: {
          ...validBody,
          school_name: "",
          fine_per_day: "-1",
          max_borrow_duration: "0",
          max_books_per_student: "0",
          operating_hours_start: "25:00",
          operating_hours_end: "abc",
        },
      }),
      res,
      () => {}
    );
    assert.equal(res.statusCode, 400);
    const errors = res.rendered.data.errors;
    assert.ok(errors.some((error) => /Nama sekolah wajib/.test(error)));
    assert.ok(errors.some((error) => /Denda per hari/.test(error)));
    assert.ok(errors.some((error) => /Durasi pinjam minimal/.test(error)));
    assert.ok(errors.some((error) => /Kuota buku minimal/.test(error)));
    assert.ok(errors.some((error) => /Jam buka tidak valid/.test(error)));
    assert.ok(errors.some((error) => /Jam tutup tidak valid/.test(error)));
    assert.equal(pool.calls.length, 0);
  });

  test("menyimpan settings dan mempertahankan token lama", async () => {
    let updateParams;
    pool.handler = async (sql, params) => {
      updateParams = params;
      return [{ affectedRows: 1 }];
    };
    const req = createReq({ body: validBody });
    const res = createRes();
    await controller.update(req, res, () => {});

    assert.equal(res.redirected, "/admin/settings");
    assert.match(req.session.flash.message, /berhasil disimpan/);
    assert.equal(updateParams[8], "abcdef1234");
    assert.equal(updateParams[2], 1000);
    assert.equal(updateParams[3], 7);
    assert.equal(updateParams[4], 3);
    assert.equal(state.clearCalls, 1);
  });

  test("menyimpan token WhatsApp baru", async () => {
    let updateParams;
    pool.handler = async (sql, params) => {
      updateParams = params;
      return [{ affectedRows: 1 }];
    };
    await controller.update(
      createReq({ body: { ...validBody, whatsapp_api_token: "token-baru" } }),
      createRes(),
      () => {}
    );
    assert.equal(updateParams[8], "token-baru");
  });

  test("meneruskan error database", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.update(createReq({ body: validBody }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("testWa", () => {
  test("mengirim pesan kustom ke nomor yang dinormalisasi", async () => {
    const req = createReq({
      body: { test_number: "0812-3456-7890", test_message: "Halo tes" },
    });
    const res = createRes();
    await controller.testWa(req, res, () => {});

    assert.equal(state.waCalls.length, 1);
    assert.equal(state.waCalls[0].phone, "0812-3456-7890");
    assert.equal(state.waCalls[0].message, "Halo tes");
    assert.match(req.session.flash.message, /berhasil dikirim ke 6281234567890/);
  });

  test("memakai pesan default bila pesan kustom kosong", async () => {
    const req = createReq({ body: { test_number: "0812" } });
    const res = createRes();
    await controller.testWa(req, res, () => {});
    assert.match(state.waCalls[0].message, /Buku Contoh/);
  });

  test("overrides token bila diisi", async () => {
    const req = createReq({
      body: { test_number: "0812", test_token: "override", test_message: "x" },
    });
    await controller.testWa(req, createRes(), () => {});
    assert.equal(state.waCalls[0].settings.whatsapp_api_token, "override");
  });

  test("menampilkan error saat pengiriman gagal", async () => {
    state.waResult = { ok: false, message: "token invalid" };
    const req = createReq({ body: { test_number: "0812", test_message: "x" } });
    const res = createRes();
    await controller.testWa(req, res, () => {});
    assert.match(req.session.flash.message, /Gagal mengirim pesan uji/);
    assert.match(req.session.flash.message, /token invalid/);
  });

  test("meneruskan error pembacaan settings", async () => {
    state.getSettingsError = new Error("db down");
    let received;
    await controller.testWa(createReq({ body: {} }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});
