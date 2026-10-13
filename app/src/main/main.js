import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRunner } from "./agents/index.js";
import { cliVersion } from "./cli.js";
import { isCompositionPreview, PreviewManager } from "./preview.js";
import { pointingAt, pointingNote, readSelection } from "./selection.js";
import { importMedia, mediaFilesIn, MEDIA_EXTENSIONS } from "./mediaImport.js";
import {
  createProject,
  forgetFolder,
  isProject,
  listProjects,
  projectAt,
  rememberFolder,
} from "./projects.js";
import { runSmoke } from "./smoke.js";
import { FootageStudy } from "./study.js";
import { readClipStudy } from "./studyRead.js";
import { projectsRoot } from "./state.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const RENDERER = path.join(here, "..", "renderer", "index.html");
const PRELOAD = path.join(here, "..", "preload", "preload.cjs");

/** True for the top frame showing the app's own page file, and for nothing else. */
function fromAppPage(frame) {
  if (!frame || frame.parent !== null) return false;
  try {
    // Compared as paths, not text: Windows paths ignore case, and a URL can spell the same path several ways.
    return path.resolve(fileURLToPath(frame.url)).toLowerCase() === path.resolve(RENDERER).toLowerCase();
  } catch {
    return false; // Not a file: URL at all.
  }
}

// What Studio's editor needs from the browser: the clipboard, full screen, and the list of installed fonts for
// its font picker. Everything else a page can ask for (camera, microphone, location, notifications, screen
// capture...) is refused.
const ALLOWED_PERMISSIONS = new Set(["clipboard-read", "clipboard-sanitized-write", "fullscreen", "local-fonts"]);

/**
 * Refuse browser permissions app-wide, except the few above, and those only for Studio's own local server. A
 * composition can embed any web content, and that content must not inherit what the editor is trusted with.
 */
function lockDownSession() {
  // Trusted askers: Studio's local server, and the app's own page (the only file: page that can ever load here).
  const trusted = (origin) => isLocal(origin) || origin.startsWith("file://");
  const allowed = (permission, origin) => ALLOWED_PERMISSIONS.has(permission) && trusted(String(origin ?? ""));
  session.defaultSession.setPermissionRequestHandler((_contents, permission, respond, details) =>
    respond(allowed(permission, details.requestingUrl)),
  );
  session.defaultSession.setPermissionCheckHandler((_contents, permission, origin) => allowed(permission, origin));
}

/** Studio's own server. Anything else that asks for a window is the web and goes to the person's browser. */
const isLocal = (url) => /^http:\/\/127\.0\.0\.1(:\d+)?(\/|$)/.test(url);

let win = null;
const preview = new PreviewManager({
  onExit: (dir, code) => win?.webContents.send("preview:exit", { dir, code }),
});
/** Set while a chat turn waits for the footage study, so the chat can show which clip is being studied. */
let studyStep = null;
const study = new FootageStudy({
  emit: (payload) => {
    win?.webContents.send("study:event", payload);
    studyStep?.(payload);
  },
});
const agent = new AgentRunner({
  emit: (payload) => win?.webContents.send("agent:event", payload),
  // An agent never starts from a study that is missing the clip the person just added.
  prepare: async (dir, onStep) => {
    studyStep = ({ dir: studied, status }) => {
      if (studied !== dir || !status.running || !status.current) return;
      onStep("Studying your footage", `${status.current} (${status.done + 1} of ${status.total})`);
    };
    try {
      await study.ready(dir);
    } finally {
      studyStep = null;
    }
  },
});

/** A project folder passed on the command line, the way the official app is handed one by `hyperframes open`. */
function folderFromArgv(argv, cwd) {
  for (const arg of argv.slice(1).reverse()) {
    if (arg.startsWith("-")) continue;
    const dir = path.resolve(cwd, arg);
    if (isProject(dir)) return dir;
  }
  return null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: "#f3f1ee",
    autoHideMenuBar: true,
    title: "Kushmanji",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once("ready-to-show", () => win?.show());
  // The window holds one local page with Studio framed inside it. Nothing may replace that page (a file dropped
  // on the window would), and links to the web open in the person's browser.
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  // No <webview>: it would be a second, less restricted way to embed a page.
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocal(url)) return { action: "allow" };
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("closed", () => (win = null));
  return win.loadFile(RENDERER);
}

