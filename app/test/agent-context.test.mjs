import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { usageLimit } from "../src/main/agents/limits.js";
import { plainProblem } from "../src/main/agents/problems.js";
import { say } from "../src/main/say.js";
import { AUTO, sizeModel } from "../src/main/agents/sizing.js";
import { CHECK_REQUEST, judge, makeScratch, testedOk } from "../src/main/agents/checkup.js";

// The assistant starts once its model is chosen, a moment after the message is saved.
const settled = () => new Promise((done) => setImmediate(done));

// Exercise the real runner with in-memory files and local bridge stand-ins: no sign-in or paid AI turn.
function runner({ state = {}, history, bridgeRun, check } = {}) {
  const files = new Map();
  const requests = [];
  const turns = [];
  const bridge = { about: { name: "Test assistant" }, models: async () => [{ id: "sonnet", name: "Sonnet" }],
    status: async () => ({ state: "ready", version: "9.9.9" }),
    run: (request) => {
    if (bridgeRun) return bridgeRun(request);
    requests.push(request);
    return { stop() {} };
  } };
  const source = fs.readFileSync(new URL("../src/main/agents/index.js", import.meta.url), "utf8")
    .replace(/^import .+;\r?$/gm, "").replace("export class AgentRunner", "class AgentRunner");
  const Runner = vm.runInNewContext(`${source}\nAgentRunner;`, {
    path,
    readJson: (file, fallback) => files.get(file) ?? fallback,
    writeJson: (file, data) => files.set(file, structuredClone(data)),
    readState: () => state, updateState() {},
    accessFor: () => "project", accessNote: () => "Project only.",
    LEVELS: [], withAccess() {},
    DEFAULT_MODE: "build", knownMode: (value) => value, modeNote: () => "", MODES: [],
    handoverNote: () => "", recapNote: () => "RECAP of the latest work", recordTurn: (_dir, turn) => turns.push(turn),
    say, usageLimit, plainProblem, filesChangedSince: () => ["index.html", "subtitles.json"], AUTO, sizeModel,
    fs, cliVersion: "0.8.149", CHECK_REQUEST, judge, makeScratch, testedOk,
    claude: bridge, codex: bridge, antigravity: bridge,
  });
  const events = [];
  return { agent: new Runner({ emit: (sent) => events.push(sent.event), history, check }), requests, turns, events, files };
}

test("the runner saves a moment beside the request and tells the chosen assistant", async () => {
  const { agent, requests, turns } = runner();
  const moment = { seconds: 42.375, when: "0:42", note: "Watching at 42.375 seconds." };
  agent.send({ dir: "video", text: "Change the title here.", moment });
  await settled();
  const saved = agent.history("video").messages[0];
  assert.deepEqual(saved.moment, { seconds: 42.375, when: "0:42" });
  assert.equal(saved.text, "Change the title here.");
  assert.match(requests[0].text, /Watching at 42\.375 seconds\./);
  assert.match(requests[0].text, /Change the title here\./);
  requests[0].onEvent({ type: "done", ok: true });
  assert.match(turns[0].asked, /At 0:42/);
  assert.match(turns[0].asked, /Change the title here\./);
});

test("messages without a moment keep the existing selection context", async () => {
  const { agent, requests } = runner();
  agent.send({ dir: "video", text: "Make this red.",
    pointing: { name: "Title", kind: "text", when: "0:10", note: "Selected title." } });
  await settled();
  const saved = agent.history("video").messages[0];
  assert.equal(saved.moment, undefined);
  assert.equal(saved.pointing.name, "Title");
  assert.match(requests[0].text, /Selected title\./);
});

test("a turn stopped by the assistant's usage limit is saved as unfinished, with the files it changed", async () => {
  const { agent, requests, turns } = runner();
  agent.send({ dir: "video", text: "Make the vlog's fourth version." });
  await settled();
  requests[0].onEvent({ type: "text", text: "I moved the title and started on the ending card." });
  requests[0].onEvent({ type: "done", ok: false, error: "You've hit your session limit · resets 3pm" });
  const saved = agent.history("video").messages.at(-1);
  assert.equal(saved.ok, false);
  assert.equal(saved.limited, true);
  assert.equal(saved.resets, "3pm");
  assert.deepEqual(saved.changed, ["index.html", "subtitles.json"]);
  assert.match(turns[0].did, /usage limit/);
});

test("an ordinary failure is not mistaken for a usage limit", async () => {
  const { agent, requests } = runner();
  agent.send({ dir: "video", text: "Trim the first clip." });
  await settled();
  requests[0].onEvent({ type: "done", ok: false, error: "Claude Code stopped unexpectedly (exit code 1)." });
  const saved = agent.history("video").messages.at(-1);
  assert.equal(saved.limited, undefined);
});

