const { ConfigurationError, ProviderError } = require("../../errors/AppError");

class BaseAiProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey || "";
    this.model = config.model || "";
    this.temperature = typeof config.temperature === "number" ? config.temperature : 0.7;
    this.maxTokens = config.maxTokens || 1024;
    this.timeoutMs = config.timeoutMs || 60000;
  }

  get providerName() {
    throw new Error("providerName harus diimplementasikan oleh subclass.");
  }

  async *generateStream() {
    throw new Error("generateStream harus diimplementasikan oleh subclass.");
  }

  async generate(systemPrompt, messages, config = {}) {
    let reply = "";

    for await (const token of this.generateStream(systemPrompt, messages, config)) {
      reply += token;
    }

    if (!reply.trim()) throw new ProviderError("Respons AI kosong.");
    return reply;
  }

  async listModels() {
    return [];
  }

  async testConnection() {
    const reply = await this.generate(
      "You are a connectivity test. Reply with the word: PONG.",
      [{ role: "user", content: "ping" }],
      { temperature: 0, maxTokens: 16 }
    );
    return reply.trim();
  }

  assertApiKey() {
    if (!this.apiKey) {
      throw new ConfigurationError("API Key belum diisi. Isi terlebih dahulu di Konfigurasi AI.");
    }
  }

  resolveModel(fallbackModel) {
    return this.model || fallbackModel;
  }
}

module.exports = BaseAiProvider;
