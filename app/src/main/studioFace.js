// Kushmanji's face on HyperFrames' editor (M14-14). "Edit by hand" shows Studio, HyperFrames' own editor, in a frame;
// it wore the HeyGen HyperFrames logo and HyperFrames' green, and the owner saw it as not our app ("still hyperframes
// logo ... dint go"). AGENTS.md says the app must not show HeyGen's logo. Studio is not changed on disk: each time its
// page loads, a small stylesheet hides the logo and gives its accent colour Kushmanji's coral. Credit stays in
// "About Kushmanji". Studio draws the logo as `<svg aria-label="Hyperframes">` followed by a "|" separator
// (packages/studio/src/components/StudioHeader.tsx) and takes every accent from four theme variables (styles/theme.css):
// when the CLI is bumped, check both still hold (docs/MAINTENANCE.md).
import { isStudioFrame } from "./askAgent.js";

/** The coral of styles.css `:root` (--accent, --accent-hover, --accent-ink), on the names Studio's theme uses. */
export const STUDIO_CSS = `
svg[aria-label="Hyperframes"],
svg[aria-label="Hyperframes"] + [aria-hidden="true"] { display: none !important; }
:root {
  --color-accent: #ce4630 !important;
  --color-accent-hover: #b53a26 !important;
  --color-accent-ink: #a02f1b !important;
  --color-on-accent: #ffffff !important;
}
`;

// Runs in Studio's page. Once per page: a reload brings a fresh page without it.
function addStyle(css) {
  if (document.getElementById("kushmanji-face")) return;
  const style = document.createElement("style");
  style.id = "kushmanji-face";
  style.textContent = css;
  (document.head ?? document.documentElement).append(style);
}

/** Dress Studio's page each time it loads. `currentPreview()` is the running preview, or null. */
export async function dressStudio(win, currentPreview) {
  // Imported here so a unit test, which runs in plain Node, can load this file.
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
    frame.executeJavaScript(`(${addStyle.toString()})(${JSON.stringify(STUDIO_CSS)})`).catch(() => {});
  });
}