test("with nothing chosen, a small change goes to the smaller model and a big job to the default", async () => {
  const { agent, requests } = runner();
  agent.send({ dir: "video", text: "Make the title red." });
  await settled();
  assert.equal(requests[0].model, "sonnet");
  requests[0].onEvent({ type: "done", ok: true });
  assert.ok(agent.history("video").messages.at(-1).activities.some((step) => /small change/.test(step)));
  agent.send({ dir: "video", text: "Re-edit the whole vlog so it flows better." });
  await settled();
  assert.equal(requests[1].model, null);
});

test("a model the person chose by hand is always used, and so is the assistant's default", async () => {
  const picked = runner({ state: { models: { claude: "opus" } } });
  picked.agent.send({ dir: "video", text: "Make the title red." });
  await settled();
  assert.equal(picked.requests[0].model, "opus");
  const plain = runner({ state: { models: { claude: null } } });
  plain.agent.send({ dir: "video", text: "Make the title red." });
  await settled();
  assert.equal(plain.requests[0].model, null);
});

test("only the assistants the person has can be chosen, and at least one stays", async () => {
  const { agent } = runner({ state: { team: ["codex"] } });
  // Copied out of the runner's own context, where arrays are another realm's.
  assert.deepEqual([...agent.history("video").agents.filter((item) => item.inTeam).map((item) => item.id)], ["codex"]);
  assert.throws(() => agent.choose("video", "claude"), /Your assistants/);
  agent.choose("video", "codex");
  assert.throws(() => agent.setTeam([]), /at least one/);
  assert.throws(() => agent.setTeam(["someone-else"]), /not known/);
});

test("with nothing ticked yet, every assistant is in the team", () => {
  const { agent } = runner();
  assert.ok(agent.history("video").agents.every((item) => item.inTeam));
});

// A stand-in for HyperFrames' history (turnHistory.js): what was begun, ended and undone.
function fakeHistory({ files = ["index.html"] } = {}) {
  const calls = [];
  let undos = 0;
  return {
    calls,
    begin: async (_dir, who) => { calls.push(["begin", who]); return "turn-1"; },
    end: async () => { calls.push(["end"]); return { id: "turn-1", files }; },
    undo: async (_dir, id) => { calls.push(["undo", id]); undos++; return { id: `undo-${undos}`, files }; },
  };
}
const ended = () => new Promise((done) => setTimeout(done, 5));

test("each assistant turn becomes one history entry, and its reply can undo it and bring it back", async () => {
  const history = fakeHistory();
  const { agent, requests, turns, events } = runner({ history });
  agent.send({ dir: "video", text: "Make the title red." });
  await settled();
  assert.deepEqual(history.calls[0], ["begin", "Test assistant"]);
  requests[0].onEvent({ type: "done", ok: true });
  await ended();
  const reply = agent.history("video").messages.at(-1);
  assert.equal(reply.undo.id, "turn-1");
  assert.equal(events.at(-1).index, 1);

  const undone = await agent.undo("video", 1);
  assert.equal(undone.undoneBy, "undo-1");
  assert.deepEqual(history.calls.at(-1), ["undo", "turn-1"]);
  assert.equal(turns.at(-1).engine, "person");
  assert.match(turns.at(-1).did, /^Undid what Test assistant changed: index\.html/);

  const back = await agent.undo("video", 1);
  assert.deepEqual(history.calls.at(-1), ["undo", "undo-1"]);
  assert.equal(back.undoneBy, undefined);
  assert.match(turns.at(-1).did, /^Brought back/);
});

test("in a chat long enough to be trimmed, a reply is still found to undo and to check", async () => {
  const history = fakeHistory();
  let checks = 0;
  const { agent, requests, events, files } = runner({ history, check: async () => ({ ok: true, n: ++checks }) });
  const chat = path.join("video", ".hyperframes", "studio-win-chat.json");
  const old = Array.from({ length: 200 }, (_, n) => ({ role: n % 2 ? "agent" : "user", text: `old ${n}`, at: n }));
  files.set(chat, { engine: "claude", messages: old });
  agent.send({ dir: "video", text: "Make the title red." });
  await settled();
  requests[0].onEvent({ type: "done", ok: true });
  await ended();
  const { index, undo } = events.find((event) => event.type === "done");
  assert.equal(files.get(chat).messages.length, 200);
  assert.equal(files.get(chat).messages[index].undo.id, "turn-1");
  assert.ok(files.get(chat).messages[index].checked);
  // The page may still know an older place for it.
  const undone = await agent.undo("video", index + 1, undo.id);
  assert.equal(undone.undoneBy, "undo-1");
});

