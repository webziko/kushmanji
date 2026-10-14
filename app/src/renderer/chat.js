// The chat beside Studio: the person describes a change, an agent on their computer edits the project, and
// Studio's preview reloads by itself as files change. The page never talks to an agent directly; it sends text
// to the main process and draws the events that come back (see "Agent bridge contract" in docs/ARCHITECTURE.md).
// Which agents exist, what they are called and how to fix them all come from the main process, so adding an
// agent there needs no change here.
import { h } from "./dom.js";
import { createStudyBar } from "./study.js";
import { createEditActions } from "./editActions.js";

const api = window.hfwin;

// What each assistant is good for, under "Your assistants" (M15-01). Plain, and true of every plan.
const GOOD_FOR = {
  claude: "careful editing and planning a whole video",
  codex: "editing, and it can make pictures",
  antigravity: "editing, and watching many clips without using much",
};

// Said beside an assistant's name in the menu when it cannot be used yet.
const STATE_NOTES = {
  "not-installed": "not on this computer yet",
  "not-signed-in": "sign in first",
  broken: "will not start",
};

/** "ChatGPT (Codex)": the plain name first, the maker's own product name beside it so it can be recognised. */
const menuName = (agent) =>
  agent.label && agent.product && agent.label !== agent.product ? `${agent.label} (${agent.product})` : agent.name;

