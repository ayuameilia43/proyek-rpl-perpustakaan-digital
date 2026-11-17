const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { errorHandler } = require("../../../src/middleware/errorHandler");
const { ValidationError, AppError } = require("../../../src/errors/AppError");
const { createReq, createRes } = require("../../helpers");

const originalError = console.error;
beforeEach(() => {
  console.error = () => {};
});
afterEach(() => {
  console.error = originalError;
});

describe("errorHandler", () => {
  test("meneruskan ke Express bila header sudah terkirim", () => {
    const req = createReq();
    const res = createRes({ headersSent: true });
    let forwarded;
    errorHandler(new Error("x"), req, res, (error) => {
      forwarded = error;
    });
    assert.equal(forwarded.message, "x");
  });

  test("mengembalikan JSON untuk rute /api/", () => {
    const req = createReq({ path: "/api/ai/chat" });
    const res = createRes();
    errorHandler(new ValidationError("Input salah"), req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.jsonPayload, {
      ok: false,
      error: "Input salah",
      code: "VALIDATION_ERROR",
    });
  });

  test("mengembalikan JSON untuk request XHR", () => {
    const req = createReq({ path: "/ai/chat", xhr: true });
    const res = createRes();
    errorHandler(new ValidationError("Input salah"), req, res, () => {});
    assert.equal(res.jsonPayload.ok, false);
  });

  test("mengembalikan JSON untuk Accept application/json", () => {
    const req = createReq({ headers: { accept: "application/json" } });
    const res = createRes();
    errorHandler(new ValidationError("Input salah"), req, res, () => {});
    assert.equal(res.jsonPayload.error, "Input salah");
  });

  test("mengembalikan JSON untuk content-type application/json", () => {
    const req = createReq({
      is(type) {
        return type === "application/json";
      },
    });
    const res = createRes();
    errorHandler(new ValidationError("Input salah"), req, res, () => {});
    assert.equal(res.jsonPayload.code, "VALIDATION_ERROR");
  });

  test("menyembunyikan pesan error server pada respons JSON", () => {
    const req = createReq({ path: "/api/x" });
    const res = createRes();
    errorHandler(new Error("database password bocor"), req, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.equal(res.jsonPayload.error, "Terjadi kesalahan pada server.");
    assert.equal(res.jsonPayload.code, "INTERNAL_ERROR");
  });

  test("merender halaman 404 untuk error 404 non-JSON", () => {
    const req = createReq();
    const res = createRes();
    errorHandler(new AppError("Tidak ada", { statusCode: 404, code: "NOT_FOUND" }), req, res, () => {});
    assert.equal(res.statusCode, 404);
    assert.equal(res.rendered.view, "errors/404");
  });

  test("merender halaman 500 untuk error server non-JSON", () => {
    const req = createReq();
    const res = createRes();
    errorHandler(new Error("boom"), req, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.equal(res.rendered.view, "errors/500");
  });

  test("merender halaman 500 untuk error 400 non-JSON", () => {
    const req = createReq();
    const res = createRes();
    errorHandler(new ValidationError("Input salah"), req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.rendered.view, "errors/500");
  });

  test("statusCode tidak valid dianggap 500", () => {
    const req = createReq();
    const res = createRes();
    errorHandler({ statusCode: "abc", message: "x" }, req, res, () => {});
    assert.equal(res.statusCode, 500);
  });
});
