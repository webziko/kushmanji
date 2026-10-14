// The app's own pages: Home (the list of videos) and the video view, which puts the chat beside the open-source
// Studio. Plain DOM on purpose: two screens do not need a framework or a build step. See docs/ARCHITECTURE.md.
// What a person reads here follows the words in docs/UX.md ("a project" is "a video", and so on).
import { createChat } from "./chat.js";
import { h } from "./dom.js";
import { createPlayer } from "./player.js";
import { createAbout } from "./about.js";
import { createEditorWords, createHelp } from "./help.js";
import { createSaveVideo } from "./saveVideo.js";

const api = window.hfwin;
const app = document.getElementById("app");
const help = createHelp();
const about = createAbout(() => info);

const folderName = (dir) => dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;

/** How long ago, in the plain words the app uses: "just now", "5 minutes ago", "yesterday", "3 days ago". */
function since(ms) {
  if (!ms) return "";
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  // Also covers a file stamped a moment ahead of this computer's clock.
  if (minutes < 1) return "just now";
  const ago = (count, unit) => `${count} ${unit}${count === 1 ? "" : "s"} ago`;
  if (minutes < 60) return ago(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return ago(hours, "hour");
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return ago(days, "day");
  if (days < 60) return ago(Math.floor(days / 7), "week");
  if (days < 365) return ago(Math.floor(days / 30), "month");
  return ago(Math.floor(days / 365), "year");
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
  // The banner sits under the start cards; in a small window that can be below the fold.
  if (message) home.error.scrollIntoView({ block: "nearest" });
}

/** A video's picture, or its first letter on a soft surface when it has none yet or the picture will not load. */
function cover(project) {
  const letter = () => h("span", { class: "cover-letter" }, [...project.name][0]?.toUpperCase() ?? "");
  const picture = project.cover && h("img", {
    src: project.cover, alt: "", draggable: "false", decoding: "async",
    onerror: (event) => event.target.replaceWith(letter()),
  });
  return h("span", { class: "cover", "aria-hidden": "true" }, picture || letter());
}

/**
 * The hero when there is a video: the one changed last. The whole card opens it, through the button's stretched
 * ::after (a button inside a button is not allowed), so a click anywhere and the keyboard do the same thing.
 */
function carryOnCard(project) {
  const when = since(project.modifiedAt);
  return h(
    "div",
    { class: "carry" },
    cover(project),
    h(
      "div",
      { class: "carry-text" },
      h("p", { class: "carry-name" }, project.name),
      when && h("p", { class: "carry-when" }, `Changed ${when}`),
      h("button", {
        class: "primary carry-go", type: "button", "aria-label": `Carry on with ${project.name}`,
        onclick: () => openProject(project.dir),
      }, "Carry on"),
    ),
  );
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
      cover(project),
      h("span", { class: "card-name" }, project.name),
      h(
        "span",
        { class: "card-meta" },
        [since(project.modifiedAt), project.external && "opened from a folder"].filter(Boolean).join(" · "),
      ),
    ),
    actions,
  );
}

function showProjects(projects) {
  // Newest first, so the first is the one to carry on with. The grid lists every video, that one too.
  const latest = projects[0];
  home.carry.replaceChildren(...(latest ? [carryOnCard(latest)] : []));
  home.carry.hidden = !latest;
  home.grid.replaceChildren(...projects.map(projectCard));
  home.empty.hidden = projects.length > 0;
  // One main thing on the screen: the Carry on card when there is one, otherwise the two ways to start.
  home.main.toggleAttribute("data-carry", Boolean(latest));
  for (const button of [home.make, home.footage]) {
    button.classList.toggle("primary", !latest);
    button.classList.toggle("secondary", Boolean(latest));
  }
}

