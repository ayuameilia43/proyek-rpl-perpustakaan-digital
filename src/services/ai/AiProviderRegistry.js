const { ConfigurationError } = require("../../errors/AppError");
const { normalizeProviderName } = require("./ProviderCatalog");
const GeminiProvider = require("./providers/GeminiProvider");
const GrokProvider = require("./providers/GrokProvider");
const NvidiaProvider = require("./providers/NvidiaProvider");

const DEFAULT_PROVIDERS = {
  gemini: GeminiProvider,
  grok: GrokProvider,
  nvidia: NvidiaProvider,
};

class AiProviderRegistry {
  constructor(providers = DEFAULT_PROVIDERS) {
    this.providers = new Map(Object.entries(providers));
  }

  register(providerName, ProviderClass) {
    this.providers.set(normalizeProviderName(providerName), ProviderClass);
    return this;
  }

  has(providerName) {
    return this.providers.has(normalizeProviderName(providerName));
  }

  create(providerName, config = {}) {
    const key = normalizeProviderName(providerName);
    const ProviderClass = this.providers.get(key);

    if (!ProviderClass) {
      throw new ConfigurationError(
        `Provider AI "${providerName}" tidak dikenal. Pilihan: ${this.list().join(", ")}.`
      );
    }

    return new ProviderClass(config);
  }

  list() {
    return Array.from(this.providers.keys());
  }
}

module.exports = AiProviderRegistry;
