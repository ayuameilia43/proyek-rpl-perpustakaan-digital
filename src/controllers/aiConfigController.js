const { settingsRepository } = require("../repositories");
const { aiOrchestrator } = require("../services/ai");
const {
  PROVIDERS,
  PROVIDER_LABELS,
  DEFAULT_MODELS,
  MODEL_SUGGESTIONS,
} = require("../services/ai/ProviderCatalog");

function mask(value) {
  if (!value) return "";
  return `••••••${String(value).slice(-4)}`;
}

function normalizeForm(body) {
  const provider = String(body.ai_provider || "gemini").trim();
  const model = String(body.ai_model || "").trim() || DEFAULT_MODELS[provider] || "";
  const temperature = Number(body.ai_temperature);

  return {
    provider,
    model,
    temperature,
    isChatbotActive: body.is_chatbot_active === "1" ? 1 : 0,
    systemPrompt: body.ai_system_prompt || "",
    apiKey: String(body.ai_api_key || "").trim(),
  };
}

function validateForm(form) {
  const errors = [];
  if (!PROVIDERS.includes(form.provider)) errors.push("Provider AI tidak valid.");
  if (!form.model) errors.push("Model AI wajib diisi.");
  if (Number.isNaN(form.temperature) || form.temperature < 0 || form.temperature > 2) {
    errors.push("Temperature harus 0-2.");
  }
  return errors;
}

function toViewForm(form) {
  return {
    ai_provider: form.provider,
    ai_model: form.model,
    ai_temperature: form.temperature,
    is_chatbot_active: form.isChatbotActive,
    ai_system_prompt: form.systemPrompt,
    ai_api_key: form.apiKey,
  };
}

function renderIndex(res, { settings, errors = [], form }) {
  const safeSettings = settings || {};
  return res.render("admin/ai/index", {
    title: "Konfigurasi AI",
    settings: safeSettings,
    errors,
    form: form || safeSettings,
    providers: PROVIDERS,
    providerLabels: PROVIDER_LABELS,
    defaultModels: DEFAULT_MODELS,
    modelSuggestions: MODEL_SUGGESTIONS,
    maskedKey: mask(safeSettings.ai_api_key),
  });
}

async function index(req, res, next) {
  try {
    const settings = await settingsRepository.getSystemSettings();
    return renderIndex(res, { settings, form: settings });
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const current = await settingsRepository.getSystemSettings();
    const form = normalizeForm(req.body);
    const errors = validateForm(form);

    if (errors.length) {
      res.status(400);
      return renderIndex(res, { settings: current, errors, form: toViewForm(form) });
    }

    await settingsRepository.updateAiConfiguration({
      provider: form.provider,
      model: form.model,
      temperature: form.temperature,
      apiKey: form.apiKey || (current && current.ai_api_key),
      isChatbotActive: form.isChatbotActive,
      systemPrompt: form.systemPrompt,
    });

    req.session.flash = { type: "success", message: "Konfigurasi AI berhasil disimpan." };
    return res.redirect("/admin/ai");
  } catch (error) {
    return next(error);
  }
}

async function test(req, res, next) {
  try {
    const current = await settingsRepository.getSystemSettings();
    const provider = String(req.body.ai_provider || (current && current.ai_provider) || "gemini").trim();
    const model = String(req.body.ai_model || (current && current.ai_model) || DEFAULT_MODELS[provider] || "").trim();
    const apiKey = String(req.body.ai_api_key || "").trim() || (current && current.ai_api_key);
    const result = await aiOrchestrator.testConnection({ provider, apiKey, model });

    req.session.flash = { type: result.ok ? "success" : "error", message: result.message };
    return res.redirect("/admin/ai");
  } catch (error) {
    return next(error);
  }
}

async function models(req, res, next) {
  try {
    const current = await settingsRepository.getSystemSettings();
    const provider = String(req.body.provider || (current && current.ai_provider) || "gemini").trim();
    const apiKey = String(req.body.ai_api_key || "").trim() || (current && current.ai_api_key);
    const result = await aiOrchestrator.listModels({ provider, apiKey });

    return res.json({ ok: result.ok, provider, models: result.models || [], error: result.error });
  } catch (error) {
    return next(error);
  }
}

module.exports = { index, update, test, models };
