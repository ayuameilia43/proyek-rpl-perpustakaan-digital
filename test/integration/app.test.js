const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const { once } = require("node:events");
const { stubModule, createPool, loadFresh } = require("../helpers");

const pool = createPool();
stubModule("src/config/db", pool);
const { createApp } = loadFresh("src/app");

let server;
let baseUrl;
let studentHash;
let adminHash;
let loginRows = [];
let settingsRow;

function firstCookie(response) {
  const raw = response.headers.get("set-cookie") || "";
  return raw.split(";")[0];
}

function csrfFrom(html) {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  assert.ok(match, "CSRF token tidak ditemukan pada halaman");
  return match[1];
}

async function getLoginPage() {
  const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
  const html = await response.text();
  return { response, html, cookie: firstCookie(response), token: csrfFrom(html) };
}

async function postForm(path, cookie, fields) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

function userRow(overrides = {}) {
  return {
    id: "u1",
    nisn: "11111111",
    full_name: "Andi Saputra",
    role: "siswa",
    class: "X RPL",
    email: "andi@example.com",
    whatsapp_number: "081234567890",
    password_hash: studentHash,
    is_active: 1,
    ...overrides,
  };
}

before(async () => {
  studentHash = await bcrypt.hash("siswa123", 4);
  adminHash = await bcrypt.hash("admin123", 4);
  settingsRow = {
    id: "s1",
    school_name: "SMA NEGERI 1 MAJALENGKA",
    ai_provider: "gemini",
    ai_model: "gemini-2.5-flash",
    ai_temperature: 0.7,
    ai_api_key: "",
    is_chatbot_active: 1,
    fine_per_day: 1000,
    max_borrow_duration: 7,
    max_books_per_student: 3,
    operating_hours_start: "07:00:00",
    operating_hours_end: "21:00:00",
  };

  pool.handler = async (sql) => {
    if (sql.includes("FROM system_settings")) return [[settingsRow]];
    if (sql.includes("FROM users WHERE nisn = ? OR email = ?")) return [loginRows];
    if (sql.includes("FROM users")) return [[]];
    return [[]];
  };

  const app = createApp();
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    server.close();
    await once(server, "close");
  }
});

describe("Integration HTTP", () => {
  test("GET / mengarahkan tamu ke halaman login", async () => {
    const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/login");
  });

  test("GET /login menampilkan form, token CSRF, dan cookie session", async () => {
    const { response, html, cookie, token } = await getLoginPage();
    assert.equal(response.status, 200);
    assert.match(html, /Masuk ke Akun/);
    assert.match(cookie, /^connect\.sid=/);
    assert.match(token, /^[a-f0-9]{48}$/);
  });

  test("GET /dashboard tanpa login diarahkan ke /login", async () => {
    const response = await fetch(`${baseUrl}/dashboard`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/login");
  });

  test("POST /login tanpa token CSRF ditolak 403", async () => {
    const { cookie } = await getLoginPage();
    const response = await postForm("/login", cookie, {
      identifier: "11111111",
      password: "siswa123",
    });
    assert.equal(response.status, 403);
    assert.match(await response.text(), /CSRF token salah/);
  });

  test("POST /login dengan kredensial salah diarahkan kembali ke login", async () => {
    loginRows = [];
    const { cookie, token } = await getLoginPage();
    const response = await postForm("/login", cookie, {
      _csrf: token,
      identifier: "99999999",
      password: "salah",
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/login");
  });

  test("login siswa berhasil dan akses admin ditolak 403", async () => {
    loginRows = [userRow()];
    const { cookie, token } = await getLoginPage();
    const loginResponse = await postForm("/login", cookie, {
      _csrf: token,
      identifier: "11111111",
      password: "siswa123",
    });
    assert.equal(loginResponse.status, 302);
    assert.equal(loginResponse.headers.get("location"), "/dashboard");

    const forbidden = await fetch(`${baseUrl}/admin/users`, {
      redirect: "manual",
      headers: { cookie },
    });
    assert.equal(forbidden.status, 403);
    assert.match(await forbidden.text(), /Akses Ditolak/);
  });

  test("login admin dapat membuka halaman user management", async () => {
    loginRows = [
      userRow({
        id: "admin-1",
        nisn: "12345678",
        full_name: "Admin Utama",
        role: "admin",
        class: null,
        email: "admin@example.com",
        password_hash: adminHash,
      }),
    ];
    const { cookie, token } = await getLoginPage();
    const loginResponse = await postForm("/login", cookie, {
      _csrf: token,
      identifier: "12345678",
      password: "admin123",
    });
    assert.equal(loginResponse.status, 302);

    const usersPage = await fetch(`${baseUrl}/admin/users`, {
      redirect: "manual",
      headers: { cookie },
    });
    assert.equal(usersPage.status, 200);
    assert.match(await usersPage.text(), /Daftar Pengguna/);
  });

  test("logout menghancurkan session", async () => {
    loginRows = [userRow()];
    const { cookie, token } = await getLoginPage();
    await postForm("/login", cookie, {
      _csrf: token,
      identifier: "11111111",
      password: "siswa123",
    });

    const logoutResponse = await postForm("/logout", cookie, { _csrf: token });
    assert.equal(logoutResponse.status, 302);
    assert.equal(logoutResponse.headers.get("location"), "/login");

    const dashboard = await fetch(`${baseUrl}/dashboard`, {
      redirect: "manual",
      headers: { cookie },
    });
    assert.equal(dashboard.status, 302);
    assert.equal(dashboard.headers.get("location"), "/login");
  });

  test("halaman tidak dikenal menghasilkan 404", async () => {
    const response = await fetch(`${baseUrl}/halaman-tidak-ada`, { redirect: "manual" });
    assert.equal(response.status, 404);
    assert.match(await response.text(), /Halaman Tidak Ditemukan/);
  });
});
