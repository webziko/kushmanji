// What a reply cost, in words (M15-05): re-read tokens weigh a tenth, and three rough bands.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fromClaude, fromCodex, weigh } from "../src/main/agents/usage.js";

test("Claude Code's counts are weighed, re-read context at a tenth", () => {
  const got = fromClaude({ usage: { input_tokens: 1200, cache_creation_input_tokens: 8000, cache_read_input_tokens: 90000,
    output_tokens: 900 } });
  assert.deepEqual(got, { tokens: 19100, level: "little", fresh: 9200, cached: 90000, written: 900 });
});

test("Codex counts its re-read context inside its input", () => {
  const got = fromCodex({ usage: { input_tokens: 300000, cached_input_tokens: 250000, output_tokens: 12000 } });
  assert.equal(got.fresh, 50000);
  assert.equal(got.tokens, 87000);
  assert.equal(got.level, "some");
});

test("a big job is a lot, and a turn that reported nothing says nothing", () => {
  assert.equal(weigh({ fresh: 200000, cached: 2_000_000, written: 60000 }).level, "a lot");
  assert.equal(fromClaude({}), null);
  assert.equal(fromCodex({ usage: { input_tokens: "x" } }), null);
});
