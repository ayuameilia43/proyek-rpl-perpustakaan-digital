const PROVIDERS = ["gemini", "grok", "nvidia"];

const PROVIDER_LABELS = {
  gemini: "Google Gemini (Google API)",
  grok: "Grok (xAI)",
  nvidia: "NVIDIA NIM",
};

const DEFAULT_MODELS = {
  gemini: "gemini-2.5-flash",
  grok: "grok-2-latest",
  nvidia: "nvidia/llama-3.1-nemotron-70b-instruct",
};

const MODEL_SUGGESTIONS = {
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  grok: ["grok-2-latest", "grok-2-1212", "grok-beta"],
  nvidia: [
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "meta/llama-3.1-70b-instruct",
    "meta/llama-3.1-405b-instruct",
  ],
};

function normalizeProviderName(providerName) {
  return String(providerName || "gemini").trim().toLowerCase();
}

function isSupportedProvider(providerName) {
  return PROVIDERS.includes(normalizeProviderName(providerName));
}

function getDefaultModel(providerName) {
  return DEFAULT_MODELS[normalizeProviderName(providerName)] || "";
}

function getProviderLabel(providerName) {
  const normalized = normalizeProviderName(providerName);
  return PROVIDER_LABELS[normalized] || normalized;
}

function getModelSuggestions(providerName) {
  return MODEL_SUGGESTIONS[normalizeProviderName(providerName)] || [];
}

module.exports = {
  PROVIDERS,
  PROVIDER_LABELS,
  DEFAULT_MODELS,
  MODEL_SUGGESTIONS,
  normalizeProviderName,
  isSupportedProvider,
  getDefaultModel,
  getProviderLabel,
  getModelSuggestions,
};
