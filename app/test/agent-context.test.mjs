import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

// Exercise the real runner with in-memory files and local bridge stand-ins: no sign-in or paid AI turn.
function runner() {
  const files = new Map();
  const requests = [];
  const turns = [];
  const bridge = { about: { name: "Test assistant" }, run: (request) => {
    requests.push(request);
    return { stop() {} };
  } };
  const source = fs.readFileSync(new URL("../src/main/agents/index.js", import.meta.url), "utf8")
    .replace(/^import .+;\r?$/gm, "").replace("export class AgentRunner", "class AgentRunner");
  const Runner = vm.runInNewContext(`${source}\nAgentRunner;`, {
    path,
    readJson: (file, fallback) => files.get(file) ?? fallback,
    writeJson: (file, data) => files.set(file, structuredClone(data)),
    readState: () => ({}), updateState() {},
    accessFor: () => "project", accessNote: () => "Project only.",
    LEVELS: [], withAccess() {},
    DEFAULT_MODE: "build", knownMode: (value) => value, modeNote: () => "", MODES: [],
    handoverNote: () => "", recordTurn: (_dir, turn) => turns.push(turn),
    claude: bridge, codex: bridge, antigravity: bridge,
  });
  return { agent: new Runner({ emit() {} }), requests, turns };
}

test("the runner saves a moment beside the request and tells the chosen assistant", () => {
  const { agent, requests, turns } = runner();
  const moment = { seconds: 42.375, when: "0:42", note: "Watching at 42.375 seconds." };
  agent.send({ dir: "video", text: "Change the title here.", moment });
  const saved = agent.history("video").messages[0];
  assert.deepEqual(saved.moment, { seconds: 42.375, when: "0:42" });
  assert.equal(saved.text, "Change the title here.");
  assert.match(requests[0].text, /Watching at 42\.375 seconds\./);
  assert.match(requests[0].text, /Change the title here\./);
  requests[0].onEvent({ type: "done", ok: true });
  assert.match(turns[0].asked, /At 0:42/);
  assert.match(turns[0].asked, /Change the title here\./);
});

test("messages without a moment keep the existing selection context", () => {
  const { agent, requests } = runner();
  agent.send({ dir: "video", text: "Make this red.",
    pointing: { name: "Title", kind: "text", when: "0:10", note: "Selected title." } });
  const saved = agent.history("video").messages[0];
  assert.equal(saved.moment, undefined);
  assert.equal(saved.pointing.name, "Title");
  assert.match(requests[0].text, /Selected title\./);
});
