// The chat runner's less common paths (agents/index.js): stopping at each stage of a start, a turn that ends while its
// history entry is still being closed, a lost conversation, a full chat, and the check-up. Like agent-context.test.mjs
// it loads the real runner in a vm with in-memory files and bridge stand-ins, so no assistant is started.
//
// Tests marked `todo` describe behaviour that is wrong today. They stay in the suite so the fix has something to turn
// green; a todo that fails does not fail the run.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { CHECK_REQUEST, judge, makeScratch, testedOk } from "../src/main/agents/checkup.js";
import { usageLimit } from "../src/main/agents/limits.js";
import { plainProblem } from "../src/main/agents/problems.js";
import { say } from "../src/main/say.js";
import { AUTO, sizeModel } from "../src/main/agents/sizing.js";
import { isNewer } from "../src/main/agents/versions.js";
import { DEFAULT_MODE, knownMode, modeNote, MODES, readPlan, strayFiles } from "../src/main/agents/working.js";
import { knownLanguage, languageNote } from "../src/main/agents/language.js";

const settled = () => new Promise((done) => setImmediate(done));
const later = (ms = 5) => new Promise((done) => setTimeout(done, ms));
const chatFile = (dir) => path.join(dir, ".hyperframes", "studio-win-chat.json");

function harness({ state = {}, history, check, prepare, bridge: overrides = {}, fsOverride } = {}) {
  const files = new Map();
  const requests = [];
  const turns = [];
  const events = [];
  const bridge = {
    about: { name: "Test assistant" },
    models: async () => [{ id: "sonnet", name: "Sonnet" }],
    status: async () => ({ state: "ready", version: "9.9.9" }),
    run: (request) => {
      requests.push(request);
      return { stop() {} };
    },
    ...overrides,
  };
  const source = fs.readFileSync(new URL("../src/main/agents/index.js", import.meta.url), "utf8")
    .replace(/^import .+;\r?$/gm, "").replace("export class AgentRunner", "class AgentRunner");
  const Runner = vm.runInNewContext(`${source}\nAgentRunner;`, {
    path,
    readJson: (file, fallback) => files.get(file) ?? fallback,
    writeJson: (file, data) => files.set(file, structuredClone(data)),
    readState: () => state,
    updateState: (patch) => Object.assign(state, patch),
    accessFor: () => "project", accessNote: () => "Project only.", LEVELS: [], withAccess() {},
    DEFAULT_MODE, knownMode, modeNote, MODES, readPlan, strayFiles, knownLanguage, languageNote,
    handoverNote: () => "", recapNote: () => "RECAP", recordTurn: (_dir, turn) => turns.push(turn),
    say, usageLimit, plainProblem, filesChangedSince: () => ["index.html"], AUTO, sizeModel, isNewer,
    fs: fsOverride ?? fs, cliVersion: "0.8.149", CHECK_REQUEST, judge, makeScratch, testedOk,
    claude: bridge, codex: bridge, antigravity: bridge,
  });
  const agent = new Runner({ emit: (sent) => events.push(sent.event), prepare, history, check });
  return { agent, requests, turns, events, files, state };
}

// A stand-in for HyperFrames' history (turnHistory.js) whose calls can be held back.
function fakeHistory({ files = ["index.html"], begin, end, undo } = {}) {
  const calls = [];
  let undos = 0;
  return {
    calls,
    begin: begin ?? (async () => { calls.push(["begin"]); return "turn-1"; }),
    end: end ?? (async () => { calls.push(["end"]); return { id: "turn-1", files }; }),
    undo: undo ?? (async (_dir, id) => { calls.push(["undo", id]); undos++; return { id: `undo-${undos}`, files }; }),
  };
}

const gate = () => {
  let open;
  const promise = new Promise((resolve) => { open = resolve; });
  return { promise, open };
};

test("a message that is empty or far too long is refused before anything starts", () => {
  const { agent, requests } = harness();
  assert.throws(() => agent.send({ dir: "video", text: "   " }), /Type what you want/);
  assert.throws(() => agent.send({ dir: "video", text: "x".repeat(20_001) }), /too long/);
  assert.equal(agent.busy, false);
  assert.equal(requests.length, 0);
  assert.equal(agent.history("video").messages.length, 0);
});

