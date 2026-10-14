// Reading the HyperFrames history command's answers for undo (M2-10).
import assert from "node:assert/strict";
import { test } from "node:test";
import { cliAnswer, turnLabel } from "../src/main/agents/turnHistory.js";

test("the CLI's JSON answer is read even after a warning line", () => {
  assert.deepEqual(cliAnswer('warning: something\n{ "entryId": "abc" }\n'), { entryId: "abc" });
  assert.equal(cliAnswer("no json here"), null);
  assert.equal(cliAnswer("{ broken"), null);
  assert.equal(cliAnswer(undefined), null);
});

test("a turn's label names the assistant and the time, never the request's words", () => {
  assert.equal(turnLabel("Claude", new Date(2026, 9, 14, 9, 5)), "Claude: chat request at 09:05");
});
