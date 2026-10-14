// Undo for each assistant turn (M2-10), through the open project's preview server and its history routes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { historyBase, turnHistory, turnLabel } from "../src/main/agents/turnHistory.js";

const OPEN = { dir: "C:\\Videos\\My Vlog", serverUrl: "http://127.0.0.1:48620", projectName: "My Vlog" };

test("a turn's label names the assistant and the time, never the request's words", () => {
  assert.equal(turnLabel("Claude", new Date(2026, 9, 14, 9, 5)), "Claude: chat request at 09:05");
});

test("history is asked of the open project's own server only", () => {
  assert.equal(historyBase(OPEN, "c:\\videos\\my vlog"), "http://127.0.0.1:48620/api/projects/My%20Vlog/history");
  assert.equal(historyBase(OPEN, "C:\\Videos\\Other"), null);
  assert.equal(historyBase(null, OPEN.dir), null);
});

test("a turn opens a window under the assistant's name, closes it into one entry, and undoes it", async () => {
  const sent = [];
  const fetch = async (url, { body }) => {
    sent.push([url.replace("http://127.0.0.1:48620/api/projects/My%20Vlog/history", ""), JSON.parse(body)]);
    const answers = {
      "/window": { windowId: "w1" },
      "/window/w1/close": { entry: { id: "e1", files: [{ path: "index.html", before: "a", after: "b" }] } },
      "/undo": { ok: true, entry: { id: "u1", files: ["index.html"] } },
    };
    return { ok: true, status: 200, json: async () => answers[sent.at(-1)[0]] };
  };
  const history = turnHistory(() => OPEN, { fetch });
  assert.equal(await history.begin(OPEN.dir, "Claude"), true);
  assert.deepEqual(sent[0][1].who, { kind: "agent", name: "Claude" });
  assert.equal(sent[0][1].idleMs, 600_000);
  assert.deepEqual(await history.end(OPEN.dir), { id: "e1", files: ["index.html"] });
  assert.deepEqual(await history.undo(OPEN.dir, "e1"), { id: "u1", files: ["index.html"] });
  assert.deepEqual(sent[2], ["/undo", { entryId: "e1" }]);
  assert.equal(await history.end(OPEN.dir), null, "a turn is closed once");
});

test("a refusal from the server becomes a plain sentence, and another project is never touched", async () => {
  const fetch = async () => ({ ok: false, status: 409, json: async () => ({ error: "Later edits changed index.html" }) });
  const history = turnHistory(() => OPEN, { fetch });
  await assert.rejects(history.undo(OPEN.dir, "e1"), /could not be undone \(Later edits changed index\.html\)\. Your video was not changed\./);
  await assert.rejects(history.begin("C:\\Videos\\Other", "Claude"), /Open this video first/);
});
