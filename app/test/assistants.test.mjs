// What the chat and the Settings dialog both say and decide about the assistants (M7-03): who is ticked, why one
// cannot be used yet, and what "Open PowerShell for me" would run. The buttons themselves are built from these and
// covered by the self-test; plain Node has no page, so only the parts that need none are tried here.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  changeTeam, fixSentence, lastTestText, menuName, setupCommands, setupStep, stateText, tickedAfter,
} from "../src/renderer/assistants.js";

const claude = { id: "claude", name: "Claude Code", label: "Claude", product: "Claude Code", inTeam: true };
const codex = { id: "codex", name: "Codex", label: "ChatGPT", product: "Codex", inTeam: true };
const gemini = { id: "antigravity", name: "Antigravity", label: "Gemini", product: "Antigravity", inTeam: false };
const team = () => [{ ...claude }, { ...codex }, { ...gemini }];

test("the plain name comes first and the maker's own beside it, unless they are the same", () => {
  assert.equal(menuName(codex), "ChatGPT (Codex)");
  assert.equal(menuName({ id: "x", name: "Same", label: "Same", product: "Same" }), "Same");
  assert.equal(menuName({ id: "x", name: "Only a name" }), "Only a name");
});

test("ticking or unticking one assistant says who would be ticked, and an older answer counts as ticked", () => {
  const [a, b, c] = team();
  assert.deepEqual(tickedAfter([a, b, c], c, true), ["claude", "codex", "antigravity"]);
  assert.deepEqual(tickedAfter([a, b, c], b, false), ["claude"]);
  assert.deepEqual(tickedAfter([{ id: "claude" }, { id: "codex", inTeam: false }], { id: "x" }, true), ["claude"]);
});

test("the last ticked assistant cannot be unticked, and nothing is sent", async () => {
  const [a, b, c] = team();
  b.inTeam = false;
  const sent = [];
  const answer = await changeTeam([a, b, c], a, false, async (ids) => sent.push(ids));
  assert.equal(answer.problem, "Keep at least one assistant ticked.");
  assert.deepEqual(sent, []);
  assert.equal(a.inTeam, true, "the list is as it was");
});

test("a change that is kept updates the list, and one the main process refuses leaves it alone", async () => {
  const [a, b, c] = team();
  const sent = [];
  const kept = await changeTeam([a, b, c], c, true, async (ids) => sent.push(ids));
  assert.equal(kept.problem, null);
  assert.deepEqual(sent, [["claude", "codex", "antigravity"]]);
  assert.equal(c.inTeam, true);

  const refused = await changeTeam([a, b, c], b, false, async () => { throw new Error("That assistant is not known to this app."); });
  assert.equal(refused.problem, "That assistant is not known to this app.");
  assert.equal(b.inTeam, true, "a refused change is not shown as made");
});

test("an assistant that is not on this computer gets its install and sign-in lines, one that needs a sign-in only that", () => {
  const install = ["winget install Anthropic.Claude"];
  const signIn = ["claude auth login"];
  assert.equal(setupStep({ state: "not-installed" }), "install");
  assert.deepEqual(setupCommands({ state: "not-installed", install, signIn }), [...install, ...signIn]);
  assert.equal(setupStep({ state: "not-signed-in" }), "signIn");
  assert.deepEqual(setupCommands({ state: "not-signed-in", install, signIn }), signIn);
  assert.deepEqual(setupCommands({ state: "not-installed" }), [], "a bridge with no lines offers nothing to run");
});

test("a ready or broken assistant has nothing to install or sign in to", () => {
  const lines = { install: ["a"], signIn: ["b"] };
  for (const state of ["ready", "broken"]) {
    assert.equal(setupStep({ state, ...lines }), null);
    assert.deepEqual(setupCommands({ state, ...lines }), []);
  }
});

test("each state is said in plain words with the assistant's name", () => {
  assert.equal(fixSentence({ ...codex, state: "not-installed" }), "ChatGPT (Codex) is not on this computer yet.");
  assert.equal(fixSentence({ ...codex, state: "not-signed-in" }), "ChatGPT (Codex) needs you to sign in first.");
  assert.equal(fixSentence({ ...codex, state: "broken" }), "ChatGPT (Codex) is on this computer, but it will not start.");
});

test("a ready assistant says its version, and any other says why it cannot be used yet", () => {
  assert.equal(stateText({ ...claude, state: "ready", version: "2.1.119" }), "Ready · version 2.1.119");
  assert.equal(stateText({ ...claude, state: "ready" }), "Ready");
  assert.equal(stateText({ ...gemini, state: "not-signed-in" }), "Gemini (Antigravity) needs you to sign in first.");
});

test("the last test is mentioned only for the version that was tested", () => {
  const checkup = { version: "1.0.0", ok: true, said: "It worked." };
  assert.equal(lastTestText({ version: "1.0.0", checkup }), "Last test: It worked.");
  assert.equal(lastTestText({ version: "1.1.0", checkup }), "", "a newer version has not been tested");
  assert.equal(lastTestText({ version: "1.0.0", checkup: null }), "");
  assert.equal(lastTestText({ version: undefined, checkup: null }), "", "no test and no version is not a match");
});
