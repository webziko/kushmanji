// The editing guide every project carries for whichever assistant cuts next.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { GUIDE, GUIDE_FILE, writeGuide } from "../src/main/agents/craft.js";
import { HOUSE_PROMPT } from "../src/main/agents/house.js";

test("a project gets the guide, in its own hidden folder, and an unchanged guide is not rewritten", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin guide é "));
  try {
    writeGuide(dir);
    const file = path.join(dir, GUIDE_FILE);
    assert.equal(fs.readFileSync(file, "utf8"), GUIDE);
    const before = fs.statSync(file).mtimeMs;
    writeGuide(dir);
    assert.equal(fs.statSync(file).mtimeMs, before);
    // An old guide left by an earlier version of the app is replaced.
    fs.writeFileSync(file, "old advice");
    writeGuide(dir);
    assert.equal(fs.readFileSync(file, "utf8"), GUIDE);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a folder that cannot be written to does not stop the project opening", () => {
  assert.doesNotThrow(() => writeGuide(path.join(os.tmpdir(), "hfwin-no-such-drive", "\0bad")));
});

test("every assistant is told where the guide is, by the same path the app writes", () => {
  assert.ok(HOUSE_PROMPT.includes(GUIDE_FILE.split(path.sep).join("/")));
});

test("the guide covers what went wrong on the first real video", () => {
  for (const lesson of [/two takes of the same lines/, /cross-fade/, /click or a hole of silence/, /moves everything after it/]) {
    assert.match(GUIDE, lesson);
  }
});
