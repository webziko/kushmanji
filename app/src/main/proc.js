import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

// By full path, so a PATH that lost System32 (it happens in stripped-down shells) cannot break shutdown.
const TASKKILL = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");

/**
 * End a process and everything it started.
 *
 * Windows has no process group a parent can signal: `child.kill()` ends that one process and leaves its children
 * running. The preview server starts Chrome and FFmpeg, so a plain kill leaks them and keeps the port bound.
 * `sync` is for app shutdown, where an async kill would be abandoned mid-flight.
 */
export function killTree(pid, { sync = false } = {}) {
  if (!pid) return;
  if (process.platform === "win32") {
    const args = ["/pid", String(pid), "/T", "/F"];
    const options = { windowsHide: true, stdio: "ignore" };
    if (sync) spawnSync(TASKKILL, args, options);
    else spawn(TASKKILL, args, options).on("error", () => {});
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already gone.
  }
}

/**
 * Collect a child's output and exit code. Never rejects: a spawn failure is reported as code -1.
 * `closeStdin` is for a child started with a stdin pipe that has nothing to read: left open, some tools wait on it.
 */
export function collect(child, { timeoutMs = 0, closeStdin = false } = {}) {
  if (closeStdin) child.stdin?.end();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timer = null;
    let timedOut = false;
    // Decode as a stream, or a character split across two chunks arrives as two broken halves.
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    const finish = (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    };
    child.on("error", (error) => {
      stderr += String(error?.message ?? error);
      finish(-1);
    });
    child.on("close", (code) => finish(code ?? -1));
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        killTree(child.pid);
      }, timeoutMs);
    }
  });
}