test("Stop while the footage is still being studied ends the turn without starting the assistant", async () => {
  const hold = gate();
  const { agent, requests } = harness({ prepare: () => hold.promise });
  agent.send({ dir: "video", text: "Make the title red." });
  assert.equal(agent.busy, true);
  agent.stop();
  await settled();
  await settled();
  assert.equal(requests.length, 0, "the assistant never started");
  assert.equal(agent.busy, false);
  const reply = agent.history("video").messages.at(-1);
  assert.equal(reply.stopped, true);
  assert.equal(reply.ok, false);
  hold.open();
});

test("a study that fails does not stop the chat", async () => {
  const { agent, requests } = harness({ prepare: async () => { throw new Error("FFmpeg is missing"); } });
  agent.send({ dir: "video", text: "Make the title red." });
  await later(10);
  assert.equal(requests.length, 1);
});

test("Stop while the history entry is being opened still closes it, and the assistant never starts", async () => {
  const opening = gate();
  const history = fakeHistory({ begin: async () => { await opening.promise; return "turn-1"; } });
  const { agent, requests } = harness({ history });
  agent.send({ dir: "video", text: "Make the title red." });
  await settled();
  agent.stop();
  opening.open();
  await later(10);
  assert.equal(requests.length, 0);
  assert.deepEqual(history.calls, [["end"]], "the window that was opened is closed again");
  assert.equal(agent.busy, false);
  assert.equal(agent.history("video").messages.at(-1).stopped, true);
});

test("a history that cannot be opened only means this turn has no undo", async () => {
  const history = fakeHistory({ begin: async () => { throw new Error("This project is open in another app"); } });
  const { agent, requests } = harness({ history });
  agent.send({ dir: "video", text: "Make the title red." });
  await later(10);
  assert.equal(requests.length, 1);
  requests[0].onEvent({ type: "done", ok: true });
  await later(10);
  assert.equal(agent.history("video").messages.at(-1).undo, undefined);
  assert.deepEqual(history.calls, [], "nothing to close");
});

test("the turn stays the active one until its history entry is closed, then the next can start", async () => {
  const closing = gate();
  const history = fakeHistory({ end: async () => { await closing.promise; return { id: "turn-1", files: ["index.html"] }; } });
  const { agent, requests, events } = harness({ history });
  agent.send({ dir: "video", text: "Make the title red." });
  await settled();
  requests[0].onEvent({ type: "done", ok: true });
  await later(10);
  assert.equal(agent.busy, true, "still busy while the entry is closing");
  assert.throws(() => agent.send({ dir: "video", text: "And the subtitle." }), /still working/);
  assert.equal(events.some((event) => event.type === "done"), false, "the page is not told it is over yet");
  closing.open();
  await later(10);
  assert.equal(agent.busy, false);
  assert.equal(events.at(-1).type, "done");
  assert.equal(agent.history("video").messages.at(-1).undo.id, "turn-1");
  agent.send({ dir: "video", text: "And the subtitle." });
  await settled();
  assert.equal(requests.length, 2);
});

test("a second 'done' from the same turn is ignored", async () => {
  const { agent, requests, turns } = harness();
  agent.send({ dir: "video", text: "Make the title red." });
  await settled();
  requests[0].onEvent({ type: "done", ok: true });
  requests[0].onEvent({ type: "done", ok: false, error: "stopped unexpectedly" });
  const replies = agent.history("video").messages.filter((message) => message.role === "agent");
  assert.equal(replies.length, 1);
  assert.equal(replies[0].ok, true);
  assert.equal(turns.length, 1);
});

test("a conversation the assistant no longer has is forgotten, so the next message starts a new one", async () => {
  const { agent, requests } = harness();
  agent.send({ dir: "video", text: "First." });
  await settled();
  requests[0].onEvent({ type: "session", id: "talk-1" });
  requests[0].onEvent({ type: "done", ok: true });
  agent.send({ dir: "video", text: "Second." });
  await settled();
  assert.equal(requests[1].sessionId, "talk-1");
  // It fails before it says a session at all: the id is not good any more.
  requests[1].onEvent({ type: "done", ok: false, error: "No conversation found with session ID talk-1" });
  agent.send({ dir: "video", text: "Third." });
  await settled();
  assert.equal(requests[2].sessionId, null);
});

