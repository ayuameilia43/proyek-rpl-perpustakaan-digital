const {
  bookRepository,
  settingsRepository,
  userRepository,
  transactionRepository,
} = require("../../repositories");
const AiOrchestrator = require("./AiOrchestrator");
const AiProviderRegistry = require("./AiProviderRegistry");
const LibraryContextBuilder = require("./LibraryContextBuilder");
const SystemPromptBuilder = require("./SystemPromptBuilder");
const PersonalIntentDetector = require("./PersonalIntentDetector");
const PersonalReplyBuilder = require("./PersonalReplyBuilder");

const providerRegistry = new AiProviderRegistry();
const libraryContextBuilder = new LibraryContextBuilder({
  settingsRepository,
  bookRepository,
  userRepository,
  transactionRepository,
});
const systemPromptBuilder = new SystemPromptBuilder();
const personalIntentDetector = new PersonalIntentDetector();
const personalReplyBuilder = new PersonalReplyBuilder();

const aiOrchestrator = new AiOrchestrator({
  providerRegistry,
  libraryContextBuilder,
  systemPromptBuilder,
  personalIntentDetector,
  personalReplyBuilder,
});

module.exports = {
  aiOrchestrator,
  AiOrchestrator,
  AiProviderRegistry,
  LibraryContextBuilder,
  SystemPromptBuilder,
  PersonalIntentDetector,
  PersonalReplyBuilder,
};
