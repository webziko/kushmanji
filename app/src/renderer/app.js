// The app's own pages: Home (the list of videos) and the video view, which puts the chat beside the open-source
// Studio. Plain DOM on purpose: two screens do not need a framework or a build step. See docs/ARCHITECTURE.md.
// What a person reads here follows the words in docs/UX.md ("a project" is "a video", and so on).
import { createChat } from "./chat.js";
import { h } from "./dom.js";
import { createPlayer } from "./player.js";
import { createEditorWords, createHelp } from "./help.js";
import { createSaveVideo } from "./saveVideo.js";

const api = window.hfwin;
const app = document.getElementById("app");
const help = createHelp();

const folderName = (dir) => dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;

function ago(ms) {
  if (!ms) return "";
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diff = ms - Date.now();
  for (const [unit, size] of [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ]) {
    if (Math.abs(diff) >= size) return format.format(Math.round(diff / size), unit);
  }
  return "just now";
}

let info = null;
/** The project on screen, or null on Home. A slow start that finishes after the person left is ignored by it. */
let open = null;

// ---------------------------------------------------------------- Home

const home = {};

function showError(message) {
  if (!home.error) return;
  home.error.hidden = !message;
  home.errorText.textContent = message ?? "";
}

function projectCard(project) {
  const actions = h(
    "div",
    { class: "card-actions" },
    h(
      "button",
      {
        class: "ghost small",
        title: "Show this video's folder in File Explorer",
        onclick: () => api.projects.reveal(project.dir).catch((error) => showError(error.message)),
      },
      "Show folder",
    ),
    project.external &&
      h(
        "button",
        {
          class: "ghost small",
          title: "Take this video off the list. Its files are not deleted.",
          onclick: async () => {
            await api.projects.forget(project.dir);
            await refreshProjects();
          },
        },
        "Remove from list",
      ),
  );
  return h(
    "li",
    { class: "card" },
    h(
      "button",
      { class: "card-open", onclick: () => openProject(project.dir), title: project.dir },
      h("span", { class: "card-thumb", "aria-hidden": "true" }, project.name.slice(0, 1).toUpperCase()),
      h("span", { class: "card-name" }, project.name),
      h(
        "span",
        { class: "card-meta" },
        [ago(project.modifiedAt), project.external && "opened from a folder"].filter(Boolean).join(" · "),
      ),
    ),
    actions,
  );
}

async function refreshProjects() {
  const projects = await api.projects.list();
  if (!home.grid) return;
  home.grid.replaceChildren(...projects.map(projectCard));
  home.empty.hidden = projects.length > 0;
}

/** Make a project. With `request`, the agent is asked to build it as soon as the project opens. */
async function createProject(name, request) {
  if (home.busy) return;
  home.busy = true;
  showError("");
  home.make.disabled = home.blank.disabled = true;
  try {
    const project = await api.projects.create(name);
    home.prompt.value = "";
    await openProject(project.dir, { request });
  } catch (error) {
    showError(error.message);
  } finally {
    // After a successful create the page is the project view and these nodes are detached; resetting is harmless.
    home.busy = false;
    home.make.disabled = home.blank.disabled = false;
  }
}

function makeFromPrompt(event) {
  event.preventDefault();
  const request = home.prompt.value.trim();
  if (!request) return home.prompt.focus();
  // The folder is named after the first few words; the whole description goes to the agent.
  void createProject(request.split(/\s+/).slice(0, 5).join(" "), request);
}

async function pickFolder() {
  showError("");
  try {
    const project = await api.projects.pickFolder();
    if (project) await openProject(project.dir);
  } catch (error) {
    showError(error.message);
  }
}

async function startFromFootage() {
  if (home.busy) return;
  home.busy = true;
  home.footage.disabled = true;
  showError("");
  try {
    const project = await api.projects.fromFootage();
    if (!project) return;
    await openProject(project.dir);
    if (open?.dir !== project.dir) return;
    open.chat.draft(
      `Look at the ${project.imported.count} clips I just added (they are in the assets folder). Tell me what ` +
      "happens in each one, what is said, how the sound is, and whether any picture is sideways. If a picture is " +
      "sideways, say whether it can just be turned round instead of cut. Keep my own files as they are. " +
      "Tell me what you suggest before you change anything.",
    );
  } catch (error) {
    showError(error.message);
  } finally {
    home.busy = false;
    home.footage.disabled = false;
  }
}

