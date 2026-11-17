const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { stubModule, loadFresh, createReq, createRes } = require("../../helpers");

const state = {
  events: [],
  error: null,
  recommendResult: { ok: true, reply: "Rekomendasi", books: [] },
  recommendError: null,
  lastStreamArgs: null,
  sseEvents: [],
  initialized: 0,
  closed: 0,
};

const aiOrchestrator = {
  async *streamChat(args) {
    state.lastStreamArgs = args;
    if (state.error) throw state.error;
    for (const event of state.events) yield event;
  },
  async recommend() {
    if (state.recommendError) throw state.recommendError;
    return state.recommendResult;
  },
};

const sseStub = {
  initializeSse: () => {
    state.initialized += 1;
  },
  sendSseEvent: (res, name, payload) => {
    state.sseEvents.push({ name, payload });
    return true;
  },
  startSseHeartbeat: () => setInterval(() => {}, 100000),
  closeSse: () => {
    state.closed += 1;
  },
};

stubModule("src/services/ai", { aiOrchestrator });
stubModule("src/utils/sse", sseStub);
const controller = loadFresh("src/controllers/aiController");

beforeEach(() => {
  state.events = [];
  state.error = null;
  state.recommendResult = { ok: true, reply: "Rekomendasi", books: [] };
  state.recommendError = null;
  state.lastStreamArgs = null;
  state.sseEvents = [];
  state.initialized = 0;
  state.closed = 0;
});

describe("sanitizeMessages", () => {
  test("mengembalikan array kosong untuk input bukan array", () => {
    assert.deepEqual(controller.sanitizeMessages(null), []);
    assert.deepEqual(controller.sanitizeMessages("halo"), []);
  });

  test("memfilter role tidak valid dan konten kosong", () => {
    const result = controller.sanitizeMessages([
      { role: "system", content: "abaikan" },
      { role: "user", content: "Halo" },
      { role: "assistant", content: "  " },
      { role: "assistant", content: "Hai" },
      null,
    ]);
    assert.deepEqual(result, [
      { role: "user", content: "Halo" },
      { role: "assistant", content: "Hai" },
    ]);
  });

  test("membatasi 12 pesan terakhir dan panjang 4000 karakter", () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({
      role: "user",
      content: `${index}-${"x".repeat(5000)}`,
    }));
    const result = controller.sanitizeMessages(messages);
    assert.equal(result.length, 12);
    assert.match(result[0].content, /^8-/);
    assert.equal(result[0].content.length, 4000);
  });

  test("mengubah konten non-string menjadi string", () => {
    const result = controller.sanitizeMessages([{ role: "user", content: 123 }]);
    assert.equal(result[0].content, "123");
  });
});

