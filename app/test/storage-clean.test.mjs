// "Free up space" (storage.js): how HyperFrames' `clean` answer is read, and that looking never deletes. `clean` is not
// exported and runs the real CLI, so the file is loaded in a vm with a stand-in for `runCli`, as agent-context.test.mjs
// does for the runner.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

function load(t, answer, files = fs) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin clean é "));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const calls = [];
  const source = fs.readFileSync(new URL("../src/main/storage.js", import.meta.url), "utf8")
    .replace(/^import .+;\r?$/gm, "").replace(/^export (async )?(function|const)/gm, "$1$2");
  const api = vm.runInNewContext(`${source}\n({ storageStatus, freeUpSpace, historyRoot, sizeText });`, {
    fs: files, path, os: { ...os, homedir: () => home, tmpdir: () => os.tmpdir() },
    runCli: async (args, options) => {
      calls.push({ args, options, existed: fs.existsSync(args[1]) });
      return typeof answer === "function" ? answer(args, options) : answer;
    },
  });
  return { api, calls, home };
}

const report = (extra = {}) => JSON.stringify({ dryRun: true, removed: [], alsoReclaimable: [], errors: [], totalBytes: 0,
  ...extra }, null, 2);

test("looking at what could be freed never deletes, and freeing never asks for a dry run", async (t) => {
  const { api, calls } = load(t, { code: 0, stdout: report({ totalBytes: 2048 }) });
  const status = await api.storageStatus();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args.includes("--dry-run"), "the status only looks");
  assert.equal(status.freeableBytes, 2048);
  assert.equal(status.freeable, "2.0 KB");
  const freed = await api.freeUpSpace();
  assert.equal(calls.length, 2);
  assert.ok(!calls[1].args.includes("--dry-run"), "freeing really cleans");
  assert.deepEqual([...calls[1].args].slice(0, 1), ["clean"]);
  assert.equal(freed.freedBytes, 2048);
});

test("clean runs in a folder of its own that is empty, and that folder is gone afterwards", async (t) => {
  const { api, calls } = load(t, { code: 0, stdout: report() });
  await api.freeUpSpace();
  const [call] = calls;
  const folder = call.args[1];
  assert.equal(call.existed, true);
  assert.equal(call.options.cwd, folder);
  assert.equal(path.dirname(folder), os.tmpdir());
  assert.match(path.basename(folder), /^kushmanji-clean-/);
  assert.equal(fs.existsSync(folder), false);
});

test("a folder Windows will not let go of yet does not cost the answer, and is tried again later", async (t) => {
  // The real Windows error, seen on the owner's computer: the program has ended but the folder is still held.
  const retried = [];
  const held = {
    ...fs,
    rmSync(target, options) {
      if (String(target).includes("kushmanji-clean-")) throw Object.assign(new Error("EPERM: operation not permitted, rm"), { code: "EPERM" });
      return fs.rmSync(target, options);
    },
    rm(target, options, done) { retried.push([target, options]); fs.rm(target, options, done); },
  };
  const { api } = load(t, { code: 0, stdout: report({ totalBytes: 4096 }) }, held);
  const status = await api.storageStatus();
  assert.equal(status.freeableBytes, 4096, "the number is still given");
  assert.equal(retried.length, 1, "removing the folder is tried again in the background");
  assert.ok(retried[0][1].maxRetries >= 1);
});

test("a banner before the answer and an exit code of 1 (some folders could not be cleaned) still give the bytes", async (t) => {
  const stdout = `npm warn config something\n${report({ errors: ["EBUSY: resource busy"], totalBytes: 5_000_000 })}`;
  const { api } = load(t, { code: 1, stdout });
  assert.equal((await api.freeUpSpace()).freedBytes, 5_000_000);
});

test("an answer that is not readable counts as nothing freed, and does not throw", async (t) => {
  for (const stdout of ["", "no json here", "{ broken", undefined]) {
    const { api } = load(t, { code: 1, stdout });
    assert.equal((await api.freeUpSpace()).freedBytes, 0);
    assert.equal((await api.freeUpSpace()).freed, "0 bytes");
  }
});

test("the answer's total may arrive as text, and nonsense counts as nothing", async (t) => {
  assert.equal((await load(t, { stdout: report({ totalBytes: "1048576" }) }).api.freeUpSpace()).freed, "1.0 MB");
  assert.equal((await load(t, { stdout: report({ totalBytes: "lots" }) }).api.freeUpSpace()).freedBytes, 0);
});

test("the history size counts what HyperFrames keeps in the home folder", async (t) => {
  const { api, home } = load(t, { stdout: report() });
  const history = path.join(home, ".cache", "hyperframes", "history", "abc");
  fs.mkdirSync(history, { recursive: true });
  fs.writeFileSync(path.join(history, "log.jsonl"), Buffer.alloc(4096));
  assert.equal(api.historyRoot(), path.join(home, ".cache", "hyperframes", "history"));
  const status = await api.storageStatus();
  assert.equal(status.historyBytes, 4096);
  assert.equal(status.history, "4.0 KB");
});

test("the scratch folder is removed even when the CLI could not be run", async (t) => {
  let folder;
  const { api } = load(t, (args) => {
    folder = args[1];
    throw new Error("spawn failed");
  });
  assert.equal((await api.freeUpSpace()).freedBytes, 0);
  assert.equal(fs.existsSync(folder), false);
});
