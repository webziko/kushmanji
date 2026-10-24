// Undo for each assistant turn (M2-10), on HyperFrames' own history. While a project is open, its preview server
// keeps that history and refuses the CLI's `history` commands ("This project is open in another app"), so this
// talks to the server: a history "window" opened before the assistant starts and closed when it stops makes
// everything written in between one entry under the assistant's name, and undo puts those files back. The undo is
// itself an entry, so undoing the undo brings the change back. Studio's history panel shows the same entries.
import { say } from "../say.js";

// A window ends by itself after this long without a write (the server's own limit is ten minutes; its default of
// thirty seconds is shorter than an assistant often thinks). Writes after that are still kept in the history, as
// changes made outside the app, but are not part of this turn's undo.
const QUIET_MS = 10 * 60_000;
const TIMEOUT_MS = 30_000;

/** The label shown in Studio's history panel: the assistant and the time, never the request's own words. */
export function turnLabel(who, at = new Date()) {
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${who}: chat request at ${time}`;
}

/** The history routes of the preview server running `dir`, or null when that project is not the open one. */
export function historyBase(current, dir) {
  if (!current?.serverUrl || !current.projectName || !dir) return null;
  if (String(current.dir).toLowerCase() !== String(dir).toLowerCase()) return null;
  return `${current.serverUrl}/api/projects/${encodeURIComponent(current.projectName)}/history`;
}

/** The server lists an entry's files as `{ path, ... }` (the CLI prints plain names): either way, the names. */
export const fileNames = (files) => (Array.isArray(files) ? files : [])
  .map((file) => (typeof file === "string" ? file : file?.path)).filter(Boolean).map(String);

/** `currentPreview()` is the running preview server's `{ dir, serverUrl, projectName }`, or null. */
export function turnHistory(currentPreview, { fetch: send = fetch } = {}) {
  const post = async (dir, route, body) => {
    const base = historyBase(currentPreview(), dir);
    if (!base) throw new Error(say("Open this video first."));
    const response = await send(`${base}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const answer = await response.json().catch(() => null);
    if (!response.ok) throw new Error(String(answer?.error ?? `HTTP ${response.status}`).slice(0, 200));
    return answer;
  };
  const windows = new Map();
  return {
    /** Open a turn for `who`. True when it is being recorded (otherwise the turn simply has no undo). */
    async begin(dir, who) {
      const answer = await post(dir, "/window", { who: { kind: "agent", name: who }, label: turnLabel(who), idleMs: QUIET_MS });
      if (!answer?.windowId) return false;
      windows.set(dir, String(answer.windowId));
      return true;
    },

    /** Close the open turn: `{ id, files }`, or null when nothing was recorded. */
    async end(dir) {
      const id = windows.get(dir);
      windows.delete(dir);
      if (!id) return null;
      const entry = (await post(dir, `/window/${encodeURIComponent(id)}/close`))?.entry;
      return entry?.id ? { id: String(entry.id), files: fileNames(entry.files) } : null;
    },

    /** Undo one entry. `{ id, files }` of the undo itself; a plain sentence when it cannot be done. */
    async undo(dir, entryId) {
      let answer;
      try {
        answer = await post(dir, "/undo", { entryId });
      } catch (error) {
        // The reason is the server's own English, or "Open this video first." above.
        throw new Error(say("That change could not be undone ({reason}). Your video was not changed.",
          { reason: error.message }));
      }
      const entry = answer?.entry ?? answer;
      return { id: entry?.id ? String(entry.id) : null, files: fileNames(entry?.files) };
    },
  };
}
