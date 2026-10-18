// The problem report (M9-07): one file a day, one JSON object a line, a size cap, a week of files, never a throw, and
// nothing private in what is written. Folders have an "é" in their names, as a real Windows account may.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createLog, errorDetails, redact } from "../src/main/log.js";

const HOME = "C:\\Users\\José Müller";

function place(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin log é "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

const lines = (file) => fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const logNames = (folder) => fs.readdirSync(folder).filter((name) => /^kushmanji-.*\.log$/.test(name)).sort();
/** A clock that says this local day, which is what a person calls "today". */
const clock = (year, month, day, hour = 12) => () => new Date(year, month - 1, day, hour, 30, 5);

test("each day has its own file, named by the date, with one JSON object on every line", (t) => {
  const folder = path.join(place(t), "logs");
  const log = createLog({ folder, now: clock(2026, 10, 18) });
  log.write("start", { appVersion: "1.2.3", screens: 2 });
  log.write("turn", { engine: "claude", ok: true, stopped: false });
  const file = path.join(folder, "kushmanji-2026-10-18.log");
  assert.deepEqual(logNames(folder), ["kushmanji-2026-10-18.log"]);
  assert.equal(log.file(), file);
  assert.equal(log.folder, folder);
  const [first, second] = lines(file);
  assert.deepEqual(first, {
    at: new Date(2026, 9, 18, 12, 30, 5).toISOString(), kind: "start", appVersion: "1.2.3", screens: 2,
  });
  assert.equal(second.kind, "turn");
  assert.equal(second.ok, true);
  assert.ok(fs.readFileSync(file, "utf8").endsWith("\n"));

  const tomorrow = createLog({ folder, now: clock(2026, 10, 19, 0) });
  tomorrow.write("start", {});
  assert.deepEqual(logNames(folder), ["kushmanji-2026-10-18.log", "kushmanji-2026-10-19.log"]);
  assert.equal(tomorrow.file(), path.join(folder, "kushmanji-2026-10-19.log"), "the newest file");
});

test("a caller cannot replace the time or the kind of a line, and a plain value or an Error still gets written", (t) => {
  const folder = place(t);
  const log = createLog({ folder, now: clock(2026, 10, 18) });
  log.write("real", { at: "yesterday", kind: "fake", code: 7 });
  log.write("text", "just a sentence");
  log.write("nothing");
  log.write("failed", { error: new Error("It broke") });
  const written = lines(log.file());
  assert.equal(written[0].kind, "real");
  assert.equal(written[0].at, new Date(2026, 9, 18, 12, 30, 5).toISOString());
  assert.equal(written[0].code, 7);
  assert.equal(written[1].value, "just a sentence");
  assert.equal(written[2].kind, "nothing");
  assert.deepEqual(written[3].error, { name: "Error", message: "It broke" });
});

test("a day's file stops growing at the size limit, says so once, and the next day starts a new file", (t) => {
  const folder = place(t);
  let day = 18;
  const log = createLog({ folder, now: () => new Date(2026, 9, day, 9), maxBytes: 600 });
  for (let i = 0; i < 40; i++) log.write("turn", { number: i, engine: "claude" });
  const file = log.file();
  const size = fs.statSync(file).size;
  assert.ok(size <= 600 + 150, `the file stopped near the limit, not at ${size}`);
  const written = lines(file);
  assert.equal(written.at(-1).kind, "log-full");
  assert.equal(written.filter((line) => line.kind === "log-full").length, 1, "one last line, said once");
  assert.ok(written.length < 40);
  log.write("turn", { number: 99 });
  assert.equal(fs.statSync(file).size, size, "nothing more is added to a full day");

  // A new program run the same day finds the file already full.
  const again = createLog({ folder, now: () => new Date(2026, 9, day, 18), maxBytes: 600 });
  again.write("start", {});
  assert.equal(fs.statSync(file).size, size);

  day = 19;
  log.write("turn", { number: 100 });
  assert.deepEqual(logNames(folder), ["kushmanji-2026-10-18.log", "kushmanji-2026-10-19.log"]);
});

test("only the newest 7 log files stay, and nothing else in the folder is touched", (t) => {
  const folder = place(t);
  for (let day = 1; day <= 10; day++) {
    fs.writeFileSync(path.join(folder, `kushmanji-2026-10-${String(day).padStart(2, "0")}.log`), "{}\n");
  }
  // Things that look a little like logs, or are not logs at all.
  const others = [
    "notes.txt", "kushmanji-2026-10-01.log.bak", "kushmanji-latest.log", "other-2026-10-01.log", "Kushmanji-2026-10-01.txt",
  ];
  for (const name of others) fs.writeFileSync(path.join(folder, name), "keep me");
  fs.mkdirSync(path.join(folder, "kushmanji-2026-09-30.log")); // A folder with a log's name is not a log.
  fs.writeFileSync(path.join(folder, "kushmanji-2026-09-30.log", "inside.txt"), "keep me");

  const log = createLog({ folder, now: clock(2026, 10, 12) });
  log.write("start", {});
  const files = fs.readdirSync(folder).filter((name) => /^kushmanji-\d{4}-\d{2}-\d{2}\.log$/.test(name) &&
    fs.statSync(path.join(folder, name)).isFile()).sort();
  assert.deepEqual(files, [
    "kushmanji-2026-10-05.log", "kushmanji-2026-10-06.log", "kushmanji-2026-10-07.log", "kushmanji-2026-10-08.log",
    "kushmanji-2026-10-09.log", "kushmanji-2026-10-10.log", "kushmanji-2026-10-12.log",
  ]);
  for (const name of others) assert.equal(fs.readFileSync(path.join(folder, name), "utf8"), "keep me");
  assert.equal(fs.readFileSync(path.join(folder, "kushmanji-2026-09-30.log", "inside.txt"), "utf8"), "keep me");
});

test("a week of logs is kept by the number asked for", (t) => {
  const folder = place(t);
  for (let day = 1; day <= 5; day++) fs.writeFileSync(path.join(folder, `kushmanji-2026-10-0${day}.log`), "{}\n");
  createLog({ folder, now: clock(2026, 10, 6), keep: 3 }).write("start", {});
  assert.deepEqual(logNames(folder), ["kushmanji-2026-10-04.log", "kushmanji-2026-10-05.log", "kushmanji-2026-10-06.log"]);
});

test("writing never throws: an unwritable folder, a clock that fails, or details that loop only lose the line", (t) => {
  const root = place(t);
  const blocker = path.join(root, "not-a-folder");
  fs.writeFileSync(blocker, "I am a file");
  const stuck = createLog({ folder: path.join(blocker, "logs"), now: clock(2026, 10, 18) });
  assert.doesNotThrow(() => stuck.write("start", { a: 1 }));
  assert.equal(stuck.file(), null);

  assert.doesNotThrow(() => createLog().write("start", {}));
  assert.doesNotThrow(() => createLog({ folder: root, now: () => { throw new Error("no clock"); } }).write("start", {}));
  assert.doesNotThrow(() => createLog({ folder: root, now: () => new Date("nonsense") }).write("start", {}));

  const log = createLog({ folder: path.join(root, "logs"), now: clock(2026, 10, 18) });
  const loop = { name: "loop" };
  loop.self = loop;
  assert.doesNotThrow(() => log.write("loop", loop));
  assert.doesNotThrow(() => log.write("odd", { big: 10n, fn() {}, sym: Symbol("x"), nope: undefined }));
  const written = lines(log.file());
  assert.equal(written.length, 2, "the folder did not exist and was made");
  assert.equal(written[1].big, "10");
  assert.deepEqual(Object.keys(written[1]).sort(), ["at", "big", "kind"]);

  // The file is taken away between two lines: the next line starts it again.
  fs.rmSync(path.join(root, "logs"), { recursive: true, force: true });
  assert.doesNotThrow(() => log.write("again", {}));
  assert.equal(lines(log.file()).at(-1).kind, "again");
});

test("what is written has no home folder, email, token or password in it", (t) => {
  const folder = place(t);
  const log = createLog({ folder, now: clock(2026, 10, 18) });
  log.write("preview-exit", {
    code: 1,
    message: `Cannot read ${os.homedir()}\\Videos\\a.mp4 for jose@example.com with token=abcd1234 and ${"k".repeat(40)}`,
  });
  const text = fs.readFileSync(log.file(), "utf8");
  assert.ok(!text.toLowerCase().includes(os.homedir().toLowerCase().replaceAll("\\", "\\\\")), "no home folder");
  assert.ok(!text.includes(os.homedir()), "no home folder");
  assert.ok(!text.includes("jose@example.com"));
  assert.ok(!text.includes("abcd1234"));
  assert.ok(!text.includes("k".repeat(32)));
  assert.equal(lines(log.file())[0].code, 1);
});

test("the home folder becomes ~ with either slash, any letter case, doubled backslashes or a file: address", () => {
  const home = { home: HOME };
  assert.equal(redact("Cannot open C:\\Users\\José Müller\\Videos\\a.mp4", home), "Cannot open ~\\Videos\\a.mp4");
  assert.equal(redact("Cannot open C:/Users/José Müller/Videos/a.mp4", home), "Cannot open ~/Videos/a.mp4");
  assert.equal(redact("c:\\users\\JOSÉ MÜLLER\\x", home), "~\\x", "a different case, as Windows treats the same folder");
  assert.equal(redact("c:/USERS/josé müller/x", home), "~/x");
  assert.equal(redact("in JSON: C:\\\\Users\\\\José Müller\\\\x", home), "in JSON: ~\\\\x");
  assert.equal(redact("file:///C:/Users/Jos%C3%A9%20M%C3%BCller/x.html", home), "file:///~/x.html");
  assert.equal(redact("one C:\\Users\\José Müller and two C:/Users/José Müller", home), "one ~ and two ~");
  assert.equal(redact("home is " + HOME, { home: HOME + "\\" }), "home is ~", "a trailing slash on the home folder");
  assert.equal(redact("/home/jose/x", { home: "/home/jose" }), "~/x");
});

test("another folder that only starts with the same letters is left alone, and so is a home that is just a drive", () => {
  assert.equal(redact("C:\\Users\\José Müllerton\\x", { home: HOME }), "C:\\Users\\José Müllerton\\x");
  assert.equal(redact("C:\\Users\\kish\\x", { home: "C:\\" }), "C:\\Users\\kish\\x");
  assert.equal(redact("C:\\Users\\kish\\x", { home: "" }), "C:\\Users\\kish\\x");
  assert.equal(redact("a.b is not (a)", { home: "C:\\a(b" }), "a.b is not (a)", "special characters are plain text");
});

test("email addresses, long tokens, Authorization, Bearer, api_key and token= values are removed", () => {
  const home = { home: HOME };
  assert.equal(redact("write to jose.muller+kushmanji@example.co.uk now", home), "write to [email] now");
  assert.equal(redact("write to josé@exämple.in now", home), "write to [email] now");
  const token = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0";
  assert.equal(token.length, 40);
  assert.equal(redact(`key ${token} end`, home), "key [hidden] end");
  assert.equal(redact("x".repeat(31), home), "x".repeat(31), "31 is still an ordinary word or name");
  assert.equal(redact("x".repeat(32), home), "[hidden]");
  assert.equal(redact("a_b-".repeat(8), home), "[hidden]", "underscores and hyphens count");
  assert.equal(redact("Authorization: Bearer abc.def-123", home), "Authorization: [hidden]");
  assert.equal(redact('{"Authorization":"Basic dXNlcjpwYXNz"}', home), '{"Authorization":"[hidden]"}');
  assert.equal(redact("failed with Bearer abc123xyz and more", home), "failed with Bearer [hidden] and more");
  assert.equal(redact("bearer abc123xyz", home), "bearer [hidden]");
  assert.equal(redact("api_key=sk-1234&x=1", home), "api_key=[hidden]&x=1");
  assert.equal(redact("api-key: 1234", home), "api-key: [hidden]");
  assert.equal(redact("token=abc123 and access_token: 'xyz789'", home), "token=[hidden] and access_token: '[hidden]'");
  assert.equal(redact("password=hunter2", home), "password=[hidden]");
  assert.equal(redact("The token expired, and 3 tokens were used", home), "The token expired, and 3 tokens were used");
});

test("redact goes through arrays and objects, keeps numbers, and gives back a new value", () => {
  const input = {
    code: 0,
    ok: true,
    nothing: null,
    folder: `${HOME}\\Videos`,
    list: ["jose@example.com", 3, { path: "c:/users/josé müller/x" }],
    nested: { deeper: { text: "Bearer abcdef" } },
  };
  const before = JSON.stringify(input);
  assert.deepEqual(redact(input, { home: HOME }), {
    code: 0,
    ok: true,
    nothing: null,
    folder: "~\\Videos",
    list: ["[email]", 3, { path: "~/x" }],
    nested: { deeper: { text: "Bearer [hidden]" } },
  });
  assert.equal(JSON.stringify(input), before, "the caller's value is not changed");
});

test("redact stops four levels down, cuts long strings to 500 characters, and limits how many things one line holds", () => {
  const deep = { a: { b: { c: { d: { e: "too far" } } } } };
  assert.deepEqual(redact(deep, { home: HOME }), { a: { b: { c: { d: "[too deep]" } } } });
  const fine = { a: { b: { c: { d: "four levels is fine" } } } };
  assert.deepEqual(redact(fine, { home: HOME }), fine);
  assert.deepEqual(redact([[[[["x"]]]]], { home: HOME }), [[[["[too deep]"]]]]);

  const long = redact("word ".repeat(400), { home: HOME });
  assert.equal(long.length, 501);
  assert.ok(long.endsWith("…"));
  assert.equal(redact("short", { home: HOME }), "short");
  assert.equal(redact("é".repeat(500), { home: HOME }).length, 500, "exactly 500 is kept whole");

  assert.equal(redact(Array.from({ length: 80 }, (_, i) => i), { home: HOME }).length, 50);
  const secretAtTheEnd = `${"a ".repeat(300)}jose@example.com`;
  assert.ok(!redact(secretAtTheEnd, { home: HOME }).includes("@"), "a secret is removed before the text is cut, not after");
});

test("an error is reported by its name, code, message and the first five places it passed through", (t) => {
  const fault = new Error(`Cannot read ${HOME}\\a.txt`);
  fault.code = "EBUSY";
  const places = Array.from({ length: 8 }, (_, i) => `    at place${i} (${HOME}\\app\\x.js:${i}:1)`);
  fault.stack = ["Error: Cannot read it", ...places].join("\n");
  const details = errorDetails(fault);
  assert.deepEqual(Object.keys(details), ["name", "code", "message", "stack"]);
  assert.equal(details.stack.length, 5);
  assert.equal(details.stack[0], `at place0 (${HOME}\\app\\x.js:0:1)`);

  const shown = redact(details, { home: HOME });
  assert.equal(shown.message, "Cannot read ~\\a.txt");
  assert.equal(shown.stack[4], "at place4 (~\\app\\x.js:4:1)");

  const log = createLog({ folder: place(t), now: clock(2026, 10, 18) });
  log.write("error", { where: "uncaught", ...details });
  const [line] = lines(log.file());
  assert.equal(line.where, "uncaught");
  assert.equal(line.code, "EBUSY");
  assert.equal(line.stack.length, 5);

  assert.deepEqual(errorDetails("a plain text"), { message: "a plain text" });
  assert.deepEqual(errorDetails(undefined), { message: "" });
  assert.deepEqual(errorDetails(Object.create(null)), { message: "An error that could not be read." });
  assert.deepEqual(errorDetails(Object.assign(new Error("no stack"), { stack: undefined })).stack, []);
});

test("a huge string is scrubbed in a moment, not in minutes", () => {
  const started = Date.now();
  redact("a".repeat(2_000_000), { home: HOME });
  assert.ok(Date.now() - started < 2000);
});
