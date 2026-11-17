const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");

function modulePath(relativePath) {
  return require.resolve(path.join(ROOT, relativePath));
}

/** Replace a module in the require cache before its dependents are loaded. */
function stubModule(relativePath, exports) {
  const id = modulePath(relativePath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
  return exports;
}

function unloadModule(relativePath) {
  const id = modulePath(relativePath);
  delete require.cache[id];
}

function loadFresh(relativePath) {
  unloadModule(relativePath);
  return require(modulePath(relativePath));
}

/** Minimal mysql2 pool double with a mutable query handler. */
function createPool(initialHandler) {
  const pool = {
    calls: [],
    handler: initialHandler || (async () => [[]]),
    async query(sql, params) {
      pool.calls.push({ sql, params });
      return pool.handler(sql, params, pool.calls);
    },
  };
  return pool;
}

/** Pool double that returns queued responses in order. */
function createSequencePool(responses = []) {
  const queue = [...responses];
  return createPool(async () => {
    if (!queue.length) throw new Error("Unexpected database query");
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  });
}

function createReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    method: "GET",
    path: "/",
    originalUrl: "/",
    files: undefined,
    xhr: false,
    session: {},
    is() {
      return false;
    },
    ...overrides,
  };
}

function createRes(overrides = {}) {
  const res = {
    statusCode: 200,
    locals: {},
    headers: {},
    rendered: null,
    redirected: null,
    jsonPayload: undefined,
    sent: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, data) {
      this.rendered = { view, data };
      return this;
    },
    redirect(url) {
      this.redirected = url;
      return this;
    },
    json(payload) {
      this.jsonPayload = payload;
      return this;
    },
    send(payload) {
      this.sent = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    clearCookie(name) {
      this.clearedCookie = name;
      return this;
    },
    on() {
      return this;
    },
    write() {
      return true;
    },
    end() {
      this.writableEnded = true;
    },
    ...overrides,
  };
  return res;
}

module.exports = {
  ROOT,
  modulePath,
  stubModule,
  unloadModule,
  loadFresh,
  createPool,
  createSequencePool,
  createReq,
  createRes,
};
