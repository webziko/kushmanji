// Home's "Connect an assistant" (M10-09): when the card shows, which rows it has, what each says, and that the
// assistants are asked once and not while one works. The card itself is built from these and covered by the self-test;
// plain Node has no page, so only the parts that need none are tried here.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canMakeVideos, complete, lookAtAssistants, needsConnecting, readyLine, rows, team,
} from "../src/renderer/connect.js";
import { fixCard } from "../src/renderer/assistants.js";

const claude = {
  id: "claude", name: "Claude Code", label: "Claude", product: "Claude Code", inTeam: true, state: "ready", version: "2.1.119",
};
const codex = { id: "codex", name: "Codex", label: "ChatGPT", product: "Codex", inTeam: true, state: "ready", version: "0.9.0" };
const gemini = {
  id: "antigravity", name: "Antigravity", label: "Gemini", product: "Antigravity", inTeam: true, state: "ready",
};
/** The three assistants with the given states, in the app's order; `more` overrides fields by id. */
const answer = (states, more = {}) => [claude, codex, gemini].map((agent, index) =>
  ({ ...agent, state: states[index], ...(more[agent.id] ?? {}) }));
const NONE = ["not-installed", "not-signed-in", "broken"];

test("the card shows when none of the ticked assistants is ready, and not when one is", () => {
  assert.equal(needsConnecting(answer(NONE)), true);
  assert.equal(needsConnecting(answer(["ready", ...NONE.slice(1)])), false);
  assert.equal(needsConnecting(answer(["not-installed", "ready", "not-installed"])), false);
  assert.equal(needsConnecting(answer(["ready", "ready", "ready"])), false);
  assert.equal(canMakeVideos(answer(NONE)), false);
  assert.equal(canMakeVideos(answer(["not-installed", "not-installed", "ready"])), true);
});

test("only the assistants the person ticked count, so a ready one that is not ticked does not hide the card", () => {
  const others = { claude: { inTeam: true }, codex: { inTeam: false }, antigravity: { inTeam: false } };
  // Claude is the only one ticked and cannot be used, although Gemini works.
  assert.equal(needsConnecting(answer(["not-signed-in", "not-installed", "ready"], others)), true);
  // Ticking Gemini is what makes it count.
  assert.equal(needsConnecting(answer(["not-signed-in", "not-installed", "ready"],
    { ...others, antigravity: { inTeam: true } })), false);
  assert.deepEqual(team(answer(NONE, others)).map((agent) => agent.id), ["claude"]);
});

test("an answer with no ticks at all, or from an older version, counts everyone as ticked", () => {
  const nobody = { claude: { inTeam: false }, codex: { inTeam: false }, antigravity: { inTeam: false } };
  assert.equal(team(answer(NONE, nobody)).length, 3);
  assert.equal(needsConnecting(answer(["not-installed", "ready", "not-installed"], nobody)), false);
  const older = answer(["not-installed", "ready", "not-installed"]).map(({ inTeam, ...agent }) => agent);
  assert.equal(needsConnecting(older), false);
  assert.equal(needsConnecting(answer(NONE).map(({ inTeam, ...agent }) => agent)), true);
});

test("a missing, empty or unfinished answer asks nothing of the person", () => {
  for (const nothing of [null, undefined, [], {}, "ready", [{ id: "claude" }], [claude, { id: "codex" }]]) {
    assert.equal(complete(nothing), false);
    assert.equal(needsConnecting(nothing), false);
    assert.equal(canMakeVideos(nothing), false);
  }
});

test("every assistant gets a row, ticked or not, with its name, what it is good for and its state", () => {
  const found = rows(answer(["not-installed", "not-signed-in", "broken"], { antigravity: { inTeam: false } }));
  assert.deepEqual(found.map((row) => row.id), ["claude", "codex", "antigravity"]);
  assert.deepEqual(found.map((row) => row.name), ["Claude (Claude Code)", "ChatGPT (Codex)", "Gemini (Antigravity)"]);
  assert.deepEqual(found.map((row) => row.goodFor), [
    "careful editing and planning a whole video",
    "editing, and it can make pictures",
    "editing, and watching many clips without using much",
  ]);
  assert.deepEqual(found.map((row) => row.said), [
    "Claude (Claude Code) is not on this computer yet.",
    "ChatGPT (Codex) needs you to sign in first.",
    "Gemini (Antigravity) is on this computer, but it will not start.",
  ]);
  assert.deepEqual(found.map((row) => row.needsFix), [true, true, true]);
});

test("a ready assistant says its version, and one that is ready but not ticked says why it does not count", () => {
  const found = rows(answer(["ready", "not-installed", "ready"],
    { antigravity: { inTeam: false, version: "1.2.3" } }));
  assert.equal(found[0].said, "Ready · version 2.1.119");
  assert.equal(found[0].needsFix, false);
  assert.equal(found[1].needsFix, true);
  assert.equal(found[2].said, "Ready, but not ticked yet. Open Settings and tick “I have this one” beside it.");
  assert.equal(found[2].needsFix, false);
  assert.equal(rows(answer(["ready", "ready", "ready"]))[2].said, "Ready", "no version is not a problem");
});

test("the install or sign-in card is what the chat and Settings show: nothing for a ready assistant", () => {
  // The card builds buttons, so only the empty case can be tried without a page.
  assert.deepEqual(fixCard({ ...claude, install: ["a"], signIn: ["b"] }), []);
});

test("the line after \"Check again\" names the assistant that is ready, or says all of them when there are several", () => {
  const now = " is ready. You can make a video now.";
  assert.equal(readyLine(answer(["not-installed", "ready", "not-installed"])), `ChatGPT${now}`);
  assert.equal(readyLine(answer(["ready", "not-signed-in", "broken"])), `Claude${now}`);
  assert.equal(readyLine(answer(["ready", "ready", "not-installed"])), "Your assistants are ready. You can make a video now.");
  // A ready assistant that is not ticked is not the one that made the card go away.
  const others = { claude: { inTeam: true }, codex: { inTeam: true }, antigravity: { inTeam: false } };
  assert.equal(readyLine(answer(["not-installed", "ready", "ready"], others)), `ChatGPT${now}`);
  assert.equal(readyLine([{ id: "x", name: "Only a name", state: "ready" }]), `Only a name${now}`);
});

test("the assistants are asked once, and the card is wanted only when none of them can be used", async () => {
  let asked = 0;
  const status = (states) => async () => { asked++; return answer(states); };
  const none = await lookAtAssistants({ status: status(NONE) });
  assert.deepEqual([none.show, none.skipped, asked], [true, false, 1]);
  assert.equal(none.agents.length, 3);
  const fine = await lookAtAssistants({ status: status(["not-installed", "ready", "not-installed"]) });
  assert.deepEqual([fine.show, fine.skipped, asked], [false, false, 2]);
});

test("nobody is asked while an assistant is working, and a failed question shows nothing", async () => {
  let asked = 0;
  const status = async () => { asked++; return answer(NONE); };
  const busy = await lookAtAssistants({ working: () => true, status });
  assert.deepEqual([busy.show, busy.skipped, busy.agents, asked], [false, true, null, 0]);

  for (const broken of [async () => { throw new Error("no answer"); }, () => { throw new Error("at once"); }, async () => null]) {
    const got = await lookAtAssistants({ status: broken });
    assert.deepEqual([got.show, got.skipped, got.agents], [false, false, null]);
  }
});
