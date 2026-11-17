const pool = require("../config/db");
const { ConfigurationError } = require("../errors/AppError");

const CACHE_DURATION_MS = 60 * 1000;

class SettingsRepository {
  constructor(poolInstance = pool, cacheDurationMs = CACHE_DURATION_MS) {
    this.pool = poolInstance;
    this.cacheDurationMs = cacheDurationMs;
    this.cache = { data: null, cachedAt: 0 };
  }

  async getSystemSettings({ forceRefresh = false } = {}) {
    const now = Date.now();
    const cacheIsValid = this.cache.data && now - this.cache.cachedAt < this.cacheDurationMs;
    if (!forceRefresh && cacheIsValid) return this.cache.data;

    const [rows] = await this.pool.query("SELECT * FROM system_settings LIMIT 1");
    this.cache.data = rows[0] || null;
    this.cache.cachedAt = now;
    return this.cache.data;
  }

  async getAiRuntimeConfig() {
    const settings = await this.getSystemSettings();
    return {
      provider: (settings && settings.ai_provider) || "gemini",
      model: (settings && settings.ai_model) || "",
      apiKey: (settings && settings.ai_api_key) || "",
      temperature: Number(settings && settings.ai_temperature != null ? settings.ai_temperature : 0.7),
      isChatbotActive: Boolean(Number(settings && settings.is_chatbot_active)),
    };
  }

  async updateAiConfiguration(configuration) {
    const current = await this.getSystemSettings({ forceRefresh: true });
    if (!current) throw new ConfigurationError("Pengaturan sistem tidak ditemukan.");

    await this.pool.query(
      `UPDATE system_settings
       SET ai_provider = ?, ai_model = ?, ai_temperature = ?, ai_api_key = ?, is_chatbot_active = ?, ai_system_prompt = ?
       WHERE id = ?`,
      [
        configuration.provider,
        configuration.model,
        configuration.temperature,
        configuration.apiKey,
        configuration.isChatbotActive,
        configuration.systemPrompt,
        current.id,
      ]
    );

    this.invalidateCache();
    return this.getSystemSettings({ forceRefresh: true });
  }

  invalidateCache() {
    this.cache = { data: null, cachedAt: 0 };
  }
}

module.exports = SettingsRepository;
