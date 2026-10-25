import { versionsText } from "./about.js";
import {
  announceAssistants, brokenDetail, changeTeam, commandLines, confirmTest, GOOD_FOR, lastTestText, menuName,
  openForMe, stateText, testingText,
} from "./assistants.js";
import { h } from "./dom.js";
import { createProblemReport } from "./report.js";
import { showSpace } from "./space.js";
import { LANGUAGES, language, setLanguage, t, tFrom } from "./words.js";

const api = window.hfwin;

/**
 * The language of the app's own words (M14-12). Choosing one draws every screen again, which is safe only when nothing
 * is open and nothing is being made, so the header offers it on Home alone, and so does Settings (it shows the menu
 * on every screen but lets it be used on Home only). The names are each language's own, so a person who cannot read
 * the current language can still find theirs.
 */
export function languageMenu() {
  const pick = h("select", { class: "agent-pick language-pick", "aria-label": t("Language"), title: t("Language") },
    ...LANGUAGES.map((item) => h("option", { value: item.id }, item.name)));
  pick.value = language();
  pick.addEventListener("change", () => {
    // False when the choice could not be kept: the menu goes back to the language still in force.
    if (!setLanguage(pick.value)) pick.value = language();
  });
  return pick;
}

/**
 * Settings (M7-03): the choices that belong to the whole app, in one dialog that opens from a button in the header of
 * every screen. Nothing here is new: each section is the same control, call and wording the app already had somewhere
 * (the header's Language menu, the chat's "Your assistants", Home's "Free up", Help's problem report, About), so
 * the shared parts live in assistants.js, space.js, report.js and about.js. A control that is refused while an
 * assistant works (the chat disables its ticks and "Test it now") waits here too. `info()` gives the versions and the
 * folder for new videos once the main process has answered; `about` is the About box.
 */
