const BaseAiProvider = require("../BaseAiProvider");
const { ProviderError } = require("../../../errors/AppError");
const {
  parseJsonSafely,
  extractApiError,
  requestJson,
  openSseStream,
  normalizeModelList,
} = require("../ProviderHttpClient");

class OpenAiCompatibleProvider extends BaseAiProvider {
  get chatEndpoint() {
    throw new Error("chatEndpoint harus diimplementasikan oleh subclass.");
  }

  get modelsEndpoint() {
    throw new Error("modelsEndpoint harus diimplementasikan oleh subclass.");
  }

  get defaultModel() {
    throw new Error("defaultModel harus diimplementasikan oleh subclass.");
  }

  buildMessages(systemPrompt, messages) {
    const normalized = (Array.isArray(messages) ? messages : []).map((message) => ({
      role: message && message.role === "assistant" ? "assistant" : "user",
      content: String((message && message.content) || ""),
    }));

    if (systemPrompt) normalized.unshift({ role: "system", content: String(systemPrompt) });
    return normalized;
  }

  async *generateStream(systemPrompt, messages, config = {}) {
    this.assertApiKey();

    const { events, cleanup } = await openSseStream({
      url: this.chatEndpoint,
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: {
        model: this.resolveModel(this.defaultModel),
        messages: this.buildMessages(systemPrompt, messages),
        temperature: config.temperature != null ? config.temperature : this.temperature,
        max_tokens: config.maxTokens || this.maxTokens,
        stream: true,
      },
      timeoutMs: config.timeoutMs || this.timeoutMs,
      signal: config.signal,
    });

    try {
      for await (const event of events) {
        if (event.data === "[DONE]") break;

        const payload = parseJsonSafely(event.data);
        if (payload.error) throw new ProviderError(extractApiError(payload));

        const choice = payload.choices && payload.choices[0];
        const token = choice && choice.delta ? choice.delta.content : "";
        if (token) yield token;
      }
    } finally {
      cleanup();
    }
  }

  async listModels() {
    this.assertApiKey();

    const result = await requestJson("GET", this.modelsEndpoint, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      timeoutMs: this.timeoutMs,
    });

    if (!result.ok) {
      throw new ProviderError(`HTTP ${result.status}: ${extractApiError(result.data)}`);
    }

    const list = Array.isArray(result.data.data) ? result.data.data : result.data.models;
    return normalizeModelList(list);
  }
}

module.exports = OpenAiCompatibleProvider;
