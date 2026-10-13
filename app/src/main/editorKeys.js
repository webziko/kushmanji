import { runPlayerCommand } from "./player.js";
import { studioPreviewFrame } from "./preview.js";

// In "Edit by hand" an arrow key belongs to the editor, where it means "one frame": the video moves a thirtieth
// of a second and stops. The owner pressed it to go forward, twice, and got a paused video ("its not going
// forward its pausing"). So while the video is playing, a plain arrow does what it does on the watching
// screen: ten seconds back or forward, still playing. While it is paused, and whenever the person is typing or
// using a control that has its own arrows, the editor keeps its key.
//
// The key is caught in the main process, before the editor's page sees it. Nothing is added to the editor's
// page; the skip itself is the same fixed playback command the watching screen uses.

export const SKIP_SECONDS = 10;

/** Ten seconds forward or back for a plain arrow going down, 0 for anything else. */
export function arrowSkip(input) {
  if (input?.type !== "keyDown" || input.isAutoRepeat) return 0;
  if (input.shift || input.control || input.alt || input.meta) return 0;
  return input.key === "ArrowRight" ? SKIP_SECONDS : input.key === "ArrowLeft" ? -SKIP_SECONDS : 0;
}

// Runs in the editor's page: is the keyboard somewhere that uses arrows for itself?
function arrowsAreTaken() {
  const owner = "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='slider'], " +
    "[role='spinbutton'], [role='textbox'], [role='combobox'], [role='listbox'], [role='option'], [role='tab'], " +
    "[role='radio'], [role='menu'], [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], " +
    "[role='tree'], [role='treeitem'], [role='grid'], [role='gridcell']";
  const focused = document.activeElement;
  return Boolean(focused?.closest?.(owner)) || Boolean(document.querySelector("[role='dialog'][aria-modal='true']"));
}

/**
 * Whether a key belongs to us can only be answered at once, and what the editor is doing can only be asked
 * for, so the answer is kept fresh a few times a second while an editor is on screen. `currentPreview()` is the
 * running preview server's `{ serverUrl, projectName, studioUrl }`, or null.
 */
export function watchEditorKeys(win, currentPreview) {
  const page = win.webContents;
  let state = null;
  let asking = false;
  const refresh = async () => {
    if (asking) return;
    const current = currentPreview();
    const shown = current && win.isVisible() && !win.isMinimized();
    const frame = shown ? studioPreviewFrame(page.mainFrame.framesInSubtree, current) : null;
    if (!frame?.parent) {
      state = null;
      return;
    }
    asking = true;
    try {
      const [playing, taken] = await Promise.all([
        frame.executeJavaScript("window.__renderReady === true && window.__player?.isPlaying?.() === true"),
        frame.parent.executeJavaScript(`(${arrowsAreTaken.toString()})()`),
      ]);
      state = { frame, playing: playing === true, taken: taken === true };
    } catch {
      // The frame went away between the look and the question: the editor is closing or reloading.
      state = null;
    } finally {
      asking = false;
    }
  };
  const timer = setInterval(() => void refresh(), 250);
  page.on("before-input-event", (event, input) => {
    const seconds = arrowSkip(input);
    if (!seconds || !state?.playing || state.taken) return;
    // Only when the keyboard is in the editor or its picture; the chat box beside it keeps its arrows.
    const focused = page.focusedFrame?.frameTreeNodeId;
    if (focused !== state.frame.frameTreeNodeId && focused !== state.frame.parent?.frameTreeNodeId) return;
    event.preventDefault();
    runPlayerCommand(state.frame, { action: "skip", value: seconds }).catch(() => {});
  });
  win.on("closed", () => clearInterval(timer));
}
