-- Migration: 2026111500001_ai_provider_enum
-- Deskripsi: Mengganti daftar provider AI dari (openai, anthropic, gemini)
--            menjadi (gemini, grok, nvidia) pada tabel system_settings.
-- Catatan: statement ALTER di bawah aman untuk database yang sudah terisi,
--          karena nilai provider lama dinormalisasi ke 'gemini' lebih dulu.

UPDATE system_settings
SET ai_provider = 'gemini'
WHERE ai_provider IS NULL OR ai_provider NOT IN ('gemini', 'grok', 'nvidia');

ALTER TABLE system_settings
  MODIFY COLUMN ai_provider ENUM('gemini','grok','nvidia') NOT NULL DEFAULT 'gemini';
