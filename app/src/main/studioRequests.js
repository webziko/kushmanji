// Requests from Studio's page that Kushmanji refuses. Electron keeps one onBeforeRequest listener per session, so
// main.js's single listener asks here first, then hands Studio's project requests to lightCopies.js.
//
// HyperFrames 0.9 added an "Install the desktop app" button to Studio's header, with HyperFrames' logo, that offers
// HeyGen's own desktop app. Kushmanji is the person's desktop app and shows no HyperFrames logo (M14-14). Studio
// shows the button only when its server answers GET /api/open-in-desktop (upstream
// packages/studio/src/components/OpenInDesktopButton.tsx: no answer, no button), and POST there would open HeyGen's
// app. Refusing that one path hides the button and leaves the rest of Studio alone.

/** The URL patterns main.js listens to. A pattern without a port matches every port. */
export const STUDIO_REQUESTS = ["http://127.0.0.1/api/projects/*", "http://127.0.0.1/api/open-in-desktop*"];

/** Whether Kushmanji answers this request with "no". */
export function refused(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.hostname === "127.0.0.1" && parsed.pathname === "/api/open-in-desktop";
}
