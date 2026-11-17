const { ConfigurationError, ProviderError } = require("../../errors/AppError");
const { getDefaultModel, getProviderLabel } = require("./ProviderCatalog");

const FALLBACK_REPLY =
  "Halo! Saya Pustakawan Virtual. Saat ini fitur AI sedang tidak tersedia, tetapi saya tetap bisa membantu menjawab pertanyaan tentang akun Anda (siapa Anda, buku yang sedang/sudah dipinjam, pengajuan, kuota, dan denda), mencari buku dari katalog, info jam operasional, serta aturan peminjaman.";
const INACTIVE_REPLY =
  "Fitur chatbot sedang dinonaktifkan oleh administrator. Silakan hubungi pustakawan untuk informasi lebih lanjut.";
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1200;

class AiOrchestrator {
  constructor(dependencies) {
    this.providerRegistry = dependencies.providerRegistry;
    this.libraryContextBuilder = dependencies.libraryContextBuilder;
    this.systemPromptBuilder = dependencies.systemPromptBuilder;
    this.personalIntentDetector = dependencies.personalIntentDetector;
    this.personalReplyBuilder = dependencies.personalReplyBuilder;
    this.fallbackReply = dependencies.fallbackReply || FALLBACK_REPLY;
    this.inactiveReply = dependencies.inactiveReply || INACTIVE_REPLY;
  }

  async *streamChat({ user, messages, signal }) {
    const context = await this.libraryContextBuilder.build(user);

    if (!context.aiConfig.isChatbotActive) {
      yield* this.fixedReply(this.inactiveReply, { fallback: true });
      return;
    }

    const intents = this.personalIntentDetector.detect(this.lastUserMessage(messages));
    if (intents.length && context.personal) {
      yield* this.personalReply(intents, context);
      return;
    }

    if (!context.aiConfig.apiKey) {
      yield* this.fixedReply(this.fallbackReply, { fallback: true });
      return;
    }

    yield* this.streamFromProvider(context, messages, signal);
  }

  async recommend({ user }) {
    const context = await this.libraryContextBuilder.build(user);
    const view = this.buildRecommendationView(context);

    if (!context.aiConfig.apiKey) {
      return { ...view, ok: false, reply: null, error: null, fallback: this.fallbackReply };
    }

    try {
      const reply = await this.generateRecommendation(context);
      return { ...view, ok: true, reply, error: null, fallback: null };
    } catch (error) {
      return { ...view, ok: false, reply: null, error: error.message, fallback: this.fallbackReply };
    }
  }

  async listModels({ provider, apiKey }) {
    try {
      const providerInstance = this.providerRegistry.create(provider, { apiKey });
      const models = await providerInstance.listModels();
      return { ok: true, models };
    } catch (error) {
      return { ok: false, models: [], error: error.message };
    }
  }

  async testConnection({ provider, apiKey, model }) {
    const label = getProviderLabel(provider);
    const resolvedModel = model || getDefaultModel(provider);

    try {
      const providerInstance = this.providerRegistry.create(provider, { apiKey, model: resolvedModel });
      await providerInstance.testConnection();
      return { ok: true, message: `Koneksi ${label} berhasil (model ${resolvedModel}).` };
    } catch (error) {
      return { ok: false, message: `Koneksi ${label} gagal: ${error.message}` };
    }
  }

  async *fixedReply(text, metadata) {
    yield this.meta(metadata);
    yield { type: "token", text };
    yield this.done({ ok: !metadata.fallback, fallback: Boolean(metadata.fallback) });
  }

  async *personalReply(intents, context) {
    const reply = this.personalReplyBuilder.build({
      intents,
      personal: context.personal,
      settings: context.settings,
    });

    yield this.meta({ personal: true });
    yield { type: "token", text: reply };
    yield this.done({ ok: true, fallback: false, personal: true });
  }

