const { test, describe, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseJsonSafely,
  extractApiError,
  normalizeRequestError,
  requestJson,
  openSseStream,
  normalizeModelList,
} = require("../../../src/services/ai/ProviderHttpClient");
const { ProviderError } = require("../../../src/errors/AppError");

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("parseJsonSafely", () => {
  test("mengembalikan objek kosong untuk input kosong", () => {
    assert.deepEqual(parseJsonSafely(""), {});
    assert.deepEqual(parseJsonSafely(null), {});
  });

  test("mem-parse JSON valid", () => {
    assert.deepEqual(parseJsonSafely('{"ok":true}'), { ok: true });
  });

  test("mengembalikan objek kosong untuk JSON invalid", () => {
    assert.deepEqual(parseJsonSafely("<html>"), {});
  });
});

describe("extractApiError", () => {
  test("mengambil pesan dari error string", () => {
    assert.equal(extractApiError({ error: "API key invalid" }), "API key invalid");
  });

  test("mengambil pesan dari error.message", () => {
    assert.equal(extractApiError({ error: { message: "Quota exceeded" } }), "Quota exceeded");
  });

  test("mengambil message/detail/reason", () => {
    assert.equal(extractApiError({ message: "m" }), "m");
    assert.equal(extractApiError({ detail: "d" }), "d");
    assert.equal(extractApiError({ reason: "r" }), "r");
  });

  test("mem-parse string JSON", () => {
    assert.equal(extractApiError('{"error":{"message":"bad"}}'), "bad");
  });

  test("mengembalikan potongan string mentah", () => {
    assert.equal(extractApiError("  plain error  "), "plain error");
  });

  test("mengembalikan pesan default", () => {
    assert.equal(extractApiError({}), "Kesalahan tidak diketahui.");
    assert.equal(extractApiError(""), "Kesalahan tidak diketahui.");
  });
});

describe("normalizeRequestError", () => {
  test("meneruskan ProviderError apa adanya", () => {
    const error = new ProviderError("sudah normal");
    assert.equal(normalizeRequestError(error, 1000), error);
  });

  test("mengubah AbortError menjadi ProviderError timeout", () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    const normalized = normalizeRequestError(error, 2500);
    assert.ok(normalized instanceof ProviderError);
    assert.match(normalized.message, /dibatalkan atau melebihi batas waktu \(2500ms\)/);
  });

  test("membungkus error jaringan umum", () => {
    const normalized = normalizeRequestError(new Error("socket hang up"), 1000);
    assert.ok(normalized instanceof ProviderError);
    assert.match(normalized.message, /socket hang up/);
  });

  test("menangani error tanpa pesan", () => {
    const normalized = normalizeRequestError(null, 1000);
    assert.match(normalized.message, /tidak diketahui/);
  });
});

describe("requestJson", () => {
  test("mengirim request dan mem-parse respons JSON", async () => {
    let captured;
    globalThis.fetch = async (url, options) => {
      captured = { url, options };
      return { status: 200, ok: true, async text() { return '{"a":1}'; } };
    };

    const result = await requestJson("POST", "https://api.test/x", {
      headers: { Authorization: "Bearer k" },
      body: { hello: "world" },
      timeoutMs: 500,
    });

    assert.equal(captured.options.method, "POST");
    assert.equal(captured.options.headers.Authorization, "Bearer k");
    assert.equal(captured.options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(captured.options.body), { hello: "world" });
    assert.deepEqual(result, { status: 200, ok: true, raw: '{"a":1}', data: { a: 1 } });
  });

  test("tidak mengirim body bila undefined", async () => {
    let captured;
    globalThis.fetch = async (url, options) => {
      captured = options;
      return { status: 200, ok: true, async text() { return ""; } };
    };
    const result = await requestJson("GET", "https://api.test/x");
    assert.equal(captured.body, undefined);
    assert.deepEqual(result.data, {});
  });

  test("membungkus kegagalan fetch", async () => {
    globalThis.fetch = async () => {
      throw new Error("fetch failed");
    };
    await assert.rejects(
      () => requestJson("GET", "https://api.test/x"),
      (error) => error instanceof ProviderError && /fetch failed/.test(error.message)
    );
  });
});

