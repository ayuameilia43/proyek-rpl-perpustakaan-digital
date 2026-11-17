const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const PersonalIntentDetector = require("../../../src/services/ai/PersonalIntentDetector");

const detector = new PersonalIntentDetector();

describe("PersonalIntentDetector", () => {
  test("mengembalikan array kosong tanpa kata ganti orang pertama", () => {
    assert.deepEqual(detector.detect("Apa saja buku terbaru?"), []);
    assert.deepEqual(detector.detect(""), []);
    assert.deepEqual(detector.detect(null), []);
  });

  test("mendeteksi pertanyaan identitas", () => {
    assert.deepEqual(detector.detect("Siapa saya?"), ["identity"]);
    assert.deepEqual(detector.detect("Apa nama saya?"), ["identity"]);
    assert.deepEqual(detector.detect("Tampilkan profil saya"), ["identity"]);
  });

  test("mendeteksi peminjaman aktif", () => {
    assert.deepEqual(detector.detect("Buku apa yang sedang saya pinjam?"), ["active"]);
    assert.deepEqual(detector.detect("Kapan buku saya jatuh tempo?"), ["active"]);
    assert.deepEqual(detector.detect("Apakah pinjaman saya terlambat?"), ["active"]);
  });

  test("mendeteksi riwayat buku yang sudah dikembalikan", () => {
    assert.deepEqual(detector.detect("Buku apa yang sudah saya pinjam?"), ["returned"]);
    assert.deepEqual(detector.detect("Tampilkan buku yang pernah saya baca"), ["returned"]);
  });

  test("mendeteksi pengajuan yang menunggu persetujuan", () => {
    assert.deepEqual(detector.detect("Bagaimana status pengajuan saya?"), ["pending"]);
    assert.deepEqual(detector.detect("Apakah saya punya pinjaman pending?"), ["pending"]);
  });

  test("mendeteksi denda dan tunggakan", () => {
    assert.deepEqual(detector.detect("Berapa denda saya?"), ["fines"]);
    assert.deepEqual(detector.detect("Saya punya tunggakan?"), ["fines"]);
  });

  test("mendeteksi kuota dan kelayakan pinjam", () => {
    assert.deepEqual(detector.detect("Berapa kuota pinjam saya?"), ["quota"]);
    assert.deepEqual(detector.detect("Apakah saya bisa meminjam buku?"), ["eligibility"]);
  });

  test("mendeteksi riwayat", () => {
    assert.deepEqual(detector.detect("Tampilkan riwayat saya"), ["history"]);
  });

  test("menggabungkan beberapa intent sekaligus", () => {
    assert.deepEqual(detector.detect("Riwayat dan denda saya?"), ["fines", "history"]);
  });

  test("fallback overview untuk pertanyaan pinjaman umum", () => {
    assert.deepEqual(detector.detect("Bagaimana pinjaman saya?"), ["overview"]);
    assert.deepEqual(detector.detect("Tampilkan buku saya"), ["overview"]);
  });

  test("tidak menganggap rekomendasi sebagai overview", () => {
    assert.deepEqual(detector.detect("Rekomendasi buku favorit saya?"), []);
  });

  test("mengoreksi intent returned menjadi active untuk buku belum dikembalikan", () => {
    assert.deepEqual(detector.detect("Buku yang belum saya kembalikan"), ["active"]);
  });

  test("normalisasi tanda baca dan huruf besar", () => {
    assert.deepEqual(detector.detect("SIAPA, SAYA?!"), ["identity"]);
  });
});
