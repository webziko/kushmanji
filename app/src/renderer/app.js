// The app's own pages: Home (the list of videos) and the video view, which puts the chat beside the open-source
// Studio. Plain DOM on purpose: two screens do not need a framework or a build step. See docs/ARCHITECTURE.md.
// What a person reads here follows the words in docs/UX.md ("a project" is "a video", and so on).
import { createChat } from "./chat.js";
import { h } from "./dom.js";
import { drawingMessage } from "./drawing.js";
import { createPlayer } from "./player.js";
import { createAbout } from "./about.js";
import { askGuided } from "./guided.js";
import { createEditorWords, createHelp } from "./help.js";
import { createSaveVideo } from "./saveVideo.js";
import { LANGUAGES, language, setLanguage, t, tFrom } from "./words.js";

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
  if (minutes < 1) return t("just now");
  // One phrase per size, so a language can say "1 minute" and "5 minutes" its own way. Days, weeks and months are
  // never 1 here ("yesterday" comes first, and a week is 14 days or more), so they only have the plural.
  if (minutes < 60) return minutes === 1 ? t("1 minute ago") : t("{count} minutes ago", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? t("1 hour ago") : t("{count} hours ago", { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("yesterday");
  if (days < 14) return t("{count} days ago", { count: days });
  if (days < 60) return t("{count} weeks ago", { count: Math.floor(days / 7) });
  if (days < 365) return t("{count} months ago", { count: Math.floor(days / 30) });
  const years = Math.floor(days / 365);
  return years === 1 ? t("1 year ago") : t("{count} years ago", { count: years });
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
      when && h("p", { class: "carry-when" }, t("Changed {when}", { when })),
      h("button", {
        class: "primary carry-go", type: "button", "aria-label": t("Carry on with {name}", { name: project.name }),
        onclick: () => openProject(project.dir),
      }, t("Carry on")),
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
        title: t("Show this video's folder in File Explorer"),
        "aria-label": t("Show the folder of {name}", { name: project.name }),
        onclick: () => api.projects.reveal(project.dir).catch((error) => showError(tFrom(error.message))),
      },
      t("Show folder"),
    ),
    project.external &&
      h(
        "button",
        {
          class: "ghost small",
          title: t("Take this video off the list. Its files are not deleted."),
          onclick: async () => {
            await api.projects.forget(project.dir);
            await refreshProjects();
          },
        },
        t("Remove from list"),
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
        [since(project.modifiedAt), project.external && t("opened from a folder")].filter(Boolean).join(" · "),
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
    showError(tFrom(error.message));
  } finally {
    // After a successful create the page is the project view and these nodes are detached; resetting is harmless.
    home.busy = false;
    home.make.disabled = home.blank.disabled = false;
  }
}

async function makeFromPrompt(event) {
  event.preventDefault();
  const idea = home.prompt.value.trim();
  if (!idea) return home.prompt.focus();
  // Three quick choices first (M7-02); closing the box changes nothing.
  const request = await askGuided(idea);
  if (!request) return home.prompt.focus();
  // The folder is named after the first few words; the whole description goes to the agent.
  void createProject(idea.split(/\s+/).slice(0, 5).join(" "), request);
}

async function pickFolder() {
  showError("");
  try {
    // The native window's title comes from here: the main process does not know the language (M14-16).
    const project = await api.projects.pickFolder(t("Open the folder of a video"));
    if (project) await openProject(project.dir);
  } catch (error) {
    showError(tFrom(error.message));
  }
}

async function startFromFootage() {
  if (home.busy) return;
  home.busy = true;
  home.footage.disabled = true;
  showError("");
  try {
    const project = await api.projects.fromFootage(t("Choose a folder of video clips"));
    if (!project) return;
    await openProject(project.dir);
    if (open?.dir !== project.dir) return;
    open.chat.draft(
      `Look at the ${project.imported.count === 1 ? "clip" : `${project.imported.count} clips`} I just added (they are in the assets folder). Tell me what ` +
      "happens in each one, what is said, how the sound is, and whether any picture is sideways. If a picture is " +
      "sideways, say whether it can just be turned round instead of cut. Keep my own files as they are. " +
      "Tell me what you suggest before you change anything.",
    );
  } catch (error) {
    showError(tFrom(error.message));
  } finally {
    home.busy = false;
    home.footage.disabled = false;
  }
}

/**
 * What this computer still needs (M5-04, main/health.js): shown on Home only when something is missing, with the
 * command that fixes it, or a button when Kushmanji can fetch it itself.
 */
