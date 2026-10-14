// Studio's "Ask agent" buttons go to the chat (M3-02). Studio has several: on a selected element, on a stretch of
// the timeline, in its list of mistakes and console errors, on a ready-made piece. Each builds a request for an AI
// assistant and copies it to the clipboard, to be pasted into some other program. Inside Kushmanji the assistant
// is right beside the editor, so those copies, and only those, are handed to the chat's message box instead. The
// person reads it there and presses Send; nothing is sent by itself.

// How each of Studio's requests begins (hyperframes 0.8.149). Anything else, a file path or a setting, is copied
// as usual. An update that rewords them only means the request goes to the clipboard again.
export const PROMPT_STARTS = [
  "## HyperFrames element edit request",
  "Edit the following HyperFrames composition:",
  "Fix these HyperFrames lint issues",
  "Fix these runtime console errors",
  "Using /hyperframes, add the ",
];

/** Whether a copied text is one of Studio's requests for an assistant. */
export function isAgentPrompt(text) {
  return typeof text === "string" &&
    (PROMPT_STARTS.some((start) => text.startsWith(start)) || /^Element: .*\nFile: /.test(text));
}

// Runs in Studio's own page, once per load. Studio copies through the Clipboard API (with a fallback it only
// takes when that fails), so wrapping it catches every one of its "Ask agent" buttons.
function catchAgentPrompts(starts, elementPattern) {
  if (window.__kushmanjiAsk) return true;
  window.__kushmanjiAsk = true;
  const element = new RegExp(elementPattern);
  const mine = (text) => typeof text === "string" && (starts.some((start) => text.startsWith(start)) || element.test(text));
  const write = Clipboard.prototype.writeText;
  Clipboard.prototype.writeText = function writeText(text) {
    if (!mine(text)) return write.call(this, text);
    window.parent.postMessage({ source: "kushmanji-studio", type: "ask-agent", text: String(text).slice(0, 20_000) }, "*");
    return Promise.resolve();
  };
  return true;
}

/** Whether `frame` is the open project's Studio page, directly inside the app's own page. */
export function isStudioFrame(frame, mainFrame, current) {
  if (!frame || !current?.studioUrl || frame.parent !== mainFrame) return false;
  try {
    const url = new URL(frame.url);
    const studio = new URL(current.studioUrl);
    return url.origin === studio.origin && url.pathname === studio.pathname;
  } catch {
    return false;
  }
}

/** Add the catcher to Studio's page each time it loads. `currentPreview()` is the running preview, or null. */
export async function catchStudioAsks(win, currentPreview) {
  // Imported here so the unit test, which runs in plain Node, can load this file.
  const { webFrameMain } = await import("electron");
  const page = win.webContents;
  page.on("did-frame-finish-load", (_event, isMainFrame, processId, routingId) => {
    if (isMainFrame) return;
    let frame = null;
    try {
      frame = webFrameMain.fromId(processId, routingId);
    } catch {
      return;
    }
    if (!isStudioFrame(frame, page.mainFrame, currentPreview())) return;
    frame.executeJavaScript(`(${catchAgentPrompts.toString()})(${JSON.stringify(PROMPT_STARTS)}, ${JSON.stringify("^Element: .*\\nFile: ")})`)
      .catch(() => {});
  });
}