/**
 * Replies carry a plain `{ ok, value | error }` so the page shows our wording, not Electron's wrapper text.
 *
 * Only the app's own page is answered. Studio and the compositions it previews run in a frame inside that page;
 * they have no preload and so no way to call in, and this check means that even a mistake there cannot reach
 * the file system or start an agent.
 */
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!fromAppPage(event.senderFrame)) return { ok: false, error: "This request did not come from the app." };
    try {
      return { ok: true, value: await fn(...args) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

function requireProject(dir) {
  if (!isProject(dir)) throw new Error("That folder is not a HyperFrames project (it has no index.html).");
  return dir;
}

function registerIpc() {
  handle("app:info", () => ({
    appVersion: app.getVersion(),
    cliVersion,
    electron: process.versions.electron,
    projectsRoot: projectsRoot(),
  }));
  handle("projects:list", () => listProjects());
  handle("projects:create", (name) => createProject(name));
  handle("projects:fromFootage", async () => {
    if (agent.busy) throw new Error("Wait for the agent to finish before starting another project.");
    const options = { title: "Choose a folder of video clips", properties: ["openDirectory"] };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths[0]) return null;
    const folder = picked.filePaths[0];
    const files = await mediaFilesIn(folder);
    if (!files.length) throw new Error("That folder has no video, sound or picture files.");
    const project = await createProject(path.basename(folder));
    return { ...project, imported: await importMedia(project.dir, files) };
  });
  handle("projects:addMedia", async (dir) => {
    requireProject(dir);
    if (agent.busy) throw new Error("Wait for the agent to finish before adding footage.");
    const options = {
      title: "Add footage (your originals are kept)",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Video, sound and pictures", extensions: MEDIA_EXTENSIONS }],
    };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths.length) return null;
    const imported = await importMedia(dir, picked.filePaths);
    void study.run(dir);
    return imported;
  });
  handle("projects:pickFolder", async () => {
    const options = { title: "Open a HyperFrames project folder", properties: ["openDirectory"] };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths[0]) return null;
    const dir = requireProject(picked.filePaths[0]);
    rememberFolder(dir);
    return projectAt(dir);
  });
  handle("projects:open", async (dir) => {
    requireProject(dir);
    rememberFolder(dir);
    const started = await preview.start(dir);
    // After Studio is up, so the two do not compete while the person is waiting for the editor.
    study.open(dir);
    return started;
  });
  handle("projects:close", () => {
    agent.stop();
    study.close();
    preview.stop();
  });
  handle("projects:ready", async (dir) => {
    requireProject(dir);
    const current = preview.current;
    if (!win || current?.dir !== dir) return false;
    // Studio's page load is not the composition's first frame. Probe only our active local preview frame.
    const frame = win.webContents.mainFrame.framesInSubtree.find((item) => isCompositionPreview(item.url, current));
    return frame ? frame.executeJavaScript("window.__renderReady === true").catch(() => false) : false;
  });
  handle("projects:reveal", async (dir) => {
    const problem = await shell.openPath(requireProject(dir));
    if (problem) throw new Error(problem);
  });
  handle("projects:forget", (dir) => forgetFolder(String(dir)));
  handle("preview:log", () => preview.log);

  handle("study:status", (dir) => study.status(requireProject(dir)));
  handle("study:clip", ({ dir, file } = {}) => readClipStudy(requireProject(dir), String(file)));
  handle("study:run", (dir) => void study.run(requireProject(dir), { force: true }));
  handle("study:setLanguage", ({ dir, language } = {}) =>
    study.setLanguage(requireProject(dir), language == null ? null : String(language)),
  );

  handle("agent:status", () => agent.status());
  handle("agent:history", (dir) => agent.history(requireProject(dir)));
  // What the person has selected in Studio, for the chat's "Pointing at" line. Only for the open project.
  const selected = async (dir) => {
    const current = preview.current;
    if (!current?.serverUrl || current.dir !== dir) return { selection: null, updatedAt: null };
    return readSelection(current);
  };
  handle("selection:get", async (dir) => {
    const { selection, updatedAt } = await selected(requireProject(dir));
    return pointingAt(selection, updatedAt ?? "");
  });
  // `pointing` only says whether to include the selection. The selection itself is read here, from Studio's
  // server, at the moment of sending: the page is not trusted to describe an element.
  handle("agent:send", async ({ dir, text, pointing } = {}) => {
    const { selection } = pointing ? await selected(requireProject(dir)) : { selection: null };
    const shown = pointingAt(selection);
    return agent.send({
      dir: requireProject(dir),
      text,
      pointing: shown ? { ...shown, note: pointingNote(selection) } : null,
    });
  });
  handle("agent:choose", ({ dir, engine } = {}) => agent.choose(requireProject(dir), String(engine)));
  handle("agent:chooseModel", ({ engine, model } = {}) =>
    agent.chooseModel(String(engine), model == null ? null : String(model)),
  );
  handle("agent:chooseMode", ({ dir, mode } = {}) => agent.chooseMode(requireProject(dir), String(mode)));
  handle("agent:chooseAccess", ({ dir, level } = {}) => agent.chooseAccess(requireProject(dir), String(level)));
  handle("agent:stop", () => agent.stop());
  handle("agent:reset", (dir) => agent.reset(requireProject(dir)));
}

// The self-test keeps its own settings folder, so it cannot change the person's settings, and it can run while
// their app is open (the one-copy lock below is per settings folder). Must be set before that lock is taken.
if (process.env.HFWIN_SMOKE) app.setPath("userData", path.join(process.env.HFWIN_SMOKE, "user-data"));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv, cwd) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const dir = folderFromArgv(argv, cwd);
    if (dir) win.webContents.send("app:open-project", { dir });
  });

  app.on("window-all-closed", () => app.quit());
  // Synchronous: an async kill started here is abandoned when the process exits, leaving the server running.
  app.on("will-quit", () => {
    agent.stop({ sync: true });
    study.close({ sync: true });
    preview.stop({ sync: true });
  });

  // Not `await app.whenReady()`: Electron holds back "ready" until this module has finished loading, so a
  // top-level await on it waits for itself and the app never starts.
  void app.whenReady().then(async () => {
    lockDownSession();
    registerIpc();
    await createWindow();

    const smokeDir = process.env.HFWIN_SMOKE;
    if (smokeDir) {
      void runSmoke({ win, outDir: smokeDir });
    } else {
      const dir = folderFromArgv(process.argv, process.cwd());
      if (dir) win?.webContents.send("app:open-project", { dir });
    }
  });
}
