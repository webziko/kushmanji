// The chat beside Studio: the person describes a change, an agent on their computer edits the project, and
// Studio's preview reloads by itself as files change. The page never talks to an agent directly; it sends text
// to the main process and draws the events that come back (see "Agent bridge contract" in docs/ARCHITECTURE.md).
// Which agents exist, what they are called and how to fix them all come from the main process, so adding an
// agent there needs no change here.
import { h } from "./dom.js";
import { createStudyBar } from "./study.js";
import { createEditActions } from "./editActions.js";

const api = window.hfwin;

const STATE_NOTES = {
  "not-installed": "not installed",
  "not-signed-in": "not signed in",
  broken: "will not start",
};

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
function agentMessage({ name, text, activities, ok, stopped, error, plan, touched, actions }) {
  const steps = [name, ...(activities ?? [])].filter(Boolean);
  return h(
    "div",
    { class: "msg agent" },
    steps.length > 0 && h("div", { class: "msg-steps" }, steps.join(" · ")),
    text && h("div", { class: "msg-text" }, formatted(text)),
    plan &&
      touched?.length > 0 &&
      h("div", { class: "msg-note error" }, `Before you said yes, the agent already changed: ${touched.slice(0, 6).join(", ")}.`),
    plan && actions,
    stopped && h("div", { class: "msg-note" }, "Stopped."),
    !ok && !stopped && h("div", { class: "msg-note error" }, error || "The agent could not finish this change."),
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
      el.replaceWith(agentMessage({ name, activities, ...done, text: done.text ?? text, actions }));
    },
  };
}

export function createChat(dir, { onEdit } = {}) {
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
  const nameOf = (id) => agents.find((agent) => agent.id === id)?.name ?? "Agent";
  const isReady = () => checked && current()?.state === "ready";

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
  const editActions = createEditActions({ onEdit, onDraft: (text) => {
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
    "aria-label": "Agent",
    title: "The agent that edits your video. A change applies from your next message.",
  });
  const modelPick = h("select", {
    class: "agent-pick",
    "aria-label": "Model",
    title: "The model this agent uses. A change applies from your next message.",
    hidden: true,
  });
  const notice = h("div", { class: "chat-notice", hidden: true });
  const studyBar = createStudyBar(dir, { onAsk: (file) => {
    if (!input.value.trim()) input.value =
      `Review ${file}. Check its picture, speech, sound and orientation. Tell me what needs fixing before editing.`;
    input.focus();
  } });
  const accessPick = h("select", {
    class: "agent-pick access-pick",
    title: "How much the agent may do on this computer. A change applies from your next message.",
  });
  // The chosen level in a sentence, always on screen: nobody should have to open a menu to learn what is allowed.
  const accessAbout = h("p", { class: "access-about muted" });
  const modePick = h("select", {
    class: "agent-pick mode-pick",
    title: "How involved you want to be. A change applies from your next message.",
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
        title: "Do not tell the agent about this selection",
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
  const versionNote = h("p", { class: "chat-version muted", hidden: true });

  /** Follow new text only if the person is already at the bottom; never yank them away from what they scrolled to. */
  const append = (node) => {
    const pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
    empty.remove();
    log.append(node);
    if (pinned) log.scrollTop = log.scrollHeight;
  };

  // `data-agent` is what the styles and the smoke test read.
  const setRunning = (running) => {
    document.body.dataset.agent = running ? "running" : "idle";
    send.hidden = running;
    stop.hidden = !running;
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
      h("p", {}, h("strong", {}, "Turn on full access for this project?")),
      h(
        "p",
        {},
        "The agent will be able to run any program and change or delete any file on this computer, without " +
          "asking first. Only do this for a project you made yourself or trust.",
      ),
      h(
        "div",
        { class: "notice-actions" },
        h("button", { class: "secondary small", type: "button", onclick: () => setAccess("full") }, "Turn on full access"),
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
    if (!text || live || !isReady()) return;
    input.value = "";
    void submit(text);
  }

  /** The card that says why the chosen agent cannot be used yet, with the commands that fix it. */
  function showFix(agent) {
    const commands =
      agent.state === "not-installed"
        ? [...(agent.install ?? []), ...(agent.signIn ?? [])]
        : agent.state === "not-signed-in"
          ? (agent.signIn ?? [])
          : [];
    const text =
      agent.state === "not-installed"
        ? `${agent.name} is not installed. Open PowerShell and run this, then sign in:`
        : agent.state === "not-signed-in"
          ? `${agent.name} is not signed in. Open PowerShell and run:`
          : agent.detail || `${agent.name} is installed, but it will not start.`;
    notice.hidden = false;
    notice.replaceChildren(
      h("p", {}, text),
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
    picker.replaceChildren(
      ...agents.map((agent) => {
        const note = STATE_NOTES[agent.state];
        return h("option", { value: agent.id }, note ? `${agent.name} · ${note}` : agent.name);
      }),
    );
    picker.value = engine;
    send.disabled = !isReady();
    const agent = current();
    // The agent's own list of models, when it has one. The first entry leaves the choice to the agent.
    const models = agent?.models ?? [];
    modelPick.hidden = models.length === 0;
    modelPick.replaceChildren(
      h("option", { value: "" }, "Default"),
      ...models.map((model) => h("option", { value: model.id }, model.name)),
    );
    modelPick.value = agent?.model ?? "";
    versionNote.hidden = !agent?.untested;
    versionNote.textContent = agent?.untested
      ? `${agent.name} ${agent.version} is newer than the ${agent.tested} this app was tried with. It should work; if it does not, that is why.`
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

  const form = h(
    "form",
    { class: "composer", onsubmit: onSubmit },
    pointingChip,
    h("div", { class: "composer-context" }, h("label", { for: "chat-request" }, "Your message"), momentChip),
    input,
    h(
      "div",
      { class: "composer-row" },
      h("span", { class: "spacer" }),
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
          title: "Clear this chat and start a new conversation. Your video is not changed.",
          onclick: reset,
        },
        "Start over",
      ),
    ),
    h("details", { class: "chat-settings" },
      h("summary", {}, "Assistant and clip settings"),
      h("div", { class: "chat-head" }, h("label", {}, "Assistant", picker), modelPick),
      h("div", { class: "chat-setting-row" }, h("label", { class: "access muted" }, "Ask me first", modePick)),
      modeAbout,
      h("div", { class: "chat-setting-row" }, h("label", { class: "access muted" }, "Allowed tools", accessPick)),
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
    if (eventDir !== dir || !live) return;
    if (event.type !== "done") return live.onEvent(event);
    const pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
    live.finish(event, event.plan ? planButtons() : null);
    live = null;
    setRunning(false);
    if (pinned) log.scrollTop = log.scrollHeight;
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
        append(
          message.role === "user"
            ? userMessage(message)
            : // Replies saved before there was a choice of agent were all Claude Code's.
              agentMessage({ ...message, name: nameOf(message.engine ?? "claude"), actions: waitingPlan ? planButtons() : null }),
        );
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
