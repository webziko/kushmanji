import { app, BrowserWindow, dialog, ipcMain, screen, session, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeGuide } from "./agents/craft.js";
import { AgentRunner } from "./agents/index.js";
import { catchStudioAsks } from "./askAgent.js";
import { checkTurn } from "./agents/turnCheck.js";
import { turnHistory } from "./agents/turnHistory.js";
import { whereAll } from "./agents/launcher.js";
import { cliVersion } from "./cli.js";
import { watchEditorKeys } from "./editorKeys.js";
import { ExportManager } from "./exporter.js";
import { captureBox, readCover, saveCover } from "./covers.js";
import { checkHealth, getBrowser } from "./health.js";
import { freeUpSpace, storageStatus } from "./storage.js";
import { hasStyle, listKits, saveKit, useKit } from "./kits.js";
import { LightCopies } from "./lightCopies.js";
import { placeToOpen } from "./windowPlace.js";
import { PreviewManager, studioPreviewFrame } from "./preview.js";
import { readPlaybackMoment, rootPlayerFrame, runPlayerCommand } from "./player.js";
import { pointingAt, pointingNote, readSelection } from "./selection.js";
import { importMedia, mediaFilesIn, MEDIA_EXTENSIONS } from "./mediaImport.js";
import { listMentionable, validateDropped } from "./mentions.js";
import {
  createProject,
  forgetFolder,
  isProject,
  listProjects,
  projectAt,
  rememberFolder,
} from "./projects.js";
import { runSmoke } from "./smoke.js";
import { SpeechTool } from "./speechTool.js";
import { FootageStudy } from "./study.js";
import { readClipStudy } from "./studyRead.js";
import { projectsRoot, readState, updateState } from "./state.js";

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
  // A video Studio's preview asks for is answered with its lighter copy when one is ready (lightCopies.js).
  // Electron keeps one listener per event: anything else that needs onBeforeRequest has to share this one.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://127.0.0.1/api/projects/*"] }, (details, respond) => {
    const redirectURL = details.method === "GET" ? lightCopies.redirect(details.url, preview.current) : null;
    respond(redirectURL ? { redirectURL } : {});
  });
}

/** Studio's own server. Anything else that asks for a window is the web and goes to the person's browser. */
const isLocal = (url) => /^http:\/\/127\.0\.0\.1(:\d+)?(\/|$)/.test(url);

let win = null;
const preview = new PreviewManager({
  onExit: (dir, code) => win?.webContents.send("preview:exit", { dir, code }),
  onChange: (dir) => {
    win?.webContents.send("preview:changed", { dir });
    lightCopies.refresh(dir);
  },
});
/** The real programs, never the stand-ins the assistants get below "Anything on this computer" (.cmd files). */
const realTool = (name, override) =>
  override?.trim() || (whereAll(name).find((file) => /\.exe$/i.test(file)) ?? null);
// Lighter copies of the open project's videos, for smooth watching and editing; "Save video" never uses them.
const lightCopies = new LightCopies({
  tools: () => ({
    ffmpeg: realTool("ffmpeg", process.env.HYPERFRAMES_FFMPEG_PATH),
    ffprobe: realTool("ffprobe", process.env.HYPERFRAMES_FFPROBE_PATH),
  }),
  emit: (payload) => win?.webContents.send("preview:copies", payload),
});
/** Set while a chat turn waits for the footage study, so the chat can show which clip is being studied. */
let studyStep = null;
const study = new FootageStudy({
  emit: (payload) => {
    win?.webContents.send("study:event", payload);
    studyStep?.(payload);
  },
});
/** Whisper, fetched only when the person asks (speechTool.js). Made once the settings folder is final. */
let speech = null;
const agent = new AgentRunner({
  emit: (payload) => win?.webContents.send("agent:event", payload),
  // An agent never starts from a study that is missing the clip the person just added.
  prepare: async (dir, onStep) => {
    studyStep = ({ dir: studied, status }) => {
      if (studied !== dir || !status.running || !status.current) return;
      onStep("The app is watching your clips", `clip ${status.done + 1} of ${status.total}`);
    };
    try {
      await study.ready(dir);
    } finally {
      studyStep = null;
    }
  },
  // Undo for each turn goes through the open project's preview server, which keeps its history.
  history: turnHistory(() => preview.current),
  check: checkTurn,
});

