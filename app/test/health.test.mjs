// The first-run health check (M5-04): only what matters to a person, in plain words, with its fix.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readDoctor } from "../src/main/health.js";

const check = (name, ok, detail = "") => ({ name, ok, detail });

test("a computer with everything needed is ready, and developers' lines are left out", () => {
  const got = readDoctor({ checks: [check("FFmpeg", true), check("Chrome", true), check("Docker running", false),
    check("Version", false, "0.8.149 → 0.8.155"), check("Disk", true, "120.4 GB free"), check("Memory", true, "16 GB total")] });
  assert.deepEqual(got, { ready: true, items: [], checked: true });
});

test("missing FFmpeg is said plainly with the command, and the browser can be fetched by the app", () => {
  const got = readDoctor({ checks: [check("FFmpeg", false), check("Chrome", false)] });
  assert.equal(got.ready, false);
  assert.match(got.items[0].said, /FFmpeg to save your videos/);
  assert.equal(got.items[0].fix, "winget install --id Gyan.FFmpeg -e");
  assert.equal(got.items[1].get, true);
  assert.equal(got.items[1].fix, null);
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
