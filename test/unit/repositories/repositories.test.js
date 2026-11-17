const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { stubModule, createPool, loadFresh } = require("../../helpers");
const { ConfigurationError } = require("../../../src/errors/AppError");

const dbPool = createPool();
stubModule("src/config/db", dbPool);

const SettingsRepository = loadFresh("src/repositories/SettingsRepository");
const BookRepository = loadFresh("src/repositories/BookRepository");
const UserRepository = loadFresh("src/repositories/UserRepository");
const TransactionRepository = loadFresh("src/repositories/TransactionRepository");

describe("SettingsRepository", () => {
  test("meng-cache pengaturan sistem", async () => {
    let calls = 0;
    const pool = { query: async () => { calls += 1; return [[{ id: "s1" }]]; } };
    const repository = new SettingsRepository(pool, 60000);

    const first = await repository.getSystemSettings();
    const second = await repository.getSystemSettings();
    assert.deepEqual(first, { id: "s1" });
    assert.equal(second, first);
    assert.equal(calls, 1);
  });

  test("forceRefresh mengabaikan cache", async () => {
    let calls = 0;
    const pool = { query: async () => { calls += 1; return [[{ id: calls }]]; } };
    const repository = new SettingsRepository(pool, 60000);
    await repository.getSystemSettings();
    await repository.getSystemSettings({ forceRefresh: true });
    assert.equal(calls, 2);
  });

  test("cache kedaluwarsa sesuai durasi", async () => {
    let calls = 0;
    const pool = { query: async () => { calls += 1; return [[{ id: calls }]]; } };
    const repository = new SettingsRepository(pool, 0);
    await repository.getSystemSettings();
    await repository.getSystemSettings();
    assert.equal(calls, 2);
  });

  test("mengembalikan null bila tabel kosong", async () => {
    const repository = new SettingsRepository({ query: async () => [[]] }, 1000);
    assert.equal(await repository.getSystemSettings(), null);
  });

  test("getAiRuntimeConfig memakai default dan konversi tipe", async () => {
    const repository = new SettingsRepository({ query: async () => [[]] }, 1000);
    assert.deepEqual(await repository.getAiRuntimeConfig(), {
      provider: "gemini",
      model: "",
      apiKey: "",
      temperature: 0.7,
      isChatbotActive: false,
    });
  });

  test("getAiRuntimeConfig membaca nilai settings", async () => {
    const repository = new SettingsRepository(
      {
        query: async () => [
          [
            {
              ai_provider: "grok",
              ai_model: "grok-2",
              ai_api_key: "key",
              ai_temperature: 0.3,
              is_chatbot_active: 1,
            },
          ],
        ],
      },
      1000
    );
    assert.deepEqual(await repository.getAiRuntimeConfig(), {
      provider: "grok",
      model: "grok-2",
      apiKey: "key",
      temperature: 0.3,
      isChatbotActive: true,
    });
  });

  test("updateAiConfiguration gagal bila settings tidak ada", async () => {
    const repository = new SettingsRepository({ query: async () => [[]] }, 1000);
    await assert.rejects(
      () => repository.updateAiConfiguration({ provider: "gemini" }),
      ConfigurationError
    );
  });

  test("updateAiConfiguration menyimpan dan menginvalidasi cache", async () => {
    const calls = [];
    const repository = new SettingsRepository(
      {
        query: async (sql, params) => {
          calls.push({ sql, params });
          if (sql.startsWith("UPDATE")) return [{ affectedRows: 1 }];
          return [[{ id: "s1", ai_provider: "grok" }]];
        },
      },
      60000
    );
    const result = await repository.updateAiConfiguration({
      provider: "grok",
      model: "grok-2",
      temperature: 0.4,
      apiKey: "key",
      isChatbotActive: 1,
      systemPrompt: "Prompt",
    });
    assert.equal(result.ai_provider, "grok");
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[1].params, ["grok", "grok-2", 0.4, "key", 1, "Prompt", "s1"]);
  });

  test("invalidateCache mengosongkan cache", async () => {
    let calls = 0;
    const repository = new SettingsRepository(
      { query: async () => { calls += 1; return [[{ id: calls }]]; } },
      60000
    );
    await repository.getSystemSettings();
    repository.invalidateCache();
    await repository.getSystemSettings();
    assert.equal(calls, 2);
  });
});

describe("BookRepository", () => {
  beforeEach(() => {
    dbPool.calls.length = 0;
    dbPool.handler = async () => [[{ id: "b1" }]];
  });

  test("mengambil katalog aktif dengan limit default", async () => {
    const repository = new BookRepository();
    const rows = await repository.findActiveCatalog();
    assert.deepEqual(rows, [{ id: "b1" }]);
    assert.deepEqual(dbPool.calls[0].params, [40]);
    assert.match(dbPool.calls[0].sql, /is_active = 1/);
  });

  test("memakai default untuk limit tidak valid dan membatasi maksimal 100", async () => {
    const repository = new BookRepository();
    await repository.findActiveCatalog({ limit: 0 });
    await repository.findActiveCatalog({ limit: 500 });
    await repository.findActiveCatalog({ limit: "abc" });
    assert.deepEqual(dbPool.calls.map((call) => call.params[0]), [40, 100, 40]);
  });

  test("mengembalikan array kosong bila rows null", async () => {
    dbPool.handler = async () => [null];
    const repository = new BookRepository();
    assert.deepEqual(await repository.findActiveCatalog(), []);
  });
});

describe("UserRepository", () => {
  beforeEach(() => {
    dbPool.calls.length = 0;
    dbPool.handler = async () => [[{ id: "u1" }]];
  });

  test("mengembalikan null tanpa userId", async () => {
    const repository = new UserRepository();
    assert.equal(await repository.findProfileById(null), null);
    assert.equal(dbPool.calls.length, 0);
  });

  test("mencari profil berdasarkan id", async () => {
    const repository = new UserRepository();
    assert.deepEqual(await repository.findProfileById("u1"), { id: "u1" });
    assert.deepEqual(dbPool.calls[0].params, ["u1"]);
  });

  test("mengembalikan null bila tidak ditemukan", async () => {
    dbPool.handler = async () => [[]];
    const repository = new UserRepository();
    assert.equal(await repository.findProfileById("u1"), null);
  });
});

describe("TransactionRepository", () => {
  beforeEach(() => {
    dbPool.calls.length = 0;
    dbPool.handler = async () => [[{ id: "t1" }]];
  });

  test("mengembalikan array kosong tanpa userId", async () => {
    const repository = new TransactionRepository();
    assert.deepEqual(await repository.findByUserIdWithBook(""), []);
    assert.equal(dbPool.calls.length, 0);
  });

  test("mengambil transaksi pengguna dengan data buku", async () => {
    const repository = new TransactionRepository();
    const rows = await repository.findByUserIdWithBook("u1");
    assert.deepEqual(rows, [{ id: "t1" }]);
    assert.match(dbPool.calls[0].sql, /JOIN books b/);
    assert.deepEqual(dbPool.calls[0].params, ["u1"]);
  });

  test("mengembalikan array kosong bila rows null", async () => {
    dbPool.handler = async () => [null];
    const repository = new TransactionRepository();
    assert.deepEqual(await repository.findByUserIdWithBook("u1"), []);
  });
});