async function showHealth(box, { again = false } = {}) {
  const health = await api.health.check({ again }).catch(() => null);
  if (!health?.checked || !box.isConnected) return;
  if (!health.items.length) {
    box.replaceChildren(h("p", { class: "muted" }, t("Kushmanji has everything it needs on this computer.")));
    box.hidden = false;
    return;
  }
  const rows = health.items.map((item) => {
    const row = h("li", {}, h("p", {}, tFrom(item.said)));
    if (item.fix) {
      const copy = h("button", { class: "ghost small", type: "button" }, t("Copy"));
      copy.addEventListener("click", () =>
        navigator.clipboard.writeText(item.fix).then(() => { copy.textContent = t("Copied"); }).catch(() => {}));
      row.append(h("div", { class: "health-fix" }, h("code", {}, item.fix), copy),
        h("p", { class: "muted" }, t("Open PowerShell (search for it in the Start menu), paste this, press Enter, " +
          "then close and open Kushmanji again.")));
    }
    // FFmpeg (M5-03) and HyperFrames' browser for saving: the app fetches them itself, with this one press.
    if (item.get) {
      const get = h("button", { class: "secondary small", type: "button" },
        t("Get it now (about {size} MB)", { size: item.megabytes }));
      const problem = h("p", { class: "muted", hidden: true });
      const unwatch = item.get === "ffmpeg" ? api.on("ffmpeg:event", (status) => {
        if (status.state === "getting") get.textContent = t("Getting it… {percent}%", { percent: status.percent });
      }) : () => {};
      get.addEventListener("click", async () => {
        get.disabled = true;
        problem.hidden = true;
        get.textContent = t("Getting it…");
        const done = await api.health.get(item.get).catch(() => null);
        if (done?.state === "ready") {
          unwatch();
          return void showHealth(box, { again: true });
        }
        problem.textContent = done?.error ? tFrom(done.error)
          : t("That did not work. Check the internet connection and try again.");
        problem.hidden = false;
        get.textContent = t("Try again");
        get.disabled = false;
      });
      row.append(get, problem);
    }
    return row;
  });
  box.replaceChildren(
    h("h2", {}, health.ready ? t("Good to know") : t("Before you start")),
    h("ul", { class: "health-list" }, ...rows),
    h("button", { class: "ghost small", type: "button", onclick: (event) => {
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = t("Checking…");
      void showHealth(box, { again: true });
    } }, t("Check again")));
  box.hidden = false;
}

/**
 * How much room HyperFrames' undo copies take (M16-09, main/storage.js), and a button that frees what belongs to
 * videos that were deleted. Asked after Home is drawn: counting takes a few seconds.
 */
async function showSpace(line) {
  const status = await api.storage.status().catch(() => null);
  if (!status?.historyBytes || !line.isConnected) return;
  const free = h("button", { class: "ghost small", type: "button" },
    t("Free up {amount}", { amount: status.freeable }));
  free.addEventListener("click", async () => {
    if (!confirm(t("Free up to {amount}? This removes the undo copies of videos you have deleted and old picture " +
      "caches. Videos you still have keep theirs.", { amount: status.freeable }))) return;
    free.disabled = true;
    const done = await api.storage.free().catch(() => null);
    line.textContent = done?.freedBytes > 0
      ? t("Freed {amount}.", { amount: done.freed }) : t("Nothing could be freed just now.");
  });
  line.replaceChildren(
    t("Undo copies of your videos take {amount} on this computer.", { amount: status.history }),
    ...(status.freeableBytes > 0
      ? [" ", t("Up to {amount} can be freed (deleted videos, old caches).", { amount: status.freeable }), " ", free]
      : []),
  );
}

/**
 * The language of the app's own words (M14-12). Only here: choosing one draws every screen again, which is safe
 * when nothing is open and nothing is being made. The names are each language's own, so a person who cannot read
 * the current language can still find theirs.
 */
