const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const PersonalReplyBuilder = require("../../../src/services/ai/PersonalReplyBuilder");
const SystemPromptBuilder = require("../../../src/services/ai/SystemPromptBuilder");

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function personalFixture(overrides = {}) {
  const active = overrides.active || [];
  const pending = overrides.pending || [];
  const returned = overrides.returned || [];
  const rejected = overrides.rejected || [];
  const transactions = overrides.transactions || [...active, ...pending, ...returned, ...rejected];
  return {
    profile: {
      full_name: "Andi Saputra",
      nisn: "11111111",
      class: "X RPL",
      role: "siswa",
      email: "andi@example.com",
      max_books_allowed: 3,
      ...overrides.profile,
    },
    active,
    pending,
    returned,
    rejected,
    transactions,
    unpaidFine: overrides.unpaidFine || 0,
    stats: {
      total: transactions.length,
      activeCount: active.length,
      pendingCount: pending.length,
      returnedCount: returned.length,
      rejectedCount: rejected.length,
    },
  };
}

const settings = { fine_per_day: 1000 };

describe("PersonalReplyBuilder", () => {
  const builder = new PersonalReplyBuilder();

  test("identitas menampilkan profil dan label role", () => {
    const reply = builder.build({
      intents: ["identity"],
      personal: personalFixture(),
      settings,
    });
    assert.match(reply, /Andi Saputra/);
    assert.match(reply, /11111111/);
    assert.match(reply, /Siswa/);
    assert.match(reply, /X RPL/);
    assert.match(reply, /andi@example.com/);
  });

  test("kuota menampilkan batas dan pemakaian", () => {
    const reply = builder.build({
      intents: ["quota"],
      personal: personalFixture({ active: [{ title: "A" }], pending: [{ title: "B" }] }),
      settings,
    });
    assert.match(reply, /Kuota peminjaman Anda 3 buku/);
    assert.match(reply, /1 buku sedang dipinjam/);
    assert.match(reply, /1 pengajuan menunggu/);
  });

  test("eligibility: masih ada pinjaman terlambat", () => {
    const reply = builder.build({
      intents: ["eligibility"],
      personal: personalFixture({
        active: [{ title: "Fisika", status: "terlambat", due_date: dateOffset(-3) }],
        unpaidFine: 3000,
      }),
      settings,
    });
    assert.match(reply, /belum bisa meminjam/);
    assert.match(reply, /Fisika/);
    assert.match(reply, /denda belum lunas/);
  });

  test("eligibility: kuota penuh", () => {
    const reply = builder.build({
      intents: ["eligibility"],
      personal: personalFixture({
        active: [
          { title: "A", status: "dipinjam", due_date: dateOffset(2) },
          { title: "B", status: "dipinjam", due_date: dateOffset(2) },
          { title: "C", status: "dipinjam", due_date: dateOffset(2) },
        ],
      }),
      settings,
    });
    assert.match(reply, /kuota 3 buku sudah penuh/);
  });

  test("eligibility: masih tersedia", () => {
    const reply = builder.build({
      intents: ["eligibility"],
      personal: personalFixture({ active: [{ title: "A", due_date: dateOffset(2) }] }),
      settings,
    });
    assert.match(reply, /Sisa kuota Anda 2 dari 3 buku/);
  });

  test("active kosong dan berisi", () => {
    assert.match(
      builder.build({ intents: ["active"], personal: personalFixture(), settings }),
      /tidak sedang meminjam/
    );
    const reply = builder.build({
      intents: ["active"],
      personal: personalFixture({
        active: [
          { title: "Fisika", author: "Ani", format: "fisik", due_date: dateOffset(2) },
          { title: "Ebook", author: "Budi", format: "e-book", due_date: dateOffset(-2) },
        ],
      }),
      settings,
    });
    assert.match(reply, /Fisika/);
    assert.match(reply, /2 hari lagi/);
    assert.match(reply, /E-Book/);
    assert.match(reply, /terlambat 2 hari/);
    assert.match(reply, /denda Rp 2.000/);
  });

  test("jatuh tempo hari ini", () => {
    const reply = builder.build({
      intents: ["active"],
      personal: personalFixture({
        active: [{ title: "A", author: "B", format: "fisik", due_date: dateOffset(0) }],
      }),
      settings,
    });
    assert.match(reply, /jatuh tempo hari ini/);
  });

  test("pending, returned, dan history", () => {
    const personal = personalFixture({
      pending: [{ title: "Buku A", borrow_date: "2026-01-01" }],
      returned: [
        { title: "Buku B", return_date: "2026-01-02", fine_amount: 0 },
        { title: "Buku C", return_date: "2026-01-03", fine_amount: 1000, fine_paid_status: "lunas" },
      ],
    });
    assert.match(builder.build({ intents: ["pending"], personal, settings }), /menunggu persetujuan/);
    assert.match(builder.build({ intents: ["returned"], personal, settings }), /Buku B/);
    const history = builder.build({ intents: ["history"], personal, settings });
    assert.match(history, /total 3 transaksi/);
    assert.match(history, /Buku C/);
    assert.match(history, /lunas/);
  });

  test("history tanpa buku kembali hanya menampilkan ringkasan", () => {
    const reply = builder.build({ intents: ["history"], personal: personalFixture(), settings });
    assert.match(reply, /total 0 transaksi/);
    assert.doesNotMatch(reply, /Buku yang sudah selesai/);
  });

  test("fines kosong dan berisi rincian", () => {
    assert.match(
      builder.build({ intents: ["fines"], personal: personalFixture(), settings }),
      /Tidak ada denda/
    );
    const personal = personalFixture({
      returned: [{ title: "Buku A", fine_amount: 1000, fine_paid_status: "belum_lunas" }],
      unpaidFine: 1000,
    });
    const reply = builder.build({ intents: ["fines"], personal, settings });
    assert.match(reply, /Total denda/);
    assert.match(reply, /Rp 1.000/);
    assert.match(reply, /belum lunas/);
  });

  test("overview menampilkan ringkasan dan pinjaman aktif", () => {
    const reply = builder.build({
      intents: ["overview"],
      personal: personalFixture({
        active: [{ title: "A", author: "B", format: "fisik", due_date: dateOffset(1) }],
      }),
      settings,
    });
    assert.match(reply, /Ringkasan akun Anda/);
    assert.match(reply, /Buku yang sedang Anda pinjam/);
  });

  test("intent kosong jatuh ke overview", () => {
    const reply = builder.build({ intents: [], personal: personalFixture(), settings });
    assert.match(reply, /Ringkasan akun Anda/);
  });
});

