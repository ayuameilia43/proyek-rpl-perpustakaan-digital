const OpenAiCompatibleProvider = require("./OpenAiCompatibleProvider");

class NvidiaProvider extends OpenAiCompatibleProvider {
  get providerName() {
    return "nvidia";
  }

  get chatEndpoint() {
    return "https://integrate.api.nvidia.com/v1/chat/completions";
  }

  get modelsEndpoint() {
    return "https://integrate.api.nvidia.com/v1/models";
  }

  get defaultModel() {
    return "nvidia/llama-3.1-nemotron-70b-instruct";
  }
}

module.exports = NvidiaProvider;
