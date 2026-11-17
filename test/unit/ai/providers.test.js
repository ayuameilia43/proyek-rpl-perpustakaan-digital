const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { stubModule, loadFresh } = require("../../helpers");
const realHttp = require("../../../src/services/ai/ProviderHttpClient");
const { ConfigurationError, ProviderError } = require("../../../src/errors/AppError");

const state = {
  openSseOptions: null,
  openSseResult: { events: [], cleanup: () => {} },
  cleanupCalled: false,
  requestJsonResult: { status: 200, ok: true, raw: "", data: {} },
  requestJsonQueue: [],
  requestJsonCalls: [],
};

stubModule("src/services/ai/ProviderHttpClient", {
  ...realHttp,
  async openSseStream(options) {
    state.openSseOptions = options;
    return {
      events: state.openSseResult.events,
      cleanup: () => {
        state.cleanupCalled = true;
        if (state.openSseResult.cleanup) state.openSseResult.cleanup();
      },
    };
  },
  async requestJson(method, url, options) {
    state.requestJsonCalls.push({ method, url, options });
    if (state.requestJsonQueue.length) return state.requestJsonQueue.shift();
    return state.requestJsonResult;
  },
});

const GeminiProvider = loadFresh("src/services/ai/providers/GeminiProvider");
const GrokProvider = loadFresh("src/services/ai/providers/GrokProvider");
const NvidiaProvider = loadFresh("src/services/ai/providers/NvidiaProvider");

function tokenEvents(dataList) {
  return dataList.map((data) => ({ event: "message", data: JSON.stringify(data) }));
}

async function collect(stream) {
  const result = [];
  for await (const token of stream) result.push(token);
  return result;
}

beforeEach(() => {
  state.openSseOptions = null;
  state.openSseResult = { events: [], cleanup: () => {} };
  state.cleanupCalled = false;
  state.requestJsonResult = { status: 200, ok: true, raw: "", data: {} };
  state.requestJsonQueue = [];
  state.requestJsonCalls = [];
});

