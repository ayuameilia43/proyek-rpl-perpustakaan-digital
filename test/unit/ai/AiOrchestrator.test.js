const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const AiOrchestrator = require("../../../src/services/ai/AiOrchestrator");
const { ProviderError } = require("../../../src/errors/AppError");

function baseContext(overrides = {}) {
  return {
    aiConfig: {
      isChatbotActive: true,
      apiKey: "api-key",
      provider: "gemini",
      model: "gemini-test",
      temperature: 0.5,
      ...overrides.aiConfig,
    },
    books: overrides.books || [{ id: "b1", title: "Buku" }],
    settings: overrides.settings || { fine_per_day: 1000 },
    personal: overrides.personal || null,
    rules: overrides.rules || { maxBorrowDuration: 7, finePerDay: 1000 },
  };
}

function makeOrchestrator({
  context = baseContext(),
  intents = [],
  provider,
  providerRegistryCreate,
} = {}) {
  const calls = {
    build: [],
    detect: [],
    personalBuild: [],
    providerCreate: [],
    systemPrompt: [],
  };
  const registry = {
    create(providerName, config) {
      calls.providerCreate.push({ providerName, config });
      if (providerRegistryCreate) return providerRegistryCreate(providerName, config);
      return provider;
    },
  };
  const orchestrator = new AiOrchestrator({
    providerRegistry: registry,
    libraryContextBuilder: {
      async build(user) {
        calls.build.push(user);
        return context;
      },
    },
    systemPromptBuilder: {
      build(value) {
        calls.systemPrompt.push(value);
        return "SYSTEM PROMPT";
      },
      buildCatalogText(books) {
        return `CATALOG:${books.length}`;
      },
    },
    personalIntentDetector: {
      detect(text) {
        calls.detect.push(text);
        return intents;
      },
    },
    personalReplyBuilder: {
      build(input) {
        calls.personalBuild.push(input);
        return "PERSONAL REPLY";
      },
    },
    fallbackReply: "FALLBACK",
    inactiveReply: "INACTIVE",
  });
  orchestrator.delay = async () => {};
  return { orchestrator, calls };
}

async function collect(stream) {
  const result = [];
  for await (const event of stream) result.push(event);
  return result;
}

