const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  PROVIDERS,
  PROVIDER_LABELS,
  DEFAULT_MODELS,
  MODEL_SUGGESTIONS,
  normalizeProviderName,
  isSupportedProvider,
  getDefaultModel,
  getProviderLabel,
  getModelSuggestions,
} = require("../../../src/services/ai/ProviderCatalog");

describe("ProviderCatalog", () => {
  test("mendukung tiga provider", () => {
    assert.deepEqual(PROVIDERS, ["gemini", "grok", "nvidia"]);
  });

  test("setiap provider memiliki label, model default, dan saran model", () => {
    for (const provider of PROVIDERS) {
      assert.ok(PROVIDER_LABELS[provider]);
      assert.ok(DEFAULT_MODELS[provider]);
      assert.ok(MODEL_SUGGESTIONS[provider].length > 0);
    }
  });

  test("normalizeProviderName menangani kapital dan spasi", () => {
    assert.equal(normalizeProviderName("  GeMiNi "), "gemini");
    assert.equal(normalizeProviderName(""), "gemini");
    assert.equal(normalizeProviderName(null), "gemini");
  });

  test("isSupportedProvider memvalidasi daftar provider", () => {
    assert.equal(isSupportedProvider("gemini"), true);
    assert.equal(isSupportedProvider("GROK"), true);
    assert.equal(isSupportedProvider("openai"), false);
  });

  test("getDefaultModel mengembalikan model sesuai provider", () => {
    assert.equal(getDefaultModel("grok"), "grok-2-latest");
    assert.equal(getDefaultModel("unknown"), "");
  });

  test("getProviderLabel mengembalikan label atau nama ternormalisasi", () => {
    assert.match(getProviderLabel("gemini"), /Google Gemini/);
    assert.equal(getProviderLabel("unknown"), "unknown");
  });

  test("getModelSuggestions mengembalikan daftar atau array kosong", () => {
    assert.ok(getModelSuggestions("NVIDIA").length > 0);
    assert.deepEqual(getModelSuggestions("unknown"), []);
  });
});