describe("GeminiProvider", () => {
  test("memiliki nama provider dan model default", () => {
    const provider = new GeminiProvider();
    assert.equal(provider.providerName, "gemini");
    assert.equal(provider.defaultModel, "gemini-2.5-flash");
  });

  test("buildContents memetakan role assistant menjadi model", () => {
    const provider = new GeminiProvider();
    assert.deepEqual(
      provider.buildContents([
        { role: "user", content: "Halo" },
        { role: "assistant", content: "Hi" },
        { role: "siswa", content: "Test" },
      ]),
      [
        { role: "user", parts: [{ text: "Halo" }] },
        { role: "model", parts: [{ text: "Hi" }] },
        { role: "user", parts: [{ text: "Test" }] },
      ]
    );
  });

  test("menolak streaming tanpa API key", async () => {
    const provider = new GeminiProvider();
    await assert.rejects(
      () => collect(provider.generateStream("sys", [])),
      (error) => error instanceof ConfigurationError
    );
  });

  test("membangun payload dan menghasilkan token", async () => {
    state.openSseResult.events = tokenEvents([
      { candidates: [{ content: { parts: [{ text: "Ha" }] } }] },
      { candidates: [{ content: { parts: [{ text: "lo" }] } }] },
    ]);
    const provider = new GeminiProvider({
      apiKey: "key dengan spasi",
      model: "gemini-custom",
      temperature: 0.2,
      maxTokens: 50,
      timeoutMs: 1234,
    });

    const tokens = await collect(
      provider.generateStream("System prompt", [{ role: "user", content: "Halo" }], {
        temperature: 0.9,
      })
    );

    assert.deepEqual(tokens, ["Ha", "lo"]);
    assert.equal(state.cleanupCalled, true);
    assert.match(state.openSseOptions.url, /gemini-custom:streamGenerateContent/);
    assert.match(state.openSseOptions.url, /key=key%20dengan%20spasi/);
    assert.deepEqual(state.openSseOptions.body, {
      contents: [{ role: "user", parts: [{ text: "Halo" }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 50 },
      systemInstruction: { parts: [{ text: "System prompt" }] },
    });
    assert.equal(state.openSseOptions.timeoutMs, 1234);
  });

  test("melempar ProviderError bila stream berisi error", async () => {
    state.openSseResult.events = tokenEvents([{ error: { message: "quota habis" } }]);
    const provider = new GeminiProvider({ apiKey: "k" });
    await assert.rejects(
      () => collect(provider.generateStream("", [])),
      (error) => error instanceof ProviderError && /quota habis/.test(error.message)
    );
    assert.equal(state.cleanupCalled, true);
  });

  test("listModels mengambil semua halaman dan menormalkan hasil", async () => {
    const responses = [
      {
        status: 200,
        ok: true,
        data: {
          models: [
            { name: "models/zeta", displayName: "Zeta" },
            { name: "models/alpha" },
          ],
          nextPageToken: "page-2",
        },
      },
      {
        status: 200,
        ok: true,
        data: { models: [{ name: "models/beta", supportedGenerationMethods: ["generateContent"] }] },
      },
    ];
    state.requestJsonQueue = responses;
    state.requestJsonCalls = [];
    const provider = new GeminiProvider({ apiKey: "k" });

    const models = await provider.listModels();
    assert.deepEqual(models.map((model) => model.id), ["alpha", "beta", "zeta"]);
    assert.equal(state.requestJsonCalls.length, 2);
    assert.match(state.requestJsonCalls[1].url, /pageToken=page-2/);
  });

  test("listModels melempar ProviderError saat HTTP gagal", async () => {
    state.requestJsonResult = { status: 429, ok: false, data: { error: { message: "rate limit" } } };
    const provider = new GeminiProvider({ apiKey: "k" });
    await assert.rejects(
      () => provider.listModels(),
      (error) => error instanceof ProviderError && /HTTP 429/.test(error.message) && /rate limit/.test(error.message)
    );
  });

  test("listModels menolak tanpa API key", async () => {
    const provider = new GeminiProvider();
    await assert.rejects(() => provider.listModels(), ConfigurationError);
  });
});

describe("OpenAI compatible providers", () => {
  test("Grok dan Nvidia memiliki endpoint serta model default", () => {
    const grok = new GrokProvider();
    const nvidia = new NvidiaProvider();
    assert.equal(grok.chatEndpoint, "https://api.x.ai/v1/chat/completions");
    assert.equal(grok.modelsEndpoint, "https://api.x.ai/v1/models");
    assert.equal(grok.defaultModel, "grok-2-latest");
    assert.equal(nvidia.chatEndpoint, "https://integrate.api.nvidia.com/v1/chat/completions");
    assert.equal(nvidia.defaultModel, "nvidia/llama-3.1-nemotron-70b-instruct");
  });

  test("buildMessages menambahkan system prompt", () => {
    const provider = new GrokProvider();
    assert.deepEqual(provider.buildMessages("sys", [{ role: "assistant", content: "A" }, { role: "user", content: "B" }]), [
      { role: "system", content: "sys" },
      { role: "assistant", content: "A" },
      { role: "user", content: "B" },
    ]);
  });

  test("generateStream mengirim payload dan menghasilkan delta token", async () => {
    state.openSseResult.events = [
      { data: '{"choices":[{"delta":{"content":"Ha"}}]}' },
      { data: '{"choices":[{"delta":{"content":"lo"}}]}' },
      { data: "[DONE]" },
      { data: '{"choices":[{"delta":{"content":"tidak dipakai"}}]}' },
    ];
    const provider = new GrokProvider({
      apiKey: "key",
      model: "grok-custom",
      temperature: 0.4,
      maxTokens: 99,
      timeoutMs: 777,
    });

    const tokens = await collect(
      provider.generateStream("sys", [{ role: "user", content: "Halo" }], { temperature: 0 })
    );

    assert.deepEqual(tokens, ["Ha", "lo"]);
    assert.equal(state.cleanupCalled, true);
    assert.equal(state.openSseOptions.url, provider.chatEndpoint);
    assert.equal(state.openSseOptions.headers.Authorization, "Bearer key");
    assert.deepEqual(state.openSseOptions.body, {
      model: "grok-custom",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "Halo" },
      ],
      temperature: 0,
      max_tokens: 99,
      stream: true,
    });
    assert.equal(state.openSseOptions.timeoutMs, 777);
  });

  test("generateStream melempar ProviderError pada payload error", async () => {
    state.openSseResult.events = [{ data: '{"error":{"message":"invalid model"}}' }];
    const provider = new NvidiaProvider({ apiKey: "k" });
    await assert.rejects(
      () => collect(provider.generateStream("", [])),
      (error) => error instanceof ProviderError && /invalid model/.test(error.message)
    );
  });

  test("generateStream menolak tanpa API key", async () => {
    const provider = new GrokProvider();
    await assert.rejects(() => collect(provider.generateStream("", [])), ConfigurationError);
  });

  test("listModels mendukung format data.data dan models", async () => {
    const provider = new GrokProvider({ apiKey: "k" });
    state.requestJsonResult = {
      status: 200,
      ok: true,
      data: { data: [{ id: "b" }, { id: "a" }, { id: "a" }] },
    };
    assert.deepEqual(await provider.listModels(), [
      { id: "a", label: "a" },
      { id: "b", label: "b" },
    ]);

    state.requestJsonResult = {
      status: 200,
      ok: true,
      data: { models: [{ id: "c" }] },
    };
    assert.deepEqual(await provider.listModels(), [{ id: "c", label: "c" }]);
  });

  test("listModels gagal pada HTTP error", async () => {
    state.requestJsonResult = { status: 500, ok: false, data: { message: "server down" } };
    const provider = new GrokProvider({ apiKey: "k" });
    await assert.rejects(
      () => provider.listModels(),
      (error) => error instanceof ProviderError && /HTTP 500/.test(error.message)
    );
  });
});
