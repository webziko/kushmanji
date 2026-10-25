// "Free up space" (M16-09). HyperFrames keeps a full copy of every video in its undo history, in the person's home
// folder (UP-02), and keeps the history of a video even after the video is deleted. Its own `clean` command
// removes what belongs to videos that are gone (and its other caches), and says how much first with `--dry-run`.
// Home shows the total and offers that, nothing more: the history of a video that still exists is its undo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCli } from "./cli.js";

const MAX_ENTRIES = 200_000;

export const historyRoot = () => path.join(os.homedir(), ".cache", "hyperframes", "history");

/** The bytes in a folder and everything under it, giving up quietly after very many entries. */
export async function folderBytes(dir) {
  let total = 0;
  let seen = 0;
  const walk = async (folder) => {
    let entries = [];
    try {
      entries = await fs.promises.readdir(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (++seen > MAX_ENTRIES) return;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) total += (await fs.promises.stat(full).catch(() => ({ size: 0 }))).size;
    }
  };
  await walk(dir);
  return total;
}

/** "1.3 GB", "640 MB", "12 KB": sizes as a person reads them. */
export function sizeText(bytes) {
  const units = [["GB", 1024 ** 3], ["MB", 1024 ** 2], ["KB", 1024]];
  for (const [unit, size] of units) {
    if (bytes >= size) return `${(bytes / size).toFixed(bytes >= size * 10 ? 0 : 1)} ${unit}`;
  }
  return `${Math.max(0, Math.round(bytes))} bytes`;
}

/** Run `hyperframes clean` against an empty folder of its own, so it only sweeps HyperFrames' shared caches. */
async function clean(dryRun) {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "kushmanji-clean-"));
  try {
    const out = await runCli(["clean", empty, ...(dryRun ? ["--dry-run"] : []), "--json"],
      { cwd: empty, timeoutMs: 300_000 });
    const text = String(out.stdout ?? "");
    const answer = JSON.parse(text.slice(text.indexOf("{")));
    return Number(answer.totalBytes) || 0;
  } catch {
    return 0;
  } finally {
    try {
      fs.rmSync(empty, { recursive: true, force: true });
    } catch {
      // Windows keeps the folder (EPERM) for a moment after the program that ran in it has ended. That must never
      // cost the answer: looking at the room would fail and Home and Settings would show nothing. Tried again in
      // the background, and left for the system's own temp cleaning if it still holds on.
      fs.rm(empty, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }, () => {});
    }
  }
}

// Counting the history and asking `clean` take seconds; Home asks often. Kept a while, and dropped after freeing.
const KEEP_MS = 10 * 60_000;
let kept = null;

export async function storageStatus() {
  if (kept && Date.now() - kept.at < KEEP_MS) return kept.value;
  const [historyBytes, freeableBytes] = await Promise.all([folderBytes(historyRoot()), clean(true)]);
  const value = { historyBytes, freeableBytes, history: sizeText(historyBytes), freeable: sizeText(freeableBytes) };
  kept = { at: Date.now(), value };
  return value;
}

export async function freeUpSpace() {
  kept = null;
  const freedBytes = await clean(false);
  return { freedBytes, freed: sizeText(freedBytes) };
}