export function createSettings({ info, about }) {
  /** The last answer of agent.status(), or null while nothing has answered. */
  let agents = null;
  let checking = false;
  let failed = false;
  /** The assistant being tested (it takes about a minute), and the sentence under each assistant. */
  let testing = null;
  const notes = new Map();
  /** True while an assistant is working on the open video: the chat's own state, kept on the page's body. */
  let working = false;
  /** A check that answers after the dialog closed or opened again is dropped. */
  let generation = 0;
  /** How many times the dialog has been opened or closed: the count of space answers that still matter. */
  let opening = 0;
  let freeButton = null;

  const title = h("h2", { class: "help-title", id: "settings-title", tabindex: "-1" }, t("Settings"));
  const workingNote = h("p", { class: "settings-working", hidden: true }, t("An assistant is working on your " +
    "video, so some buttons wait until it has finished."));
  const content = h("div", { class: "help-content settings-content" });
  const close = h("button", { class: "primary settings-close", type: "button" }, t("Close"));
  const dialog = h("dialog", { class: "settings-dialog", "aria-labelledby": "settings-title" },
    h("div", { class: "help-head" }, title),
    content,
    h("div", { class: "help-footer" }, h("span", { class: "spacer" }), close));
  document.body.append(dialog);
  close.addEventListener("click", () => dialog.close());

  const problems = createProblemReport({ className: "settings-report" });

  const section = (id, heading, ...children) => h("section", {
    class: "settings-section", "data-section": id, "aria-labelledby": `settings-${id}`,
  }, h("h3", { id: `settings-${id}` }, heading), ...children);

  // ---------------------------------------------------------------- Language

  function languageSection() {
    const onHome = document.body.dataset.view === "home";
    const pick = languageMenu();
    pick.disabled = !onHome;
    return section("language", t("Language"), pick,
      onHome ? null : h("p", { class: "muted" }, t("To change the language, go back to My videos first.")));
  }

  // ---------------------------------------------------------------- Your assistants

  const assistantsBox = h("div", { class: "settings-assistants-box" });
  const teamNote = h("p", { class: "msg-note error settings-team-note", role: "status" });

  async function tick(agent, box) {
    const { problem } = await changeTeam(agents, agent, box.checked);
    teamNote.textContent = problem ?? "";
    if (problem) {
      box.checked = agent.inTeam !== false;
      return;
    }
    // An open chat stops offering an assistant that was just unticked.
    announceAssistants(agents);
  }

  async function test(agent) {
    if (working || testing) return;
    const name = agent.label ?? agent.name;
    if (!confirmTest(name)) return;
    testing = agent.id;
    notes.set(agent.id, testingText(name));
    drawAssistants();
    try {
      const got = await api.agent.checkup(agent.id);
      notes.set(agent.id, tFrom(got.said));
    } catch (error) {
      notes.set(agent.id, tFrom(error.message));
    } finally {
      testing = null;
    }
    // The main process keeps the answer for the installed version; asking again brings it back with the rest.
    void check({ again: true });
  }

  function row(agent) {
    const box = h("input", { type: "checkbox", checked: agent.inTeam !== false, disabled: working });
    box.addEventListener("change", () => void tick(agent, box));
    const ready = agent.state === "ready";
    const said = notes.get(agent.id) ?? lastTestText(agent);
    return h("li", { class: "settings-assistant", "data-engine": agent.id, "data-state": agent.state },
      h("div", { class: "settings-who" }, h("strong", {}, menuName(agent)),
        h("span", { class: "muted" }, GOOD_FOR[agent.id] ?? "")),
      h("label", { class: "settings-have" }, box, t("I have this one")),
      h("p", { class: "settings-state" }, stateText(agent)),
      // The card the chat shows for an assistant that cannot be used yet, here for each one that cannot, with
      // "Check again" within reach of the PowerShell window it opens (the list's own button is further down).
      ...(ready ? [] : [...openForMe(agent), ...brokenDetail(agent), ...commandLines(agent),
        h("div", { class: "settings-actions" }, checkButton("settings-row-check"))]),
      said ? h("p", { class: "muted settings-said" }, said) : null,
      ready ? h("div", { class: "settings-actions" }, h("button", {
        class: "secondary small", type: "button", disabled: working || testing !== null, onclick: () => void test(agent),
      }, t("Test it now"))) : null);
  }

  function drawAssistants() {
    const loading = checking && !agents;
    assistantsBox.replaceChildren(
      h("p", {}, t("Tick the assistants you have. The chat only uses the ones you tick.")),
      ...(loading ? [h("p", { class: "settings-loading muted", role: "status" },
        h("span", { class: "spinner", "aria-hidden": "true" }),
        t("Checking your assistants… this can take a few seconds."))] : []),
      ...(failed ? [h("p", { class: "msg-note error settings-failed", role: "status" },
        t("Your assistants could not be checked just now."))] : []),
      ...(agents ? [h("ul", { class: "settings-assistants" }, ...agents.map(row))] : []),
      teamNote,
      h("div", { class: "settings-actions" }, checkButton("settings-check")),
    );
  }

  /** "Check again" asks every assistant again, so every one of its buttons is the same one. */
  const checkButton = (className) => h("button", {
    class: `secondary small ${className}`, type: "button", disabled: checking, onclick: () => void check({ again: true }),
  }, checking ? t("Checking…") : t("Check again"));

  /** Ask the main process which assistants are installed and signed in. It starts each tool, so it takes seconds. */
  async function check({ again = false } = {}) {
    const mine = ++generation;
    checking = true;
    failed = false;
    if (!again) agents = null;
    drawAssistants();
    const found = await api.agent.status().catch(() => null);
    if (mine !== generation) return;
    checking = false;
    if (found) {
      agents = found;
      // An open chat takes the fresh answer too: someone may have just signed in from the card below.
      announceAssistants(found);
    } else failed = true;
    drawAssistants();
  }

  function assistantsSection() {
    return section("assistants", t("Your assistants"), assistantsBox);
  }

  // ---------------------------------------------------------------- Space on this computer

  function spaceSection() {
    const line = h("p", { class: "settings-space", role: "status" }, t("Checking…"));
    const folder = info()?.projectsRoot;
    const mine = opening;
    void showSpace(line, {
      none: t("Nothing is taking up room yet."),
      failed: t("Could not look just now."),
      working: () => working,
    }).then((button) => {
      // An answer for a dialog that was closed, or opened again, is not this one's.
      if (mine === opening) freeButton = button;
    });
    return section("space", t("Space on this computer"), line,
      folder ? h("p", { class: "muted settings-folder" }, t("New videos are kept in this folder: {folder}", { folder })) : null);
  }

  // ---------------------------------------------------------------- When something goes wrong, About

  const problemsSection = () => section("problems", t("When something goes wrong"), problems.element);

  function aboutSection() {
    const versions = versionsText(info());
    return section("about", t("About"),
      versions ? h("p", { class: "muted" }, versions) : null,
      h("button", { class: "secondary settings-about", type: "button", onclick: () => about.show() },
        t("About Kushmanji")));
  }

  // ---------------------------------------------------------------- the dialog

  /** The chat marks an assistant's work on the body (`data-agent`); what it disables, Settings keeps waiting too. */
  function syncWorking() {
    const now = document.body.dataset.agent === "running";
    if (now === working) return;
    working = now;
    workingNote.hidden = !working;
    if (freeButton) freeButton.disabled = working;
    drawAssistants();
  }
  const watcher = new MutationObserver(syncWorking);

  dialog.addEventListener("close", () => {
    watcher.disconnect();
    generation++;
    opening++;
    checking = false;
    freeButton = null;
  });

  function show() {
    generation++;
    opening++;
    agents = null;
    failed = false;
    freeButton = null;
    // A test that is still running (it takes about a minute) goes on being shown; any other sentence is old news.
    if (!testing) notes.clear();
    teamNote.textContent = "";
    problems.reset();
    working = document.body.dataset.agent === "running";
    workingNote.hidden = !working;
    content.replaceChildren(workingNote, languageSection(), assistantsSection(), spaceSection(),
      problemsSection(), aboutSection());
    content.scrollTop = 0;
    watcher.observe(document.body, { attributes: true, attributeFilter: ["data-agent"] });
    if (!dialog.open) dialog.showModal();
    title.focus();
    void check();
  }

  return {
    button: h("button", {
      class: "secondary settings-button", type: "button", onclick: show,
      title: t("Language, your assistants, room on this computer, and help when something goes wrong"),
    }, t("Settings")),
    show,
  };
}
