// The app's own check after a reply that changed the video (M10-03).
import assert from "node:assert/strict";
import { test } from "node:test";
import { summarise } from "../src/main/agents/turnCheck.js";

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