describe("chat", () => {
  test("menolak pesan kosong", async () => {
    let received;
    await controller.chat(createReq({ body: { messages: [] } }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.code, "VALIDATION_ERROR");
    assert.match(received.message, /Pesan tidak boleh kosong/);
  });

  test("menggabungkan token dan metadata stream", async () => {
    state.events = [
      { type: "meta", data: { personal: true } },
      { type: "token", text: "Ha" },
      { type: "token", text: "lo" },
      { type: "error", message: "diabaikan" },
      { type: "done", data: { ok: true, fallback: false } },
    ];
    const req = createReq({
      body: { messages: [{ role: "user", content: "Halo" }] },
      session: { user: { id: "u1" } },
    });
    const res = createRes();
    await controller.chat(req, res, () => {});
    assert.deepEqual(res.jsonPayload, {
      reply: "Halo",
      ok: true,
      fallback: false,
      personal: true,
    });
    assert.deepEqual(state.lastStreamArgs, {
      user: { id: "u1" },
      messages: [{ role: "user", content: "Halo" }],
    });
  });

  test("menangani fallback", async () => {
    state.events = [
      { type: "token", text: "Fallback" },
      { type: "done", data: { ok: false, fallback: true } },
    ];
    const res = createRes();
    await controller.chat(
      createReq({ body: { messages: [{ role: "user", content: "x" }] } }),
      res,
      () => {}
    );
    assert.equal(res.jsonPayload.fallback, true);
    assert.equal(res.jsonPayload.ok, false);
  });
});

describe("streamChat", () => {
  test("menolak pesan kosong", async () => {
    let received;
    await controller.streamChat(createReq({ body: { messages: [] } }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.code, "VALIDATION_ERROR");
  });

  test("mengirim event SSE dan menutup stream", async () => {
    state.events = [
      { type: "meta", data: { provider: "gemini" } },
      { type: "token", text: "Ha" },
      { type: "done", data: { ok: true } },
    ];
    const res = createRes();
    await controller.streamChat(
      createReq({ body: { messages: [{ role: "user", content: "Halo" }] } }),
      res,
      () => {}
    );

    assert.equal(state.initialized, 1);
    assert.deepEqual(state.sseEvents, [
      { name: "meta", payload: { provider: "gemini" } },
      { name: "token", payload: { text: "Ha" } },
      { name: "done", payload: { ok: true } },
    ]);
    assert.equal(state.closed, 1);
  });

  test("mengirim event error untuk tipe error", async () => {
    state.events = [{ type: "error", message: "gagal", fallback: true }];
    await controller.streamChat(
      createReq({ body: { messages: [{ role: "user", content: "x" }] } }),
      createRes(),
      () => {}
    );
    assert.deepEqual(state.sseEvents[0], {
      name: "error",
      payload: { message: "gagal", fallback: true },
    });
  });

  test("menangani exception orchestrator", async () => {
    state.error = new Error("boom");
    await controller.streamChat(
      createReq({ body: { messages: [{ role: "user", content: "x" }] } }),
      createRes(),
      () => {}
    );
    assert.deepEqual(state.sseEvents, [
      { name: "error", payload: { message: "Koneksi ke layanan AI terputus.", fallback: false } },
    ]);
    assert.equal(state.closed, 1);
  });

  test("membatalkan upstream saat koneksi ditutup", async () => {
    state.events = [{ type: "token", text: "x" }];
    const res = createRes({
      on(event, callback) {
        if (event === "close") this.closeCallback = callback;
        return this;
      },
    });
    await controller.streamChat(
      createReq({ body: { messages: [{ role: "user", content: "x" }] } }),
      res,
      () => {}
    );
    const signal = state.lastStreamArgs.signal;
    assert.equal(signal.aborted, false);
    res.closeCallback();
    assert.equal(signal.aborted, true);
  });

  test("tidak menulis event setelah dibatalkan", async () => {
    const res = createRes({
      on(event, callback) {
        if (event === "close") this.closeCallback = callback;
        return this;
      },
    });
    state.events = [];
    const originalStream = aiOrchestrator.streamChat;
    aiOrchestrator.streamChat = async function* (args) {
      args.signal.addEventListener("abort", () => {});
      res.closeCallback();
      yield { type: "token", text: "tidak boleh" };
    };
    try {
      await controller.streamChat(
        createReq({ body: { messages: [{ role: "user", content: "x" }] } }),
        res,
        () => {}
      );
      assert.equal(state.sseEvents.length, 0);
      assert.equal(state.closed, 1);
    } finally {
      aiOrchestrator.streamChat = originalStream;
    }
  });
});

describe("recommend", () => {
  test("merender hasil rekomendasi", async () => {
    const res = createRes();
    await controller.recommend(createReq({ session: { user: { id: "u1" } } }), res, () => {});
    assert.equal(res.rendered.view, "ai/rekomendasi");
    assert.deepEqual(res.rendered.data.books, []);
  });

  test("meneruskan error", async () => {
    state.recommendError = new Error("AI down");
    let received;
    await controller.recommend(createReq(), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "AI down");
  });
});
