// Rules of AGENTS.md and SECURITY.md that can be checked by reading the source: the page's calls, the way processes are
// ended and started, and the address the app uses for its own server. They catch the next change that forgets one.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const MAIN = fileURLToPath(new URL("../src/main", import.meta.url));
const PRELOAD = fileURLToPath(new URL("../src/preload/preload.cjs", import.meta.url));

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "bin" ? [] : sources(full);
    return /\.(js|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
}

/** The code of a file, without // comments and block comments, so a rule is not tripped by a sentence about it. */
const code = (file) => fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const rel = (file) => path.relative(MAIN, file).split(path.sep).join("/");

test("every call the page can make is answered by the main process, and every answer can be asked for", () => {
  const main = code(path.join(MAIN, "main.js"));
  const preload = code(PRELOAD);
  const handled = new Set([...main.matchAll(/\bhandle\("([^"]+)"/g)].map((match) => match[1]));
  const exposed = new Set([...preload.matchAll(/\bcall\("([^"]+)"/g)].map((match) => match[1]));
  assert.deepEqual([...exposed].filter((name) => !handled.has(name)), [], "exposed to the page but nobody answers");
  assert.deepEqual([...handled].filter((name) => !exposed.has(name)), [], "answered but the page cannot ask");
});

test("every event the page may listen for is one the main process sends, and the reverse", () => {
  const main = code(path.join(MAIN, "main.js"));
  const preload = fs.readFileSync(PRELOAD, "utf8");
  const listed = new Set(preload.match(/const EVENTS = new Set\(\[([^\]]*)\]/)[1].match(/"[^"]+"/g).map((name) => name.slice(1, -1)));
  const sent = new Set([...main.matchAll(/\.send\("([^"]+)"/g)].map((match) => match[1]));
  assert.deepEqual([...listed].filter((name) => !sent.has(name)), []);
  assert.deepEqual([...sent].filter((name) => !listed.has(name)), []);
});

test("the page is given named calls and never ipcRenderer itself", () => {
  const preload = code(PRELOAD);
  const exposedObject = preload.slice(preload.indexOf("exposeInMainWorld"));
  assert.doesNotMatch(exposedObject.replace(/ipcRenderer\.(invoke|on|removeListener)\(/g, ""), /ipcRenderer/);
});

test("a process is ended with killTree, not child.kill(), which leaves what it started running", () => {
  const offenders = sources(MAIN)
    .filter((file) => rel(file) !== "proc.js")
    .filter((file) => /\b(child|mine|proc|subprocess|server)\.kill\(/.test(code(file)))
    .map(rel);
  assert.deepEqual(offenders, []);
});

test("every program the app starts is started hidden, so no console window flashes", () => {
  const missing = [];
  for (const file of sources(MAIN)) {
    if (rel(file) === "proc.js") continue;
    const text = code(file);
    for (const match of text.matchAll(/\b(?:spawn|spawnSync|execFile|execFileSync|fork)\(/g)) {
      if (!/windowsHide:\s*true/.test(text.slice(match.index, match.index + 500))) missing.push(`${rel(file)}:${text.slice(0, match.index).split("\n").length}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("no program is started through a shell, and none is handed one command string", () => {
  const offenders = sources(MAIN)
    .filter((file) => /\bshell:\s*true/.test(code(file)) ||
      /import\s*\{[^}]*\bexec(Sync)?\b[^}]*\}\s*from\s*"(node:)?child_process"/.test(code(file)))
    .map(rel);
  assert.deepEqual(offenders, []);
});

test("the app talks to its own server by 127.0.0.1, never localhost", () => {
  const offenders = sources(MAIN).filter((file) => /\blocalhost\b/i.test(code(file))).map(rel);
  assert.deepEqual(offenders, []);
});

test("the page's window keeps its sandbox, context isolation and no Node", () => {
  const main = code(path.join(MAIN, "main.js"));
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.doesNotMatch(main, /webSecurity:\s*false|allowRunningInsecureContent|nodeIntegrationInSubFrames:\s*true/);
});

test("every call the page makes goes through a check that it came from the app's own page", () => {
  const main = code(path.join(MAIN, "main.js"));
  const direct = [...main.matchAll(/ipcMain\.(handle|on)\(/g)].length;
  assert.equal(direct, 1, "one place registers handlers, and it checks the sender");
  assert.match(main, /ipcMain\.handle\(channel, async \(event, \.\.\.args\) => \{\s*if \(!fromAppPage\(event\.senderFrame\)\)/);
});
