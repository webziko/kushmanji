import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { usageLimit } from "../src/main/agents/limits.js";
import { AUTO, sizeModel } from "../src/main/agents/sizing.js";

// The assistant starts once its model is chosen, a moment after the message is saved.
const settled = () => new Promise((done) => setImmediate(done));

// Exercise the real runner with in-memory files and local bridge stand-ins: no sign-in or paid AI turn.
function runner({ state = {} } = {}) {
  const files = new Map();
  const requests = [];
  const turns = [];
  const bridge = { about: { name: "Test assistant" }, models: async () => [{ id: "sonnet", name: "Sonnet" }],
    run: (request) => {
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
    handoverNote: () => "", recordTurn: (_dir, turn) => turns.push(turn),
    usageLimit, filesChangedSince: () => ["index.html", "subtitles.json"], AUTO, sizeModel,
    claude: bridge, codex: bridge, antigravity: bridge,
  });
  return { agent: new Runner({ emit() {} }), requests, turns };
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