describe("AiOrchestrator.streamChat", () => {
  test("mengirim balasan nonaktif bila chatbot dimatikan", async () => {
    const { orchestrator } = makeOrchestrator({
      context: baseContext({ aiConfig: { isChatbotActive: false } }),
    });
    const events = await collect(orchestrator.streamChat({ user: null, messages: [] }));
    assert.deepEqual(events, [
      { type: "meta", data: { personal: false, fallback: true } },
      { type: "token", text: "INACTIVE" },
      { type: "done", data: { ok: false, fallback: true } },
    ]);
  });

  test("mengutamakan jawaban personal bila intent terdeteksi", async () => {
    const { orchestrator, calls } = makeOrchestrator({
      context: baseContext({ personal: { profile: { full_name: "Andi" } } }),
      intents: ["identity"],
    });
    const events = await collect(
      orchestrator.streamChat({ user: { id: "u1" }, messages: [{ role: "user", content: "Siapa saya?" }] })
    );
    assert.deepEqual(events, [
      { type: "meta", data: { personal: true, fallback: false } },
      { type: "token", text: "PERSONAL REPLY" },
      { type: "done", data: { ok: true, fallback: false, personal: true } },
    ]);
    assert.equal(calls.detect[0], "Siapa saya?");
    assert.equal(calls.personalBuild[0].intents[0], "identity");
  });

  test("mengabaikan intent personal bila data personal tidak tersedia", async () => {
    const provider = {
      async *generateStream() {
        yield "AI";
      },
    };
    const { orchestrator } = makeOrchestrator({ intents: ["identity"], provider });
    const events = await collect(
      orchestrator.streamChat({ user: null, messages: [{ role: "user", content: "Siapa saya?" }] })
    );
    assert.equal(events[0].type, "meta");
    assert.equal(events[0].data.provider, "gemini");
    assert.deepEqual(events[1], { type: "token", text: "AI" });
  });

  test("menggunakan fallback bila API key belum diisi", async () => {
    const { orchestrator } = makeOrchestrator({
      context: baseContext({ aiConfig: { apiKey: "" } }),
    });
    const events = await collect(orchestrator.streamChat({ user: null, messages: [] }));
    assert.deepEqual(events[0], { type: "meta", data: { personal: false, fallback: true } });
    assert.deepEqual(events[1], { type: "token", text: "FALLBACK" });
    assert.equal(events[2].data.fallback, true);
  });

  test("mengalirkan token dari provider", async () => {
    const provider = {
      async *generateStream(systemPrompt, messages) {
        assert.equal(systemPrompt, "SYSTEM PROMPT");
        yield "Ha";
        yield "lo";
      },
    };
    const { orchestrator, calls } = makeOrchestrator({ provider });
    const events = await collect(
      orchestrator.streamChat({ user: null, messages: [{ role: "user", content: "Halo" }] })
    );
    assert.deepEqual(events, [
      { type: "meta", data: { personal: false, fallback: false, provider: "gemini" } },
      { type: "token", text: "Ha" },
      { type: "token", text: "lo" },
      { type: "done", data: { ok: true, fallback: false } },
    ]);
    assert.deepEqual(calls.providerCreate[0], {
      providerName: "gemini",
      config: {
        apiKey: "api-key",
        model: "gemini-test",
        temperature: 0.5,
        maxTokens: 1024,
        timeoutMs: 60000,
      },
    });
  });

  test("fallback ketika provider tidak menghasilkan token", async () => {
    const provider = {
      async *generateStream() {},
    };
    const { orchestrator } = makeOrchestrator({ provider });
    const events = await collect(orchestrator.streamChat({ user: null, messages: [] }));
    assert.deepEqual(events.at(-2), { type: "token", text: "FALLBACK" });
    assert.equal(events.at(-1).data.fallback, true);
    assert.equal(events.at(-1).data.ok, false);
  });

  test("retry sekali untuk error transien sebelum token terkirim", async () => {
    let attempts = 0;
    const provider = {
      async *generateStream() {
        attempts += 1;
        if (attempts === 1) throw new Error("ETIMEDOUT");
        yield "OK";
      },
    };
    const { orchestrator } = makeOrchestrator({ provider });
    const events = await collect(orchestrator.streamChat({ user: null, messages: [] }));
    assert.equal(attempts, 2);
    assert.deepEqual(events[1], { type: "token", text: "OK" });
    assert.equal(events.at(-1).data.ok, true);
  });

  test("tidak retry untuk error permanen", async () => {
    let attempts = 0;
    const provider = {
      async *generateStream() {
        attempts += 1;
        throw new ProviderError("API key tidak valid");
      },
    };
    const { orchestrator } = makeOrchestrator({ provider });
    const events = await collect(orchestrator.streamChat({ user: null, messages: [] }));
    assert.equal(attempts, 1);
    assert.equal(events.at(-1).data.fallback, true);
    assert.match(events.at(-1).data.error, /API key tidak valid/);
  });

  test("menandai respons parsial bila error setelah token terkirim", async () => {
    const provider = {
      async *generateStream() {
        yield "Sebagian";
        throw new Error("socket hang up");
      },
    };
    const { orchestrator } = makeOrchestrator({ provider });
    const events = await collect(orchestrator.streamChat({ user: null, messages: [] }));
    assert.deepEqual(events.at(-2), {
      type: "error",
      message: "Layanan AI sedang tidak tersedia. Silakan coba lagi.",
      fallback: false,
    });
    assert.deepEqual(events.at(-1), {
      type: "done",
      data: {
        ok: false,
        fallback: false,
        partial: true,
        error: "Layanan AI sedang tidak tersedia. Silakan coba lagi.",
      },
    });
  });

  test("menyembunyikan pesan error internal", async () => {
    const provider = {
      async *generateStream() {
        throw new Error("database password bocor");
      },
    };
    const { orchestrator } = makeOrchestrator({ provider });
    const events = await collect(orchestrator.streamChat({ user: null, messages: [] }));
    assert.doesNotMatch(events.at(-1).data.error, /password/);
  });
});

describe("AiOrchestrator.recommend", () => {
  test("mengembalikan fallback bila API key kosong", async () => {
    const { orchestrator } = makeOrchestrator({
      context: baseContext({ aiConfig: { apiKey: "" } }),
    });
    const result = await orchestrator.recommend({ user: null });
    assert.equal(result.ok, false);
    assert.equal(result.reply, null);
    assert.equal(result.fallback, "FALLBACK");
    assert.deepEqual(result.books, [{ id: "b1", title: "Buku" }]);
    assert.equal(result.maxBorrowDuration, 7);
  });

  test("menghasilkan rekomendasi dari provider", async () => {
    let captured;
    const provider = {
      async generate(systemPrompt, messages, config) {
        captured = { systemPrompt, messages, config };
        return "Rekomendasi buku";
      },
    };
    const { orchestrator } = makeOrchestrator({
      context: baseContext({ personal: { profile: { full_name: "Andi", class: "X" } } }),
      provider,
    });
    const result = await orchestrator.recommend({ user: { id: "u1" } });
    assert.equal(result.ok, true);
    assert.equal(result.reply, "Rekomendasi buku");
    assert.equal(captured.systemPrompt, "SYSTEM PROMPT");
    assert.equal(captured.messages[0].role, "user");
    assert.match(captured.messages[0].content, /untuk Andi \(kelas X\)/);
    assert.match(captured.messages[0].content, /CATALOG:1/);
    assert.deepEqual(captured.config, { temperature: 0.5 });
  });

  test("mengembalikan error yang aman bila provider gagal", async () => {
    const provider = {
      async generate() {
        throw new Error("API down");
      },
    };
    const { orchestrator } = makeOrchestrator({ provider });
    const result = await orchestrator.recommend({ user: null });
    assert.equal(result.ok, false);
    assert.equal(result.error, "API down");
    assert.equal(result.fallback, "FALLBACK");
  });

  test("retry rekomendasi untuk error transien", async () => {
    let attempts = 0;
    const provider = {
      async generate() {
        attempts += 1;
        if (attempts === 1) throw new Error("fetch failed");
        return "OK";
      },
    };
    const { orchestrator } = makeOrchestrator({ provider });
    const result = await orchestrator.recommend({ user: null });
    assert.equal(attempts, 2);
    assert.equal(result.reply, "OK");
  });
});