function languageMenu() {
  const pick = h("select", { class: "agent-pick language-pick", "aria-label": t("Language"), title: t("Language") },
    ...LANGUAGES.map((item) => h("option", { value: item.id }, item.name)));
  pick.value = language();
  pick.addEventListener("change", () => {
    // False when the choice could not be kept: the menu goes back to the language still in force.
    if (!setLanguage(pick.value)) pick.value = language();
  });
  return pick;
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
    placeholder: t("A 15 second intro for my bakery"),
    "aria-label": t("Describe the video you want"),
  });
  // Primary or secondary is decided once the list of videos is known (showProjects).
  home.make = h("button", { class: "primary", type: "submit" }, t("Make it"));
  home.blank = h(
    "button",
    { class: "secondary", type: "button", onclick: () => createProject("Untitled video") },
    t("Blank video"),
  );
  home.footage = h("button", {
    class: "primary", type: "button", onclick: startFromFootage,
    title: t("Copy a folder of clips into a new video. Your own files are not changed."),
  }, t("Choose clips"));
  home.errorText = h("span", {});
  home.error = h(
    "div",
    { class: "banner", role: "alert", hidden: true },
    home.errorText,
    h("button", { class: "ghost small", onclick: () => showError("") }, t("Close")),
  );
  home.carry = h("section", { class: "carry-slot", hidden: true });
  home.grid = h("ul", { class: "grid" });
  home.empty = h(
    "p",
    { class: "empty", hidden: true },
    t("No videos yet. Describe one above, or open the folder of a video you already have."),
  );
  // Held back for a moment, so the page does not jump when the videos arrive and the Carry on card appears.
  home.main = h(
    "main",
    { class: "home", "data-loading": true },
    h("h1", {}, t("What do you want to make?")),
    home.carry,
    h(
      "div",
      { class: "starts" },
      h(
        "section",
        { class: "start" },
        h("h2", { class: "start-title" }, t("From my clips")),
        h(
          "p",
          { class: "start-about" },
          t("Pick the clips from your phone or camera. The assistant puts them together."),
        ),
        h("div", { class: "start-action" }, home.footage),
      ),
      h(
        "section",
        { class: "start" },
        h("h2", { class: "start-title" }, t("From an idea")),
        h("p", { class: "start-about" }, t("Say what you want. The assistant makes it.")),
        h("form", { class: "start-action", onsubmit: makeFromPrompt }, home.prompt, home.make),
      ),
    ),
    h(
      "div",
      { class: "start-more" },
      h("span", { class: "muted" }, t("Or")),
      home.blank,
      h("button", {
        class: "secondary", type: "button", onclick: pickFolder,
        title: t("Open a video that is already in a folder on your computer."),
      }, t("Open a folder")),
    ),
    home.error,
    home.health = h("section", { class: "health", hidden: true, role: "status" }),
    h("h2", { class: "my-videos" }, t("My videos")),
    home.grid,
    home.empty,
    h("p", { class: "muted foot" },
      info ? t("New videos are kept in this folder: {folder}", { folder: info.projectsRoot }) : ""),
    home.space = h("p", { class: "muted foot space", role: "status" }),
  );

  app.replaceChildren(
    h(
      "header",
      { class: "topbar" },
      h("img", { class: "brand-wordmark", src: "brand/wordmark.svg", alt: "Kushmanji" }),
      // "Unofficial" stays in sight (AGENTS.md); the credit to HyperFrames and the versions are in About.
      h("button", { class: "tag", type: "button", title: t("About Kushmanji"),
        "aria-label": t("About Kushmanji (unofficial)"), onclick: () => about.show() }, t("unofficial")),
      h("span", { class: "spacer" }),
      languageMenu(),
      help.button,
    ),
    home.main,
  );
  const main = home.main;
  void showSpace(home.space);
  void showHealth(home.health);
  refreshProjects()
    .then((projects) => {
      // With videos, "Carry on" is the thing to press, so the text box does not grab the keyboard. Nothing is
      // taken from the person if they have already clicked somewhere, or the welcome guide is open.
      const idle = main.isConnected && document.activeElement === document.body;
      if (idle && !projects?.length) home.prompt.focus();
    })
    .catch((error) => showError(tFrom(error.message)))
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

/**
 * Why the editor did not start (main/preview.js): a sentence on the first line, and under it, when the editor's
 * server printed any, its own last lines. Only the sentence is the app's to translate; the rest stays as it came.
 */