function showHome() {
  open?.destroy();
  open = null;
  document.body.dataset.view = "home";
  delete document.body.dataset.studio;
  delete document.body.dataset.error;
  delete document.body.dataset.screen;

  home.busy = false;
  home.prompt = h("input", {
    class: "field",
    type: "text",
    maxlength: "600",
    placeholder: "Describe the video you want, for example a 15 second intro for my bakery",
    "aria-label": "Describe the video you want",
  });
  home.make = h("button", { class: "primary", type: "submit" }, "Make it");
  home.blank = h(
    "button",
    { class: "secondary", type: "button", onclick: () => createProject("Untitled video") },
    "Blank video",
  );
  home.footage = h("button", {
    class: "secondary", type: "button", onclick: startFromFootage,
    title: "Copy a folder of clips into a new video. Your own files are not changed.",
  }, "Start from my clips");
  home.errorText = h("span", {});
  home.error = h(
    "div",
    { class: "banner", role: "alert", hidden: true },
    home.errorText,
    h("button", { class: "ghost small", onclick: () => showError("") }, "Close"),
  );
  home.grid = h("ul", { class: "grid" });
  home.empty = h(
    "p",
    { class: "empty", hidden: true },
    "No videos yet. Describe one above, or open the folder of a video you already have.",
  );

  app.replaceChildren(
    h(
      "header",
      { class: "topbar" },
      h("span", { class: "brand" }, h("span", { class: "brand-mark", "aria-hidden": "true" }), "Kushmanji"),
      h("span", { class: "tag" }, "built on HyperFrames · unofficial"),
      h("span", { class: "spacer" }),
      h("span", { class: "muted" }, info ? `App ${info.appVersion} · HyperFrames ${info.cliVersion}` : ""),
      help.button,
    ),
    h(
      "main",
      { class: "home" },
      h("h1", {}, "What do you want to make?"),
      h("form", { class: "create", onsubmit: makeFromPrompt }, home.prompt, home.make),
      h(
        "div",
        { class: "create-more" },
        h("span", { class: "muted" }, "Or start from"),
        home.blank,
        home.footage,
        h("button", {
          class: "secondary", type: "button", onclick: pickFolder,
          title: "Open a video that is already in a folder on your computer.",
        }, "Open a folder"),
      ),
      home.error,
      h("h2", {}, "My videos"),
      home.grid,
      home.empty,
      h("p", { class: "muted foot" }, info ? `New videos are kept in this folder: ${info.projectsRoot}` : ""),
    ),
  );
  home.prompt.focus();
  refreshProjects().catch((error) => showError(error.message));
  help.firstTime();
}

// ---------------------------------------------------------------- Project

async function goHome() {
  await api.projects.close().catch(() => {});
  showHome();
}

/** `state` is what the smoke test and the styles read: starting, loaded, failed or stopped. */
function setStudio(state, error = "") {
  document.body.dataset.studio = state;
  if (error) document.body.dataset.error = error;
  else delete document.body.dataset.error;
}

