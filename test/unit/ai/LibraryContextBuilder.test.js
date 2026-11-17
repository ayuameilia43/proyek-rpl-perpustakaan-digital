const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const LibraryContextBuilder = require("../../../src/services/ai/LibraryContextBuilder");

function createBuilder(overrides = {}) {
  const repositories = {
    settingsRepository: {
      getSystemSettings: async () => overrides.settings || null,
      getAiRuntimeConfig: async () => overrides.aiConfig || { provider: "gemini" },
    },
    bookRepository: {
      findActiveCatalog: async () => overrides.books || [],
    },
    userRepository: {
      findProfileById: async () => overrides.profile || null,
    },
    transactionRepository: {
      findByUserIdWithBook: async () => overrides.transactions || [],
    },
  };
  return new LibraryContextBuilder(repositories);
}

describe("LibraryContextBuilder.build", () => {
  test("membangun konteks lengkap untuk pengguna terautentikasi", async () => {
    const transactions = [
      { status: "dipinjam", fine_amount: 0, fine_paid_status: "belum_lunas" },
      { status: "terlambat", fine_amount: 3000, fine_paid_status: "belum_lunas" },
      { status: "menunggu_persetujuan", fine_amount: 0, fine_paid_status: "belum_lunas" },
      { status: "dikembalikan", fine_amount: 1000, fine_paid_status: "lunas" },
      { status: "dikembalikan", fine_amount: 2000, fine_paid_status: "belum_lunas" },
      { status: "ditolak", fine_amount: 0, fine_paid_status: "belum_lunas" },
    ];
    const builder = createBuilder({
      settings: {
        school_name: "SMA Test",
        max_borrow_duration: 10,
        fine_per_day: 500,
        max_books_per_student: 4,
        operating_hours_start: "08:00:00",
        operating_hours_end: "17:00:00",
      },
      books: [{ id: "b1" }],
      profile: { id: "u1", full_name: "Andi" },
      transactions,
    });

    const context = await builder.build({ id: "u1" });

    assert.equal(context.books.length, 1);
    assert.equal(context.personal.profile.full_name, "Andi");
    assert.equal(context.personal.active.length, 2);
    assert.equal(context.personal.pending.length, 1);
    assert.equal(context.personal.returned.length, 2);
    assert.equal(context.personal.rejected.length, 1);
    assert.equal(context.personal.unpaidFine, 5000);
    assert.deepEqual(context.personal.stats, {
      total: 6,
      activeCount: 2,
      pendingCount: 1,
      returnedCount: 2,
      rejectedCount: 1,
    });
    assert.deepEqual(context.rules, {
      schoolName: "SMA Test",
      maxBorrowDuration: 10,
      finePerDay: 500,
      maxBooks: 4,
      openHours: "08:00 - 17:00",
    });
  });

  test("pengguna tanpa id tidak memuat profil/transaksi", async () => {
    let profileCalls = 0;
    let transactionCalls = 0;
    const builder = new LibraryContextBuilder({
      settingsRepository: {
        getSystemSettings: async () => null,
        getAiRuntimeConfig: async () => ({}),
      },
      bookRepository: { findActiveCatalog: async () => [] },
      userRepository: {
        findProfileById: async () => {
          profileCalls += 1;
          return null;
        },
      },
      transactionRepository: {
        findByUserIdWithBook: async () => {
          transactionCalls += 1;
          return [];
        },
      },
    });

    const context = await builder.build(null);
    assert.equal(context.personal, null);
    assert.equal(profileCalls, 0);
    assert.equal(transactionCalls, 0);
  });

  test("memakai aturan default saat settings kosong", async () => {
    const builder = createBuilder();
    const context = await builder.build(null);
    assert.deepEqual(context.rules, {
      schoolName: "Perpustakaan Digital SMA NEGERI 1 MAJALENGKA",
      maxBorrowDuration: 7,
      finePerDay: 0,
      maxBooks: 3,
      openHours: "07:00 - 21:00",
    });
  });

  test("menangani denda bernilai negatif atau bukan angka", async () => {
    const builder = createBuilder({
      profile: { id: "u1" },
      transactions: [
        { status: "dikembalikan", fine_amount: "abc", fine_paid_status: "belum_lunas" },
        { status: "dikembalikan", fine_amount: -500, fine_paid_status: "belum_lunas" },
      ],
    });
    const context = await builder.build({ id: "u1" });
    assert.equal(context.personal.unpaidFine, 0);
  });
});