function startFailure(message) {
  const [sentence, ...printed] = String(message ?? "").split("\n");
  return [tFrom(sentence), ...printed].join("\n");
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
    // Not translated: it is the editor's own name, and the self-test and the chat find the frame by it.
    title: "HyperFrames Studio",
    allow: "clipboard-read; clipboard-write; fullscreen",
    hidden: true,
  });
  const status = h("p", { class: "overlay-text" }, t("Opening your video…"));
  // A "Make it" idea that never reached the assistant because the editor failed to start is not lost on retry.
  const retry = h("button", { class: "primary", hidden: true,
    onclick: () => openProject(dir, { request: initialRequest ?? undefined }) }, t("Try again"));
  const overlay = h("div", { class: "overlay" }, h("div", { class: "spinner", "aria-hidden": "true" }), status, retry);
  let initialRequest = request;
  let viewGeneration = 0;
  const loading = () => {
    if (open !== project) return;
    setStudio("starting");
    overlay.hidden = false;
    overlay.classList.remove("failed");
    status.textContent = project.editing ? t("Opening the editor…") : t("Loading your video…");
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
    // A drawing is saved in the video's folder; the chat's box gets the message about it, to send or to change.
    onDrawing: (sent) => project.chat.addToDraft(drawingMessage(sent)),
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
      edit.textContent = project.editing ? t("Watch video") : t("Edit by hand");
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
  }, t("Edit by hand"));
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
      project.fail("failed", t("The editor opened, but the video's picture did not finish loading. Try again."));
  });
  const mediaStatus = h("span", { class: "muted", role: "status" });
  // The app makes lighter copies of big clips for smooth watching and editing (main/lightCopies.js).
  const smooth = h("span", { class: "muted", role: "status" });
  let smoothTimer;
  const unwatchSmooth = api.on("preview:copies", ({ dir: changed, status }) => {
    if (changed !== dir || open !== project) return;
    clearTimeout(smoothTimer);
    if (status.state === "making") {
      smooth.textContent = t("Making clips smooth to edit ({done} of {total})",
        { done: status.done, total: status.total });
    } else if (status.state === "ready" && status.total > 0) {
      smooth.textContent = t("Clips are smooth to edit");
      smoothTimer = setTimeout(() => { smooth.textContent = ""; }, 6000);
    } else smooth.textContent = "";
  });
  // The first time a video opens in the editor, Studio prepares every clip's sound picture and moving around is
  // slow for a minute or two (main/editorPrep.js). Shown on the editor screen only.
  const preparing = h("p", { class: "editor-prep", role: "status", hidden: true },
    h("span", { class: "spinner", "aria-hidden": "true" }),
    h("span", {}, t("Getting the editor ready. The first time, HyperFrames prepares the sound of every clip, so moving around can be slow until this note goes away.")));
  const unwatchPreparing = api.on("editor:preparing", ({ dir: changed, preparing: busy }) => {
    if (changed === dir && open === project) preparing.hidden = !busy;
  });
  const destroy = project.destroy;
  project.destroy = () => { unwatchSmooth(); unwatchPreparing(); clearTimeout(smoothTimer); destroy(); };
  const addMedia = h("button", {
    class: "ghost", title: t("Copy clips into this video. Your own files are not changed."),
    onclick: async () => {
      addMedia.disabled = true;
      try {
        const imported = await api.projects.addMedia(dir, t("Add clips (your own files are not changed)"));
        if (imported && open === project) {
          mediaStatus.textContent = imported.count === 1
            ? t("1 file added") : t("{count} files added", { count: imported.count });
          project.chat.draft("Look at the clips I just added (they are in the assets folder). Check the sound " +
            "and whether any picture is sideways before you change anything.");
        }
      } catch (error) { mediaStatus.textContent = tFrom(error.message); }
      finally { addMedia.disabled = false; }
    },
  }, t("Add clips"));

  app.replaceChildren(
    h(
      "header",
      { class: "topbar" },
      h("button", { class: "ghost", onclick: goHome, title: t("Back to your videos") }, "← ", t("My videos")),
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
          title: t("Show this video's folder in File Explorer"),
          onclick: () => api.projects.reveal(dir).catch(() => {}),
        },
        t("Show folder"),
      ),
      help.button,
    ),
    h("main", { class: "project" },
      h("div", { class: "stage" }, player.element, createEditorWords(), preparing, frame, overlay),
      project.chat.element),
  );
  help.firstTime();

  try {
    const started = await api.projects.open(dir);
    if (open !== project) return;
    project.started = started;
    player.open(started);
  } catch (error) {
    if (open === project) project.fail("failed", startFailure(error.message));
  }
}

// Registered before the first await, so an event sent while the page is still starting is not missed.
api.on("app:open-project", ({ dir }) => void openProject(dir));
api.on("preview:exit", ({ dir }) => {
  if (open?.dir === dir) open.fail("stopped", t("The editor stopped unexpectedly. Press Try again."));
});

info = await api.app.info().catch(() => null);
if (!open) showHome();
