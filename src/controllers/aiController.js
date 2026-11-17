const { aiOrchestrator } = require("../services/ai");
const { ValidationError } = require("../errors/AppError");
const { initializeSse, sendSseEvent, startSseHeartbeat, closeSse } = require("../utils/sse");

const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 4000;
const HEARTBEAT_INTERVAL_MS = 15000;

function sanitizeMessages(input) {
  if (!Array.isArray(input)) return [];

  return input
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").slice(0, MAX_MESSAGE_LENGTH),
    }))
    .filter((message) => message.content.trim());
}

function writeStreamEvent(res, event) {
  if (!event || res.writableEnded || res.destroyed) return;

  if (event.type === "meta") {
    sendSseEvent(res, "meta", event.data || {});
  } else if (event.type === "token") {
    sendSseEvent(res, "token", { text: event.text || "" });
  } else if (event.type === "done") {
    sendSseEvent(res, "done", event.data || {});
  } else if (event.type === "error") {
    sendSseEvent(res, "error", { message: event.message || "Kesalahan AI.", fallback: Boolean(event.fallback) });
  }
}

function abortUpstreamOnDisconnect(res, controller) {
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
}

async function streamChat(req, res, next) {
  const messages = sanitizeMessages(req.body && req.body.messages);
  if (!messages.length) return next(new ValidationError("Pesan tidak boleh kosong."));

  initializeSse(res);
  const heartbeat = startSseHeartbeat(res, HEARTBEAT_INTERVAL_MS);
  const controller = new AbortController();
  abortUpstreamOnDisconnect(res, controller);

  try {
    for await (const event of aiOrchestrator.streamChat({
      user: req.session.user,
      messages,
      signal: controller.signal,
    })) {
      if (controller.signal.aborted) break;
      writeStreamEvent(res, event);
    }
  } catch (error) {
    writeStreamEvent(res, { type: "error", message: "Koneksi ke layanan AI terputus." });
  } finally {
    clearInterval(heartbeat);
    closeSse(res);
  }
}

async function chat(req, res, next) {
  const messages = sanitizeMessages(req.body && req.body.messages);
  if (!messages.length) return next(new ValidationError("Pesan tidak boleh kosong."));

  const result = await collectStreamReply(req.session.user, messages);
  return res.json(result);
}

async function collectStreamReply(user, messages) {
  let reply = "";
  let ok = false;
  let fallback = false;
  let personal = false;

  for await (const event of aiOrchestrator.streamChat({ user, messages })) {
    if (event.type === "token") reply += event.text;
    if (event.type === "meta") personal = Boolean(event.data && event.data.personal);
    if (event.type === "done") {
      ok = Boolean(event.data && event.data.ok);
      fallback = Boolean(event.data && event.data.fallback);
    }
  }

  return { reply, ok, fallback, personal };
}

async function recommend(req, res, next) {
  try {
    const result = await aiOrchestrator.recommend({ user: req.session.user });
    return res.render("ai/rekomendasi", { title: "Rekomendasi AI", ...result });
  } catch (error) {
    return next(error);
  }
}

module.exports = { recommend, chat, streamChat, sanitizeMessages };