describe("AiOrchestrator.listModels dan testConnection", () => {
  test("listModels mengembalikan daftar model", async () => {
    const { orchestrator } = makeOrchestrator({
      provider: { listModels: async () => [{ id: "m1" }] },
    });
    const result = await orchestrator.listModels({ provider: "gemini", apiKey: "k" });
    assert.deepEqual(result, { ok: true, models: [{ id: "m1" }] });
  });

  test("listModels menangani kegagalan", async () => {
    const { orchestrator } = makeOrchestrator({
      provider: {
        listModels: async () => {
          throw new Error("invalid key");
        },
      },
    });
    const result = await orchestrator.listModels({ provider: "gemini", apiKey: "k" });
    assert.deepEqual(result, { ok: false, models: [], error: "invalid key" });
  });

  test("testConnection sukses dan memakai model default", async () => {
    let config;
    const { orchestrator } = makeOrchestrator({
      providerRegistryCreate: (providerName, providerConfig) => {
        config = providerConfig;
        return { testConnection: async () => "PONG" };
      },
    });
    const result = await orchestrator.testConnection({ provider: "gemini", apiKey: "k" });
    assert.equal(result.ok, true);
    assert.match(result.message, /berhasil/);
    assert.match(result.message, /gemini-2.5-flash/);
    assert.equal(config.model, "gemini-2.5-flash");
  });

  test("testConnection gagal", async () => {
    const { orchestrator } = makeOrchestrator({
      provider: {
        testConnection: async () => {
          throw new Error("timeout");
        },
      },
    });
    const result = await orchestrator.testConnection({ provider: "grok", apiKey: "k", model: "m" });
    assert.equal(result.ok, false);
    assert.match(result.message, /Koneksi Grok \(xAI\) gagal: timeout/);
  });
});

describe("AiOrchestrator helpers", () => {
  const { orchestrator } = makeOrchestrator();

  test("lastUserMessage mengambil pesan user terakhir", () => {
    assert.equal(
      orchestrator.lastUserMessage([
        { role: "user", content: "satu" },
        { role: "assistant", content: "dua" },
        { role: "user", content: "tiga" },
      ]),
      "tiga"
    );
    assert.equal(orchestrator.lastUserMessage([{ role: "assistant", content: "x" }]), "");
    assert.equal(orchestrator.lastUserMessage([]), "");
  });

  test("isTransientError mendeteksi pola jaringan", () => {
    assert.equal(orchestrator.isTransientError(new Error("ECONNRESET")), true);
    assert.equal(orchestrator.isTransientError(new Error("ETIMEDOUT")), true);
    assert.equal(orchestrator.isTransientError(new Error("socket hang up")), true);
    assert.equal(orchestrator.isTransientError(new Error("timeout")), true);
    assert.equal(orchestrator.isTransientError(new Error("fetch failed")), true);
    assert.equal(orchestrator.isTransientError(new Error("network error")), true);
    assert.equal(orchestrator.isTransientError(new Error("invalid api key")), false);
    assert.equal(orchestrator.isTransientError(null), false);
  });

  test("toSafeMessage mempertahankan pesan ProviderError", () => {
    assert.equal(orchestrator.toSafeMessage(new ProviderError("pesan aman")), "pesan aman");
    assert.equal(
      orchestrator.toSafeMessage(new Error("internal")),
      "Layanan AI sedang tidak tersedia. Silakan coba lagi."
    );
  });

  test("fixedReply menghasilkan event meta, token, done", async () => {
    const events = await collect(orchestrator.fixedReply("TES", { fallback: false }));
    assert.deepEqual(events, [
      { type: "meta", data: { personal: false, fallback: false } },
      { type: "token", text: "TES" },
      { type: "done", data: { ok: true, fallback: false } },
    ]);
  });
});