/** Inline `code` and **bold**, built as nodes so the agent's text is never parsed as HTML. */
function formatted(text) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(/`([^`\n]+)`|\*\*([^*\n]+)\*\*/g)) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(match[1] != null ? h("code", {}, match[1]) : h("strong", {}, match[2]));
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** "the video clip “City Centre”, 0:26 to 0:41": what the person had selected, in their words. */
const pointingText = ({ name, kind, when }) => `the ${kind} “${name}”${when ? `, ${when}` : ""}`;

function userMessage({ text, pointing, moment }) {
  return h(
    "div",
    { class: "msg user" },
    moment && h("div", { class: "msg-pointing" }, `At ${moment.when}`),
    pointing && h("div", { class: "msg-pointing" }, `Pointing at ${pointingText(pointing)}`),
    text,
  );
}

/**
 * `plan` marks a reply that is a plan waiting for a yes; `touched` lists files the agent changed all the same.
 * `actions`, given for the newest such reply only, is the row of buttons that answers it.
 */
/** When an assistant says it can work again: a time it gave as a date, or its own words ("3pm", "2 days"). */
function resetsText(resets) {
  const date = /^\d{4}-\d\d-\d\dT/.test(resets ?? "") ? new Date(resets) : null;
  if (date && !Number.isNaN(date.getTime()))
    return date.toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" });
  return resets ?? "";
}

/** The plain account of a turn its assistant's usage limit cut short (M17-06). */
function limitNote(name, { changed, resets }) {
  const files = changed ?? [];
  return [
    `${name} ran out of its allowance before it finished.`,
    files.length
      ? `It had already changed: ${files.slice(0, 6).join(", ")}${files.length > 6 ? ` and ${files.length - 6} more` : ""}. ` +
        "Nobody has checked those changes yet."
      : "It had not changed anything yet.",
    resets ? `${name} says it can work again: ${resetsText(resets)}.` : "",
  ].filter(Boolean).join(" ");
}

function agentMessage({
  name, text, activities, ok, stopped, error, plan, touched, actions, limited, resets, changed, undoAction,
}) {
  const steps = [name, ...(activities ?? [])].filter(Boolean);
  return h(
    "div",
    { class: "msg agent" },
    steps.length > 0 && h("div", { class: "msg-steps" }, steps.join(" · ")),
    text && h("div", { class: "msg-text" }, formatted(text)),
    plan &&
      touched?.length > 0 &&
      h(
        "div",
        { class: "msg-note error" },
        `The assistant changed your video before you said yes. Files it changed: ${touched.slice(0, 6).join(", ")}.`,
      ),
    plan && actions,
    stopped && h("div", { class: "msg-note" }, "Stopped."),
    limited && h("div", { class: "msg-note error" }, limitNote(name, { changed, resets })),
    limited && actions,
    !ok && !stopped && !limited &&
      h("div", { class: "msg-note error" }, error || "The assistant could not finish this change."),
    undoAction,
  );
}

/** The agent's reply while it is still being written. `finish` swaps it for the settled message. */
function liveMessage(name) {
  const steps = h("div", { class: "msg-steps live" }, `${name} · Thinking…`);
  const body = h("div", { class: "msg-text" });
  const el = h("div", { class: "msg agent" }, steps, body);
  const activities = [];
  let text = "";
  let frame = 0;
  return {
    el,
    onEvent(event) {
      if (event.type === "activity") {
        steps.textContent = [name, event.label, event.detail].filter(Boolean).join(" · ");
        if (!activities.includes(event.label)) activities.push(event.label);
      } else if (event.type === "text") {
        text += event.text;
        // One repaint per frame, however many pieces of text arrived in it.
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => body.replaceChildren(...formatted(text)));
      }
    },
    /** `done.text`, when present, is the reply with the app's own marks taken out. */
    finish(done, actions) {
      cancelAnimationFrame(frame);
      const settled = agentMessage({ name, activities, ...done, text: done.text ?? text, actions });
      el.replaceWith(settled);
      return settled;
    },
  };
}

export function createChat(dir, { onEdit, onSave } = {}) {
  /** Every agent the app knows: `{ id, name }` at once, then `state`, `install` and `signIn` once checked. */
  let agents = [];
  let engine = null;
  let checked = false;
  let live = null;
  /** A message that arrived before the agent was known to be ready (Home's "Make it"). */
  let waiting = null;
  let editor = false;
  let moment = null;

  const current = () => agents.find((agent) => agent.id === engine);
  // The assistants the person ticked under "Your assistants". Older main processes send no `inTeam`: all.
  const team = () => agents.filter((agent) => agent.inTeam !== false);
  const nameOf = (id) => {
    const agent = agents.find((item) => item.id === id);
    return agent?.label ?? agent?.name ?? "Assistant";
  };
  const isReady = () => checked && current()?.state === "ready";

  /** Each settled reply by its place in the chat, so the app's check can be added to it when it arrives. */
  const replies = new Map();

  /**
   * What the app's check found after a reply changed the video (M10-03, main/agents/turnCheck.js). Mistakes come
   * with a button that puts a request to fix them in the message box.
   */
  function checkedNote({ errors, mistakes = [] }) {
    if (!errors) return h("div", { class: "msg-check muted" }, "The app checked your video: no mistakes found.");
    const listed = mistakes.map((mistake) => `- ${mistake.text}${mistake.where ? ` (${mistake.where})` : ""}`);
    const more = errors > mistakes.length ? `\n- and ${errors - mistakes.length} more like these` : "";
    const ask = `Please fix the mistakes the app's check found:\n${listed.join("\n")}${more}`;
    return h("div", { class: "msg-check" },
      h("div", { class: "msg-note error" },
        `The app checked your video and found ${errors === 1 ? "one mistake" : `${errors} mistakes`}.`),
      h("div", { class: "msg-actions" },
        h("button", { class: "secondary small", type: "button", onclick: () => {
          input.value = input.value.trim() ? `${input.value.trim()}\n\n${ask}` : ask;
          input.focus();
        } }, "Ask to fix them"),
        // The check's own words are for the assistant; whoever is curious can read them.
        h("details", { class: "msg-check-details" }, h("summary", {}, "Show them"),
          ...mistakes.map((mistake) => h("p", {}, mistake.text)))));
  }

  /**
   * "Undo this change" under a reply that changed files (M2-10). After undoing it says so, and offers to bring the
   * change back. The main process does the work with HyperFrames' own history; the page only names the reply.
   */
  function undoControl(index, undo) {
    if (!Number.isInteger(index) || !undo?.id) return null;
    const note = h("span", { class: "muted", role: "status" });
    const button = h("button", { class: "ghost small", type: "button" });
    const show = (state) => {
      button.textContent = state.undoneBy ? "Bring it back" : "Undo this change";
      button.title = state.undoneBy
        ? "Put back what the assistant changed."
        : `Put these files back as they were before: ${state.files.slice(0, 6).join(", ")}`;
      note.textContent = state.undoneBy ? "Undone. Your video is back as it was before this change." : "";
    };
    show(undo);
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        show(await api.agent.undo({ dir, index }));
      } catch (error) {
        note.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
    return h("div", { class: "msg-undo" }, button, note);
  }

  /**
   * After a usage limit: one button per other assistant. It switches the chat to that assistant and prepares a
   * message asking it to check the half-done work and finish it. The person still presses Send.
   */
  function carryOnButtons(stoppedEngine, changed = [], limited = true) {
    const others = team().filter((agent) => agent.id !== stoppedEngine);
    if (!others.length) return null;
    const from = nameOf(stoppedEngine);
    return h("div", { class: "notice-actions" }, ...others.map((agent) => h("button", {
      class: "secondary small", type: "button",
      onclick: () => {
        engine = agent.id;
        render();
        void api.agent.choose({ dir, engine }).catch(() => {});
        const files = changed.length ? `, after changing ${changed.slice(0, 6).join(", ")}` : "";
        const why = limited ? "ran out of its allowance part-way through" : "could not finish it";
        const ask = `Please carry on with my last request. ${from} ${why}${files}. ` +
          "First look at what it changed and check it, then finish the job and check your work.";
        input.value = input.value.trim() ? `${input.value.trim()}\n\n${ask}` : ask;
        input.focus();
      },
    }, `Carry on with ${agent.label ?? agent.name}`)));
  }

  const log = h("div", { class: "chat-log", role: "log" });
  /** How much the agents may do in this project: every level the app offers, and the one in force. */
  let levels = [];
  let access = null;
  /** How involved the person wants to be: every way the app offers, and the one chosen. */
  let modes = [];
  let mode = null;
  /** What is selected in Studio right now, and the selection the person said not to send. */
  let pointing = null;
  let dismissed = null;
  /** The buttons under the newest plan. They go when the conversation moves on. */
  let planActions = null;

  const input = h("textarea", {
    id: "chat-request",
    class: "field",
    rows: "3",
    placeholder: "Describe a change\nEnter to send · Shift+Enter for a new line",
    "aria-label": "Message to the assistant",
  });
  const hint = h("p", { class: "muted" }, "Move to a moment in the video, then tell the assistant what to change there.");
  const empty = h(
    "div",
    { class: "chat-empty" },
    h("p", {}, "Tell the assistant what you would like to change. Your video updates as it works."),
    hint,
  );
  const editActions = createEditActions({ onEdit, onSave, onDraft: (text) => {
    input.value = input.value.trim() ? `${input.value.trimEnd()}\n\n${text}` : text;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  } });
  const send = h("button", { class: "primary", type: "submit", disabled: true }, "Send");
  const stop = h(
    "button",
    { class: "secondary", type: "button", hidden: true, onclick: () => api.agent.stop().catch(() => {}) },
    "Stop",
  );
  const picker = h("select", {
    class: "agent-pick",
    "aria-label": "Assistant",
    title: "Who changes your video for you. A change starts with your next message.",
  });
  const teamBox = h("fieldset", { class: "chat-team" });
  const teamNote = h("p", { class: "msg-note error", role: "status" });
  const modelPick = h("select", {
    class: "agent-pick",
    "aria-label": "How careful",
    title: "How careful the assistant is. Not sure? Leave it on Auto. A change starts with your next message.",
    hidden: true,
  });
  const notice = h("div", { class: "chat-notice", hidden: true });
  const studyBar = createStudyBar(dir, { onAsk: (file) => {
    if (!input.value.trim()) input.value =
      `Look at ${file}. Tell me what is in it: the picture, what is said, the sound, and whether it is sideways. ` +
      "Tell me what needs fixing before you change anything.";
    input.focus();
  } });
  const accessPick = h("select", {
    class: "agent-pick access-pick",
    title: "What the assistant may do. A change starts with your next message.",
  });
  // The chosen level in a sentence, always on screen: nobody should have to open a menu to learn what is allowed.
  const accessAbout = h("p", { class: "access-about muted" });
  const modePick = h("select", {
    class: "agent-pick mode-pick",
    title: "When the assistant asks you before it builds. A change starts with your next message.",
  });
  const modeAbout = h("p", { class: "access-about muted" });
  // What is selected in Studio, said back to the person before they send, with a way to leave it out.
  const pointingName = h("span", {});
  const momentChip = h("div", { class: "pointing chat-moment", hidden: true,
    title: "The assistant receives this video moment when you send your message." });
  function renderMoment() {
    momentChip.hidden = editor || moment === null;
    momentChip.textContent = moment === null ? "" : `At ${moment.when}`;
  }
  const pointingChip = h(
    "div",
    { class: "pointing", hidden: true },
    pointingName,
    h(
      "button",
      {
        class: "ghost small",
        type: "button",
        title: "Do not tell the assistant about this",
        "aria-label": "Do not point at this",
        onclick: () => {
          dismissed = pointing?.key ?? null;
          renderPointing();
        },
      },
      "✕",
    ),
  );
  const accessConfirm = h("div", { class: "chat-notice access-confirm", hidden: true });
  // Agents update themselves often. This says so when the installed one is newer than the app was tried with.
  // A newer assistant than the app was tried with can be tested once here (M12-03, main/agents/checkup.js).
  const versionText = h("span", {});
  const testButton = h("button", { class: "secondary small", type: "button" }, "Test it now");
  const versionNote = h("div", { class: "chat-version muted", hidden: true }, versionText, testButton);
  testButton.addEventListener("click", async () => {
    const agent = current();
    if (!agent || live) return;
    const name = agent.label ?? agent.name;
    if (!confirm(`Test ${name} with one small job? It changes one word in a scratch folder and runs one program. ` +
      "It takes a minute and uses a little of its allowance. Your videos are not touched.")) return;
    testButton.disabled = true;
    send.disabled = true;
    versionText.textContent = `Testing ${name}… this takes about a minute.`;
    try {
      const got = await api.agent.checkup(agent.id);
      agent.untested = !got.ok;
      agent.checkup = got;
      versionText.textContent = got.said;
      testButton.hidden = got.ok;
    } catch (error) {
      versionText.textContent = error.message;
    } finally {
      testButton.disabled = false;
      send.disabled = !isReady();
    }
  });

  /** Follow new text only if the person is already at the bottom; never yank them away from what they scrolled to. */
  const append = (node) => {
    const pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
    empty.remove();
    log.append(node);
    if (pinned) log.scrollTop = log.scrollHeight;
  };

  // `data-agent` is what the styles and the smoke test read.
  // While an assistant works, the next message waits (M2-09): "Send when done" sends it as soon as the turn ends,
  // "Stop and send now" stops the turn first. A turn that fails puts the waiting message back in the box instead.
  let queued = null;
  const queuedText = h("span", {});
  const queuedNote = h("div", { class: "composer-note queued", role: "status", hidden: true }, queuedText,
    h("button", { class: "ghost small", type: "button", onclick: () => { queued = null; renderQueued(); } }, "Cancel"));
  const short = (text) => (text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text);
  function renderQueued() {
    queuedNote.hidden = !queued;
    const who = nameOf(engine);
    queuedText.textContent = !queued ? ""
      : queued.steer ? `Stopping ${who}, then sending “${short(queued.text)}”.`
        : `“${short(queued.text)}” waits and goes as soon as ${who} has finished.`;
    later.hidden = now.hidden = !live || Boolean(queued) || !input.value.trim();
  }
  function wait(steer) {
    const text = input.value.trim();
    if (!text || !live) return;
    queued = { text, steer };
    input.value = "";
    if (steer) api.agent.stop().catch(() => {});
    renderQueued();
  }
  const later = h("button", { class: "secondary", type: "button", hidden: true, onclick: () => wait(false) }, "Send when done");
  const now = h("button", { class: "secondary", type: "button", hidden: true, onclick: () => wait(true) },
    "Stop and send now");
  input.addEventListener("input", renderQueued);

  const setRunning = (running) => {
    document.body.dataset.agent = running ? "running" : "idle";
    send.hidden = running;
    stop.hidden = !running;
    renderQueued();
    picker.disabled = running;
    modelPick.disabled = running;
    accessPick.disabled = running;
    modePick.disabled = running;
    editActions.setRunning(running);
  };

  /** The selection to send with the next message, or null. */
  const pointed = () => (editor && pointing && pointing.key !== dismissed ? pointing : null);

  // `data-pointing` is what the smoke test reads.
  function renderPointing() {
    const shown = pointed();
    pointingChip.hidden = !shown;
    pointingName.textContent = shown ? `Pointing at ${pointingText(shown)}` : "";
    if (shown) document.body.dataset.pointing = shown.name;
    else delete document.body.dataset.pointing;
  }

  // Asked for, not pushed: Studio keeps its selection on its own local server, and a look every second and a
  // half is cheap. A selection the person has just dismissed stays dismissed until they select something else.
  const watchPointing = setInterval(async () => {
    if (!editor) return;
    const found = await api.selection.get(dir).catch(() => null);
    if (!editor) return;
    if (found?.key === pointing?.key) return;
    pointing = found;
    renderPointing();
  }, 1500);

  // `data-mode` is what the smoke test reads.
  function renderMode() {
    modePick.replaceChildren(...modes.map((item) => h("option", { value: item.id }, item.name)));
    modePick.value = mode ?? "";
    modeAbout.textContent = modes.find((item) => item.id === mode)?.about ?? "";
    document.body.dataset.mode = mode ?? "";
  }

  modePick.addEventListener("change", async () => {
    const chosen = modePick.value;
    try {
      await api.agent.chooseMode({ dir, mode: chosen });
      mode = chosen;
    } catch {
      // Refused or failed: the menu goes back to the way still in force.
    }
    renderMode();
  });

  /** The answer to a plan: build it, or say what to change. One tap each; neither sends anything unseen. */
  function planButtons() {
    planActions?.remove();
    planActions = h(
      "div",
      { class: "notice-actions plan-actions" },
      h("button", { class: "primary small", type: "button",
        onclick: () => void submit("Yes. Build the plan you just showed me.", false) }, "Build it"),
      h(
        "button",
        {
          class: "secondary small",
          type: "button",
          onclick: () => {
            input.placeholder = "Say what to change in the plan";
            input.focus();
          },
        },
        "Change the plan",
      ),
    );
    return planActions;
  }

  // `data-access` is what the smoke test reads.
  function renderAccess() {
    accessPick.replaceChildren(...levels.map((level) => h("option", { value: level.id }, level.name)));
    accessPick.value = access ?? "";
    accessAbout.textContent = levels.find((level) => level.id === access)?.about ?? "";
    accessAbout.classList.toggle("warn", access === "full");
    document.body.dataset.access = access ?? "";
  }

  async function setAccess(level) {
    accessConfirm.hidden = true;
    try {
      await api.agent.chooseAccess({ dir, level });
      access = level;
    } catch {
      // Refused or failed: the menu goes back to the level still in force.
    }
    renderAccess();
  }

  accessPick.addEventListener("change", () => {
    const level = accessPick.value;
    if (level !== "full") return void setAccess(level);
    // Full access is not applied until the person has read what it means. The menu shows the level still in
    // force meanwhile.
    accessPick.value = access ?? "";
    accessConfirm.hidden = false;
    accessConfirm.replaceChildren(
      h("p", {}, h("strong", {}, "Let the assistant do anything on this computer?")),
      h(
        "p",
        {},
        "The assistant will be able to open any program and change or delete any file on this computer, " +
          "without asking you first. Only do this for a video you made yourself or one you trust.",
      ),
      h(
        "div",
        { class: "notice-actions" },
        h("button", { class: "secondary small", type: "button", onclick: () => setAccess("full") },
          "Yes, allow anything"),
        h("button", { class: "ghost small", type: "button", onclick: () => (accessConfirm.hidden = true) }, "Cancel"),
      ),
    );
  });

  async function submit(text, includeMoment = true) {
    if (live) return;
    const about = pointed();
    planActions?.remove();
    planActions = null;
    const watched = includeMoment && !editor ? moment : null;
    const sent = userMessage({ text, pointing: about, moment: watched });
    append(sent);
    live = liveMessage(nameOf(engine));
    append(live.el);
    setRunning(true);
    try {
      const accepted = await api.agent.send({ dir, text, pointing: Boolean(about), moment: Boolean(watched) });
      sent.replaceWith(userMessage({ text, pointing: about, moment: accepted?.moment }));
    } catch (error) {
      live.finish({ ok: false, error: error.message });
      live = null;
      setRunning(false);
      if (!input.value.trim()) input.value = text;
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    const text = input.value.trim();
    if (live) return void wait(false);
    if (!text || !isReady()) return;
    input.value = "";
    void submit(text);
  }

  /** The card that says why the chosen assistant cannot be used yet, with the lines that fix it. */
  function showFix(agent) {
    const commands =
      agent.state === "not-installed"
        ? [...(agent.install ?? []), ...(agent.signIn ?? [])]
        : agent.state === "not-signed-in"
          ? (agent.signIn ?? [])
          : [];
    const who = menuName(agent);
    const text =
      agent.state === "not-installed"
        ? `${who} is not on this computer yet. To add it, open PowerShell (search for it in the Start menu), ` +
          "paste each line below and press Enter after each one. The last line signs you in:"
        : agent.state === "not-signed-in"
          ? `${who} needs you to sign in first. Open PowerShell (search for it in the Start menu), ` +
            "paste the line below and press Enter:"
          : `${who} is on this computer, but it will not start.`;
    notice.hidden = false;
    notice.replaceChildren(
      h("p", {}, text),
      agent.state === "broken" && agent.detail && h("p", { class: "muted" }, agent.detail),
      ...commands.map((command) =>
        h(
          "div",
          { class: "command" },
          h("code", {}, command),
          h(
            "button",
            { class: "ghost small", type: "button", onclick: () => navigator.clipboard.writeText(command) },
            "Copy",
          ),
        ),
      ),
      h("button", { class: "secondary small", type: "button", onclick: checkAgents }, "Check again"),
    );
  }

  function render() {
    // The chat's assistant was unticked: carry on with the first one the person has.
    if (agents.length && !team().some((agent) => agent.id === engine) && team()[0]) {
      engine = team()[0].id;
      void api.agent.choose({ dir, engine }).catch(() => {});
    }
    renderTeam();
    picker.replaceChildren(
      ...team().map((agent) => {
        const note = STATE_NOTES[agent.state];
        return h("option", { value: agent.id }, note ? `${menuName(agent)} · ${note}` : menuName(agent));
      }),
    );
    picker.value = engine;
    send.disabled = !isReady();
    const agent = current();
    // The agent's own list of models, when it has one. The first entry leaves the choice to the agent.
    const models = agent?.models ?? [];
    modelPick.hidden = models.length === 0;
    modelPick.replaceChildren(
      // "Auto": the app sends small changes to a smaller model (main/agents/sizing.js).
      h("option", { value: "auto" }, "Auto (saves your allowance)"),
      h("option", { value: "" }, "Default"),
      ...models.map((model) => h("option", { value: model.id }, model.name)),
    );
    modelPick.value = agent?.model ?? "";
    versionNote.hidden = !agent?.untested;
    testButton.hidden = !agent?.untested;
    versionText.textContent = agent?.untested
      ? `Your copy of ${agent.product ?? agent.name} (version ${agent.version}) is newer than the one this app was ` +
        `tested with (${agent.tested}). It should still work. ` +
        (agent.checkup?.version === agent.version ? `Last test: ${agent.checkup.said} ` : "")
      : "";
    if (!checked || !agent || agent.state === "ready") notice.hidden = true;
    else showFix(agent);
    if (isReady() && waiting) {
      const text = waiting;
      waiting = null;
      input.value = "";
      void submit(text, false);
    }
  }

  /** "Your assistants": one box per assistant. At least one stays ticked. */
  function renderTeam() {
    teamBox.replaceChildren(
      h("legend", {}, "Your assistants: tick the ones you have"),
      ...agents.map((agent) => {
        const box = h("input", { type: "checkbox", checked: agent.inTeam !== false });
        box.addEventListener("change", async () => {
          const ticked = agents.filter((item) => (item === agent ? box.checked : item.inTeam !== false));
          if (!ticked.length) {
            box.checked = true;
            teamNote.textContent = "Keep at least one assistant ticked.";
            return;
          }
          teamNote.textContent = "";
          try {
            await api.agent.setTeam(ticked.map((item) => item.id));
            for (const item of agents) item.inTeam = ticked.includes(item);
          } catch (error) {
            teamNote.textContent = error.message;
          }
          render();
        });
        return h("label", { class: "team-member" }, box,
          h("span", {}, menuName(agent), h("span", { class: "muted" }, ` · ${GOOD_FOR[agent.id] ?? ""}`)));
      }),
      teamNote,
    );
  }

  /** Ask the main process which agents are installed and signed in. It starts each tool, so it takes seconds. */
  async function checkAgents() {
    const found = await api.agent.status().catch(() => null);
    if (found) agents = found;
    checked = true;
    render();
  }

  modelPick.addEventListener("change", async () => {
    const agent = current();
    if (!agent) return;
    agent.model = modelPick.value || null;
    await api.agent.chooseModel({ engine, model: agent.model }).catch(() => {});
  });

  picker.addEventListener("change", async () => {
    engine = picker.value;
    render();
    await api.agent.choose({ dir, engine }).catch(() => {});
  });

  async function reset() {
    await api.agent.reset(dir).catch(() => {});
    log.replaceChildren(empty);
  }

  // The editor's own "Ask agent" buttons land here (M3-02, main/askAgent.js): the request goes in the message box,
  // and the person presses Send. Only a message from the editor's own frame on the local server is taken.
  const askNote = h("p", { class: "composer-note muted", role: "status", hidden: true });
  const fromEditor = (event) => {
    const studio = document.querySelector('iframe[title="HyperFrames Studio"]');
    if (!studio || event.source !== studio.contentWindow || !/^http:\/\/127\.0\.0\.1:\d+$/.test(event.origin)) return;
    const { source, type, text } = event.data ?? {};
    if (source !== "kushmanji-studio" || type !== "ask-agent" || typeof text !== "string" || !text.trim()) return;
    input.value = input.value.trim() ? `${input.value.trim()}\n\n${text.trim()}` : text.trim();
    askNote.hidden = false;
    askNote.textContent = "The editor's request is in your message. Add anything you want, then press Send.";
    input.focus();
  };
  window.addEventListener("message", fromEditor);
  input.addEventListener("input", () => { askNote.hidden = true; });

  const form = h(
    "form",
    { class: "composer", onsubmit: onSubmit },
    askNote,
    queuedNote,
    pointingChip,
    h("div", { class: "composer-context" }, h("label", { for: "chat-request" }, "Your message"), momentChip),
    input,
    h(
      "div",
      { class: "composer-row" },
      h("span", { class: "spacer" }),
      later,
      now,
      stop,
      send,
    ),
    accessAbout,
  );
  const element = h(
    "aside",
    { class: "chat" },
    h(
      "div",
      { class: "chat-head" },
      h("strong", {}, "What would you like to change?"),
      h("span", { class: "spacer" }),
      h(
        "button",
        {
          class: "ghost small",
          type: "button",
          title: "Start a new conversation. Your video is not changed.",
          onclick: reset,
        },
        "Start over",
      ),
    ),
    h("details", { class: "chat-settings" },
      h("summary", {}, "Assistant and clip settings"),
      teamBox,
      h("div", { class: "chat-head" }, h("label", {}, "Assistant", picker), modelPick),
      h("div", { class: "chat-setting-row" }, h("label", { class: "access muted" }, "Ask me first", modePick)),
      modeAbout,
      h("div", { class: "chat-setting-row" },
        h("label", { class: "access muted" }, "What may the assistant do", accessPick)),
      versionNote,
      studyBar.element,
    ),
    editActions.element,
    log,
    notice,
    accessConfirm,
    form,
  );

  input.addEventListener("keydown", (event) => {
    // isComposing: Enter that confirms an IME word (Hindi, Telugu, Japanese...) must not send the message.
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    form.requestSubmit();
  });

  const stopListening = api.on("agent:event", ({ dir: eventDir, event }) => {
    if (eventDir !== dir) return;
    // The app's own check of a finished reply arrives a moment after it (M10-03).
    if (event.type === "checked") {
      const reply = replies.get(event.index);
      reply?.querySelector(".msg-check")?.remove();
      reply?.append(checkedNote(event.checked));
      return;
    }
    if (!live) return;
    if (event.type !== "done") return live.onEvent(event);
    const pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
    // A reply that failed, for whatever reason, offers the person's other assistants (M12-04).
    const failed = event.limited || (!event.ok && !event.stopped);
    const settled = live.finish({ ...event, undoAction: undoControl(event.index, event.undo) },
      event.plan ? planButtons() : failed ? carryOnButtons(engine, event.changed ?? event.undo?.files, event.limited) : null);
    if (Number.isInteger(event.index)) replies.set(event.index, settled);
    live = null;
    setRunning(false);
    if (pinned) log.scrollTop = log.scrollHeight;
    if (queued) {
      const { text, steer } = queued;
      queued = null;
      renderQueued();
      // It goes after a turn that finished, or one stopped to make room for it. After a failure it waits in the
      // box, where the person can send it to another assistant.
      if (event.ok || (steer && event.stopped)) void submit(text);
      else input.value = input.value.trim() ? `${input.value.trim()}\n\n${text}` : text;
    }
  });

  log.append(empty);
  setRunning(false);
  // The saved chat answers at once and names the agents; whether each one works arrives a few seconds later.
  api.agent
    .history(dir)
    .then((saved) => {
      agents = saved.agents;
      engine = saved.engine;
      levels = saved.accessLevels ?? [];
      access = saved.access ?? null;
      renderAccess();
      modes = saved.modes ?? [];
      mode = saved.mode ?? null;
      renderMode();
      for (const [i, message] of saved.messages.entries()) {
        // A plan still waiting for its answer, when it is the last thing said, keeps its buttons.
        const waitingPlan = message.plan && i === saved.messages.length - 1 && !saved.running;
        const last = i === saved.messages.length - 1 && !saved.running;
        if (message.role === "user") {
          append(userMessage(message));
          continue;
        }
        // Replies saved before there was a choice of agent were all Claude Code's.
        const reply = agentMessage({ ...message, name: nameOf(message.engine ?? "claude"),
          undoAction: undoControl(i, message.undo),
          actions: waitingPlan ? planButtons()
            : (message.limited || (!message.ok && !message.stopped)) && last
              ? carryOnButtons(message.engine ?? "claude", message.changed ?? message.undo?.files, message.limited)
              : null });
        replies.set(i, reply);
        if (message.checked) reply.append(checkedNote(message.checked));
        append(reply);
      }
      log.scrollTop = log.scrollHeight;
      render();
    })
    .catch(() => {})
    .then(checkAgents);

  return {
    element,
    setTime(seconds) {
      const whole = Math.floor(seconds);
      moment = Number.isFinite(seconds) && seconds >= 0
        ? { seconds, when: `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}` } : null;
      renderMoment();
    },
    setEditor(shown) {
      editor = shown;
      hint.textContent = shown
        ? "Click something in the picture or on the timeline, then tell the assistant what to change."
        : "Move to a moment in the video, then tell the assistant what to change there.";
      if (!shown) pointing = null;
      renderPointing();
      renderMoment();
    },
    /** Importing footage prepares a request, without spending agent usage or replacing what was typed. */
    draft(text) {
      if (!input.value.trim()) input.value = text;
      input.focus();
    },
    /** Send now if the agent is ready; otherwise keep it in the box and send once it is. */
    send(text) {
      if (isReady()) return void submit(text, false);
      waiting = text;
      input.value = text;
    },
    destroy() {
      stopListening();
      window.removeEventListener("message", fromEditor);
      clearInterval(watchPointing);
      studyBar.destroy();
      editActions.destroy();
      delete document.body.dataset.agent;
      delete document.body.dataset.access;
      delete document.body.dataset.mode;
      delete document.body.dataset.pointing;
    },
  };
}
