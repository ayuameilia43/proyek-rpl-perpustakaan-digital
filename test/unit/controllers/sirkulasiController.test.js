const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { stubModule, createPool, loadFresh, createReq, createRes } = require("../../helpers");

const pool = createPool();
const state = {
  settings: { max_borrow_duration: 7, fine_per_day: 1000 },
  markOverdueCalls: 0,
  calculateFineResult: 0,
  calculateFineArgs: null,
  waResult: { ok: true, message: "sent" },
  waThrow: null,
  waCalls: [],
};

stubModule("src/config/db", pool);
stubModule("src/middleware/locals", { getSettings: async () => state.settings });
stubModule("src/services/sirkulasiService", {
  markOverdue: async () => {
    state.markOverdueCalls += 1;
    return 0;
  },
  calculateFine: (...args) => {
    state.calculateFineArgs = args;
    return state.calculateFineResult;
  },
});
stubModule("src/services/WhatsappService", {
  async sendPinjam(payload) {
    state.waCalls.push({ fn: "sendPinjam", payload });
    if (state.waThrow) throw state.waThrow;
    return state.waResult;
  },
  async sendTolak(payload) {
    state.waCalls.push({ fn: "sendTolak", payload });
    if (state.waThrow) throw state.waThrow;
    return state.waResult;
  },
  async sendTerlambat(payload) {
    state.waCalls.push({ fn: "sendTerlambat", payload });
    if (state.waThrow) throw state.waThrow;
    return state.waResult;
  },
  async sendPengingat(payload) {
    state.waCalls.push({ fn: "sendPengingat", payload });
    if (state.waThrow) throw state.waThrow;
    return state.waResult;
  },
});
const controller = loadFresh("src/controllers/sirkulasiController");

beforeEach(() => {
  pool.calls.length = 0;
  state.markOverdueCalls = 0;
  state.calculateFineResult = 0;
  state.calculateFineArgs = null;
  state.waResult = { ok: true, message: "sent" };
  state.waThrow = null;
  state.waCalls = [];
  state.settings = { max_borrow_duration: 7, fine_per_day: 1000 };
  pool.handler = async () => [[]];
});

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function transaction(overrides = {}) {
  return {
    id: "t1",
    book_id: "b1",
    status: "menunggu_persetujuan",
    format: "fisik",
    stock_fisic: 2,
    total_stock_fisic: 5,
    title: "Fisika",
    whatsapp_number: "081234567890",
    full_name: "Andi",
    nisn: "11111111",
    class: "X RPL",
    due_date: dateOffset(-3),
    ...overrides,
  };
}

