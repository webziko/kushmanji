import path from "node:path";
import { fileURLToPath } from "node:url";
import { whereAll } from "./launcher.js";

// Puts the app's check in front of FFmpeg for an agent's run.
//
// At "Project only" and "Editing tools" the agent's PATH starts with tools/bin, whose `ffmpeg` and `ffprobe`
// run tools/guard.mjs instead of the real programs. The guard refuses outright at "Project only", and at
// "Editing tools" lets a command through only when every file it names is inside the project. At "Full access"
// nothing is put in front.
//
// The same two names serve every agent and every shell, so an agent types `ffmpeg` as it always would and the
// HyperFrames skills' own recipes work unchanged.

// In a packaged app these files must sit outside the archive, where a shell can run them (M5-01: unpack
// `src/main/agents/tools`).
const here = path.dirname(fileURLToPath(import.meta.url)).replace("app.asar", "app.asar.unpacked");
export const SHIM_DIR = path.join(here, "tools", "bin");
export const GUARD = path.join(here, "tools", "guard.mjs");

const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** The real program: the person's own override if they set one, else the first .exe on PATH that is not ours. */
function findReal(name, override) {
  if (override?.trim()) return path.resolve(override.trim());
  return whereAll(name).find((file) => /\.exe$/i.test(file) && !samePath(path.dirname(file), SHIM_DIR)) ?? null;
}

/**
 * What runs the guard: Node when it is installed, because it starts in a twentieth of a second, else the app's
 * own Electron as Node (over half a second per FFmpeg call, but always there).
 */
const findNode = () => whereAll("node").find((file) => /\.exe$/i.test(file)) ?? process.execPath;

/** Windows names the variable `Path`; a plain copy of the environment keeps whatever spelling it had. */
const pathKey = (env) => Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "Path";

/**
 * The environment for one agent run at `access`, built on `env` (already cleaned by `agentEnv`).
 * `find` is replaceable so the tests need no FFmpeg.
 */
export function mediaToolsEnv(env, { dir, access }, find = { real: findReal, node: findNode }) {
  if (access === "full") return env;
  const ffmpeg = find.real("ffmpeg", env.HYPERFRAMES_FFMPEG_PATH);
  const ffprobe = find.real("ffprobe", env.HYPERFRAMES_FFPROBE_PATH);
  const key = pathKey(env);
  return {
    ...env,
    [key]: [SHIM_DIR, env[key]].filter(Boolean).join(path.delimiter),
    HFWIN_NODE: find.node(),
    HFWIN_GUARD: GUARD,
    HFWIN_PROJECT: dir,
    HFWIN_ACCESS: access === "tools" ? "tools" : "project",
    ...(ffmpeg ? { HFWIN_FFMPEG: ffmpeg } : {}),
    ...(ffprobe ? { HFWIN_FFPROBE: ffprobe } : {}),
    // HyperFrames' own commands (render, snapshot, transcribe) write to its cache and temp folders, outside the
    // project. They are told where the real programs are, so they do not go through the check meant for the
    // agent's own FFmpeg calls.
    ...(ffmpeg ? { HYPERFRAMES_FFMPEG_PATH: ffmpeg } : {}),
    ...(ffprobe ? { HYPERFRAMES_FFPROBE_PATH: ffprobe } : {}),
  };
}
