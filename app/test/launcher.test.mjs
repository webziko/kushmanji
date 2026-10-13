// Starting agents without a shell, and keeping a parent agent session's variables out of them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { agentEnv, lastLine } from "../src/main/agents/launcher.js";
import { isNewer } from "../src/main/agents/versions.js";

test("started normally, the person's own settings pass through untouched", () => {
  const env = agentEnv({ PATH: "x", CLAUDE_CODE_MAX_OUTPUT_TOKENS: "4000", CODEX_HOME: "D:\\codex" });
  assert.deepEqual(env, { PATH: "x", CLAUDE_CODE_MAX_OUTPUT_TOKENS: "4000", CODEX_HOME: "D:\\codex" });
});

test("started from inside a Claude Code session, that session's variables are dropped", () => {
  const env = agentEnv({
    PATH: "x",
    CLAUDECODE: "1",
    CLAUDE_CODE_SESSION_ID: "abc",
    CLAUDE_CODE_ENTRYPOINT: "cli",
    CLAUDE_CODE_GIT_BASH_PATH: "C:\\Git\\bash.exe",
  });
  assert.deepEqual(env, { PATH: "x", CLAUDE_CODE_GIT_BASH_PATH: "C:\\Git\\bash.exe" });
});

test("started from inside a Codex session, its thread and sandbox variables are dropped, its home is kept", () => {
  const env = agentEnv({ CODEX_THREAD_ID: "t", CODEX_SANDBOX_NETWORK_DISABLED: "1", CODEX_HOME: "D:\\codex" });
  assert.deepEqual(env, { CODEX_HOME: "D:\\codex" });
});

test("our own Electron switch never reaches an agent", () => {
  assert.deepEqual(agentEnv({ ELECTRON_RUN_AS_NODE: "1", PATH: "x" }), { PATH: "x" });
});

test("lastLine picks the final line of mixed line endings", () => {
  assert.equal(lastLine("one\r\ntwo\nthree\r\n"), "three");
  assert.equal(lastLine(""), "");
});

test("isNewer compares versions by number, not by text", () => {
  assert.equal(isNewer("0.162.1", "0.145.0"), true);
  assert.equal(isNewer("2.1.280", "2.1.280"), false);
  assert.equal(isNewer("2.1.9", "2.1.280"), false, "9 is less than 280");
  assert.equal(isNewer("1.4", "1.3.3"), true);
  assert.equal(isNewer("codex-cli 0.170.0", "0.162.1"), true, "a name in front is ignored");
});

test("an unknown version is never called newer", () => {
  assert.equal(isNewer(undefined, "1.0.0"), false);
  assert.equal(isNewer("1.0.0", undefined), false);
  assert.equal(isNewer("", ""), false);
});
