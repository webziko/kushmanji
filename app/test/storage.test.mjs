// "Free up space" (M16-09): counting a folder, and sizes in words.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { folderBytes, sizeText } from "../src/main/storage.js";

test("a folder's size counts every file under it", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin space é "));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "a b", "c"), { recursive: true });
  fs.writeFileSync(path.join(dir, "one.bin"), Buffer.alloc(1000));
  fs.writeFileSync(path.join(dir, "a b", "c", "two.bin"), Buffer.alloc(2500));
  assert.equal(await folderBytes(dir), 3500);
  assert.equal(await folderBytes(path.join(dir, "missing")), 0);
});

test("sizes read the way people say them", () => {
  assert.equal(sizeText(666 * 1024 ** 2), "666 MB");
  assert.equal(sizeText(1.34 * 1024 ** 3), "1.3 GB");
  assert.equal(sizeText(87 * 1024 ** 2), "87 MB");
  assert.equal(sizeText(5.2 * 1024 ** 2), "5.2 MB");
  assert.equal(sizeText(512), "512 bytes");
});
