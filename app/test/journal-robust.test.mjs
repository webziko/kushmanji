// Listing the files a turn changed (journal.js) is done at the end of every turn, outside any try block, so it must not
// throw because a file vanished or cannot be read at that moment. Windows does this: a file another program is
// deleting answers "operation not permitted" until the last handle closes.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { filesChangedSince, recordTurn } from "../src/main/agents/journal.js";

function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin journal é "));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "index.html"), "<h1>Title</h1>");
  fs.writeFileSync(path.join(dir, "going.txt"), "about to go");
  return dir;
}

/** Make `fs.statSync` fail for one file name, as it does on Windows for a file that is being deleted. */
function failFor(t, name, code) {
  const stat = fs.statSync;
  fs.statSync = (target, ...rest) => {
    if (path.basename(String(target)) === name) throw Object.assign(new Error(`${code}: ${name}`), { code });
    return stat(target, ...rest);
  };
  t.after(() => { fs.statSync = stat; });
}

test("a file that vanishes while the folder is being read is left out, not thrown about", (t) => {
  const dir = project(t);
  failFor(t, "going.txt", "ENOENT");
  assert.deepEqual(filesChangedSince(dir, 0), ["index.html"]);
});

test("a file Windows refuses to describe (a delete is pending) is left out, not thrown about", (t) => {
  const dir = project(t);
  failFor(t, "going.txt", "EPERM");
  assert.deepEqual(filesChangedSince(dir, 0), ["index.html"]);
});

test("writing the journal survives the same failure, as it promises", (t) => {
  const dir = project(t);
  failFor(t, "going.txt", "EPERM");
  assert.doesNotThrow(() => recordTurn(dir, { engine: "claude", asked: "x", did: "y", startedAt: 0 }));
});
