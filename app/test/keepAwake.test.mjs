// Keep the computer awake while a video saves or an assistant works (M4-05).
import assert from "node:assert/strict";
import { test } from "node:test";
import { KeepAwake } from "../src/main/keepAwake.js";

function fakeBlocker() {
  const calls = [];
  let next = 1;
  const live = new Set();
  return {
    calls,
    start(type) { calls.push(["start", type]); const id = next++; live.add(id); return id; },
    stop(id) { calls.push(["stop", id]); live.delete(id); },
    isStarted(id) { return live.has(id); },
    live,
  };
}

test("held while any job runs, released when the last one ends", () => {
  const blocker = fakeBlocker();
  const awake = new KeepAwake({ blocker });
  awake.set("saving", true);
  awake.set("assistant", true);
  awake.set("saving", true);
  assert.deepEqual(blocker.calls, [["start", "prevent-app-suspension"]]);
  awake.set("saving", false);
  assert.equal(blocker.live.size, 1);
  assert.deepEqual(awake.reasons, ["assistant"]);
  awake.set("assistant", false);
  assert.equal(blocker.live.size, 0);
  assert.deepEqual(awake.reasons, []);
});

test("an idle app never holds the computer awake, and a refusal never breaks a job", () => {
  const blocker = fakeBlocker();
  const awake = new KeepAwake({ blocker });
  awake.set("assistant", false);
  assert.deepEqual(blocker.calls, []);
  const refusing = new KeepAwake({ blocker: { start() { throw new Error("no"); }, stop() {}, isStarted() { return false; } } });
  assert.doesNotThrow(() => refusing.set("saving", true));
  assert.doesNotThrow(() => refusing.set("saving", false));
});