test("a stopped turn keeps its conversation", async () => {
  const { agent, requests } = harness();
  agent.send({ dir: "video", text: "First." });
  await settled();
  requests[0].onEvent({ type: "session", id: "talk-1" });
  requests[0].onEvent({ type: "done", ok: true });
  agent.send({ dir: "video", text: "Second." });
  await settled();
  requests[1].onEvent({ type: "done", ok: false, stopped: true });
  agent.send({ dir: "video", text: "Third." });
  await settled();
  assert.equal(requests[2].sessionId, "talk-1");
});

test("a plan that ends with the mark is shown without it, in a mode that asks first", async () => {
  const { agent, requests, events } = harness({ state: {} });
  agent.chooseMode("video", "review");
  agent.send({ dir: "video", text: "Make a video of my trip." });
  await settled();
  requests[0].onEvent({ type: "text", text: "Here is the plan.\n\nPLAN READY" });
  requests[0].onEvent({ type: "done", ok: true });
  const reply = agent.history("video").messages.at(-1);
  assert.equal(reply.plan, true);
  assert.equal(reply.text, "Here is the plan.");
  assert.equal(events.at(-1).plan, true);
  // index.html is not a plan file, so the person is told it was touched.
  assert.deepEqual([...reply.touched], ["index.html"]);
});

test("what the person asked is saved before the assistant starts, and survives a failure to start", async () => {
  const { agent } = harness({ bridge: { run: () => { throw new Error("spawn EINVAL"); } } });
  const unhandled = [];
  const watch = (error) => unhandled.push(error);
  process.on("unhandledRejection", watch);
  try {
    agent.send({ dir: "video", text: "Make the title red." });
    await later(20);
  } finally {
    process.off("unhandledRejection", watch);
  }
  assert.equal(agent.history("video").messages[0].text, "Make the title red.");
  assert.deepEqual(unhandled, [], "no unhandled rejection");
  assert.equal(agent.busy, false, "the app is not left busy forever");
});

// A chat that has reached its cap of 200 saved messages.
function fullChat(files, dir) {
  const messages = [];
  for (let i = 0; i < 100; i++) {
    messages.push({ role: "user", text: `Request ${i}`, at: i });
    messages.push({ role: "agent", engine: "claude", text: `Done ${i}`, ok: true, at: i,
      undo: { id: `old-${i}`, files: ["index.html"] } });
  }
  files.set(chatFile(dir), { engine: "claude", sessions: {}, turns: {}, mode: "build", told: {}, messages });
}

test("once the chat is full, a new reply's index is its place in the saved chat, so it can be undone", async () => {
  const history = fakeHistory();
  const { agent, requests, events, files } = harness({ history });
  fullChat(files, "video");
  agent.send({ dir: "video", text: "Make the title red." });
  await settled();
  requests[0].onEvent({ type: "done", ok: true });
  await later(10);
  const saved = agent.history("video").messages;
  assert.equal(saved.length, 200);
  const index = events.at(-1).index;
  assert.equal(saved[index]?.role, "agent", `index ${index} must point at the new reply in a chat of ${saved.length}`);
  const undone = await agent.undo("video", index);
  assert.equal(undone.undoneBy, "undo-1");
  assert.deepEqual(history.calls.at(-1), ["undo", "turn-1"]);
});

test("a reply's check lands on that reply even when the chat is full", async () => {
  const { agent, requests, events, files } = harness({ history: fakeHistory(),
    check: async () => ({ errors: 1, warnings: 0, mistakes: [{ text: "A clip is missing.", where: "index.html" }] }) });
  fullChat(files, "video");
  agent.send({ dir: "video", text: "Make the title red." });
  await settled();
  requests[0].onEvent({ type: "done", ok: true });
  await later(20);
  assert.equal(events.at(-1).type, "checked", "the page is told the check found something");
  assert.equal(agent.history("video").messages.at(-1).checked.errors, 1);
});

test("a message cannot start while an undo is putting files back", async () => {
  const restoring = gate();
  const history = fakeHistory({ undo: async () => { await restoring.promise; return { id: "undo-1", files: ["index.html"] }; } });
  const { agent, requests } = harness({ history });
  agent.send({ dir: "video", text: "Make the title red." });
  await settled();
  requests[0].onEvent({ type: "done", ok: true });
  await later(10);
  const undoing = agent.undo("video", 1);
  await settled();
  try {
    assert.throws(() => agent.send({ dir: "video", text: "And the subtitle." }), /undo|still working/i);
  } finally {
    // Whatever happened above, let both finish so nothing is left pending.
    restoring.open();
    await undoing.catch(() => {});
    if (requests[1]) requests[1].onEvent({ type: "done", ok: true });
    await later(10);
  }
});

