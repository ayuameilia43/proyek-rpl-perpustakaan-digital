const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  toDate,
  formatDate,
  formatRupiah,
  dayDiff,
  numberedList,
} = require("../../../src/services/ai/Formatters");

describe("toDate", () => {
  test("mengubah string YYYY-MM-DD menjadi Date lokal", () => {
    const date = toDate("2026-02-03");
    assert.equal(date.getFullYear(), 2026);
    assert.equal(date.getMonth(), 1);
    assert.equal(date.getDate(), 3);
  });

  test("meneruskan objek Date", () => {
    const input = new Date(2026, 0, 1);
    assert.equal(toDate(input).getTime(), input.getTime());
  });
});

describe("formatDate", () => {
  test("mengembalikan tanda hubung untuk nilai kosong", () => {
    assert.equal(formatDate(null), "-");
    assert.equal(formatDate(""), "-");
  });

  test("memformat tanggal dalam bahasa Indonesia", () => {
    const formatted = formatDate("2026-02-03");
    assert.match(formatted, /3/);
    assert.match(formatted, /Februari/);
    assert.match(formatted, /2026/);
  });

  test("mengembalikan string asli bila tanggal tidak valid", () => {
    assert.equal(formatDate("bukan-tanggal"), "bukan-tanggal");
  });
});

describe("formatRupiah", () => {
  test("memformat angka dengan pemisah ribuan", () => {
    assert.equal(formatRupiah(15000), "Rp 15.000");
  });

  test("nilai kosong menjadi Rp 0", () => {
    assert.equal(formatRupiah(null), "Rp 0");
    assert.equal(formatRupiah(undefined), "Rp 0");
  });

  test("menerima string angka", () => {
    assert.equal(formatRupiah("2500"), "Rp 2.500");
  });
});

describe("dayDiff", () => {
  test("menghitung selisih hari positif", () => {
    assert.equal(dayDiff("2026-01-01", "2026-01-10"), 9);
  });

  test("menghitung selisih hari negatif", () => {
    assert.equal(dayDiff("2026-01-10", "2026-01-01"), -9);
  });

  test("tanggal akhir kosong menghasilkan nol", () => {
    assert.equal(dayDiff("2026-01-10", null), 0);
  });

  test("mengabaikan jam", () => {
    assert.equal(dayDiff("2026-01-01T23:00:00", "2026-01-02T01:00:00"), 1);
  });
});

describe("numberedList", () => {
  test("membuat daftar bernomor", () => {
    assert.equal(numberedList(["a", "b"]), "1. a\n2. b");
  });

  test("membatasi jumlah item dan menambahkan sisa", () => {
    assert.equal(numberedList(["a", "b", "c"], 2), "1. a\n2. b\n... dan 1 lainnya.");
  });

  test("daftar kosong menghasilkan string kosong", () => {
    assert.equal(numberedList([]), "");
  });
});
