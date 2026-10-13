import path from "node:path";
import { spawnCli } from "./cli.js";
import { killTree } from "./proc.js";

// One fixed port, so Studio keeps one origin and with it its saved theme, panel layout and export settings
// (browser storage is per origin, and a new port is a new origin). The CLI moves up if this one is taken.
const BASE_PORT = 48620;
const READY_TIMEOUT_MS = 90_000;
const LOG_LINES = 200;

/** Studio keeps its last selected scene, so the first visible preview need not be index.html. */
export function isCompositionPreview(given, { serverUrl, projectName }) {
  try {
    const url = new URL(given);
    const route = url.pathname.match(/^\/api\/projects\/([^/]+)\/preview(?:\/comp\/.+)?$/);
    return url.origin === serverUrl && Boolean(route) && decodeURIComponent(route[1]) === projectName;
  } catch { return false; }
}

/** The line `hyperframes preview --json` prints once the server answers. */
function readyResult(line) {
  if (!line.startsWith("{")) return null;
  try {
    const payload = JSON.parse(line);
    return payload?.operation === "start" && payload.ok === true ? payload.result : null;
  } catch {
    return null;
  }
}

/**
 * Runs the open-source preview server (Studio's UI and its API) for the open project.
 * One project at a time: opening another stops the first.
 */
export class PreviewManager {
  #session = null;
  #onExit;

  /** `onExit(dir, code)` runs when a running server dies without being asked to. */
  constructor({ onExit } = {}) {
    this.#onExit = onExit;
  }

  get current() {
    return this.#session && { dir: this.#session.dir, ...this.#session.info };
  }

  /** The last lines the server printed, for an error message or a bug report. */
  get log() {
    return this.#session?.log.join("\n") ?? "";
  }

  async start(dir) {
    if (this.#session?.dir === dir) return this.#session.ready;
    this.stop();

    const child = spawnCli(
      ["preview", dir, "--foreground", "--no-open", "--force-new", "--json", "--port", String(BASE_PORT)],
      { cwd: dir, projectDir: dir },
    );
    // Decode as a stream, or a character split across two chunks arrives as two broken halves.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    const log = [];
    const keep = (text) => {
      for (const line of String(text).split(/\r?\n/)) if (line.trim()) log.push(line);
      if (log.length > LOG_LINES) log.splice(0, log.length - LOG_LINES);
    };

    const ready = new Promise((resolve, reject) => {
      let pending = "";
      let settled = false;
      const settle = (act, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        act(value);
      };
      const fail = (message) => {
        const tail = log.slice(-8).join("\n");
        settle(reject, new Error(tail ? `${message}\n${tail}` : message));
      };
      const timer = setTimeout(() => {
        fail("Studio took too long to start.");
        killTree(child.pid);
      }, READY_TIMEOUT_MS);

      child.stdout.on("data", (chunk) => {
        pending += chunk;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? "";
        for (const line of lines) {
          const result = readyResult(line.trim());
          if (!result) {
            keep(line);
            continue;
          }
          // 127.0.0.1 rather than localhost: Windows may resolve localhost to ::1 first, where nothing listens.
          const serverUrl = `http://127.0.0.1:${result.port}`;
          const projectName = result.projectName ?? path.basename(dir);
          settle(resolve, {
            port: result.port,
            serverUrl,
            studioUrl: `${serverUrl}/#project/${encodeURIComponent(projectName)}`,
            projectName,
          });
        }
      });
      child.stderr.on("data", keep);
      child.on("error", (error) => fail(`Studio could not start: ${error.message}`));
      child.on("close", (code) => {
        const wasReady = settled;
        fail(`Studio stopped before it was ready (exit code ${code}).`);
        // Still the open project's server: it died by itself, so the window has to know. A stop() clears the
        // session first and so never reports.
        if (this.#session?.child !== child) return;
        this.#session = null;
        if (wasReady) this.#onExit?.(dir, code);
      });
    });

    const session = { dir, child, log, ready, info: null };
    this.#session = session;
    try {
      session.info = await ready;
      return session.info;
    } catch (error) {
      if (this.#session === session) this.#session = null;
      throw error;
    }
  }

  stop({ sync = false } = {}) {
    const session = this.#session;
    if (!session) return;
    this.#session = null;
    killTree(session.child.pid, { sync });
  }
}
