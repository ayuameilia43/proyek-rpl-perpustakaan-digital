const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  AppError,
  ValidationError,
  ConfigurationError,
  ProviderError,
  NotFoundError,
} = require("../../../src/errors/AppError");

describe("AppError", () => {
  test("menggunakan nilai default", () => {
    const error = new AppError("Gagal");
    assert.equal(error.message, "Gagal");
    assert.equal(error.name, "AppError");
    assert.equal(error.statusCode, 500);
    assert.equal(error.code, "APP_ERROR");
    assert.equal(error.details, null);
    assert.equal(error.isOperational, true);
    assert.ok(error.stack);
  });

  test("menghormati opsi yang diberikan", () => {
    const cause = new Error("penyebab");
    const error = new AppError("Gagal", {
      statusCode: 418,
      code: "TEAPOT",
      details: { field: "x" },
      cause,
    });
    assert.equal(error.statusCode, 418);
    assert.equal(error.code, "TEAPOT");
    assert.deepEqual(error.details, { field: "x" });
    assert.equal(error.cause, cause);
  });

  test("nama subclass mengikuti kelas turunan", () => {
    assert.equal(new ValidationError().name, "ValidationError");
  });
});

describe("subclass AppError", () => {
  const cases = [
    [ValidationError, 400, "VALIDATION_ERROR"],
    [ConfigurationError, 503, "CONFIGURATION_ERROR"],
    [ProviderError, 502, "PROVIDER_ERROR"],
    [NotFoundError, 404, "NOT_FOUND"],
  ];

  for (const [ErrorClass, statusCode, code] of cases) {
    test(`${ErrorClass.name} memiliki status dan kode yang tepat`, () => {
      const error = new ErrorClass("pesan");
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, statusCode);
      assert.equal(error.code, code);
      assert.equal(error.message, "pesan");
    });
  }

  test("ProviderError menyimpan cause", () => {
    const cause = new Error("upstream");
    const error = new ProviderError("gagal", { x: 1 }, cause);
    assert.deepEqual(error.details, { x: 1 });
    assert.equal(error.cause, cause);
  });
});
