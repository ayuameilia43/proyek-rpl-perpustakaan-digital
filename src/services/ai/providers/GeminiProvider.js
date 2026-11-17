const BaseAiProvider = require("../BaseAiProvider");
const { ProviderError } = require("../../../errors/AppError");
const {
  parseJsonSafely,
  extractApiError,
  requestJson,
  openSseStream,
  normalizeModelList,
} = require("../ProviderHttpClient");

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

class GeminiProvider extends BaseAiProvider {
  get providerName() {
    return "gemini";
  }

  get defaultModel() {
    return "gemini-2.5-flash";
  }

  buildContents(messages) {
    return (Array.isArray(messages) ? messages : []).map((message) => ({
      role: message && message.role === "assistant" ? "model" : "user",
      parts: [{ text: String((message && message.content) || "") }],
    }));
  }

  async *generateStream(systemPrompt, messages, config = {}) {
    this.assertApiKey();

    const model = this.resolveModel(this.defaultModel);
    const url = `${BASE_URL}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;
    const payload = {
      contents: this.buildContents(messages),
      generationConfig: {
        temperature: config.temperature != null ? config.temperature : this.temperature,
        maxOutputTokens: config.maxTokens || this.maxTokens,
      },
    };

    if (systemPrompt) payload.systemInstruction = { parts: [{ text: String(systemPrompt) }] };

    const { events, cleanup } = await openSseStream({
      url,
      body: payload,
      timeoutMs: config.timeoutMs || this.timeoutMs,
      signal: config.signal,
    });

    try {
      for await (const event of events) {
        const data = parseJsonSafely(event.data);
        if (data.error) throw new ProviderError(extractApiError(data));

        const candidate = data.candidates && data.candidates[0];
        const parts = candidate && candidate.content ? candidate.content.parts || [] : [];
        for (const part of parts) {
          if (part.text) yield part.text;
        }
      }
    } finally {
      cleanup();
    }
  }

  async listModels() {
    this.assertApiKey();

    const collected = [];
    let pageToken = "";

    for (let page = 0; page < 10; page += 1) {
      const tokenQuery = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
      const url = `${BASE_URL}/models?key=${encodeURIComponent(this.apiKey)}${tokenQuery}`;
      const result = await requestJson("GET", url, { timeoutMs: this.timeoutMs });

      if (!result.ok) {
        throw new ProviderError(`HTTP ${result.status}: ${extractApiError(result.data)}`);
      }

      if (Array.isArray(result.data.models)) collected.push(...result.data.models);
      pageToken = result.data.nextPageToken || "";
      if (!pageToken) break;
    }

    return normalizeModelList(collected);
  }
}

module.exports = GeminiProvider;
