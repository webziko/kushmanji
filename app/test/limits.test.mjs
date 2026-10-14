// Recognising an assistant stopped by its plan's usage limit (M17-06), in the words each one uses.
import assert from "node:assert/strict";
import { test } from "node:test";
import { usageLimit } from "../src/main/agents/limits.js";

test("Claude Code's session limit is recognised, with the time it resets", () => {
  assert.deepEqual(usageLimit({ error: "You've hit your session limit · resets 3pm (Europe/London)" }),
    { resets: "3pm (Europe/London)" });
  assert.deepEqual(usageLimit({ error: "You've hit your weekly limit" }), { resets: null });
});

test("Claude Code's older wording gives the reset time as a number", () => {
  assert.deepEqual(usageLimit({ error: "Claude AI usage limit reached|1760440800" }),
    { resets: new Date(1760440800 * 1000).toISOString() });
});

test("Codex and Gemini are recognised in their own words", () => {
  assert.deepEqual(usageLimit({ error: "You've hit your usage limit. Upgrade to Pro or try again in 2 days." }),
    { resets: "2 days" });
  assert.ok(usageLimit({ error: "stream error: 429 Too Many Requests" }));
  assert.ok(usageLimit({ error: "RESOURCE_EXHAUSTED: Quota exceeded for quota metric 'Generate requests'" }));
  assert.ok(usageLimit({ error: "insufficient_quota" }));
});

test("a limit at the end of an otherwise finished reply counts too", () => {
  const text = "I trimmed the first clip and moved the title.\n\nYou've hit your session limit · resets 11am";
  assert.deepEqual(usageLimit({ text }), { resets: "11am" });
});

test("ordinary failures and replies that only talk about limits are not a usage limit", () => {
  assert.equal(usageLimit({ error: "Claude Code stopped unexpectedly (exit code 1)." }), null);
  assert.equal(usageLimit({ error: "" }), null);
  assert.equal(usageLimit({}), null);
  // Early in a long reply, about the video: not the assistant's own limit.
  const text = `The title now says "No speed limit" for the motorway part.${" More words.".repeat(60)}`;
  assert.equal(usageLimit({ text }), null);
});
