const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const WhatsappService = require("../../../src/services/WhatsappService");

const originalFetch = globalThis.fetch;
const originalLog = console.log;
const originalWarn = console.warn;

function gatewayResponse({ ok = true, status = 200, body = '{"status":true,"reason":"sent"}' } = {}) {
  return {
    ok,
    status,
    async text() {
      return body;
    },
  };
}

beforeEach(() => {
  console.log = () => {};
  console.warn = () => {};
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  console.warn = originalWarn;
});

describe("normalizePhone", () => {
  const cases = [
    ["081234567890", "6281234567890"],
    ["0812-3456-7890", "6281234567890"],
    ["+6281234567890", "6281234567890"],
    ["6281234567890", "6281234567890"],
    [" 0811 2345 678 ", "628112345678"],
    ["", ""],
    [null, ""],
    ["abc", ""],
    ["+62 812-3456-7890", "6281234567890"],
  ];

  for (const [input, expected] of cases) {
    test(`normalisasi ${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      assert.equal(WhatsappService.normalizePhone(input), expected);
    });
  }
});

describe("renderTemplate", () => {
  test("mengganti seluruh placeholder yang dikenal", () => {
    const result = WhatsappService.renderTemplate(
      "Halo {nama} ({nisn}/{kelas}), buku {judul} terlambat {hari_terlambat} hari. Denda Rp {denda}.",
      {
        nama: "Andi",
        nisn: "11111111",
        kelas: "X RPL",
        judul: "Fisika",
        hari_terlambat: 3,
        denda: 3000,
      }
    );
    assert.equal(
      result,
      "Halo Andi (11111111/X RPL), buku Fisika terlambat 3 hari. Denda Rp 3000."
    );
  });

  test("mendukung alias field dari database", () => {
    const result = WhatsappService.renderTemplate(
      "{nama}|{judul_buku}|{batas_tanggal}|{tanggal_kembali}|{alasan}",
      {
        student_name: "Budi",
        book_title: "Matematika",
        due_date: "2026-02-01",
        return_date: "2026-02-02",
        reason: "Stok habis",
      }
    );
    assert.equal(result, "Budi|Matematika|2026-02-01|2026-02-02|Stok habis");
  });

  test("placeholder kosong atau tidak dikenal dibiarkan", () => {
    assert.equal(
      WhatsappService.renderTemplate("{nama} {judul} {tidak_ada}", { nama: "", judul: null }),
      "{nama} {judul} {tidak_ada}"
    );
  });

  test("template kosong menghasilkan string kosong", () => {
    assert.equal(WhatsappService.renderTemplate(null, { nama: "Andi" }), "");
  });
});

describe("send - validasi konfigurasi", () => {
  const message = "Halo";
  const phone = "081234567890";

  test("melewati pengiriman jika endpoint belum diisi", async () => {
    const result = await WhatsappService.send({ phone, message, settings: {} });
    assert.deepEqual(result, {
      ok: false,
      skipped: true,
      message: "Endpoint WhatsApp Gateway belum diisi (System Settings > WhatsApp Gateway).",
    });
  });

  test("melewati pengiriman jika token belum diisi", async () => {
    const result = await WhatsappService.send({
      phone,
      message,
      settings: { whatsapp_api_endpoint: "https://wa.test/send" },
    });
    assert.equal(result.skipped, true);
    assert.match(result.message, /Token WhatsApp Gateway/);
  });

  test("melewati pengiriman jika nomor kosong", async () => {
    const result = await WhatsappService.send({
      phone: "",
      message,
      settings: { whatsapp_api_endpoint: "https://wa.test/send", whatsapp_api_token: "t" },
    });
    assert.equal(result.skipped, true);
    assert.match(result.message, /Nomor WhatsApp/);
  });

  test("melewati pengiriman jika pesan kosong", async () => {
    const result = await WhatsappService.send({
      phone,
      message: "",
      settings: { whatsapp_api_endpoint: "https://wa.test/send", whatsapp_api_token: "t" },
    });
    assert.equal(result.skipped, true);
    assert.match(result.message, /Isi pesan/);
  });
});

describe("send - pemanggilan gateway", () => {
  const settings = {
    whatsapp_api_endpoint: "https://wa.test/send",
    whatsapp_api_token: "secret-token",
  };

  test("membentuk payload dan header yang benar serta menangani sukses", async () => {
    let captured;
    globalThis.fetch = async (url, options) => {
      captured = { url, options };
      return gatewayResponse();
    };

    const result = await WhatsappService.send({
      phone: "0812-3456-7890",
      message: "Pesan uji",
      settings,
    });

    assert.equal(result.ok, true);
    assert.equal(captured.url, settings.whatsapp_api_endpoint);
    assert.equal(captured.options.method, "POST");
    assert.equal(captured.options.headers.Authorization, "secret-token");
    assert.deepEqual(JSON.parse(captured.options.body), {
      target: "6281234567890",
      message: "Pesan uji",
      countryCode: "62",
    });
  });

  test("menangani HTTP error dari gateway", async () => {
    globalThis.fetch = async () =>
      gatewayResponse({ ok: false, status: 500, body: '{"reason":"server error"}' });

    const result = await WhatsappService.send({ phone: "0812", message: "x", settings });
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
    assert.match(result.message, /HTTP 500/);
    assert.match(result.message, /server error/);
  });

  test("menangani HTTP 200 dengan status false dari gateway", async () => {
    globalThis.fetch = async () =>
      gatewayResponse({ body: '{"status":false,"reason":"device disconnected"}' });

    const result = await WhatsappService.send({ phone: "0812", message: "x", settings });
    assert.equal(result.ok, false);
    assert.match(result.message, /device disconnected/);
  });

  test("menangani respons JSON invalid tanpa crash", async () => {
    globalThis.fetch = async () => gatewayResponse({ body: "bukan json" });
    const result = await WhatsappService.send({ phone: "0812", message: "x", settings });
    assert.equal(result.ok, true);
    assert.equal(result.message, "bukan json");
  });

  test("menangani kegagalan jaringan", async () => {
    globalThis.fetch = async () => {
      throw new Error("ECONNRESET");
    };
    const result = await WhatsappService.send({ phone: "0812", message: "x", settings });
    assert.equal(result.ok, false);
    assert.match(result.message, /Gagal menghubungi WhatsApp Gateway/);
    assert.match(result.message, /ECONNRESET/);
  });

  test("menangani timeout / AbortError", async () => {
    globalThis.fetch = async () => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    };
    const result = await WhatsappService.send({ phone: "0812", message: "x", settings });
    assert.equal(result.ok, false);
    assert.match(result.message, /aborted/);
  });
});

describe("template helpers", () => {
  const settings = {
    whatsapp_api_endpoint: "https://wa.test/send",
    whatsapp_api_token: "token",
  };

  test("sendPinjam memakai template kustom dan data transaksi", async () => {
    let body;
    globalThis.fetch = async (url, options) => {
      body = JSON.parse(options.body);
      return gatewayResponse();
    };

    const result = await WhatsappService.sendPinjam({
      phone: "0812",
      settings: { ...settings, whatsapp_template_pinjam: "Pinjam {judul} untuk {nama} ({kelas})" },
      nama: "Andi",
      judul: "Biologi",
      kelas: "X",
    });

    assert.equal(result.ok, true);
    assert.equal(body.message, "Pinjam Biologi untuk Andi (X)");
  });

  test("sendKembali memakai template default bila tidak dikonfigurasi", async () => {
    let body;
    globalThis.fetch = async (url, options) => {
      body = JSON.parse(options.body);
      return gatewayResponse();
    };

    await WhatsappService.sendKembali({
      phone: "0812",
      settings,
      nama: "Andi",
      judul: "Biologi",
      tanggal_kembali: "2026-02-01",
    });

    assert.match(body.message, /terima kasih telah mengembalikan buku \*Biologi\*/);
    assert.match(body.message, /2026-02-01/);
  });

  test("sendTerlambat mengisi hari terlambat dan denda", async () => {
    let body;
    globalThis.fetch = async (url, options) => {
      body = JSON.parse(options.body);
      return gatewayResponse();
    };

    await WhatsappService.sendTerlambat({
      phone: "0812",
      settings,
      nama: "Andi",
      judul: "Biologi",
      hari_terlambat: 5,
      denda: "5.000",
    });

    assert.match(body.message, /Keterlambatan: 5 hari/);
    assert.match(body.message, /Rp 5.000/);
  });
});
