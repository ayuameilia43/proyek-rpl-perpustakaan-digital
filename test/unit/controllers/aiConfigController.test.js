const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { stubModule, loadFresh, createReq, createRes } = require("../../helpers");

const state = {
  current: {
    id: "s1",
    ai_provider: "gemini",
    ai_model: "gemini-2.5-flash",
    ai_temperature: 0.7,
    ai_api_key: "secret-key-1234",
    is_chatbot_active: 1,
    ai_system_prompt: "Prompt",
  },
  updateCalls: [],
  testArgs: null,
  testResult: { ok: true, message: "Koneksi berhasil." },
  listArgs: null,
  listResult: { ok: true, models: [{ id: "m1" }] },
  error: null,
};

const settingsRepository = {
  async getSystemSettings() {
    if (state.error) throw state.error;
    return state.current;
  },
  async updateAiConfiguration(configuration) {
    state.updateCalls.push(configuration);
    return state.current;
  },
};
const aiOrchestrator = {
  async testConnection(args) {
    state.testArgs = args;
    return state.testResult;
  },
  async listModels(args) {
    state.listArgs = args;
    return state.listResult;
  },
};

stubModule("src/repositories/index", { settingsRepository });
stubModule("src/services/ai", { aiOrchestrator });
const controller = loadFresh("src/controllers/aiConfigController");

const validBody = {
  ai_provider: "gemini",
  ai_model: "gemini-2.5-flash",
  ai_temperature: "0.7",
  is_chatbot_active: "1",
  ai_system_prompt: "Prompt",
  ai_api_key: "new-key",
};

beforeEach(() => {
  state.updateCalls = [];
  state.testArgs = null;
  state.listArgs = null;
  state.testResult = { ok: true, message: "Koneksi berhasil." };
  state.listResult = { ok: true, models: [{ id: "m1" }] };
  state.error = null;
  state.current = {
    id: "s1",
    ai_provider: "gemini",
    ai_model: "gemini-2.5-flash",
    ai_temperature: 0.7,
    ai_api_key: "secret-key-1234",
    is_chatbot_active: 1,
    ai_system_prompt: "Prompt",
  };
});

describe("index", () => {
  test("merender konfigurasi AI dengan API key disamarkan", async () => {
    const res = createRes();
    await controller.index(createReq(), res, () => {});
    assert.equal(res.rendered.view, "admin/ai/index");
    assert.equal(res.rendered.data.maskedKey, "••••••1234");
    assert.deepEqual(res.rendered.data.providers, ["gemini", "grok", "nvidia"]);
  });

  test("meneruskan error", async () => {
    state.error = new Error("db down");
    let received;
    await controller.index(createReq(), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("update", () => {
  test("menolak provider, model, dan temperature tidak valid", async () => {
    const res = createRes();
    await controller.update(
      createReq({ body: { ...validBody, ai_provider: "openai", ai_model: "", ai_temperature: "3" } }),
      res,
      () => {}
    );
    assert.equal(res.statusCode, 400);
    const errors = res.rendered.data.errors;
    assert.ok(errors.some((error) => /Provider AI tidak valid/.test(error)));
    assert.ok(errors.some((error) => /Model AI wajib/.test(error)));
    assert.ok(errors.some((error) => /Temperature harus 0-2/.test(error)));
    assert.equal(state.updateCalls.length, 0);
  });

  test("menyimpan konfigurasi dengan API key baru", async () => {
    const req = createReq({ body: validBody });
    const res = createRes();
    await controller.update(req, res, () => {});
    assert.equal(res.redirected, "/admin/ai");
    assert.match(req.session.flash.message, /berhasil disimpan/);
    assert.deepEqual(state.updateCalls[0], {
      provider: "gemini",
      model: "gemini-2.5-flash",
      temperature: 0.7,
      apiKey: "new-key",
      isChatbotActive: 1,
      systemPrompt: "Prompt",
    });
  });

  test("mempertahankan API key lama bila field kosong", async () => {
    await controller.update(
      createReq({ body: { ...validBody, ai_api_key: "" } }),
      createRes(),
      () => {}
    );
    assert.equal(state.updateCalls[0].apiKey, "secret-key-1234");
  });

  test("meneruskan error", async () => {
    state.error = new Error("db down");
    let received;
    await controller.update(createReq({ body: validBody }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("test", () => {
  test("menampilkan flash sukses", async () => {
    const req = createReq({ body: { ai_provider: "grok", ai_model: "grok-2", ai_api_key: "k" } });
    const res = createRes();
    await controller.test(req, res, () => {});
    assert.equal(res.redirected, "/admin/ai");
    assert.equal(req.session.flash.type, "success");
    assert.deepEqual(state.testArgs, { provider: "grok", apiKey: "k", model: "grok-2" });
  });

  test("menampilkan flash error saat koneksi gagal", async () => {
    state.testResult = { ok: false, message: "gagal konek" };
    const req = createReq({ body: {} });
    const res = createRes();
    await controller.test(req, res, () => {});
    assert.equal(req.session.flash.type, "error");
    assert.equal(req.session.flash.message, "gagal konek");
    assert.equal(state.testArgs.provider, "gemini");
    assert.equal(state.testArgs.model, "gemini-2.5-flash");
    assert.equal(state.testArgs.apiKey, "secret-key-1234");
  });

  test("meneruskan error", async () => {
    state.error = new Error("db down");
    let received;
    await controller.test(createReq({ body: {} }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("models", () => {
  test("mengembalikan daftar model sebagai JSON", async () => {
    const req = createReq({ body: { provider: "nvidia", ai_api_key: "k" } });
    const res = createRes();
    await controller.models(req, res, () => {});
    assert.deepEqual(res.jsonPayload, {
      ok: true,
      provider: "nvidia",
      models: [{ id: "m1" }],
      error: undefined,
    });
    assert.deepEqual(state.listArgs, { provider: "nvidia", apiKey: "k" });
  });

  test("mengembalikan daftar kosong saat gagal", async () => {
    state.listResult = { ok: false, models: null, error: "invalid key" };
    const res = createRes();
    await controller.models(createReq({ body: {} }), res, () => {});
    assert.equal(res.jsonPayload.ok, false);
    assert.deepEqual(res.jsonPayload.models, []);
    assert.equal(res.jsonPayload.error, "invalid key");
  });

  test("meneruskan error", async () => {
    state.error = new Error("db down");
    let received;
    await controller.models(createReq({ body: {} }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});
