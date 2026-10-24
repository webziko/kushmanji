// The first-run health check (M5-04): only what matters to a person, in plain words, with its fix.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FFMPEG_ZIP } from "../src/main/ffmpegTool.js";
import { readDoctor } from "../src/main/health.js";

const check = (name, ok, detail = "") => ({ name, ok, detail });

test("a computer with everything needed is ready, and developers' lines are left out", () => {
  const got = readDoctor({ checks: [check("FFmpeg", true), check("Chrome", true), check("Docker running", false),
    check("Version", false, "0.8.149 → 0.8.155"), check("Disk", true, "120.4 GB free"), check("Memory", true, "16 GB total")] });
  assert.deepEqual(got, { ready: true, items: [], checked: true });
});

test("missing FFmpeg and the browser are said plainly, and the app can fetch both with one press", () => {
  const got = readDoctor({ checks: [check("FFprobe", false), check("FFmpeg", false), check("Chrome", false)] });
  assert.equal(got.ready, false);
  // FFprobe comes with FFmpeg: one line, whichever order doctor gives them in.
  assert.deepEqual(got.items.map((item) => item.name), ["FFmpeg", "Chrome"]);
  assert.match(got.items[0].said, /FFmpeg to save your videos/);
  assert.equal(got.items[0].get, "ffmpeg");
  assert.equal(got.items[0].fix, null);
  assert.equal(got.items[0].megabytes, Math.round(FFMPEG_ZIP.bytes / 1e6), "the button says the real size");
  assert.equal(got.items[1].get, "browser");
  assert.equal(got.items[1].fix, null);
  // FFprobe alone missing still has its line and its button.
  assert.equal(readDoctor({ checks: [check("FFmpeg", true), check("FFprobe", false)] }).items[0].get, "ffmpeg");
});

test("little disk space or memory is a note, not a blocker", () => {
  const got = readDoctor({ checks: [check("FFmpeg", true), check("Disk", true, "6.2 GB free"),
    check("Memory", true, "3.9 GB total · 1 GB available")] });
  assert.equal(got.ready, true);
  assert.match(got.items[0].said, /Only 6.2 GB/);
  assert.match(got.items[1].said, /3.9 GB of memory/);
});

test("when doctor gave nothing readable, nothing is claimed", () => {
  assert.deepEqual(readDoctor(null), { ready: true, items: [], checked: false });
});
