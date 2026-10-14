// How each assistant is given "look_at_video" (tools/look.mjs, M17-07): the same small MCP server, described in
// each assistant's own way. It runs with the app's own Electron as Node, so nothing else has to be installed.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cliEntry } from "../cli.js";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "tools", "look.mjs");

/** Claude Code's name for the tool, for its list of allowed tools. */
export const CLAUDE_LOOK_TOOL = "mcp__kushmanji__look_at_video";

/** The server for one project: the program, its arguments and what it needs in its environment. */
export function lookServer(dir, { execPath = process.execPath, cli = cliEntry } = {}) {
  return { command: execPath, args: [SCRIPT, cli, dir], env: { ELECTRON_RUN_AS_NODE: "1" } };
}

/** Claude Code takes MCP servers as JSON on its command line. */
export function claudeLookArgs(dir, options) {
  return ["--mcp-config", JSON.stringify({ mcpServers: { kushmanji: { type: "stdio", ...lookServer(dir, options) } } })];
}

// A TOML string. JSON's escapes are a subset of TOML's basic strings, so a Windows path with backslashes, spaces or
// any letters survives as it is.
const toml = (text) => JSON.stringify(String(text));

/** Codex takes the same server as TOML settings on its command line. */
export function codexLookArgs(dir, options) {
  const server = lookServer(dir, options);
  return [
    "-c", `mcp_servers.kushmanji.command=${toml(server.command)}`,
    "-c", `mcp_servers.kushmanji.args=[${server.args.map(toml).join(", ")}]`,
    "-c", 'mcp_servers.kushmanji.env={ ELECTRON_RUN_AS_NODE = "1" }',
  ];
}
