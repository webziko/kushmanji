// Pointing instead of describing. When the person clicks something in Studio's picture or timeline, Studio
// tells its own local server what is selected (`PUT /api/projects/:id/selection`, upstream's
// studio-server/src/routes/selection.ts). This reads it back, so the chat can show "Pointing at: City Centre"
// and hand the agent the element itself instead of the person's description of it.
//
// Nothing is injected into Studio and nothing is taken from the page: the main process asks the server. What
// comes back is still text from a project file, so every field is cut to a sane length before it is used.

const cut = (value, max) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

const KINDS = { video: "video clip", audio: "sound", img: "picture", svg: "graphic", canvas: "graphic" };

/** What kind of thing it is, in the person's words. A tag with words in it is "text". */
function kindOf(selection) {
  const tag = String(selection.tagName ?? "").toLowerCase();
  if (KINDS[tag]) return KINDS[tag];
  if (selection.dataAttributes?.["composition-src"] || selection.dataAttributes?.["composition-id"]) return "scene";
  return selection.textContent?.trim() ? "text" : "element";
}

/** 75.25 → "1:15". Close enough to say where on the timeline something is. */
const clock = (seconds) => {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/**
 * What the chat shows for a selection: `{ key, name, kind, when }`, or null for nothing usable. `key` changes
 * when the person selects something else, so a dismissed chip stays dismissed only for that selection.
 */
export function pointingAt(selection, updatedAt = "") {
  if (!selection || typeof selection !== "object" || !selection.target) return null;
  const data = selection.dataAttributes ?? {};
  const kind = kindOf(selection);
  // The name the person gave it on the timeline, else its words, else Studio's own label for it.
  const name = cut(data.label || (kind === "text" ? selection.textContent : "") || selection.label || selection.tagName, 60);
  if (!name) return null;
  const start = Number(data.start);
  const length = Number(data.duration);
  const when = Number.isFinite(start)
    ? `${clock(start)}${Number.isFinite(length) ? ` to ${clock(start + length)}` : ""}`
    : "";
  return { key: `${selection.target.hfId ?? selection.target.id ?? selection.target.selector ?? name}@${updatedAt}`, name, kind, when };
}

/** What the agent is told about the selection, in front of the person's request. */
export function pointingNote(selection) {
  const shown = pointingAt(selection);
  if (!shown) return "";
  const data = selection.dataAttributes ?? {};
  const target = selection.target;
  const tag = cut(selection.tagName, 20).toLowerCase();
  const address = [
    target.id ? `id="${cut(target.id, 80)}"` : "",
    target.hfId ? `data-hf-id="${cut(target.hfId, 40)}"` : "",
    !target.id && !target.hfId && target.selector ? `selector ${cut(target.selector, 120)}` : "",
  ].filter(Boolean);
  const lines = [
    `- What: the ${shown.kind} "${shown.name}" (<${tag}${address.length ? ` ${address.join(" ")}` : ""}>)`,
    `- File: ${cut(selection.sourceFile, 200)}` +
      (selection.compositionPath && selection.compositionPath !== selection.sourceFile
        ? `, shown in ${cut(selection.compositionPath, 200)}`
        : ""),
    data.start !== undefined ? `- On the timeline: starts at ${cut(data.start, 12)}s` + (data.duration !== undefined ? `, lasts ${cut(data.duration, 12)}s` : "") : "",
    selection.textContent?.trim() ? `- Its words: "${cut(selection.textContent, 300)}"` : "",
    Number.isFinite(selection.currentTime) ? `- The playhead was at ${Math.round(selection.currentTime * 100) / 100}s` : "",
  ].filter(Boolean);
  return (
    "The person is pointing at one thing in the preview. Their request is about it unless they say otherwise:\n" +
    `${lines.join("\n")}\n` +
    "Change that element, and only what the request needs around it. Say what you changed by its name on " +
    "screen, not by its id."
  );
}

/** The current selection as Studio's server holds it: `{ selection, updatedAt }`, both null when there is none. */
export async function readSelection({ serverUrl, projectName }) {
  try {
    const reply = await fetch(`${serverUrl}/api/projects/${encodeURIComponent(projectName)}/selection`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!reply.ok) return { selection: null, updatedAt: null };
    const body = await reply.json();
    return { selection: body?.selection ?? null, updatedAt: body?.updatedAt ?? null };
  } catch {
    // Studio is still starting, or has stopped: nothing is selected as far as the chat is concerned.
    return { selection: null, updatedAt: null };
  }
}
