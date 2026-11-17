class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = new.target.name;
    this.statusCode = options.statusCode || 500;
    this.code = options.code || "APP_ERROR";
    this.details = options.details || null;
    this.isOperational = true;
    if (options.cause) this.cause = options.cause;
    Error.captureStackTrace(this, new.target);
  }
}

class ValidationError extends AppError {
  constructor(message = "Data permintaan tidak valid.", details = null) {
    super(message, { statusCode: 400, code: "VALIDATION_ERROR", details });
  }
}

class ConfigurationError extends AppError {
  constructor(message = "Konfigurasi layanan belum lengkap.", details = null) {
    super(message, { statusCode: 503, code: "CONFIGURATION_ERROR", details });
  }
}

class ProviderError extends AppError {
  constructor(message = "Layanan AI gagal merespons.", details = null, cause = null) {
    super(message, { statusCode: 502, code: "PROVIDER_ERROR", details, cause });
  }
}

class NotFoundError extends AppError {
  constructor(message = "Data tidak ditemukan.") {
    super(message, { statusCode: 404, code: "NOT_FOUND" });
  }
}

module.exports = {
  AppError,
  ValidationError,
  ConfigurationError,
  ProviderError,
  NotFoundError,
};