// Saving a video: the file goes to the person's Downloads folder, and the taskbar button shows how far it is.
const exporter = new ExportManager({
  folder: () => app.getPath("downloads"),
  ffmpeg: () => realTool("ffmpeg", process.env.HYPERFRAMES_FFMPEG_PATH),
  emit: (payload) => {
    win?.setProgressBar(payload.status.state === "saving" ? Math.max(0.02, payload.status.percent / 100) : -1);
    win?.webContents.send("save:event", payload);
  },
});
const samePath = (a, b) => Boolean(a && b) && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

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
  // Where the person left it (M1-12). The self-test always opens at the default size, so its pictures compare.
  const saved = process.env.HFWIN_SMOKE ? null : readState().window;
  const place = placeToOpen(saved, screen.getAllDisplays().map((display) => display.workArea));
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    ...(place ?? {}),
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: "#fff4e9",
    // Kushmanji's own icon (M14-06); the installer's comes from build/icon.ico.
    icon: path.join(here, "..", "renderer", "brand", "icon.png"),
    autoHideMenuBar: true,
    title: "Kushmanji",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once("ready-to-show", () => {
    if (place && saved?.maximized) win?.maximize();
    win?.show();
  });
  // Kept as the window closes: its normal size and place, and whether it was maximised.
  win.on("close", () => {
    if (!win || process.env.HFWIN_SMOKE) return;
    try {
      updateState({ window: { ...win.getNormalBounds(), maximized: win.isMaximized() } });
    } catch { /* a settings file that cannot be written only means the default size next time */ }
  });
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
  watchEditorKeys(win, () => preview.current);
  void catchStudioAsks(win, () => preview.current);
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
  if (!isProject(dir)) {
    throw new Error("That folder is not a video this app can open. Choose a folder where a video was made.");
  }
  return dir;
}

