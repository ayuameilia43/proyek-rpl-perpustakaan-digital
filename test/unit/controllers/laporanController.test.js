const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { stubModule, createPool, loadFresh, createReq, createRes } = require("../../helpers");

const pool = createPool();
stubModule("src/config/db", pool);
const controller = loadFresh("src/controllers/laporanController");

const row = {
  id: "t1",
  status: "dikembalikan",
  borrow_date: "2026-01-01",
  due_date: "2026-01-08",
  return_date: "2026-01-10",
  fine_amount: 2000,
  fine_paid_status: "belum_lunas",
  title: "Fisika",
  format: "fisik",
  stock_fisic: 2,
  total_stock_fisic: 5,
  full_name: "Andi",
  nisn: "11111111",
  class: "X RPL",
};

beforeEach(() => {
  pool.calls.length = 0;
  pool.handler = async (sql) => {
    if (sql.includes("COUNT(*) AS total")) return [[{ total: 1, fines: 2000 }]];
    return [[row]];
  };
});

describe("index", () => {
  test("menampilkan laporan tanpa filter", async () => {
    const res = createRes();
    await controller.index(createReq({ query: {} }), res, () => {});
    assert.equal(res.rendered.view, "admin/laporan/index");
    assert.equal(res.rendered.data.total, 1);
    assert.equal(res.rendered.data.fines, 2000);
    assert.equal(res.rendered.data.from, "");
    assert.equal(res.rendered.data.to, "");
    assert.match(pool.calls[0].sql, /WHERE 1=1/);
  });

  test("menerapkan filter tanggal pada query dan ringkasan", async () => {
    const req = createReq({ query: { from: "2026-01-01", to: "2026-01-31" } });
    const res = createRes();
    await controller.index(req, res, () => {});
    assert.match(pool.calls[0].sql, /DATE\(t.created_at\) >= \?/);
    assert.match(pool.calls[0].sql, /DATE\(t.created_at\) <= \?/);
    assert.deepEqual(pool.calls[0].params, ["2026-01-01", "2026-01-31"]);
    assert.deepEqual(pool.calls[1].params, ["2026-01-01", "2026-01-31"]);
    assert.equal(res.rendered.data.from, "2026-01-01");
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

describe("exportCsv", () => {
  test("mengirim CSV dengan header dan baris data", async () => {
    const res = createRes();
    await controller.exportCsv(createReq({ query: {} }), res, () => {});
    assert.equal(res.headers["content-type"], "text/csv; charset=utf-8");
    assert.match(res.headers["content-disposition"], /laporan-sirkulasi\.csv/);
    const lines = res.sent.split("\n");
    assert.equal(
      lines[0],
      "id,status,borrow_date,due_date,return_date,fine_amount,fine_paid_status,title,format,stock_fisic,total_stock_fisic,full_name,nisn,class"
    );
    assert.match(lines[1], /^t1,/);
    assert.match(lines[1], /Fisika/);
  });

  test("meng-escape nilai yang mengandung koma dan tanda kutip", async () => {
    pool.handler = async () => [
      [{ ...row, title: 'Buku, "Spesial"', full_name: "Andi\nSaputra" }],
    ];
    const res = createRes();
    await controller.exportCsv(createReq({ query: {} }), res, () => {});
    assert.match(res.sent, /"Buku, ""Spesial"""/);
    assert.match(res.sent, /"Andi\nSaputra"/);
  });

  test("menghasilkan header saja saat data kosong", async () => {
    pool.handler = async () => [[]];
    const res = createRes();
    await controller.exportCsv(createReq({ query: {} }), res, () => {});
    assert.equal(res.sent.split("\n").length, 1);
  });

  test("menerapkan filter dan limit 2000", async () => {
    await controller.exportCsv(createReq({ query: { from: "2026-01-01" } }), createRes(), () => {});
    assert.match(pool.calls[0].sql, /LIMIT 2000/);
    assert.deepEqual(pool.calls[0].params, ["2026-01-01"]);
  });

  test("meneruskan error", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.exportCsv(createReq(), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});

describe("print", () => {
  test("merender tampilan cetak dengan filter", async () => {
    const res = createRes();
    await controller.print(
      createReq({ query: { from: "2026-01-01", to: "2026-01-31" } }),
      res,
      () => {}
    );
    assert.equal(res.rendered.view, "admin/laporan/print");
    assert.equal(res.rendered.data.rows.length, 1);
    assert.match(pool.calls[0].sql, /LIMIT 500/);
  });

  test("meneruskan error", async () => {
    pool.handler = async () => {
      throw new Error("db down");
    };
    let received;
    await controller.print(createReq(), createRes(), (error) => {
      received = error;
    });
    assert.equal(received.message, "db down");
  });
});
