// The only bridge between the page and the main process. CommonJS because a sandboxed preload cannot be an ES
// module. The page gets named calls, never `ipcRenderer` itself, so it cannot reach a channel not listed here.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

const call =
  (channel) =>
  async (...args) => {
    const reply = await ipcRenderer.invoke(channel, ...args);
    if (!reply.ok) throw new Error(reply.error);
    return reply.value;
  };

const EVENTS = new Set([
  "app:open-project", "preview:exit", "preview:changed", "preview:copies", "agent:event", "study:event", "speech:event",
  "save:event", "shorts:event", "editor:preparing", "ffmpeg:event",
]);

contextBridge.exposeInMainWorld("hfwin", {
  app: {
    info: call("app:info"),
    reload: call("app:reload"),
    checkUpdate: call("app:checkUpdate"),
    openReleasePage: call("app:openReleasePage"),
  },
  projects: {
    list: call("projects:list"),
    saveCover: call("projects:saveCover"),
    create: call("projects:create"),
    fromFootage: call("projects:fromFootage"),
    addMedia: call("projects:addMedia"),
    addDropped: call("projects:addDropped"),
    pickFolder: call("projects:pickFolder"),
    open: call("projects:open"),
    ready: call("projects:ready"),
    close: call("projects:close"),
    reveal: call("projects:reveal"),
    forget: call("projects:forget"),
    rename: call("projects:rename"),
    trash: call("projects:trash"),
  },
  notes: { saveDrawing: call("notes:saveDrawing") },
  looks: { list: call("looks:list"), save: call("looks:save"), use: call("looks:use") },
  health: { check: call("health:check"), get: call("health:get") },
  storage: { status: call("storage:status"), free: call("storage:free") },
  mentions: { list: call("mentions:list") },
  files: {
    /**
     * Where a file the person dropped on the page really is. Electron removed `File.path`; this reads it from the
     * file itself, so the page cannot name a path it was not handed: a file the page made up has none, and "" is
     * returned. The main process still checks every path before it touches it.
     */
    pathOf(file) {
      try {
        return String(webUtils.getPathForFile(file) ?? "");
      } catch {
        return "";
      }
    },
  },
  preview: { log: call("preview:log") },
  logs: { show: call("logs:show") },
  player: { command: call("player:command") },
  save: { start: call("save:start"), stop: call("save:stop"), status: call("save:status"), show: call("save:show"),
    credits: call("save:credits") },
  selection: { get: call("selection:get") },
  study: {
    status: call("study:status"),
    clip: call("study:clip"),
    run: call("study:run"),
    setLanguage: call("study:setLanguage"),
  },
  speech: { status: call("speech:status"), get: call("speech:get") },
  shorts: {
    plan: call("shorts:plan"),
    status: call("shorts:status"),
    make: call("shorts:make"),
    stop: call("shorts:stop"),
  },
  sizes: {
    shapes: call("sizes:shapes"),
    make: call("sizes:make"),
  },
  agent: {
    status: call("agent:status"),
    history: call("agent:history"),
    send: call("agent:send"),
    choose: call("agent:choose"),
    setTeam: call("agent:setTeam"),
    checkup: call("agent:checkup"),
    openSetup: call("agent:openSetup"),
    chooseModel: call("agent:chooseModel"),
    chooseAccess: call("agent:chooseAccess"),
    chooseMode: call("agent:chooseMode"),
    stop: call("agent:stop"),
    reset: call("agent:reset"),
    undo: call("agent:undo"),
  },
  /** Listen for a main-process event. Returns the function that stops listening. */
  on(channel, listener) {
    if (!EVENTS.has(channel)) throw new Error(`Unknown event: ${channel}`);
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