  async *streamFromProvider(context, messages, signal) {
    yield this.meta({ provider: context.aiConfig.provider });
    let receivedToken = false;

    try {
      const provider = this.providerRegistry.create(
        context.aiConfig.provider,
        this.buildProviderConfig(context.aiConfig)
      );
      const systemPrompt = this.systemPromptBuilder.build(context);

      for await (const token of this.streamProviderTokens(provider, systemPrompt, messages, signal)) {
        receivedToken = true;
        yield { type: "token", text: token };
      }

      if (!receivedToken) throw new ProviderError("Respons AI kosong.");
      yield this.done({ ok: true, fallback: false });
    } catch (error) {
      yield* this.failureEvents(error, receivedToken);
    }
  }

  async *streamProviderTokens(provider, systemPrompt, messages, signal) {
    let emittedToken = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        for await (const token of provider.generateStream(systemPrompt, messages, { signal })) {
          if (!token) continue;
          emittedToken = true;
          yield token;
        }
        return;
      } catch (error) {
        const canRetry =
          !emittedToken && attempt < MAX_ATTEMPTS && this.isTransientError(error) && !(signal && signal.aborted);
        if (!canRetry) throw error;
        await this.delay(RETRY_DELAY_MS);
      }
    }
  }

  async *failureEvents(error, receivedToken) {
    const message = this.toSafeMessage(error);

    if (receivedToken) {
      yield { type: "error", message, fallback: false };
      yield this.done({ ok: false, fallback: false, partial: true, error: message });
      return;
    }

    yield { type: "token", text: this.fallbackReply };
    yield this.done({ ok: false, fallback: true, error: message });
  }

  async generateRecommendation(context) {
    const provider = this.providerRegistry.create(
      context.aiConfig.provider,
      this.buildProviderConfig(context.aiConfig)
    );
    const systemPrompt = this.systemPromptBuilder.build(context);
    const messages = [{ role: "user", content: this.buildRecommendationPrompt(context) }];

    return this.generateWithRetry(provider, systemPrompt, messages, context.aiConfig.temperature);
  }

  async generateWithRetry(provider, systemPrompt, messages, temperature) {
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await provider.generate(systemPrompt, messages, { temperature });
      } catch (error) {
        lastError = error;
        if (attempt >= MAX_ATTEMPTS || !this.isTransientError(error)) break;
        await this.delay(RETRY_DELAY_MS);
      }
    }

    throw lastError;
  }

  buildRecommendationView(context) {
    return {
      books: context.books,
      settings: context.settings,
      maxBorrowDuration: context.rules.maxBorrowDuration,
      finePerDay: context.rules.finePerDay,
    };
  }

  buildRecommendationPrompt(context) {
    const profile = context.personal && context.personal.profile;
    const className = profile && profile.class ? ` (kelas ${profile.class})` : "";
    const forWhom = profile ? ` untuk ${profile.full_name}${className}` : " untuk siswa";

    return [
      `Berikan 5 rekomendasi buku${forWhom} berdasarkan katalog berikut.`,
      "Jangan menyarankan buku yang sedang dipinjam atau sudah pernah dipinjam pengguna tersebut.",
      this.systemPromptBuilder.buildCatalogText(context.books),
    ].join("\n");
  }

  buildProviderConfig(aiConfig) {
    return {
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      temperature: aiConfig.temperature,
      maxTokens: 1024,
      timeoutMs: 60000,
    };
  }

  lastUserMessage(messages) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index] && messages[index].role === "user") return String(messages[index].content || "");
    }
    return "";
  }

  isTransientError(error) {
    const message = [error && error.message, error && error.cause && error.cause.message].filter(Boolean).join(" ");
    return /ECONNRESET|ETIMEDOUT|socket hang up|timeout|fetch failed|network/i.test(message);
  }

  toSafeMessage(error) {
    if (error instanceof ProviderError || error instanceof ConfigurationError) return error.message;
    return "Layanan AI sedang tidak tersedia. Silakan coba lagi.";
  }

  delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  meta(data) {
    return { type: "meta", data: { personal: false, fallback: false, ...data } };
  }

  done(data) {
    return { type: "done", data };
  }
}

module.exports = AiOrchestrator;
