const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { markOverdue, calculateFine } = require("../../../src/services/sirkulasiService");

describe("calculateFine", () => {
  test("tidak ada denda jika tanggal jatuh tempo kosong", () => {
    assert.equal(calculateFine(null, "2026-01-10", 1000), 0);
  });

  test("tidak ada denda jika tanggal kembali kosong", () => {
    assert.equal(calculateFine("2026-01-01", null, 1000), 0);
  });

  test("tidak ada denda jika dikembalikan tepat waktu", () => {
    assert.equal(calculateFine("2026-01-10", "2026-01-10", 1000), 0);
  });

  test("tidak ada denda jika dikembalikan lebih awal", () => {
    assert.equal(calculateFine("2026-01-10", "2026-01-05", 1000), 0);
  });

  test("menghitung denda satu hari keterlambatan", () => {
    assert.equal(calculateFine("2026-01-10", "2026-01-11", 1000), 1000);
  });

  test("menghitung denda 13 hari keterlambatan", () => {
    assert.equal(calculateFine("2026-01-01", "2026-01-14", 1000), 13000);
  });

  test("mengabaikan komponen jam pada tanggal", () => {
    assert.equal(
      calculateFine("2026-01-10T23:59:59", "2026-01-11T00:00:01", 1000),
      1000
    );
  });

  test("mendukung nominal denda desimal", () => {
    assert.equal(calculateFine("2026-01-01", "2026-01-03", 1000.5), 2001);
  });

  test("nominal denda tidak valid dianggap nol", () => {
    assert.equal(calculateFine("2026-01-01", "2026-01-03", "abc"), 0);
  });
});

describe("markOverdue", () => {
  test("mengubah status transaksi lewat due_date dan mengembalikan affectedRows", async () => {
    const pool = {
      async query(sql) {
        assert.match(sql, /UPDATE transactions SET status = 'terlambat'/);
        assert.match(sql, /due_date < CURDATE\(\)/);
        return [{ affectedRows: 4 }];
      },
    };
    assert.equal(await markOverdue(pool), 4);
  });

  test("mengembalikan nol bila affectedRows tidak tersedia", async () => {
    const pool = { query: async () => [{}] };
    assert.equal(await markOverdue(pool), 0);
  });

  test("meneruskan error database", async () => {
    const pool = { query: async () => { throw new Error("db down"); } };
    await assert.rejects(() => markOverdue(pool), /db down/);
  });
});