describe("SystemPromptBuilder", () => {
  const builder = new SystemPromptBuilder();

  test("membangun prompt lengkap tanpa data pribadi", () => {
    const prompt = builder.build({
      books: [],
      personal: null,
      settings: {},
      rules: {
        schoolName: "SMA Test",
        maxBorrowDuration: 7,
        finePerDay: 1000,
        maxBooks: 3,
        openHours: "07:00 - 21:00",
      },
    });
    assert.match(prompt, /SMA Test/);
    assert.match(prompt, /durasi pinjam 7 hari/);
    assert.match(prompt, /Rp 1.000/);
    assert.match(prompt, /Pengguna tidak terautentikasi/);
    assert.match(prompt, /Jangan pernah mengarang/);
  });

  test("menampilkan katalog fisik dan e-book", () => {
    const text = builder.buildCatalogText([
      { title: "Fisika", author: "Ani", format: "fisik", stock_fisic: 2 },
      { title: "Biologi", author: "Budi", format: "fisik", stock_fisic: 0 },
      { title: "Kimia", author: "Cici", format: "e-book", stock_ebook: 1 },
      { title: "Matematika", author: "Dodi", format: "e-book", stock_ebook: 0, synopsis: "Ringkasan" },
    ]);
    assert.match(text, /Fisika .*stok fisik 2/);
    assert.match(text, /Biologi .*stok fisik habis/);
    assert.match(text, /Kimia .*e-book tersedia/);
    assert.match(text, /Matematika .*e-book tidak tersedia.*Ringkasan/);
  });

  test("menyertakan snapshot pribadi dan instruksi administrator", () => {
    const personal = personalFixture({
      active: [{ title: "A", author: "B", format: "fisik", due_date: dateOffset(-1) }],
      pending: [{ title: "P", borrow_date: "2026-01-01" }],
      returned: [{ title: "R", return_date: "2026-01-02", fine_amount: 0 }],
      rejected: [{ title: "X", admin_notes: "Stok habis" }],
      unpaidFine: 1000,
    });
    const prompt = builder.build({
      books: [],
      personal,
      settings: { ai_system_prompt: "Gunakan sapaan formal." },
      rules: {
        schoolName: "SMA Test",
        maxBorrowDuration: 7,
        finePerDay: 1000,
        maxBooks: 3,
        openHours: "07:00 - 21:00",
      },
    });
    assert.match(prompt, /Nama: Andi Saputra/);
    assert.match(prompt, /Buku yang sedang dipinjam/);
    assert.match(prompt, /Pengajuan menunggu persetujuan/);
    assert.match(prompt, /Buku yang sudah selesai dipinjam/);
    assert.match(prompt, /Pengajuan ditolak: 1/);
    assert.match(prompt, /Stok habis/);
    assert.match(prompt, /Total denda belum lunas/);
    assert.match(prompt, /Instruksi tambahan dari administrator: Gunakan sapaan formal/);
  });

  test("membatasi daftar buku kembali dan ditolak", () => {
    const returned = Array.from({ length: 22 }, (_, index) => ({
      title: `R${index}`,
      return_date: "2026-01-02",
      fine_amount: 0,
    }));
    const rejected = Array.from({ length: 12 }, (_, index) => ({ title: `X${index}` }));
    const prompt = builder.build({
      books: [],
      personal: personalFixture({ returned, rejected }),
      settings: {},
      rules: {
        schoolName: "SMA",
        maxBorrowDuration: 7,
        finePerDay: 0,
        maxBooks: 3,
        openHours: "-",
      },
    });
    assert.match(prompt, /dan 2 buku lainnya/);
    assert.match(prompt, /Pengajuan ditolak: 12/);
  });
});
