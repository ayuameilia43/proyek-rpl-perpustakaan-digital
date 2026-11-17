process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-session-secret";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "mysql://test:test@127.0.0.1:3306/perpustakaan_test";