test("a turn that changed nothing has no undo, and nothing is undone while an assistant works", async () => {
  const history = fakeHistory({ files: [] });
  const { agent, requests } = runner({ history });
  agent.send({ dir: "video", text: "What is in the first clip?" });
  await settled();
  await assert.rejects(agent.undo("video", 0), /still working/);
  requests[0].onEvent({ type: "done", ok: true });
  await ended();
  assert.equal(agent.history("video").messages.at(-1).undo, undefined);
  await assert.rejects(agent.undo("video", 1), /cannot be undone/);
});

test("the check-up gives the assistant one small job in a scratch folder and keeps the answer for its version", async () => {
  const state = {};
  const saved = [];
  const { agent } = runner({ state, bridgeRun: (request) => {
    assert.equal(request.text, CHECK_REQUEST);
    assert.equal(request.access, "project");
    fs.writeFileSync(path.join(request.dir, "check.txt"), "AFTER\n");
    request.onEvent({ type: "activity", label: "Running a program" });
    setTimeout(() => request.onEvent({ type: "done", ok: true }), 1);
    saved.push(request.dir);
    return { stop() {} };
  } });
  const got = await agent.checkup("claude");
  assert.equal(got.ok, true);
  assert.match(got.said, /works with Kushmanji/);
  // Removed in the background, so a folder Windows still holds cannot fail the answer.
  for (let wait = 0; wait < 50 && fs.existsSync(saved[0]); wait++) await new Promise((done) => setTimeout(done, 20));
  assert.equal(fs.existsSync(saved[0]), false, "the scratch folder is removed");
});

test("a check-up that cannot change the file says so plainly", async () => {
  const { agent } = runner({ bridgeRun: (request) => {
    setTimeout(() => request.onEvent({ type: "done", ok: true }), 1);
    return { stop() {} };
  } });
  const got = await agent.checkup("codex");
  assert.equal(got.ok, false);
  assert.match(got.said, /could not change a file/);
  await assert.rejects(agent.checkup("someone-else"), /not known/);
});

test("a reply that changed the video is checked once, and what was found is kept with it", async () => {
  const checked = [];
  const { agent, requests, events } = runner({ history: fakeHistory(), check: async (dir) => {
    checked.push(dir);
    return { errors: 1, warnings: 0, mistakes: [{ text: "A clip is missing.", where: "index.html, line 3" }] };
  } });
  agent.send({ dir: "video", text: "Make the title red." });
  await settled();
  requests[0].onEvent({ type: "done", ok: true });
  await ended();
  await ended();
  assert.deepEqual(checked, ["video"]);
  assert.equal(agent.history("video").messages.at(-1).checked.errors, 1);
  assert.equal(events.at(-1).type, "checked");
  assert.equal(events.at(-1).index, 1);
});

test("after six requests in one conversation the assistant starts afresh, with a recap instead of the old words", async () => {
  const { agent, requests } = runner();
  for (let i = 0; i < 7; i++) {
    agent.send({ dir: "video", text: `Change number ${i + 1}.` });
    await settled();
    requests[i].onEvent({ type: "session", id: "talk-1" });
    requests[i].onEvent({ type: "done", ok: true });
  }
  assert.equal(requests[1].sessionId, "talk-1", "the second request carries on the conversation");
  assert.equal(requests[5].sessionId, "talk-1");
  assert.equal(requests[6].sessionId, null, "the seventh starts a fresh one");
  assert.match(requests[6].text, /RECAP of the latest work/);
  assert.doesNotMatch(requests[5].text, /RECAP/);
  assert.ok(agent.history("video").messages.at(-1).activities.some((step) => /fresh conversation/.test(step)));
});

test("a review is told to change nothing, and what it changed anyway is named", async () => {
  const { agent, requests } = runner();
  agent.send({ dir: "video", text: "Please check what Claude just changed.", purpose: "review" });
  await settled();
  assert.match(requests[0].text, /Look, do not change/);
  requests[0].onEvent({ type: "done", ok: true });
  const reply = agent.history("video").messages.at(-1);
  assert.equal(reply.purpose, "review");
  assert.deepEqual([...reply.touched], ["index.html", "subtitles.json"]);
  assert.throws(() => agent.send({ dir: "video", text: "Hm.", purpose: "something" }), /not known/);
});

test("a sign-out in the middle of a turn is said plainly, with how to sign in again", async () => {
  const { agent, requests } = runner();
  agent.send({ dir: "video", text: "Trim the first clip." });
  await settled();
  requests[0].onEvent({ type: "done", ok: false, error: "API Error: 401 authentication_error: OAuth token has expired" });
  const saved = agent.history("video").messages.at(-1);
  assert.match(saved.error, /Test assistant is signed out/);
});