describe("index", () => {
  test("menandai keterlambatan lalu memuat daftar pending dan aktif", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("status = 'menunggu_persetujuan'")) return [[{ id: "p1" }]];
      if (sql.includes("IN ('dipinjam', 'terlambat')")) return [[{ id: "a1" }]];
      return [[]];
    };
    const res = createRes();
    await controller.index(createReq(), res, () => {});
    assert.equal(state.markOverdueCalls, 1);
    assert.equal(res.rendered.view, "admin/peminjaman/index");
    assert.deepEqual(res.rendered.data.pending, [{ id: "p1" }]);
    assert.deepEqual(res.rendered.data.active, [{ id: "a1" }]);
  });

  test("meneruskan error", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.index(createReq(), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("approve", () => {
  test("mengarahkan bila transaksi tidak ditemukan", async () => {
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.approve(req, res, () => {});
    assert.equal(res.redirected, "/admin/peminjaman");
    assert.match(req.session.flash.message, /tidak ditemukan/);
  });

  test("menolak transaksi yang sudah diproses", async () => {
    pool.handler = async () => [[transaction({ status: "dipinjam" })]];
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.approve(req, res, () => {});
    assert.match(req.session.flash.message, /sudah diproses/);
  });

  test("e-book tidak memerlukan approval stok", async () => {
    pool.handler = async (sql) => {
      if (sql.includes("SELECT t.*")) return [[transaction({ format: "e-book" })]];
      return [{}];
    };
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.approve(req, res, () => {});
    assert.equal(res.redirected, "/admin/peminjaman");
    assert.match(req.session.flash.message, /e-book/);
    assert.equal(pool.calls.some((call) => call.sql.includes("UPDATE books")), false);
  });

  test("menolak approval saat stok habis", async () => {
    pool.handler = async () => [[transaction({ stock_fisic: 0 })]];
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.approve(req, res, () => {});
    assert.match(req.session.flash.message, /Stok buku habis/);
  });

  test("menyetujui peminjaman, mengurangi stok, dan mengirim WhatsApp", async () => {
    let dueDateParam;
    pool.handler = async (sql, params) => {
      if (sql.includes("SELECT t.*")) return [[transaction()]];
      if (sql.includes("UPDATE transactions")) {
        dueDateParam = params[0];
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    };
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.approve(req, res, () => {});

    assert.equal(state.markOverdueCalls, 1);
    assert.equal(state.waCalls.length, 1);
    assert.equal(state.waCalls[0].fn, "sendPinjam");
    assert.equal(state.waCalls[0].payload.judul, "Fisika");
    assert.equal(state.waCalls[0].payload.batas_tanggal, dueDateParam);
    assert.ok(pool.calls.some((call) => call.sql.includes("stock_fisic = stock_fisic - 1")));
    assert.equal(res.redirected, "/admin/peminjaman");
    assert.match(req.session.flash.message, /Notifikasi WhatsApp terkirim/);
  });

  test("tetap menyetujui saat WhatsApp gagal", async () => {
    state.waResult = { ok: false, message: "token kosong" };
    pool.handler = async (sql) => {
      if (sql.includes("SELECT t.*")) return [[transaction()]];
      return [{ affectedRows: 1 }];
    };
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.approve(req, res, () => {});
    assert.match(req.session.flash.message, /disetujui/);
    assert.match(req.session.flash.message, /token kosong/);
  });

  test("tetap menyetujui saat WhatsApp melempar error", async () => {
    state.waThrow = new Error("network");
    pool.handler = async (sql) => {
      if (sql.includes("SELECT t.*")) return [[transaction()]];
      return [{ affectedRows: 1 }];
    };
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.approve(req, res, () => {});
    assert.match(req.session.flash.message, /network/);
  });

  test("meneruskan error database", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.approve(createReq({ body: { transaction_id: "t1" } }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("reject", () => {
  test("menolak pengajuan dan mengirim alasan", async () => {
    let updateParams;
    pool.handler = async (sql, params) => {
      if (sql.includes("SELECT t.*")) return [[transaction()]];
      if (sql.includes("UPDATE transactions")) {
        updateParams = params;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    };
    const req = createReq({ body: { transaction_id: "t1", reason: "Stok habis" } });
    const res = createRes();
    await controller.reject(req, res, () => {});

    assert.deepEqual(updateParams, ["Stok habis", "t1"]);
    assert.equal(state.waCalls[0].fn, "sendTolak");
    assert.equal(state.waCalls[0].payload.alasan, "Stok habis");
    assert.match(req.session.flash.message, /ditolak/);
  });

  test("memakai alasan default bila kosong", async () => {
    let updateParams;
    pool.handler = async (sql, params) => {
      if (sql.includes("SELECT t.*")) return [[transaction()]];
      if (sql.includes("UPDATE transactions")) {
        updateParams = params;
      }
      return [[]];
    };
    await controller.reject(createReq({ body: { transaction_id: "t1" } }), createRes(), () => {});
    assert.equal(updateParams[0], "Tidak disetujui admin.");
  });

  test("menangani transaksi tidak ditemukan tanpa WhatsApp", async () => {
    pool.handler = async () => [[]];
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.reject(req, res, () => {});
    assert.equal(state.waCalls.length, 0);
    assert.match(req.session.flash.message, /tidak terkirim/);
  });

  test("menangani kegagalan WhatsApp", async () => {
    state.waResult = { ok: false, message: "gagal" };
    pool.handler = async (sql) => {
      if (sql.includes("SELECT t.*")) return [[transaction()]];
      return [[]];
    };
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.reject(req, res, () => {});
    assert.match(req.session.flash.message, /gagal/);
  });

  test("meneruskan error database", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.reject(createReq({ body: { transaction_id: "t1" } }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("returnBook", () => {
  test("mengarahkan bila transaksi tidak ditemukan", async () => {
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.returnBook(req, res, () => {});
    assert.match(req.session.flash.message, /tidak ditemukan/);
  });

  test("menolak pengembalian transaksi ditolak", async () => {
    pool.handler = async () => [[transaction({ status: "ditolak" })]];
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.returnBook(req, res, () => {});
    assert.match(req.session.flash.message, /Tidak dapat mengembalikan/);
  });

  test("mengembalikan tepat waktu tanpa denda dan menambah stok", async () => {
    state.calculateFineResult = 0;
    let updateParams;
    pool.handler = async (sql, params) => {
      if (sql.includes("SELECT t.*")) return [[transaction({ due_date: dateOffset(2) })]];
      if (sql.includes("UPDATE transactions")) {
        updateParams = params;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    };
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.returnBook(req, res, () => {});

    assert.equal(updateParams[1], 0);
    assert.equal(updateParams[2], "lunas");
    assert.ok(pool.calls.some((call) => call.sql.includes("stock_fisic = stock_fisic + 1")));
    assert.match(req.session.flash.message, /Rp 0/);
  });

  test("mengembalikan terlambat dengan denda belum lunas", async () => {
    state.calculateFineResult = 5000;
    let updateParams;
    pool.handler = async (sql, params) => {
      if (sql.includes("SELECT t.*")) return [[transaction({ due_date: dateOffset(-5) })]];
      if (sql.includes("UPDATE transactions")) {
        updateParams = params;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    };
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.returnBook(req, res, () => {});

    assert.equal(updateParams[1], 5000);
    assert.equal(updateParams[2], "belum_lunas");
    assert.match(req.session.flash.message, /Rp 5.000/);
    assert.deepEqual(state.calculateFineArgs.slice(2), [1000]);
  });

  test("meneruskan error database", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.returnBook(createReq({ body: { transaction_id: "t1" } }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("verifyFine", () => {
  test("mengarahkan bila transaksi tidak ditemukan", async () => {
    const req = createReq({ params: { id: "t1" } });
    const res = createRes();
    await controller.verifyFine(req, res, () => {});
    assert.match(req.session.flash.message, /tidak ditemukan/);
  });

  test("memverifikasi pelunasan denda", async () => {
    pool.handler = async (sql) => {
      if (sql.startsWith("SELECT id")) return [[{ id: "t1" }]];
      return [{ affectedRows: 1 }];
    };
    const req = createReq({ params: { id: "t1" } });
    const res = createRes();
    await controller.verifyFine(req, res, () => {});
    assert.ok(pool.calls.some((call) => call.sql.includes("fine_paid_status='lunas'")));
    assert.match(req.session.flash.message, /telah diverifikasi/);
  });

  test("meneruskan error database", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.verifyFine(createReq({ params: { id: "t1" } }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("remind", () => {
  test("mengarahkan bila transaksi tidak ditemukan", async () => {
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.remind(req, res, () => {});
    assert.match(req.session.flash.message, /tidak ditemukan/);
  });

  test("menolak pengingat untuk status nonaktif", async () => {
    pool.handler = async () => [[transaction({ status: "dikembalikan" })]];
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.remind(req, res, () => {});
    assert.match(req.session.flash.message, /hanya untuk peminjaman aktif/);
  });

  test("mengirim pengingat terlambat dengan hari dan denda", async () => {
    pool.handler = async () => [[transaction({ status: "terlambat", due_date: dateOffset(-5) })]];
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.remind(req, res, () => {});
    assert.equal(state.waCalls[0].fn, "sendTerlambat");
    assert.equal(state.waCalls[0].payload.hari_terlambat, 5);
    assert.equal(state.waCalls[0].payload.denda, "5.000");
    assert.match(req.session.flash.message, /Pengingat WhatsApp terkirim/);
  });

  test("mengirim pengingat jatuh tempo untuk status dipinjam", async () => {
    pool.handler = async () => [[transaction({ status: "dipinjam", due_date: dateOffset(2) })]];
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.remind(req, res, () => {});
    assert.equal(state.waCalls[0].fn, "sendPengingat");
    assert.equal(state.waCalls[0].payload.batas_tanggal, dateOffset(2));
  });

  test("menampilkan peringatan saat pengiriman gagal", async () => {
    state.waResult = { ok: false, message: "gateway down" };
    pool.handler = async () => [[transaction({ status: "dipinjam" })]];
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.remind(req, res, () => {});
    assert.match(req.session.flash.message, /gateway down/);
  });

  test("menangani exception WhatsApp", async () => {
    state.waThrow = new Error("timeout");
    pool.handler = async () => [[transaction({ status: "dipinjam" })]];
    const req = createReq({ body: { transaction_id: "t1" } });
    const res = createRes();
    await controller.remind(req, res, () => {});
    assert.match(req.session.flash.message, /timeout/);
  });

  test("meneruskan error database", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.remind(createReq({ body: { transaction_id: "t1" } }), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});
