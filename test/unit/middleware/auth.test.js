const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { requireAuth, guestOnly, requireStaff, requireAdmin, isStaff } = require("../../../src/middleware/auth");
const { createReq, createRes } = require("../../helpers");

describe("isStaff", () => {
  test("hanya admin dan pustakawan yang dianggap staf", () => {
    assert.equal(isStaff({ role: "admin" }), true);
    assert.equal(isStaff({ role: "pustakawan" }), true);
    assert.equal(isStaff({ role: "siswa" }), false);
    assert.equal(isStaff(null), false);
  });
});

describe("requireAuth", () => {
  test("mengarahkan ke login bila belum masuk", () => {
    const req = createReq();
    const res = createRes();
    let nextCalled = false;
    requireAuth(req, res, () => {
      nextCalled = true;
    });
    assert.equal(res.redirected, "/login");
    assert.equal(req.session.flash.type, "error");
    assert.equal(nextCalled, false);
  });

  test("meneruskan request bila sudah login", () => {
    const req = createReq({ session: { user: { id: "u1" } } });
    const res = createRes();
    let nextCalled = false;
    requireAuth(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(res.redirected, null);
  });
});

describe("guestOnly", () => {
  test("mengarahkan pengguna login ke dashboard", () => {
    const req = createReq({ session: { user: { id: "u1" } } });
    const res = createRes();
    let nextCalled = false;
    guestOnly(req, res, () => {
      nextCalled = true;
    });
    assert.equal(res.redirected, "/dashboard");
    assert.equal(nextCalled, false);
  });

  test("meneruskan tamu", () => {
    const req = createReq();
    const res = createRes();
    let nextCalled = false;
    guestOnly(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });
});

describe("requireStaff", () => {
  test("mengarahkan ke login bila belum masuk", () => {
    const req = createReq();
    const res = createRes();
    requireStaff(req, res, () => {});
    assert.equal(res.redirected, "/login");
  });

  test("menolak siswa dengan 403", () => {
    const req = createReq({ session: { user: { role: "siswa" } } });
    const res = createRes();
    requireStaff(req, res, () => {});
    assert.equal(res.statusCode, 403);
    assert.equal(res.rendered.view, "errors/403");
  });

  test("meneruskan admin dan pustakawan", () => {
    for (const role of ["admin", "pustakawan"]) {
      const req = createReq({ session: { user: { role } } });
      const res = createRes();
      let nextCalled = false;
      requireStaff(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
    }
  });
});

describe("requireAdmin", () => {
  test("mengarahkan ke login bila belum masuk", () => {
    const req = createReq();
    const res = createRes();
    requireAdmin(req, res, () => {});
    assert.equal(res.redirected, "/login");
  });

  test("menolak pustakawan dan siswa", () => {
    for (const role of ["pustakawan", "siswa"]) {
      const req = createReq({ session: { user: { role } } });
      const res = createRes();
      requireAdmin(req, res, () => {});
      assert.equal(res.statusCode, 403);
    }
  });

  test("meneruskan admin", () => {
    const req = createReq({ session: { user: { role: "admin" } } });
    const res = createRes();
    let nextCalled = false;
    requireAdmin(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });
});
