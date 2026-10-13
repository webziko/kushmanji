// Saving a video: what the file is called, and reading how far the work is.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { exportName, freeFile, progressFrom } from "../src/main/exporter.js";

const when = new Date(2026, 9, 14, 3, 5);

test("a saved video is named after the project and the time", () => {
  assert.equal(exportName("city-centre-vlog", when), "city-centre-vlog 2026-10-14 03.05");
  assert.equal(exportName("José Müller ನಮಸ್ಕಾರ", when), "José Müller ನಮಸ್ಕಾರ 2026-10-14 03.05");
});

test("nothing Windows refuses in a file name gets through, and an empty or reserved name becomes Video", () => {
  assert.equal(exportName('a<b>c:d"e/f\\g|h?i*j', when), "a b c d e f g h i j 2026-10-14 03.05");
  assert.equal(exportName("trailing dots...  ", when), "trailing dots 2026-10-14 03.05");
  assert.equal(exportName("", when), "Video 2026-10-14 03.05");
  assert.equal(exportName("CON", when), "Video 2026-10-14 03.05");
  assert.equal(exportName("..", when), "Video 2026-10-14 03.05");
  assert.ok(exportName("x".repeat(300), when).length < 110);
});

test("a second save in the same minute does not overwrite the first", () => {
  const taken = new Set([path.join("D", "v.mp4"), path.join("D", "v (2).mp4")]);
  assert.equal(freeFile("D", "v", (file) => taken.has(file)), path.join("D", "v (3).mp4"));
  assert.equal(freeFile("D", "w", () => false), path.join("D", "w.mp4"));
});

test("progress is read from the command's own lines and never trusted beyond 0 to 100", () => {
  assert.equal(progressFrom('@hf-progress {"stage":"capture","pct":37}'), 37);
  assert.equal(progressFrom('@hf-progress {"pct":250}'), 100);
  assert.equal(progressFrom("@hf-progress {broken"), null);
  assert.equal(progressFrom("  ████░░░░  12%  Capturing frames"), 12);
  assert.equal(progressFrom("Rendering city-centre-vlog"), null);
  assert.equal(progressFrom("zoom 400% is not progress"), null);
});
