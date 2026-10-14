// "Look at the video" for every assistant (M17-07, M10-06). Codex could not take still frames of what it built:
// HyperFrames' snapshot starts a browser, and Codex's sandbox refuses it, so it worked from the footage study's
// pictures and missed two faults a look would have caught. This is a tiny MCP server (the plug-in format Claude
// Code and Codex both speak) that the assistant starts itself, outside its sandbox: one tool, `look_at_video`,
// which takes moments in seconds and answers with pictures of the video at those moments. It only ever renders
// the one project it was started for, into that project's hidden `.cache` folder.
//
//   <electron or node> look.mjs <path of the HyperFrames CLI> <project folder>
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

const MAX_MOMENTS = 6;
const KEEP_LOOKS = 3;
const TIMEOUT_MS = 180_000;

export const TOOL = {
  name: "look_at_video",
  description:
    "See the video as it is now: still pictures at the moments you ask for, in seconds from the start of the " +
    "whole video. Use it to check your own work before you say it is done: titles, crops, faces, captions, joins. " +
    `At most ${MAX_MOMENTS} moments at a time; each takes a few seconds.`,
  inputSchema: {
    type: "object",
    properties: {
      seconds: {
        type: "array",
        items: { type: "number", minimum: 0 },
        minItems: 1,
        maxItems: MAX_MOMENTS,
        description: "The moments to see, in seconds from the start, for example [3.5, 12, 61.2]",
      },
    },
    required: ["seconds"],
  },
};

/** The moments asked for, checked: finite, not negative, at most six, rounded to hundredths. */
export function moments(given) {
  if (!Array.isArray(given) || given.length === 0) throw new Error("Give one to six moments, in seconds.");
  if (given.length > MAX_MOMENTS) throw new Error(`At most ${MAX_MOMENTS} moments at a time.`);
  return given.map((value) => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`${value} is not a moment in seconds.`);
    return Math.round(seconds * 100) / 100;
  });
}

/**
 * Answer one JSON-RPC message from the assistant, or return null for a notification. `look(seconds)` makes the
 * pictures: `[{ seconds, png }]` with `png` a Buffer.
 */
export async function answer(message, { look }) {
  const { id, method, params } = message ?? {};
  if (id === undefined || id === null) return null;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  if (method === "initialize") {
    return reply({
      protocolVersion: params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "kushmanji", version: "1.0.0" },
    });
  }
  if (method === "ping") return reply({});
  if (method === "tools/list") return reply({ tools: [TOOL] });
  if (method === "tools/call") {
    if (params?.name !== TOOL.name) {
      return reply({ isError: true, content: [{ type: "text", text: `There is no tool called ${params?.name}.` }] });
    }
    try {
      const shots = await look(moments(params.arguments?.seconds));
      return reply({
        content: [
          { type: "text", text: `Pictures of the video at ${shots.map((shot) => `${shot.seconds} s`).join(", ")}.` },
          ...shots.map((shot) => ({ type: "image", data: shot.png.toString("base64"), mimeType: "image/png" })),
        ],
      });
    } catch (error) {
      return reply({ isError: true, content: [{ type: "text", text: `No pictures: ${error.message}` }] });
    }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method ${method}` } };
}

/** Pictures of the project at `seconds`, made by HyperFrames' own snapshot with the app's own copy of the CLI. */
export function snapshotLook(cliEntry, projectDir) {
  const looks = path.join(projectDir, ".cache", "kushmanji-look");
  return async (seconds) => {
    const out = path.join(looks, String(Date.now()));
    fs.mkdirSync(out, { recursive: true });
    const args = [cliEntry, "snapshot", projectDir, "--at", seconds.join(","), "--no-end", "-o", out,
      "--describe", "false"];
    const code = await new Promise((done) => {
      const child = spawn(process.execPath, args, {
        cwd: projectDir, windowsHide: true, stdio: ["ignore", "ignore", "pipe"],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      });
      const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
      child.on("error", () => done(-1));
      child.on("close", (exit) => {
        clearTimeout(timer);
        done(exit ?? -1);
      });
    });
    const files = fs.existsSync(out) ? fs.readdirSync(out).filter((name) => /\.png$/i.test(name)).sort() : [];
    if (code !== 0 || files.length === 0) throw new Error("the video could not be drawn just now; check it for mistakes first");
    // Older looks are not needed again; the newest few stay for the person to see.
    const older = fs.readdirSync(looks).filter((name) => /^\d+$/.test(name)).sort().slice(0, -KEEP_LOOKS);
    for (const name of older) fs.rmSync(path.join(looks, name), { recursive: true, force: true });
    // Each file says its moment ("frame-01-at-20s.png"): read it from there, whatever order they were made in.
    return files.slice(0, MAX_MOMENTS).map((name, index) => ({
      seconds: Number(/at-([\d.]+)s/.exec(name)?.[1] ?? seconds[index]), png: fs.readFileSync(path.join(out, name)),
    }));
  };
}

/** Serve on stdin and stdout, one JSON message per line, as MCP's stdio transport does. */
export function serve(look, input = process.stdin, output = process.stdout) {
  const lines = readline.createInterface({ input });
  lines.on("line", async (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const response = await answer(message, { look });
    if (response) output.write(`${JSON.stringify(response)}\n`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cliEntry, projectDir] = process.argv.slice(2);
  serve(snapshotLook(cliEntry, path.resolve(projectDir)));
}