async function openProject(dir, { request } = {}) {
  open?.destroy();
  const project = { dir, name: folderName(dir) };
  const save = createSaveVideo(dir);
  project.chat = createChat(dir, { onEdit: () => { if (!project.editing) edit.click(); }, onSave: () => save.start() });
  open = project;
  document.body.dataset.view = "project";
  document.body.dataset.screen = "watch";
  setStudio("starting");

  const frame = h("iframe", {
    class: "studio",
    title: "HyperFrames Studio",
    allow: "clipboard-read; clipboard-write; fullscreen",
    hidden: true,
  });
  const status = h("p", { class: "overlay-text" }, "Opening your video…");
  const retry = h("button", { class: "primary", hidden: true, onclick: () => openProject(dir) }, "Try again");
  const overlay = h("div", { class: "overlay" }, h("div", { class: "spinner", "aria-hidden": "true" }), status, retry);
  let initialRequest = request;
  let viewGeneration = 0;
  const loading = () => {
    if (open !== project) return;
    setStudio("starting");
    overlay.hidden = false;
    overlay.classList.remove("failed");
    status.textContent = project.editing ? "Opening the editor…" : "Loading your video…";
    retry.hidden = true;
    edit.disabled = true;
  };
  const ready = () => {
    if (open !== project) return;
    overlay.hidden = true;
    setStudio("loaded");
    edit.disabled = false;
    if (initialRequest) {
      project.chat.send(initialRequest);
      initialRequest = null;
    }
  };
  const player = createPlayer(dir, { onLoading: loading, onReady: ready,
    onTime: (time) => project.chat.setTime(time),
    onHelp: () => help.show(),
    onError: (message) => { if (open === project) project.fail("failed", message); } });
  project.destroy = () => { player.destroy(); project.chat.destroy(); save.destroy(); };
  const edit = h("button", {
    class: "secondary editor-toggle", disabled: true, type: "button", "aria-pressed": "false",
    onclick: () => {
      if (!project.started || open !== project) return;
      project.editing = !project.editing;
      viewGeneration++;
      document.body.dataset.screen = project.editing ? "edit" : "watch";
      project.chat.setEditor(project.editing);
      edit.textContent = project.editing ? "Watch video" : "Edit by hand";
      edit.setAttribute("aria-pressed", String(project.editing));
      frame.hidden = !project.editing;
      player.element.hidden = Boolean(project.editing);
      loading();
      if (project.editing) {
        player.suspend();
        frame.src = project.started.studioUrl;
      } else {
        frame.removeAttribute("src");
        player.open(project.started);
      }
    },
  }, "Edit by hand");
  project.fail = (state, message) => {
    setStudio(state, message);
    overlay.hidden = false;
    overlay.classList.add("failed");
    status.textContent = message;
    retry.hidden = false;
    edit.disabled = true;
    frame.removeAttribute("src");
    player.suspend();
  };
  frame.addEventListener("load", async () => {
    if (open !== project || !project.editing || !frame.hasAttribute("src")) return;
    const current = viewGeneration;
    const deadline = Date.now() + 45_000;
    while (open === project && project.editing && current === viewGeneration && Date.now() < deadline) {
      if (await api.projects.ready(dir).catch(() => false)) {
        if (open === project && project.editing && current === viewGeneration) ready();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (open === project && project.editing && current === viewGeneration)
      project.fail("failed", "The editor opened, but the video's picture did not finish loading. Try again.");
  });
  const mediaStatus = h("span", { class: "muted", role: "status" });
  // The app makes lighter copies of big clips for smooth watching and editing (main/lightCopies.js).
  const smooth = h("span", { class: "muted", role: "status" });
  let smoothTimer;
  const unwatchSmooth = api.on("preview:copies", ({ dir: changed, status }) => {
    if (changed !== dir || open !== project) return;
    clearTimeout(smoothTimer);
    if (status.state === "making") smooth.textContent = `Making clips smooth to edit (${status.done} of ${status.total})`;
    else if (status.state === "ready" && status.total > 0) {
      smooth.textContent = "Clips are smooth to edit";
      smoothTimer = setTimeout(() => { smooth.textContent = ""; }, 6000);
    } else smooth.textContent = "";
  });
  const destroy = project.destroy;
  project.destroy = () => { unwatchSmooth(); clearTimeout(smoothTimer); destroy(); };
  const addMedia = h("button", {
    class: "ghost", title: "Copy clips into this video. Your own files are not changed.",
    onclick: async () => {
      addMedia.disabled = true;
      try {
        const imported = await api.projects.addMedia(dir);
        if (imported && open === project) {
          mediaStatus.textContent = `${imported.count} files added`;
          project.chat.draft("Look at the clips I just added (they are in the assets folder). Check the sound " +
            "and whether any picture is sideways before you change anything.");
        }
      } catch (error) { mediaStatus.textContent = error.message; }
      finally { addMedia.disabled = false; }
    },
  }, "Add clips");

  app.replaceChildren(
    h(
      "header",
      { class: "topbar" },
      h("button", { class: "ghost", onclick: goHome, title: "Back to your videos" }, "← My videos"),
      h("span", { class: "project-name", title: dir }, project.name),
      mediaStatus,
      smooth,
      save.status,
      h("span", { class: "spacer" }),
      save.show,
      save.button,
      addMedia,
      edit,
      h(
        "button",
        {
          class: "ghost",
          title: "Show this video's folder in File Explorer",
          onclick: () => api.projects.reveal(dir).catch(() => {}),
        },
        "Show folder",
      ),
      help.button,
    ),
    h("main", { class: "project" },
      h("div", { class: "stage" }, player.element, createEditorWords(), frame, overlay), project.chat.element),
  );
  help.firstTime();

  try {
    const started = await api.projects.open(dir);
    if (open !== project) return;
    project.started = started;
    player.open(started);
  } catch (error) {
    if (open === project) project.fail("failed", error.message);
  }
}

// Registered before the first await, so an event sent while the page is still starting is not missed.
api.on("app:open-project", ({ dir }) => void openProject(dir));
api.on("preview:exit", ({ dir }) => {
  if (open?.dir === dir) open.fail("stopped", "The editor stopped unexpectedly. Press Try again.");
});

info = await api.app.info().catch(() => null);
if (!open) showHome();
