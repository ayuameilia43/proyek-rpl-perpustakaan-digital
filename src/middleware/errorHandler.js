function wantsJsonResponse(req) {
  const acceptHeader = String(req.headers.accept || "");
  const sendsJsonBody = Boolean(req.is && req.is("application/json"));
  return req.path.startsWith("/api/") || req.xhr || sendsJsonBody || acceptHeader.includes("application/json");
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const statusCode = Number(error.statusCode) || 500;
  const isServerError = statusCode >= 500;

  if (isServerError) {
    console.error("Server error:", error);
  }

  if (wantsJsonResponse(req)) {
    return res.status(statusCode).json({
      ok: false,
      error: isServerError ? "Terjadi kesalahan pada server." : error.message,
      code: error.code || "INTERNAL_ERROR",
    });
  }

  if (statusCode === 404) {
    return res.status(404).render("errors/404", { layout: "layouts/auth", title: "404 - Tidak Ditemukan" });
  }

  return res.status(statusCode).render("errors/500", { layout: "layouts/auth", title: "500 - Kesalahan Server" });
}

module.exports = { errorHandler };