test("a message cannot start while a check-up is getting ready", async () => {
  const getting = gate();
  const { agent, requests } = harness({ bridge: {
    status: async () => { await getting.promise; return { state: "ready", version: "9.9.9" }; },
    run: (request) => {
      if (request.text === CHECK_REQUEST) {
        fs.writeFileSync(path.join(request.dir, "check.txt"), "AFTER\n");
        request.onEvent({ type: "activity", label: "Running a program" });
        setTimeout(() => request.onEvent({ type: "done", ok: true }), 1);
      } else requests.push(request);
      return { stop() {} };
    },
  } });
  const testing = agent.checkup("claude");
  await settled();
  try {
    assert.throws(() => agent.send({ dir: "video", text: "Make the title red." }), /still working/);
  } finally {
    getting.open();
    await testing;
    if (requests[0]) requests[0].onEvent({ type: "done", ok: true });
    await later(10);
  }
});

test("a check-up still gives its answer when the scratch folder cannot be removed yet", async (t) => {
  // On Windows a folder that is some program's current folder cannot be removed. The assistant's last program may
  // still be shutting down when it reports that it is done.
  const left = [];
  const busy = { ...fs, rmSync(target) {
    left.push(target);
    throw Object.assign(new Error("EBUSY: resource busy or locked, rmdir"), { code: "EBUSY" });
  } };
  const { agent, state } = harness({ fsOverride: busy, bridge: {
    run: (request) => {
      fs.writeFileSync(path.join(request.dir, "check.txt"), "AFTER\n");
      request.onEvent({ type: "activity", label: "Running a program" });
      setTimeout(() => request.onEvent({ type: "done", ok: true }), 1);
      return { stop() {} };
    },
  } });
  t.after(() => left.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));
  const got = await agent.checkup("claude");
  assert.equal(got.ok, true);
  assert.equal(state.checkups.claude.ok, true, "the answer is kept for the version");
});

test("a check-up that was stopped says so and does not leave the app busy", async () => {
  let stopRun = () => {};
  const { agent } = harness({ bridge: {
    run: (request) => {
      stopRun = () => request.onEvent({ type: "done", ok: false, stopped: true });
      return { stop: () => stopRun() };
    },
  } });
  const testing = agent.checkup("claude");
  await later(10);
  assert.equal(agent.busy, true);
  agent.stop();
  const got = await testing;
  assert.equal(got.ok, false);
  assert.match(got.said, /stopped/);
  assert.equal(agent.busy, false);
});

test("a finished reply that is only about rate limits in the video is not a usage limit", async () => {
  const { agent, requests } = harness();
  agent.send({ dir: "video", text: "Add a title card for my explainer." });
  await settled();
  requests[0].onEvent({ type: "text", text: "Done. The title card now reads \"API rate limits explained\"." });
  requests[0].onEvent({ type: "done", ok: true });
  const reply = agent.history("video").messages.at(-1);
  assert.equal(reply.ok, true);
  assert.equal(reply.limited, undefined);
});

test("after a lost conversation the count towards a fresh one starts again", async () => {
  const { agent, requests } = harness();
  for (let i = 0; i < 5; i++) {
    agent.send({ dir: "video", text: `Change ${i}.` });
    await settled();
    requests[i].onEvent({ type: "session", id: "old" });
    requests[i].onEvent({ type: "done", ok: true });
  }
  // The sixth request is lost before it starts: the conversation is gone.
  agent.send({ dir: "video", text: "Change 5." });
  await settled();
  requests[5].onEvent({ type: "done", ok: false, error: "No conversation found" });
  // A new conversation begins, and has had one request when the next arrives.
  agent.send({ dir: "video", text: "Change 6." });
  await settled();
  requests[6].onEvent({ type: "session", id: "new" });
  requests[6].onEvent({ type: "done", ok: true });
  agent.send({ dir: "video", text: "Change 7." });
  await settled();
  assert.equal(requests[7].sessionId, "new", "one request into a new conversation is not yet time for a fresh one");
});