function registerIpc() {
  handle("app:info", () => ({
    appVersion: app.getVersion(),
    cliVersion,
    electron: process.versions.electron,
    projectsRoot: projectsRoot(),
  }));
  // Each video with its picture for Home (covers.js), when it has one.
  handle("projects:list", () => listProjects().map((project) => ({ ...project, cover: readCover(project.dir) })));
  // The page names only the box of its own player to keep as the video's picture; it never names a file.
  handle("projects:saveCover", async ({ dir, rect } = {}) => {
    dir = requireProject(dir);
    if (!win) return false;
    const box = captureBox(rect, win.getContentBounds());
    return box ? saveCover(dir, await win.webContents.capturePage(box)) : false;
  });
  handle("projects:create", (name) => createProject(name));
  handle("projects:fromFootage", async () => {
    if (agent.busy) {
      throw new Error("The assistant is still working. Wait for it to finish before starting another video.");
    }
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
    if (agent.busy) throw new Error("The assistant is still working. Wait for it to finish before adding clips.");
    const options = {
      title: "Add clips (your own files are not changed)",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Video, sound and pictures", extensions: MEDIA_EXTENSIONS }],
    };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths.length) return null;
    const imported = await importMedia(dir, picked.filePaths);
    void study.run(dir);
    return imported;
  });
  // Clips dropped on the chat (M3-03). The page gives the paths of what a real drop handed it; they are checked
  // again here and copied by the same safe import as the picker above. Never while an assistant works.
  handle("projects:addDropped", async ({ dir, paths } = {}) => {
    requireProject(dir);
    if (agent.busy) throw new Error("The assistant is still working. Wait for it to finish before adding clips.");
    const imported = await importMedia(dir, await validateDropped(paths));
    void study.run(dir);
    return imported;
  });
  // The clips, sounds, pictures and scenes of the open video, for the "@" list in the message box.
  handle("mentions:list", (dir) => listMentionable(requireProject(dir)));
  handle("projects:pickFolder", async () => {
    const options = { title: "Open the folder of a video", properties: ["openDirectory"] };
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
    // Every project carries the current editing guide, for whichever assistant cuts next.
    writeGuide(dir);
    const started = await preview.start(dir);
    // After Studio is up, so the two do not compete while the person is waiting for the editor.
    study.open(dir);
    lightCopies.start(dir);
    return started;
  });
  handle("projects:close", () => {
    agent.stop();
    study.close();
    lightCopies.stop();
    preview.stop();
  });
  handle("projects:ready", async (dir) => {
    requireProject(dir);
    const current = preview.current;
    if (!win || current?.dir !== dir) return false;
    // Studio's page load is not the composition's first frame. Probe only our active local preview frame.
    const frame = studioPreviewFrame(win.webContents.mainFrame.framesInSubtree, current);
    return frame ? frame.executeJavaScript("window.__renderReady === true").catch(() => false) : false;
  });
  handle("projects:reveal", async (dir) => {
    const problem = await shell.openPath(requireProject(dir));
    if (problem) throw new Error(problem);
  });
  handle("projects:forget", (dir) => forgetFolder(String(dir)));
  // One video at a time, and never while an assistant is changing one: the file would hold half an edit.
  handle("save:start", (dir) => {
    dir = requireProject(dir);
    if (agent.busy) throw new Error("The assistant is still working. Save the video when it has finished.");
    return exporter.start(dir);
  });
  handle("save:stop", () => exporter.stop());
  handle("save:status", (dir) => exporter.status(requireProject(dir)));
  // Only the file this app has just made can be shown: the page never names a path.
  handle("save:show", () => {
    const file = exporter.lastFile;
    if (!file) return false;
    shell.showItemInFolder(file);
    return true;
  });
  handle("preview:log", () => preview.log);
  // Saved looks (M10-04): kept in the app's settings folder, copied into a video as its STYLE.md.
  const looks = () => path.join(app.getPath("userData"), "looks");
  handle("looks:list", (dir) => ({ looks: listKits(looks()), written: hasStyle(requireProject(dir)) }));
  handle("looks:save", ({ dir, name } = {}) => saveKit(looks(), requireProject(dir), String(name ?? "")));
  handle("looks:use", ({ dir, name } = {}) => {
    dir = requireProject(dir);
    if (agent.busy) throw new Error("The assistant is still working. Change the look when it has finished.");
    return useKit(looks(), dir, String(name ?? ""));
  });
  handle("health:check", (options) => checkHealth({ again: options?.again === true }));
  handle("health:getBrowser", () => getBrowser());
  handle("storage:status", () => storageStatus());
  handle("storage:free", () => freeUpSpace());
  handle("player:command", ({ dir, action, value } = {}) => {
    requireProject(dir);
    const current = preview.current;
    if (!win || !current || path.resolve(current.dir).toLowerCase() !== path.resolve(dir).toLowerCase())
      throw new Error("Open this video before using its playback controls.");
    const frame = rootPlayerFrame(win.webContents.mainFrame, current);
    if (!frame) {
      if (action === "state") return { ready: false };
      throw new Error("The video is still loading. Try again in a moment.");
    }
    return runPlayerCommand(frame, { action, value });
  });

  handle("study:status", (dir) => study.status(requireProject(dir)));
  handle("study:clip", ({ dir, file } = {}) => readClipStudy(requireProject(dir), String(file)));
  handle("study:run", (dir) => void study.run(requireProject(dir), { force: true }));
  handle("study:setLanguage", ({ dir, language } = {}) =>
    study.setLanguage(requireProject(dir), language == null ? null : String(language)),
  );
  handle("speech:status", () => speech.status());
  // The person's yes to the download. When it is done, the clips of their video that have no words yet are heard.
  handle("speech:get", (dir) => {
    const project = requireProject(dir);
    void speech.get().then((status) => {
      if (status.state === "ready") void study.run(project, { missingWords: true });
    });
    return speech.status();
  });

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
  // `moment` likewise requests a fresh root-player snapshot, not a time or note supplied by the page.
  handle("agent:send", async ({ dir, text, pointing, moment = false, purpose = null } = {}) => {
    dir = requireProject(dir);
    if (samePath(exporter.dir, dir))
      throw new Error("This video is being saved. Wait until it is saved, or stop saving, then send your message.");
    if (typeof moment !== "boolean") throw new Error("Choose whether to include the current video moment.");
    let captured = null;
    if (moment) {
      const current = preview.current;
      if (!win || !current || path.resolve(current.dir).toLowerCase() !== path.resolve(dir).toLowerCase())
        throw new Error("Open this video before sending its current moment.");
      captured = await readPlaybackMoment(rootPlayerFrame(win.webContents.mainFrame, current));
    }
    const { selection } = !moment && pointing ? await selected(dir) : { selection: null };
    const shown = pointingAt(selection);
    agent.send({
      dir,
      text,
      pointing: shown ? { ...shown, note: pointingNote(selection) } : null,
      moment: captured,
      // A review by another assistant, or the fixes after it (M13-04); the runner checks the value.
      purpose: typeof purpose === "string" ? purpose : null,
    });
    return { moment: captured ? { seconds: captured.seconds, when: captured.when } : null };
  });
  handle("agent:choose", ({ dir, engine } = {}) => agent.choose(requireProject(dir), String(engine)));
  handle("agent:setTeam", (engines) => agent.setTeam(engines));
  handle("agent:checkup", (engine) => agent.checkup(String(engine)));
  handle("agent:chooseModel", ({ engine, model } = {}) =>
    agent.chooseModel(String(engine), model == null ? null : String(model)),
  );
  handle("agent:chooseMode", ({ dir, mode } = {}) => agent.chooseMode(requireProject(dir), String(mode)));
  handle("agent:chooseAccess", ({ dir, level } = {}) => agent.chooseAccess(requireProject(dir), String(level)));
  handle("agent:stop", () => agent.stop());
  handle("agent:reset", (dir) => agent.reset(requireProject(dir)));
  handle("agent:undo", ({ dir, index, id } = {}) => {
    if (!Number.isInteger(index) || index < 0) throw new Error("That change cannot be undone.");
    return agent.undo(requireProject(dir), index, typeof id === "string" ? id : null);
  });
}