function sseResponse(chunks) {
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true };
            return { value: new TextEncoder().encode(chunks[index++]), done: false };
          },
          releaseLock() {},
        };
      },
    },
  };
}

async function collect(events) {
  const result = [];
  for await (const event of events) result.push(event);
  return result;
}

describe("openSseStream", () => {
  test("mengirim POST dan mengalirkan event SSE", async () => {
    let captured;
    globalThis.fetch = async (url, options) => {
      captured = { url, options };
      return sseResponse([
        'event: meta\ndata: {"provider":"gemini"}\n\n',
        'event: token\ndata: {"text":"Ha"}\n\n',
        'event: token\ndata: {"text":"lo"}\n\n',
        "data: [DONE]\n\n",
      ]);
    };

    const { events, cleanup } = await openSseStream({
      url: "https://api.test/stream",
      headers: { Authorization: "Bearer k" },
      body: { prompt: "hi" },
    });

    const result = await collect(events);
    cleanup();

    assert.equal(captured.options.method, "POST");
    assert.equal(captured.options.headers.Authorization, "Bearer k");
    assert.deepEqual(JSON.parse(captured.options.body), { prompt: "hi" });
    assert.deepEqual(result, [
      { event: "meta", data: '{"provider":"gemini"}' },
      { event: "token", data: '{"text":"Ha"}' },
      { event: "token", data: '{"text":"lo"}' },
      { event: "message", data: "[DONE]" },
    ]);
  });

  test("memproses event terakhir tanpa delimiter", async () => {
    globalThis.fetch = async () =>
      sseResponse(['event: token\ndata: {"text":"akhir"}']);
    const { events, cleanup } = await openSseStream({
      url: "https://api.test/stream",
      body: {},
    });
    assert.deepEqual(await collect(events), [
      { event: "token", data: '{"text":"akhir"}' },
    ]);
    cleanup();
  });

  test("melempar ProviderError saat HTTP gagal", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      async text() {
        return '{"error":{"message":"invalid key"}}';
      },
    });
    await assert.rejects(
      () => openSseStream({ url: "https://api.test/stream", body: {} }),
      (error) => error instanceof ProviderError && /HTTP 401/.test(error.message) && /invalid key/.test(error.message)
    );
  });

  test("melempar ProviderError saat streaming tidak tersedia", async () => {
    globalThis.fetch = async () => ({ ok: true, status: 200, body: null });
    const { events, cleanup } = await openSseStream({ url: "https://api.test/stream", body: {} });
    await assert.rejects(() => collect(events), /Respons streaming tidak tersedia/);
    cleanup();
  });

  test("membungkus error jaringan", async () => {
    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    await assert.rejects(
      () => openSseStream({ url: "https://api.test/stream", body: {} }),
      (error) => error instanceof ProviderError && /network down/.test(error.message)
    );
  });
});

describe("normalizeModelList", () => {
  test("memfilter, menormalkan, dan mengurutkan model", () => {
    const result = normalizeModelList([
      { name: "models/zeta", displayName: "Zeta" },
      { name: "models/alpha" },
      { name: "alpha", displayName: "Duplikat" },
      { name: "models/beta", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gamma", supportedGenerationMethods: ["embedContent"] },
      { name: "" },
      null,
    ]);
    assert.deepEqual(result, [
      { id: "alpha", label: "models/alpha" },
      { id: "beta", label: "models/beta" },
      { id: "zeta", label: "Zeta" },
    ]);
  });

  test("menerima input bukan array", () => {
    assert.deepEqual(normalizeModelList(null), []);
  });

  test("mendukung id dan method chat", () => {
    const result = normalizeModelList([
      { id: "model-a", supportedGenerationMethods: ["chat"], displayName: "Model A" },
    ]);
    assert.deepEqual(result, [{ id: "model-a", label: "Model A" }]);
  });
});
