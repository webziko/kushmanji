// The app's own check after a reply that changed the video (M10-03).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkTurn, summarise } from "../src/main/agents/turnCheck.js";

test("mistakes are kept with where they are; notes are only counted", () => {
  const got = summarise({
    errorCount: 2, warningCount: 16,
    findings: [
      { severity: "warning", message: "Two clips overlap on track 1." },
      { severity: "error", message: "<video id=\"clip-1\"> has no muted.", file: "C:\\Videos\\Vlog\\index.html", line: 12,
        fixHint: "Add muted." },
      { severity: "error", message: "Missing file assets/a.mp4." },
    ],
  });
  assert.equal(got.errors, 2);
  assert.equal(got.warnings, 16);
  assert.deepEqual(got.mistakes[0], { text: "<video id=\"clip-1\"> has no muted.", where: "index.html, line 12", fix: "Add muted." });
  assert.equal(got.mistakes[1].where, "");
  assert.equal(got.mistakes.length, 2);
});

test("an answer that is not the check's is ignored", () => {
  assert.equal(summarise(null), null);
  assert.deepEqual(summarise({}), { errors: 0, warnings: 0, mistakes: [] });
});

test("when lint cannot run, automation check alone still reports mistakes or says nothing", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kushmanji-turn-"));
  try {
    const failingRun = async () => { throw new Error("lint executable not found"); };

    // With no automation and failing lint: returns null (say nothing).
    const emptyCheck = await checkTurn(tempDir, { run: failingRun });
    assert.equal(emptyCheck, null);

    // With broken automation and failing lint: automation check reports mistakes.
    fs.writeFileSync(
      path.join(tempDir, "index.html"),
      '<audio id="bgm" data-automation=\'{"volume":[{"t":0,"v":0}]}\'></audio>',
      "utf8"
    );
    const brokenCheck = await checkTurn(tempDir, { run: failingRun });
    assert.ok(brokenCheck);
    assert.equal(brokenCheck.errors, 1);
    assert.equal(brokenCheck.mistakes.length, 1);
    assert.equal(brokenCheck.mistakes[0].text, "A sound's fade is written in a form the video cannot be saved with.");
    assert.equal(brokenCheck.mistakes[0].where, "index.html, line 1");

    // When lint runs and succeeds with findings, automation mistakes are combined.
    const lintSuccessRun = async () => ({
      stdout: JSON.stringify({
        errorCount: 1,
        warningCount: 2,
        findings: [
          { severity: "error", message: "Missing asset.", file: path.join(tempDir, "index.html"), line: 5 },
        ],
      }),
    });
    const combined = await checkTurn(tempDir, { run: lintSuccessRun });
    assert.ok(combined);
    assert.equal(combined.errors, 2);
    assert.equal(combined.warnings, 2);
    assert.equal(combined.mistakes.length, 2);
    // What stops "Save video" comes first.
    assert.equal(combined.mistakes[0].text, "A sound's fade is written in a form the video cannot be saved with.");
    assert.equal(combined.mistakes[1].text, "Missing asset.");
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows lock cleanup fallback
    }
  }
});
