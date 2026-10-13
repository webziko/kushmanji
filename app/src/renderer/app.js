// The app's own pages: Home (the project list) and the project view, which puts the chat beside the open-source
// Studio. Plain DOM on purpose: two screens do not need a framework or a build step. See docs/ARCHITECTURE.md.
import { createChat } from "./chat.js";
import { h } from "./dom.js";

const api = window.hfwin;
const app = document.getElementById("app");

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
        title: "Show this project's folder in File Explorer",
        onclick: () => api.projects.reveal(project.dir).catch((error) => showError(error.message)),
      },
      "Show folder",
    ),
    project.external &&
      h(
        "button",
        {
          class: "ghost small",
          title: "Take this folder off the list. Its files are not deleted.",
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
      `Review the ${project.imported.count} imported files in assets first. Check what happens, speech, sound ` +
      "and orientation. Check whether a sideways picture can simply be rotated before cropping it. " +
      "Keep every original file unchanged. Tell me what you recommend before editing.",
    );
  } catch (error) {
    showError(error.message);
  } finally {
    home.busy = false;
    home.footage.disabled = false;
  }
}

function showHome() {
  open?.chat.destroy();
  open = null;
  document.body.dataset.view = "home";
  delete document.body.dataset.studio;
  delete document.body.dataset.error;

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
    "Blank project",
  );
  home.footage = h("button", {
    class: "secondary", type: "button", onclick: startFromFootage,
    title: "Copy a folder of clips into a new project. Your originals stay unchanged.",
  }, "Start from footage");
  home.errorText = h("span", {});
  home.error = h(
    "div",
    { class: "banner", role: "alert", hidden: true },
    home.errorText,
    h("button", { class: "ghost small", onclick: () => showError("") }, "Dismiss"),
  );
  home.grid = h("ul", { class: "grid" });
  home.empty = h(
    "p",
    { class: "empty", hidden: true },
    "No projects yet. Describe a video above, or open a folder that has an index.html.",
  );

  app.replaceChildren(
    h(
      "header",
      { class: "topbar" },
      h("span", { class: "brand" }, h("span", { class: "brand-mark", "aria-hidden": "true" }), "Kushmanji"),
      h("span", { class: "tag" }, "built on HyperFrames · unofficial"),
      h("span", { class: "spacer" }),
      h("span", { class: "muted" }, info ? `App ${info.appVersion} · HyperFrames ${info.cliVersion}` : ""),
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
        h("button", { class: "secondary", type: "button", onclick: pickFolder }, "Open a folder"),
      ),
      home.error,
      h("h2", {}, "Your projects"),
      home.grid,
      home.empty,
      h("p", { class: "muted foot" }, info ? `New projects are kept in ${info.projectsRoot}` : ""),
    ),
  );
  home.prompt.focus();
  refreshProjects().catch((error) => showError(error.message));
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
  open?.chat.destroy();
  const project = { dir, name: folderName(dir), chat: createChat(dir) };
  open = project;
  document.body.dataset.view = "project";
  setStudio("starting");

  const frame = h("iframe", {
    class: "studio",
    title: "HyperFrames Studio",
    allow: "clipboard-read; clipboard-write; fullscreen",
  });
  const status = h("p", { class: "overlay-text" }, "Starting Studio…");
  const retry = h("button", { class: "primary", hidden: true, onclick: () => openProject(dir) }, "Try again");
  const overlay = h("div", { class: "overlay" }, h("div", { class: "spinner", "aria-hidden": "true" }), status, retry);
  project.fail = (state, message) => {
    setStudio(state, message);
    overlay.hidden = false;
    overlay.classList.add("failed");
    status.textContent = message;
    retry.hidden = false;
    frame.removeAttribute("src");
  };
  const mediaStatus = h("span", { class: "muted", role: "status" });
  const addMedia = h("button", {
    class: "ghost", title: "Copy footage into this project; keep the originals.",
    onclick: async () => {
      addMedia.disabled = true;
      try {
        const imported = await api.projects.addMedia(dir);
        if (imported && open === project) {
          mediaStatus.textContent = `${imported.count} files added`;
          project.chat.draft("Review the new footage in assets. Check the sound and orientation before editing.");
        }
      } catch (error) { mediaStatus.textContent = error.message; }
      finally { addMedia.disabled = false; }
    },
  }, "Add footage");

  app.replaceChildren(
    h(
      "header",
      { class: "topbar" },
      h("button", { class: "ghost", onclick: goHome, title: "Back to your projects" }, "← Home"),
      h("span", { class: "project-name", title: dir }, project.name),
      mediaStatus,
      h("span", { class: "spacer" }),
      addMedia,
      h(
        "button",
        {
          class: "ghost",
          title: "Show this project's folder in File Explorer",
          onclick: () => api.projects.reveal(dir).catch(() => {}),
        },
        "Show folder",
      ),
    ),
    h("main", { class: "project" }, project.chat.element, h("div", { class: "stage" }, frame, overlay)),
  );

  try {
    const started = await api.projects.open(dir);
    if (open !== project) return;
    frame.addEventListener(
      "load",
      async () => {
        if (open !== project) return;
        const deadline = Date.now() + 45_000;
        while (open === project && Date.now() < deadline) {
          if (await api.projects.ready(dir).catch(() => false)) {
            if (open !== project) return;
            overlay.hidden = true;
            setStudio("loaded");
            if (request) project.chat.send(request);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (open === project) project.fail("failed", "The editor opened, but the video's picture did not finish loading. Try again.");
      },
      { once: true },
    );
    frame.src = started.studioUrl;
  } catch (error) {
    if (open === project) project.fail("failed", error.message);
  }
}

// Registered before the first await, so an event sent while the page is still starting is not missed.
api.on("app:open-project", ({ dir }) => void openProject(dir));
api.on("preview:exit", ({ dir }) => {
  if (open?.dir === dir) open.fail("stopped", "Studio stopped unexpectedly.");
});

info = await api.app.info().catch(() => null);
if (!open) showHome();
