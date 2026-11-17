const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const BaseAiProvider = require("../../../src/services/ai/BaseAiProvider");
const { ConfigurationError, ProviderError } = require("../../../src/errors/AppError");

class FakeProvider extends BaseAiProvider {
  constructor(config = {}, tokens = []) {
    super(config);
    this.tokens = tokens;
    this.received = null;
  }

  get providerName() {
    return "fake";
  }

  async *generateStream(systemPrompt, messages, config) {
    this.received = { systemPrompt, messages, config };
    for (const token of this.tokens) yield token;
  }
}

describe("BaseAiProvider", () => {
  test("menyimpan konfigurasi dengan nilai default", () => {
    const provider = new FakeProvider();
    assert.equal(provider.apiKey, "");
    assert.equal(provider.model, "");
    assert.equal(provider.temperature, 0.7);
    assert.equal(provider.maxTokens, 1024);
    assert.equal(provider.timeoutMs, 60000);
  });

  test("menghormati konfigurasi yang diberikan", () => {
    const provider = new FakeProvider({
      apiKey: "k",
      model: "m",
      temperature: 0,
      maxTokens: 10,
      timeoutMs: 1000,
    });
    assert.equal(provider.apiKey, "k");
    assert.equal(provider.model, "m");
    assert.equal(provider.temperature, 0);
    assert.equal(provider.maxTokens, 10);
    assert.equal(provider.timeoutMs, 1000);
  });

  test("generate menggabungkan token stream", async () => {
    const provider = new FakeProvider({}, ["Ha", "lo", "!"]);
    assert.equal(await provider.generate("sys", [], { temperature: 0 }), "Halo!");
    assert.equal(provider.received.systemPrompt, "sys");
  });

  test("generate melempar ProviderError saat respons kosong", async () => {
    const provider = new FakeProvider({}, ["", "   "]);
    await assert.rejects(
      () => provider.generate("sys", []),
      (error) => error instanceof ProviderError && /kosong/.test(error.message)
    );
  });

  test("assertApiKey melempar ConfigurationError bila kosong", () => {
    const provider = new FakeProvider();
    assert.throws(
      () => provider.assertApiKey(),
      (error) => error instanceof ConfigurationError && error.statusCode === 503
    );
    provider.apiKey = "key";
    assert.doesNotThrow(() => provider.assertApiKey());
  });

  test("resolveModel memakai model konfigurasi atau fallback", () => {
    const provider = new FakeProvider();
    assert.equal(provider.resolveModel("fallback"), "fallback");
    provider.model = "custom";
    assert.equal(provider.resolveModel("fallback"), "custom");
  });

  test("testConnection mengirim prompt uji", async () => {
    const provider = new FakeProvider({}, ["PONG"]);
    assert.equal(await provider.testConnection(), "PONG");
    assert.match(provider.received.systemPrompt, /connectivity test/);
    assert.deepEqual(provider.received.messages, [{ role: "user", content: "ping" }]);
  });
});
