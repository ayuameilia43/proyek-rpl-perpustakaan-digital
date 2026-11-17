const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  initializeSse,
  sendSseEvent,
  sendSseHeartbeat,
  startSseHeartbeat,
  closeSse,
} = require("../../../src/utils/sse");

function fakeRes() {
  return {
    statusCode: null,
    headers: {},
    chunks: [],
    writableEnded: false,
    destroyed: false,
    flushed: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    flushHeaders() {
      this.flushed = true;
    },
    write(chunk) {
      this.chunks.push(chunk);
    },
    end() {
      this.writableEnded = true;
    },
  };
}

describe("initializeSse", () => {
  test("mengatur status dan header SSE", () => {
    const res = fakeRes();
    initializeSse(res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Content-Type"], "text/event-stream; charset=utf-8");
    assert.equal(res.headers["Cache-Control"], "no-cache, no-transform");
    assert.equal(res.headers["Connection"], "keep-alive");
    assert.equal(res.headers["X-Accel-Buffering"], "no");
    assert.equal(res.flushed, true);
  });
});

describe("sendSseEvent", () => {
  test("menulis event dan data", () => {
    const res = fakeRes();
    const sent = sendSseEvent(res, "token", { text: "halo" });
    assert.equal(sent, true);
    assert.deepEqual(res.chunks, ['event: token\n', 'data: {"text":"halo"}\n\n']);
  });

  test("memakai payload kosong dan tidak menulis saat respons selesai", () => {
    const res = fakeRes();
    sendSseEvent(res, "done");
    assert.equal(res.chunks[1], "data: {}\n\n");

    res.writableEnded = true;
    assert.equal(sendSseEvent(res, "token", {}), false);
  });

  test("tidak menulis saat koneksi terputus", () => {
    const res = fakeRes();
    res.destroyed = true;
    assert.equal(sendSseEvent(res, "token", {}), false);
  });
});

describe("heartbeat", () => {
  test("mengirim ping saat koneksi aktif", () => {
    const res = fakeRes();
    sendSseHeartbeat(res);
    assert.deepEqual(res.chunks, [": ping\n\n"]);
  });

  test("tidak mengirim ping saat koneksi selesai", () => {
    const res = fakeRes();
    res.writableEnded = true;
    sendSseHeartbeat(res);
    assert.deepEqual(res.chunks, []);
  });

  test("interval heartbeat berjalan dan dapat dihentikan", async () => {
    const res = fakeRes();
    const timer = startSseHeartbeat(res, 5);
    await new Promise((resolve) => setTimeout(resolve, 18));
    clearInterval(timer);
    assert.ok(res.chunks.length >= 1);
  });
});

describe("closeSse", () => {
  test("menutup respons aktif", () => {
    const res = fakeRes();
    closeSse(res);
    assert.equal(res.writableEnded, true);
  });

  test("tidak menutup respons yang sudah selesai atau terputus", () => {
    const ended = fakeRes();
    ended.writableEnded = true;
    closeSse(ended);
    assert.equal(ended.writableEnded, true);

    const destroyed = fakeRes();
    destroyed.destroyed = true;
    closeSse(destroyed);
    assert.equal(destroyed.writableEnded, false);
  });
});
