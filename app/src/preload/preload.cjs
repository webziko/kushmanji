// The only bridge between the page and the main process. CommonJS because a sandboxed preload cannot be an ES
// module. The page gets named calls, never `ipcRenderer` itself, so it cannot reach a channel not listed here.
const { contextBridge, ipcRenderer } = require("electron");

const call =
  (channel) =>
  async (...args) => {
    const reply = await ipcRenderer.invoke(channel, ...args);
    if (!reply.ok) throw new Error(reply.error);
    return reply.value;
  };

const EVENTS = new Set(["app:open-project", "preview:exit", "preview:changed", "agent:event", "study:event"]);

contextBridge.exposeInMainWorld("hfwin", {
  app: { info: call("app:info") },
  projects: {
    list: call("projects:list"),
    create: call("projects:create"),
    fromFootage: call("projects:fromFootage"),
    addMedia: call("projects:addMedia"),
    pickFolder: call("projects:pickFolder"),
    open: call("projects:open"),
    ready: call("projects:ready"),
    close: call("projects:close"),
    reveal: call("projects:reveal"),
    forget: call("projects:forget"),
  },
  preview: { log: call("preview:log") },
  player: { command: call("player:command") },
  selection: { get: call("selection:get") },
  study: {
    status: call("study:status"),
    clip: call("study:clip"),
    run: call("study:run"),
    setLanguage: call("study:setLanguage"),
  },
  agent: {
    status: call("agent:status"),
    history: call("agent:history"),
    send: call("agent:send"),
    choose: call("agent:choose"),
    chooseModel: call("agent:chooseModel"),
    chooseAccess: call("agent:chooseAccess"),
    chooseMode: call("agent:chooseMode"),
    stop: call("agent:stop"),
    reset: call("agent:reset"),
  },
  /** Listen for a main-process event. Returns the function that stops listening. */
  on(channel, listener) {
    if (!EVENTS.has(channel)) throw new Error(`Unknown event: ${channel}`);
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
