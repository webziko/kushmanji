// The "Make shorts" queue (shortsMaker.js, M17-04): one short after the other, each in its own video's chat.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { madeRecord, recordMade, SHORT_REQUEST, ShortsMaker } from "../src/main/shortsMaker.js";

function maker({ busyFor = 0 } = {}) {
  const sent = [];
  const chosen = [];
  const told = [];
  let refusals = busyFor;
  const shorts = new ShortsMaker({
    send: ({ dir, text }) => {
      if (refusals > 0) {
        refusals--;
        throw new Error("The assistant is still working. Press Stop, or wait for it to finish.");
      }
      sent.push({ dir, text });
    },
    choose: (dir, engine) => chosen.push([dir, engine]),
    emit: (payload) => told.push(payload),
  });
  return { shorts, sent, chosen, told };
}
const list = [{ dir: "C:\\v\\a", title: "One" }, { dir: "C:\\v\\b", title: "Two" }, { dir: "C:\\v\\c", title: "Three" }];
const done = (dir, ok = true, extra = {}) => ({ dir, event: { type: "done", ok, ...extra } });

test("the shorts are built one after the other, each with the same request and the source's assistant", () => {
  const { shorts, sent, chosen, told } = maker();
  const first = shorts.start("C:\\v\\source", list, { engine: "codex" });
  assert.deepEqual(first, { state: "making", total: 3, number: 1, title: "One", waiting: false, made: [] });
  assert.deepEqual(sent.map((item) => item.dir), ["C:\\v\\a"]);
  shorts.agentEvent({ dir: "C:\\v\\a", event: { type: "text", text: "working" } });
  shorts.agentEvent(done("C:\\v\\other"));
  assert.equal(sent.length, 1, "only the short being built moves the queue on");
  shorts.agentEvent(done("C:\\v\\a"));
  shorts.agentEvent(done("C:\\v\\b"));
  assert.equal(shorts.busy, true);
  shorts.agentEvent(done("C:\\v\\c"));
  assert.deepEqual(sent.map((item) => item.dir), ["C:\\v\\a", "C:\\v\\b", "C:\\v\\c"]);
  assert.ok(sent.every((item) => item.text === SHORT_REQUEST));
  assert.deepEqual(chosen.map(([, engine]) => engine), ["codex", "codex", "codex"]);
  assert.equal(shorts.busy, false);
  const last = told.at(-1);
  assert.equal(last.dir, "C:\\v\\source");
  assert.deepEqual(last.status, { state: "done", total: 3, made: list, error: null });
  assert.deepEqual(shorts.status("C:\\v\\source").state, "done");
  assert.deepEqual(shorts.status("C:\\v\\elsewhere"), { state: "idle" });
});

test("while the person's own request runs, the next short waits for it, then starts", () => {
  const { shorts, sent } = maker({ busyFor: 1 });
  const first = shorts.start("C:\\v\\source", list.slice(0, 1), { engine: "codex" });
  assert.equal(first.waiting, true);
  assert.equal(sent.length, 0);
  shorts.agentEvent(done("C:\\v\\source"));
  assert.deepEqual(sent.map((item) => item.dir), ["C:\\v\\a"]);
  assert.equal(shorts.status("C:\\v\\source").waiting, false);
});

test("a short that fails stops the run and says which one, keeping those already made", () => {
  const { shorts, sent } = maker();
  shorts.start("C:\\v\\source", list, { engine: "claude" });
  shorts.agentEvent(done("C:\\v\\a"));
  shorts.agentEvent(done("C:\\v\\b", false, { limited: true }));
  assert.equal(sent.length, 2, "short three is not started");
  const status = shorts.status("C:\\v\\source");
  assert.equal(status.state, "stopped");
  assert.deepEqual(status.made, [list[0]]);
  assert.match(status.error, /Short 2, "Two", was not finished: the assistant ran out of its allowance/);
  assert.throws(() => maker().shorts.start("C:\\v\\source", [], { engine: "codex" }), /no shorts/);
});

test("one run at a time, and Stop ends it after the short being built", () => {
  const { shorts, sent } = maker();
  shorts.start("C:\\v\\source", list, { engine: "codex" });
  assert.throws(() => shorts.start("C:\\v\\other", list, { engine: "codex" }), /already being made/);
  shorts.stop();
  shorts.agentEvent(done("C:\\v\\a"));
  assert.equal(sent.length, 1);
  assert.equal(shorts.status("C:\\v\\source").state, "stopped");
});

test("the shorts of a plan are remembered as made, until the plan changes", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin shorts made é "));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(madeRecord(dir), null, "no plan");
  fs.writeFileSync(path.join(dir, "SHORTS.md"), "plan one");
  assert.equal(madeRecord(dir), null, "not made yet");
  recordMade(dir, ["C:\\v\\a"]);
  assert.deepEqual(madeRecord(dir).dirs, ["C:\\v\\a"]);
  fs.writeFileSync(path.join(dir, "SHORTS.md"), "plan two");
  assert.equal(madeRecord(dir), null, "a new plan has not been made");
});
