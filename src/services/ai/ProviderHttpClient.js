const { ProviderError } = require("../../errors/AppError");

const DEFAULT_TIMEOUT_MS = 60000;

function parseJsonSafely(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

function extractApiError(input) {
  const data = typeof input === "string" ? parseJsonSafely(input) : input;

  if (data && data.error) {
    if (typeof data.error === "string") return data.error;
    if (data.error.message) return data.error.message;
  }

  if (data && (data.message || data.detail || data.reason)) {
    return data.message || data.detail || data.reason;
  }

  if (typeof input === "string" && input.trim()) return input.slice(0, 300);
  return "Kesalahan tidak diketahui.";
}

function normalizeRequestError(error, timeoutMs) {
  if (error instanceof ProviderError) return error;

  if (error && error.name === "AbortError") {
    return new ProviderError(
      `Permintaan AI dibatalkan atau melebihi batas waktu (${timeoutMs}ms).`,
      null,
      error
    );
  }

  return new ProviderError(
    `Kegagalan memanggil AI: ${(error && error.message) || "tidak diketahui"}.`,
    null,
    error
  );
}

function attachAbortSignal(controller, signal) {
  if (!signal) return () => {};
  const forwardAbort = () => controller.abort();

  if (signal.aborted) {
    controller.abort();
  } else {
    signal.addEventListener("abort", forwardAbort, { once: true });
  }

  return () => signal.removeEventListener("abort", forwardAbort);
}

async function requestJson(method, url, options = {}) {
  const { headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const detachAbort = attachAbortSignal(controller, signal);

  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    return { status: response.status, ok: response.ok, raw, data: parseJsonSafely(raw) };
  } catch (error) {
    throw normalizeRequestError(error, timeoutMs);
  } finally {
    clearTimeout(timer);
    detachAbort();
  }
}

function parseSseBlock(block) {
  let event = "message";
  const dataLines = [];

  block.split(/\r?\n/).forEach((line) => {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  });

  if (!dataLines.length) return null;
  return { event, data: dataLines.join("\n") };
}

function extractSseEvents(buffer) {
  const events = [];
  let boundary = buffer.indexOf("\n\n");

  while (boundary !== -1) {
    const block = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    const event = parseSseBlock(block);
    if (event) events.push(event);
    boundary = buffer.indexOf("\n\n");
  }

  return { events, rest: buffer };
}

async function* readSseEvents(response) {
  if (!response.body) throw new ProviderError("Respons streaming tidak tersedia.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const extracted = extractSseEvents(buffer.replace(/\r\n/g, "\n"));
      buffer = extracted.rest;
      for (const event of extracted.events) yield event;
    }

    buffer += decoder.decode();
    const extracted = extractSseEvents(`${buffer.replace(/\r\n/g, "\n")}\n\n`);
    for (const event of extracted.events) yield event;
  } finally {
    reader.releaseLock();
  }
}

async function openSseStream(options) {
  const { url, headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const detachAbort = attachAbortSignal(controller, signal);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new ProviderError(`HTTP ${response.status}: ${extractApiError(raw)}`);
    }

    return {
      events: readSseEvents(response),
      cleanup: () => {
        clearTimeout(timer);
        detachAbort();
      },
    };
  } catch (error) {
    clearTimeout(timer);
    detachAbort();
    throw normalizeRequestError(error, timeoutMs);
  }
}

function normalizeModelList(list) {
  const models = [];
  const seen = new Set();

  (Array.isArray(list) ? list : []).forEach((model) => {
    const methods = model && model.supportedGenerationMethods;
    if (methods && !methods.includes("generateContent") && !methods.includes("chat")) return;

    const rawId = String((model && (model.name || model.id)) || "").replace(/^models\//, "").trim();
    if (!rawId || seen.has(rawId)) return;

    seen.add(rawId);
    models.push({ id: rawId, label: (model && (model.displayName || model.name || model.id)) || rawId });
  });

  return models.sort((first, second) => first.id.localeCompare(second.id));
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  parseJsonSafely,
  extractApiError,
  normalizeRequestError,
  requestJson,
  openSseStream,
  normalizeModelList,
};
