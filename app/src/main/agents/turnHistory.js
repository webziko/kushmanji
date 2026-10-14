// Undo for each assistant turn (M2-10), on HyperFrames' own history. `history begin` before the assistant starts and
// `history end` when it stops make everything it wrote one entry under its name; `history undo` puts those files
// back as they were, and is itself an entry, so undoing the undo brings the change back. Studio's history panel
// shows the same entries. Each call is the CLI with an argument list; no text the person typed is on it.
import { runCli } from "../cli.js";

const TIMEOUT_MS = 60_000;

/** The CLI's JSON answer. It prints one object; anything before it (a warning) is skipped. */
export function cliAnswer(stdout) {
  const text = String(stdout ?? "");
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

/** The label shown in Studio's history panel: the assistant and the time, never the request's own words. */
export function turnLabel(who, at = new Date()) {
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${who}: chat request at ${time}`;
}

export const turnHistory = {
  /** Open a turn for `who`. Its id, or null when history is not available (then the turn has no undo). */
  async begin(dir, who) {
    const out = await runCli(["history", "begin", "--dir", dir, "--who", who, "--label", turnLabel(who), "--json"],
      { cwd: dir, timeoutMs: TIMEOUT_MS });
    return out.code === 0 ? cliAnswer(out.stdout)?.entryId ?? null : null;
  },

  /** Close the open turn: `{ id, files }`, or null when nothing was recorded. */
  async end(dir) {
    const out = await runCli(["history", "end", "--dir", dir, "--json"], { cwd: dir, timeoutMs: TIMEOUT_MS });
    const entry = out.code === 0 ? cliAnswer(out.stdout)?.entry : null;
    return entry?.id ? { id: String(entry.id), files: (entry.files ?? []).map(String) } : null;
  },

  /** Undo one entry. `{ id, files }` of the undo itself; throws a plain sentence when it cannot be done. */
  async undo(dir, id) {
    const out = await runCli(["history", "undo", id, "--dir", dir, "--json"], { cwd: dir, timeoutMs: TIMEOUT_MS });
    const answer = cliAnswer(out.stdout);
    if (out.code !== 0 || !answer?.ok) {
      const why = answer?.error ? ` (${String(answer.error).slice(0, 200)})` : "";
      throw new Error(`That change could not be undone${why}. Your video was not changed.`);
    }
    return { id: answer.entry?.id ? String(answer.entry.id) : null, files: (answer.entry?.files ?? []).map(String) };
  },
};
