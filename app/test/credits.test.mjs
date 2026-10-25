// "Copy credits" after saving: only the files that need credit, as one line each (M8-12).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { creditsNeeded } from "../src/main/credits.js";

test("only files free with credit are listed, each as one line with its page", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kushmanji credits "));
  try {
    assert.deepEqual(creditsNeeded(dir), []);
    fs.mkdirSync(path.join(dir, "assets", "free-media"), { recursive: true });
    fs.writeFileSync(path.join(dir, "assets", "free-media", "ledger.json"), JSON.stringify([
      { license: "cc0", title: "Whoosh", creator: "A", page: "https://freesound.org/x" },
      { license: "by", attribution: "\"Sunset\" by B is licensed\nunder CC BY 2.0.", page: "https://flickr.com/y" },
      { license: "by", title: "Hills", creator: "C", page: "javascript:alert(1)" },
    ]));
    assert.deepEqual(creditsNeeded(dir), [
      "\"Sunset\" by B is licensed under CC BY 2.0. https://flickr.com/y",
      "\"Hills\" by C",
    ]);
    fs.writeFileSync(path.join(dir, "assets", "free-media", "ledger.json"), "not json");
    assert.deepEqual(creditsNeeded(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
