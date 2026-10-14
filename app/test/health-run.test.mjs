// The first-run check (health.js), the half health.test.mjs leaves out: reading what `hyperframes doctor --json` printed
// and fetching the browser. The CLI is a stand-in, as in agent-context.test.mjs, so nothing is installed or downloaded.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { readDoctor } from "../src/main/health.js";

function load(answer) {
  const calls = [];
  const source = fs.readFileSync(new URL("../src/main/health.js", import.meta.url), "utf8")
    .replace(/^import .+;\r?$/gm, "").replace(/^export (async )?(function|const)/gm, "$1$2");
  const api = vm.runInNewContext(`${source}\n({ checkHealth, getBrowser });`, {
    runCli: async (args, options) => {
      calls.push({ args, options });
      return typeof answer === "function" ? answer(args) : answer;
    },
  });
  return { api, calls };
}

const doctor = (checks) => JSON.stringify({ ok: true, checks });

test("doctor is asked for JSON, with a time limit", async () => {
  const { api, calls } = load({ code: 0, stdout: doctor([]) });
  await api.checkHealth();
  assert.deepEqual([...calls[0].args], ["doctor", "--json"]);
  assert.ok(calls[0].options.timeoutMs > 0);
});

test("a line before the JSON (a notice, a warning) does not hide the answer", async () => {
  const stdout = `Update available: 0.8.150\n${doctor([{ name: "FFmpeg", ok: false, detail: "FFmpeg is required" }])}`;
  const got = await load({ code: 1, stdout }).api.checkHealth();
  assert.equal(got.ready, false);
  assert.equal(got.items[0].name, "FFmpeg");
});

test("doctor that printed nothing, or something else, claims nothing", async () => {
  for (const stdout of ["", "Error: spawn failed", undefined, "{ not json"]) {
    const got = await load({ code: 1, stdout }).api.checkHealth();
    assert.equal(got.ready, true);
    assert.equal(got.checked, false);
    assert.equal(got.items.length, 0);
  }
});

test("the browser is fetched with `browser ensure`, and the answer is whether it worked", async () => {
  const worked = load({ code: 0, stdout: "" });
  assert.equal(await worked.api.getBrowser(), true);
  assert.deepEqual([...worked.calls[0].args], ["browser", "ensure"]);
  assert.ok(worked.calls[0].options.timeoutMs >= 600_000, "a download of about 100 MB gets time");
  assert.equal(await load({ code: 1, stdout: "" }).api.getBrowser(), false);
  assert.equal(await load({ code: -1, stdout: "" }).api.getBrowser(), false);
});

test("a disk with exactly ten gigabytes free, or a memory of exactly six, is not a note", () => {
  const got = readDoctor({ checks: [{ name: "Disk", ok: true, detail: "10 GB free at C:\\" },
    { name: "Memory", ok: true, detail: "6 GB total · 2 GB available" }] });
  assert.deepEqual(got.items, []);
});

test("a check that is not an object, or has no name, is skipped", () => {
  const got = readDoctor({ checks: [null, 5, "FFmpeg", {}, { name: "FFmpeg", ok: false }] });
  assert.deepEqual(got.items.map((item) => item.name), ["FFmpeg"]);
  assert.equal(got.checked, true);
  assert.equal(readDoctor({ checks: "none" }).checked, false);
  assert.equal(readDoctor([]).checked, false);
});

test("a figure in a unit other than GB, or none, is ignored rather than guessed", () => {
  const got = readDoctor({ checks: [{ name: "Disk", ok: true, detail: "512 MB free at C:\\" },
    { name: "Memory", ok: true, detail: "unknown" }] });
  assert.deepEqual(got.items, []);
});