// The self-test keeps its own settings folder, so it cannot change the person's settings, and it can run while
// their app is open (the one-copy lock below is per settings folder). Must be set before that lock is taken.
if (process.env.HFWIN_SMOKE) {
  app.setPath("userData", path.join(process.env.HFWIN_SMOKE, "user-data"));
  // The self-test saves a video too, and must not leave it in the person's real Downloads folder.
  app.setPath("downloads", path.join(process.env.HFWIN_SMOKE, "downloads"));
}
// The playback measurement counts pictures really put on screen. Windows stops painting a window that another
// one covers, which would read as a frozen video, so for that one test run the window is always painted.
if (process.env.HFWIN_SMOKE_PLAYBACK) {
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
}

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
    exporter.stop({ sync: true });
    study.close({ sync: true });
    lightCopies.stop({ sync: true });
    speech?.stop();
    preview.stop({ sync: true });
  });

  // Not `await app.whenReady()`: Electron holds back "ready" until this module has finished loading, so a
  // top-level await on it waits for itself and the app never starts.
  void app.whenReady().then(async () => {
    lockDownSession();
    speech = new SpeechTool({
      folder: path.join(app.getPath("userData"), "tools", "whisper"),
      emit: (status) => win?.webContents.send("speech:event", status),
    });
    speech.useIfPresent();
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
