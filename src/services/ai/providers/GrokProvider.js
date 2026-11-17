const OpenAiCompatibleProvider = require("./OpenAiCompatibleProvider");

class GrokProvider extends OpenAiCompatibleProvider {
  get providerName() {
    return "grok";
  }

  get chatEndpoint() {
    return "https://api.x.ai/v1/chat/completions";
  }

  get modelsEndpoint() {
    return "https://api.x.ai/v1/models";
  }

  get defaultModel() {
    return "grok-2-latest";
  }
}

module.exports = GrokProvider;
