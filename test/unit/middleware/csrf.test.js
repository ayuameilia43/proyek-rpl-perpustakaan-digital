const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { csrfToken, verifyCsrf } = require("../../../src/middleware/csrf");
const { createReq, createRes } = require("../../helpers");

describe("csrfToken", () => {
  test("membuat token baru dan menyimpannya di session serta locals", () => {
    const req = createReq();
    const res = createRes();
    let nextCalled = false;
    csrfToken(req, res, () => {
      nextCalled = true;
    });
    assert.match(req.session.csrfToken, /^[a-f0-9]{48}$/);
    assert.equal(res.locals.csrfToken, req.session.csrfToken);
    assert.equal(nextCalled, true);
  });

  test("menggunakan kembali token yang sudah ada", () => {
    const req = createReq({ session: { csrfToken: "existing-token" } });
    const res = createRes();
    csrfToken(req, res, () => {});
    assert.equal(res.locals.csrfToken, "existing-token");
  });
});

describe("verifyCsrf", () => {
  test("melewati request non-POST", () => {
    const req = createReq({ method: "GET" });
    const res = createRes();
    let nextCalled = false;
    verifyCsrf(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });

  test("menerima POST dengan token yang cocok", () => {
    const req = createReq({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: { _csrf: "abc" },
      session: { csrfToken: "abc" },
    });
    const res = createRes();
    let nextCalled = false;
    verifyCsrf(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });

  test("menolak POST tanpa token", () => {
    const req = createReq({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: {},
      session: { csrfToken: "abc" },
    });
    const res = createRes();
    verifyCsrf(req, res, () => {});
    assert.equal(res.statusCode, 403);
    assert.match(res.sent, /CSRF token salah/);
  });

  test("menolak POST dengan token berbeda", () => {
    const req = createReq({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: { _csrf: "salah" },
      session: { csrfToken: "abc" },
    });
    const res = createRes();
    verifyCsrf(req, res, () => {});
    assert.equal(res.statusCode, 403);
  });

  test("menolak POST tanpa body", () => {
    const req = createReq({ method: "POST", headers: {}, body: undefined, session: {} });
    const res = createRes();
    verifyCsrf(req, res, () => {});
    assert.equal(res.statusCode, 403);
  });

  test("melewati multipart karena body belum diparse", () => {
    const req = createReq({
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=abc" },
    });
    const res = createRes();
    let nextCalled = false;
    verifyCsrf(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });
});