async function refreshProjects() {
  const projects = await api.projects.list();
  if (!home.grid) return;
  showProjects(projects);
  return projects;
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

/**
 * How much room HyperFrames' undo copies take (M16-09, main/storage.js), and a button that frees what belongs to
 * videos that were deleted. Asked after Home is drawn: counting takes a few seconds.
 */
async function showSpace(line) {
  const status = await api.storage.status().catch(() => null);
  if (!status?.historyBytes || !line.isConnected) return;
  const free = h("button", { class: "ghost small", type: "button" }, `Free up ${status.freeable}`);
  free.addEventListener("click", async () => {
    if (!confirm(`Remove the undo copies of videos you have deleted (${status.freeable})? ` +
      "Videos you still have keep theirs.")) return;
    free.disabled = true;
    const done = await api.storage.free().catch(() => null);
    line.textContent = done ? `Freed ${done.freed}.` : "Nothing could be freed just now.";
  });
  line.replaceChildren(
    `Undo copies of your videos take ${status.history} on this computer.`,
    ...(status.freeableBytes > 0 ? [` ${status.freeable} of that is for videos you have deleted. `, free] : []),
  );
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
    placeholder: "A 15 second intro for my bakery",
    "aria-label": "Describe the video you want",
  });
  // Primary or secondary is decided once the list of videos is known (showProjects).
  home.make = h("button", { class: "primary", type: "submit" }, "Make it");
  home.blank = h(
    "button",
    { class: "secondary", type: "button", onclick: () => createProject("Untitled video") },
    "Blank video",
  );
  home.footage = h("button", {
    class: "primary", type: "button", onclick: startFromFootage,
    title: "Copy a folder of clips into a new video. Your own files are not changed.",
  }, "Choose clips");
  home.errorText = h("span", {});
  home.error = h(
    "div",
    { class: "banner", role: "alert", hidden: true },
    home.errorText,
    h("button", { class: "ghost small", onclick: () => showError("") }, "Close"),
  );
  home.carry = h("section", { class: "carry-slot", hidden: true });
  home.grid = h("ul", { class: "grid" });
  home.empty = h(
    "p",
    { class: "empty", hidden: true },
    "No videos yet. Describe one above, or open the folder of a video you already have.",
  );
  // Held back for a moment, so the page does not jump when the videos arrive and the Carry on card appears.
  home.main = h(
    "main",
    { class: "home", "data-loading": true },
    h("h1", {}, "What do you want to make?"),
    home.carry,
    h(
      "div",
      { class: "starts" },
      h(
        "section",
        { class: "start" },
        h("h2", { class: "start-title" }, "From my clips"),
        h(
          "p",
          { class: "start-about" },
          "Pick the clips from your phone or camera. The assistant puts them together.",
        ),
        h("div", { class: "start-action" }, home.footage),
      ),
      h(
        "section",
        { class: "start" },
        h("h2", { class: "start-title" }, "From an idea"),
        h("p", { class: "start-about" }, "Say what you want. The assistant makes it."),
        h("form", { class: "start-action", onsubmit: makeFromPrompt }, home.prompt, home.make),
      ),
    ),
    h(
      "div",
      { class: "start-more" },
      h("span", { class: "muted" }, "Or"),
      home.blank,
      h("button", {
        class: "secondary", type: "button", onclick: pickFolder,
        title: "Open a video that is already in a folder on your computer.",
      }, "Open a folder"),
    ),
    home.error,
    h("h2", { class: "my-videos" }, "My videos"),
    home.grid,
    home.empty,
    h("p", { class: "muted foot" }, info ? `New videos are kept in this folder: ${info.projectsRoot}` : ""),
    home.space = h("p", { class: "muted foot space", role: "status" }),
  );

  app.replaceChildren(
    h(
      "header",
      { class: "topbar" },
      h("img", { class: "brand-wordmark", src: "brand/wordmark.svg", alt: "Kushmanji" }),
      // "Unofficial" stays in sight (AGENTS.md); the credit to HyperFrames and the versions are in About.
      h("button", { class: "tag", type: "button", title: "About Kushmanji", onclick: () => about.show() }, "unofficial"),
      h("span", { class: "spacer" }),
      help.button,
    ),
    home.main,
  );
  const main = home.main;
  void showSpace(home.space);
  refreshProjects()
    .then((projects) => {
      // With videos, "Carry on" is the thing to press, so the text box does not grab the keyboard. Nothing is
      // taken from the person if they have already clicked somewhere, or the welcome guide is open.
      const idle = main.isConnected && document.activeElement === document.body;
      if (idle && !projects?.length) home.prompt.focus();
    })
    .catch((error) => showError(error.message))
    .finally(() => main.removeAttribute("data-loading"));
  // Never leave the page invisible, whatever happens to the list.
  setTimeout(() => main.removeAttribute("data-loading"), 3000);
  help.firstTime();
}

// ---------------------------------------------------------------- Project

/**
 * Keep what the open video looks like right now as its picture on Home. Only from the watching screen with the
 * picture loaded (in the editor the player is hidden), and only for a moment: Home and the next video matter
 * more than their pictures, so a slow or failed save is simply dropped.
 */
async function keepPicture() {
  const current = open;
  const { screen, studio } = document.body.dataset;
  if (!current || screen !== "watch" || studio !== "loaded") return;
  let timer;
  try {
    const box = document.querySelector(".player-screen")?.getBoundingClientRect();
    if (!box) return;
    const rect = { x: box.x, y: box.y, width: box.width, height: box.height };
    await Promise.race([
      api.projects.saveCover({ dir: current.dir, rect }).catch(() => false),
      new Promise((resolve) => { timer = setTimeout(resolve, 1500); }),
    ]);
  } catch {
    // The picture is a nicety.
  } finally {
    clearTimeout(timer);
  }
}

async function goHome() {
  await keepPicture();
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
  // Moving to another video from an open one: keep the picture of the one being left first.
  if (open) await keepPicture();
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
