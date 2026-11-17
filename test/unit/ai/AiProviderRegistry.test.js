const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const AiProviderRegistry = require("../../../src/services/ai/AiProviderRegistry");
const { ConfigurationError } = require("../../../src/errors/AppError");

class FakeProvider {
  constructor(config) {
    this.config = config;
  }
}

describe("AiProviderRegistry", () => {
  test("mendaftarkan provider bawaan dan menormalkan nama", () => {
    const registry = new AiProviderRegistry();
    assert.deepEqual(registry.list().sort(), ["gemini", "grok", "nvidia"]);
    assert.equal(registry.has("GEMINI"), true);
    assert.equal(registry.has("openai"), false);
  });

  test("register menambahkan provider baru dan mengembalikan registry", () => {
    const registry = new AiProviderRegistry({});
    const returned = registry.register(" Custom ", FakeProvider);
    assert.equal(returned, registry);
    assert.equal(registry.has("custom"), true);
  });

  test("create membuat instance provider dengan konfigurasi", () => {
    const registry = new AiProviderRegistry({ fake: FakeProvider });
    const instance = registry.create("FAKE", { apiKey: "abc" });
    assert.ok(instance instanceof FakeProvider);
    assert.deepEqual(instance.config, { apiKey: "abc" });
  });

  test("create melempar ConfigurationError untuk provider tak dikenal", () => {
    const registry = new AiProviderRegistry();
    assert.throws(
      () => registry.create("openai", {}),
      (error) =>
        error instanceof ConfigurationError &&
        error.statusCode === 503 &&
        /tidak dikenal/.test(error.message) &&
        /gemini/.test(error.message)
    );
  });
});
