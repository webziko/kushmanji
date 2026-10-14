// "look_at_video" (M17-07): the MCP messages, the moments allowed, and how each assistant is told about the server.
import assert from "node:assert/strict";
import { test } from "node:test";
import { answer, moments, TOOL } from "../src/main/agents/tools/look.mjs";
import { claudeLookArgs, codexLookArgs, lookServer } from "../src/main/agents/lookTool.js";

const png = Buffer.from("89504e47", "hex");
const look = async (seconds) => seconds.map((at) => ({ seconds: at, png }));

test("the server introduces itself and offers one tool", async () => {
  const hello = await answer({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, { look });
  assert.equal(hello.result.protocolVersion, "2025-06-18");
  assert.deepEqual(hello.result.capabilities, { tools: {} });
  const list = await answer({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { look });
  assert.deepEqual(list.result.tools.map((tool) => tool.name), [TOOL.name]);
  assert.equal(await answer({ jsonrpc: "2.0", method: "notifications/initialized" }, { look }), null);
  const unknown = await answer({ jsonrpc: "2.0", id: 3, method: "resources/list" }, { look });
  assert.equal(unknown.error.code, -32601);
});

test("looking returns one picture per moment, and a bad request a plain refusal", async () => {
  const got = await answer({ jsonrpc: "2.0", id: 4, method: "tools/call",
    params: { name: "look_at_video", arguments: { seconds: [3.456, 12] } } }, { look });
  assert.equal(got.result.content[0].text, "Pictures of the video at 3.46 s, 12 s.");
  assert.deepEqual(got.result.content.slice(1).map((item) => item.type), ["image", "image"]);
  assert.equal(got.result.content[1].data, png.toString("base64"));
  const bad = await answer({ jsonrpc: "2.0", id: 5, method: "tools/call",
    params: { name: "look_at_video", arguments: { seconds: [1, 2, 3, 4, 5, 6, 7] } } }, { look });
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /At most 6/);
});

test("moments must be numbers of seconds, not negative", () => {
  assert.deepEqual(moments(["5", 2.345]), [5, 2.35]);
  assert.throws(() => moments([-1]), /not a moment/);
  assert.throws(() => moments(["soon"]), /not a moment/);
  assert.throws(() => moments([]), /one to six/);
});

test("Claude and Codex are each told about the same server, with paths that keep their spaces and accents", () => {
  const options = { execPath: "C:\\Program Files\\Kushmanji\\Kushmanji.exe", cli: "C:\\App\\hyperframes.mjs" };
  const dir = "C:\\Users\\José Müller\\Videos\\My vlog";
  const server = lookServer(dir, options);
  assert.equal(server.command, options.execPath);
  assert.equal(server.args.at(-1), dir);
  const claude = claudeLookArgs(dir, options);
  assert.equal(claude[0], "--mcp-config");
  assert.deepEqual(JSON.parse(claude[1]).mcpServers.kushmanji.args.at(-1), dir);
  const codex = codexLookArgs(dir, options);
  assert.equal(codex.filter((arg) => arg === "-c").length, 4);
  // `codex exec` cannot ask, so the tool must be approved up front or every call is refused.
  assert.ok(codex.includes('mcp_servers.kushmanji.default_tools_approval_mode="approve"'));
  assert.equal(codex[1], 'mcp_servers.kushmanji.command="C:\\\\Program Files\\\\Kushmanji\\\\Kushmanji.exe"');
  assert.ok(codex[3].endsWith('"C:\\\\Users\\\\José Müller\\\\Videos\\\\My vlog"]'));
});
