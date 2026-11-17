const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { stubModule, loadFresh, createReq, createRes } = require("../../helpers");

const settingsRepository = {
  settings: { school_name: "SMA Test" },
  invalidateCalls: 0,
  async getSystemSettings() {
    return settingsRepository.settings;
  },
  invalidateCache() {
    settingsRepository.invalidateCalls += 1;
  },
};

stubModule("src/repositories/index", { settingsRepository });
const { loadLocals, getSettings, clearSettingsCache } = loadFresh("src/middleware/locals");

beforeEach(() => {
  settingsRepository.settings = { school_name: "SMA Test" };
  settingsRepository.invalidateCalls = 0;
});

describe("loadLocals", () => {
  test("mengisi data user, path, role, flash, dan settings", async () => {
    const req = createReq({
      path: "/dashboard",
      session: {
        user: { id: "u1", role: "admin" },
        flash: { type: "success", message: "ok" },
      },
    });
    const res = createRes();
    let nextCalled = false;
    await loadLocals(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(res.locals.user, req.session.user);
    assert.equal(res.locals.currentPath, "/dashboard");
    assert.equal(res.locals.isStaff, true);
    assert.equal(res.locals.isAdmin, true);
    assert.deepEqual(res.locals.flash, { type: "success", message: "ok" });
    assert.equal(req.session.flash, undefined);
    assert.deepEqual(res.locals.settings, settingsRepository.settings);
    assert.equal(res.locals.schoolName, "SMA Test");
  });

  test("pengguna pustakawan bukan admin", async () => {
    const req = createReq({ session: { user: { role: "pustakawan" } } });
    const res = createRes();
    await loadLocals(req, res, () => {});
    assert.equal(res.locals.isStaff, true);
    assert.equal(res.locals.isAdmin, false);
  });

  test("tamu tanpa user", async () => {
    const req = createReq();
    const res = createRes();
    await loadLocals(req, res, () => {});
    assert.equal(res.locals.user, null);
    assert.equal(res.locals.isStaff, false);
    assert.equal(res.locals.isAdmin, false);
  });

  test("memakai nama sekolah default bila settings kosong", async () => {
    settingsRepository.settings = null;
    const req = createReq();
    const res = createRes();
    await loadLocals(req, res, () => {});
    assert.equal(res.locals.schoolName, "SMA NEGERI 1 MAJALENGKA");
  });

  test("meneruskan error ke next", async () => {
    const req = createReq();
    const res = createRes();
    const original = settingsRepository.getSystemSettings;
    settingsRepository.getSystemSettings = async () => {
      throw new Error("db down");
    };
    let received;
    await loadLocals(req, res, (error) => {
      received = error;
    });
    settingsRepository.getSystemSettings = original;
    assert.equal(received.message, "db down");
  });
});

describe("getSettings dan clearSettingsCache", () => {
  test("getSettings mengembalikan settings repository", async () => {
    assert.deepEqual(await getSettings(), { school_name: "SMA Test" });
  });

  test("clearSettingsCache memanggil invalidateCache", () => {
    clearSettingsCache();
    assert.equal(settingsRepository.invalidateCalls, 1);
  });
});
