const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { removeUpload, MAX_SIZE, COVERS_DIR, EBOOKS_DIR, UPLOAD_DIR, PUBLIC_DIR } = require("../../../src/middleware/upload");

const createdFiles = [];

after(() => {
  for (const file of createdFiles) {
    try {
      fs.unlinkSync(file);
    } catch (_) {}
  }
});

function createTempUpload(relativeName) {
  const file = path.join(UPLOAD_DIR, relativeName);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "test");
  createdFiles.push(file);
  return file;
}

describe("konstanta upload", () => {
  test("mengekspos batas ukuran cover dan e-book", () => {
    assert.equal(MAX_SIZE.cover_image, 2 * 1024 * 1024);
    assert.equal(MAX_SIZE.ebook_file, 10 * 1024 * 1024);
  });

  test("folder upload berada di dalam public", () => {
    assert.equal(UPLOAD_DIR, path.join(PUBLIC_DIR, "uploads"));
    assert.equal(COVERS_DIR, path.join(UPLOAD_DIR, "covers"));
    assert.equal(EBOOKS_DIR, path.join(UPLOAD_DIR, "ebooks"));
  });
});

describe("removeUpload", () => {
  test("mengabaikan path kosong atau di luar folder upload", () => {
    assert.doesNotThrow(() => removeUpload(""));
    assert.doesNotThrow(() => removeUpload(null));
    assert.doesNotThrow(() => removeUpload("/css/style.css"));
  });

  test("menolak path traversal", () => {
    const target = path.join(PUBLIC_DIR, "css", "style.css");
    const before = fs.existsSync(target);
    removeUpload("/uploads/../css/style.css");
    assert.equal(fs.existsSync(target), before);
  });

  test("menghapus file upload yang valid", async () => {
    const file = createTempUpload("covers/test-remove-upload.jpg");
    assert.equal(fs.existsSync(file), true);
    removeUpload("/uploads/covers/" + path.basename(file));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(fs.existsSync(file), false);
  });
});
