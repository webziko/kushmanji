// "Auto" in the model menu: small changes go to a smaller model, big jobs to the assistant's own default (M15-02).
import assert from "node:assert/strict";
import { test } from "node:test";
import { isSmallRequest, sizeModel } from "../src/main/agents/sizing.js";

const CLAUDE = [{ id: "fable" }, { id: "opus" }, { id: "sonnet" }, { id: "haiku" }];
const CODEX = [{ id: "gpt-5.5-codex" }, { id: "gpt-5.5-codex-mini" }];
const GEMINI = [{ id: "gemini-3-pro" }, { id: "gemini-3-flash-lite" }, { id: "gemini-3-flash" }];

test("a short change to one thing is small", () => {
  assert.equal(isSmallRequest({ text: "Make the title red." }), true);
  assert.equal(isSmallRequest({ text: "Move this up a little and make it bigger.", pointing: true }), true);
});

test("the whole video, a new version, shorts or subtitles are big jobs", () => {
  for (const text of ["Re-edit the whole vlog so it flows.", "Make a short from the best moment.",
    "Add subtitles.", "Make the fourth version with an intro.", "Rearrange the clips by time of day."]) {
    assert.equal(isSmallRequest({ text }), false, text);
  }
});

test("a long request, or one that asks for a plan first, is never sized down", () => {
  assert.equal(isSmallRequest({ text: "Make the title red. ".repeat(20) }), false);
  assert.equal(isSmallRequest({ text: "Make the title red.", mode: "review" }), false);
  assert.equal(isSmallRequest({ text: "   " }), false);
});

test("each assistant's smaller model is found by name in its own list", () => {
  const ask = { text: "Make the title red." };
  assert.deepEqual(sizeModel({ engine: "claude", models: CLAUDE, ...ask }), { model: "sonnet", small: true });
  assert.deepEqual(sizeModel({ engine: "codex", models: CODEX, ...ask }), { model: "gpt-5.5-codex-mini", small: true });
  assert.deepEqual(sizeModel({ engine: "antigravity", models: GEMINI, ...ask }), { model: "gemini-3-flash", small: true });
});

test("a big job, or an assistant with no smaller model listed, keeps the assistant's own default", () => {
  assert.deepEqual(sizeModel({ engine: "claude", models: CLAUDE, text: "Re-edit the whole vlog." }),
    { model: null, small: false });
  assert.deepEqual(sizeModel({ engine: "codex", models: [{ id: "gpt-5.5-codex" }], text: "Make it red." }),
    { model: null, small: false });
  assert.deepEqual(sizeModel({ engine: "codex", models: [], text: "Make it red." }), { model: null, small: false });
});
