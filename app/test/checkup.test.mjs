// "Test this assistant" (M12-03): the scratch folder, the plain answer, and remembering it per version.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { judge, makeScratch, testedOk } from "../src/main/agents/checkup.js";

test("the scratch folder holds the file to change and a check the assistant may run", (t) => {
  const dir = makeScratch("0.8.149");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(fs.readFileSync(path.join(dir, "check.txt"), "utf8").trim(), "BEFORE");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).scripts.check,
    "npx --yes hyperframes@0.8.149 check");
  assert.ok(fs.readFileSync(path.join(dir, "index.html"), "utf8").includes('data-composition-id="main"'));
});

test("the answer says plainly what worked and what did not", () => {
  assert.equal(judge("Claude", { ok: true, changedFile: true, ranCommand: true }).ok, true);
  assert.match(judge("Claude", { ok: true, changedFile: true, ranCommand: false }).said, /did not run a program/);
  assert.match(judge("Claude", { ok: true, changedFile: false }).said, /could not change a file/);
  assert.match(judge("Gemini", { ok: false, limited: true }).said, /used up its allowance/);
  assert.match(judge("ChatGPT", { ok: false, error: "not signed in" }).said, /did not finish the test: not signed in/);
  assert.match(judge("Claude", { stopped: true }).said, /stopped/);
});

test("a version tested and found working is not asked about again; a newer one is", () => {
  const checkups = { claude: { version: "2.2.0", ok: true } };
  assert.equal(testedOk(checkups, "claude", "2.2.0"), true);
  assert.equal(testedOk(checkups, "claude", "2.3.0"), false);
  assert.equal(testedOk({ claude: { version: "2.2.0", ok: false } }, "claude", "2.2.0"), false);
  assert.equal(testedOk(undefined, "codex", "1.0.0"), false);
});
