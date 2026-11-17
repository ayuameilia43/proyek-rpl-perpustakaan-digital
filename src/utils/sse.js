function initializeSse(res) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}

function sendSseEvent(res, eventName, payload) {
  if (res.writableEnded || res.destroyed) return false;
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
  return true;
}

function sendSseHeartbeat(res) {
  if (!res.writableEnded && !res.destroyed) res.write(": ping\n\n");
}

function startSseHeartbeat(res, intervalMs = 15000) {
  return setInterval(() => sendSseHeartbeat(res), intervalMs);
}

function closeSse(res) {
  if (!res.writableEnded && !res.destroyed) res.end();
}

module.exports = {
  initializeSse,
  sendSseEvent,
  sendSseHeartbeat,
  startSseHeartbeat,
  closeSse,
};
