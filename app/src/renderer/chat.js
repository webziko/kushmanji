// The chat beside Studio: the person describes a change, an agent on their computer edits the project, and
// Studio's preview reloads by itself as files change. The page never talks to an agent directly; it sends text
// to the main process and draws the events that come back (see "Agent bridge contract" in docs/ARCHITECTURE.md).
// Which agents exist, what they are called and how to fix them all come from the main process, so adding an
// agent there needs no change here.
import { h } from "./dom.js";
import { createStudyBar } from "./study.js";
import { createEditActions } from "./editActions.js";
import { createShortsCard } from "./shorts.js";
import {
  ASSISTANTS_CHANGED, changeTeam, confirmTest, fixCard, fixSentence, GOOD_FOR, lastTestText, menuName, STATE_NOTES,
  testingText,
} from "./assistants.js";
import { language, locale, t, tFrom } from "./words.js";

const api = window.hfwin;

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

// The kinds of thing the main process names a selection with (main/selection.js), in the person's language.
const KIND_NAMES = {
  "video clip": t("video clip"), sound: t("sound"), picture: t("picture"), graphic: t("graphic"),
  scene: t("scene"), text: t("text"), item: t("item"),
};

/** "the video clip “City Centre”, 0:26 to 0:41": what the person had selected, in their words. */
function pointingText({ name, kind, when }) {
  const span = /^(\d+:\d\d) to (\d+:\d\d)$/.exec(when ?? "");
  const where = span ? t("{start} to {end}", { start: span[1], end: span[2] }) : when;
  const what = KIND_NAMES[kind] ?? kind;
  return where ? t("the {kind} “{name}”, {when}", { kind: what, name, when: where })
    : t("the {kind} “{name}”", { kind: what, name });
}

function userMessage({ text, pointing, moment }) {
  return h(
    "div",
    { class: "msg user" },
    moment && h("div", { class: "msg-pointing" }, t("At {when}", { when: moment.when })),
    pointing && h("div", { class: "msg-pointing" },
      t("Pointing at {thing}", { thing: pointingText(pointing) })),
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
    return date.toLocaleString(locale(), { weekday: "long", hour: "numeric", minute: "2-digit" });
  // "2 days" reads as an answer to "when?" only with "in".
  return /^\d+\s*(?:second|minute|hour|day|week)s?\b/i.test(resets ?? "")
    ? t("in {time}", { time: resets }) : resets ?? "";
}

/** The plain account of a turn its assistant's usage limit cut short (M17-06). */
function limitNote(name, { changed, resets }) {
  const files = changed ?? [];
  const listed = files.slice(0, 6).join(", ");
  return [
    t("{name} ran out of its allowance before it finished.", { name }),
    files.length > 6
      ? t("It had already changed: {files} and {count} more.", { files: listed, count: files.length - 6 })
      : files.length ? t("It had already changed: {files}.", { files: listed })
        : t("It had not changed anything yet."),
    files.length && t("Nobody has checked those changes yet."),
    resets && t("{name} says it can work again: {time}.", { name, time: resetsText(resets) }),
  ].filter(Boolean).join(" ");
}

/** "Used a little of Claude's allowance", with the counts for whoever is curious (M15-05, agents/usage.js). */
function usageNote(name, usage) {
  if (!usage?.level) return null;
  const used = usage.level === "little" ? t("Used a little of {name}'s allowance", { name })
    : usage.level === "a lot" ? t("Used a lot of {name}'s allowance", { name })
      : t("Used some of {name}'s allowance", { name });
  return h("div", { class: "msg-usage muted",
    title: t("About {tokens} word pieces (tokens): {fresh} read new, {cached} read again, {written} written.", {
      tokens: usage.tokens.toLocaleString(), fresh: usage.fresh.toLocaleString(),
      cached: usage.cached.toLocaleString(), written: usage.written.toLocaleString(),
    }) }, used);
}

function agentMessage({
  name, text, activities, ok, stopped, error, plan, touched, actions, limited, resets, changed, undoAction, usage,
}) {
  // The labels are saved in English (main/say.js); they are shown in the chosen language.
  const steps = [name, ...(activities ?? []).map(tFrom)].filter(Boolean);
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
        t("The assistant changed your video before you said yes. Files it changed: {files}.",
          { files: touched.slice(0, 6).join(", ") }),
      ),
    plan && actions,
    stopped && h("div", { class: "msg-note" }, t("Stopped.")),
    limited && h("div", { class: "msg-note error" }, limitNote(name, { changed, resets })),
    limited && actions,
    // The review round's buttons (M13-04) and anything else a settled reply offers.
    !plan && !limited && actions,
    !ok && !stopped && !limited &&
      h("div", { class: "msg-note error" },
        error ? tFrom(error) : t("The assistant could not finish this change.")),
    undoAction,
    usageNote(name, usage),
  );
}

/** The agent's reply while it is still being written. `finish` swaps it for the settled message. */
function liveMessage(name) {
  const steps = h("div", { class: "msg-steps live" }, `${name} · ${t("Thinking…")}`);
  const body = h("div", { class: "msg-text" });
  const el = h("div", { class: "msg agent" }, steps, body);
  const activities = [];
  let text = "";
  let frame = 0;
  return {
    el,
    /** The reply's words so far. */
    reply: () => text,
    onEvent(event) {
      if (event.type === "activity") {
        // Each part on its own: the detail is usually a file name or a command, which tFrom leaves as it is.
        steps.textContent = [name, tFrom(event.label), tFrom(event.detail)].filter(Boolean).join(" · ");
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
  // Assistants that can take a request now: ticked and, once the check has answered, installed and signed in.
  const usable = () => team().filter((agent) => !checked || agent.state === "ready");
  const nameOf = (id) => {
    const agent = agents.find((item) => item.id === id);
    return agent?.label ?? agent?.name ?? t("Assistant");
  };
  const isReady = () => checked && current()?.state === "ready";

  /** Each settled reply by its place in the chat, so the app's check can be added to it when it arrives. */
  const replies = new Map();
  /** What was sent last: the request, its purpose, and to which assistant (M13-04). */
  let sending = null;
  /** The assistant whose work is being reviewed, while a review runs. */
  let reviewing = null;
  /** The review round's buttons on the latest reply, removed when a newer request goes out. */
  let roundActions = null;
  /** True while "Test it now" runs: nothing else is sent meanwhile. */
  let testing = false;

  /**
   * One review by a different assistant, then one round of fixes, never a loop (M13-04). Under a reply that
   * changed the video: "Ask ... to check it", one button per other assistant the person has. The reviewer is told
   * by the main process to change nothing.
   */
  function reviewButtons({ engine: author, asked, files = [] }) {
    const others = usable().filter((agent) => agent.id !== author);
    if (!others.length || !files.length) return null;
    const ask = `Please check what ${nameOf(author)} just did for my request: “${short(asked ?? "", 400)}”. ` +
      `Files it changed: ${files.slice(0, 12).join(", ")}.`;
    return h("div", { class: "notice-actions" }, ...others.map((agent) => h("button", {
      class: "secondary small", type: "button",
      onclick: () => {
        if (live) return;
        reviewing = author;
        engine = agent.id;
        render();
        void api.agent.choose({ dir, engine }).catch(() => {});
        void submit(ask, false, "review");
      },
    }, t("Ask {name} to check it", { name: agent.label ?? agent.name }))));
  }

  /** Under a review: back to the assistant that did the work, with the list. A clean review says so instead. */
  function fixButton(reviewer, author, review) {
    if (!author || author === reviewer) return null;
    const said = review.trim();
    if (!said.includes("\n") && /^\W*(?:(?:it |this |everything )?(?:looks|seems) (?:right|good|fine)|no (?:real )?problems)\b/i
      .test(said)) {
      return h("p", { class: "muted" }, t("Nothing to fix. Watch your video to be sure."));
    }
    const ask = `Please fix the problems ${nameOf(reviewer)} found in your last change:\n\n${review.trim().slice(0, 4000)}` +
      "\n\nThen check your work once and stop.";
    return h("div", { class: "notice-actions" }, h("button", {
      class: "secondary small", type: "button",
      onclick: () => {
        if (live) return;
        engine = author;
        render();
        void api.agent.choose({ dir, engine }).catch(() => {});
        void submit(ask, false, "fix");
      },
    }, t("Ask {name} to fix these", { name: nameOf(author) })));
  }

  /** The buttons that come after a settled reply in the review round, or null. */
  function roundButtons({ purpose, ok, engine: by, text, files, asked, author }) {
    if (!ok) return null;
    if (purpose === "review") return fixButton(by, author, text ?? "");
    if (purpose === "fix") return null;
    return reviewButtons({ engine: by, asked, files });
  }

  /**
   * What the app's check found after a reply changed the video (M10-03, main/agents/turnCheck.js). Mistakes come
   * with a button that puts a request to fix them in the message box.
   */
  function checkedNote({ errors, mistakes = [] }) {
    if (!errors) return h("div", { class: "msg-check muted" }, t("The app checked your video: no mistakes found."));
    const listed = mistakes.map((mistake) => `- ${mistake.text}${mistake.where ? ` (${mistake.where})` : ""}`);
    const more = errors > mistakes.length ? `\n- and ${errors - mistakes.length} more like these` : "";
    const ask = `Please fix the mistakes the app's check found:\n${listed.join("\n")}${more}`;
    return h("div", { class: "msg-check" },
      h("div", { class: "msg-note error" }, errors === 1
        ? t("The app checked your video and found one mistake.")
        : t("The app checked your video and found {count} mistakes.", { count: errors })),
      h("div", { class: "msg-actions" },
        h("button", { class: "secondary small", type: "button", onclick: () => {
          input.value = input.value.trim() ? `${input.value.trim()}\n\n${ask}` : ask;
          input.focus();
        } }, t("Ask to fix them")),
        // The check's own words are for the assistant; whoever is curious can read them.
        h("details", { class: "msg-check-details" }, h("summary", {}, t("Show them")),
          ...mistakes.map((mistake) => h("p", {}, tFrom(mistake.text))))));
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
      button.textContent = state.undoneBy ? t("Bring it back") : t("Undo this change");
      button.title = state.undoneBy
        ? t("Put back what the assistant changed.")
        : t("Put these files back as they were before: {files}", { files: state.files.slice(0, 6).join(", ") });
      note.textContent = state.undoneBy ? t("Undone. Your video is back as it was before this change.") : "";
    };
    show(undo);
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        show(await api.agent.undo({ dir, index, id: undo.id }));
      } catch (error) {
        note.textContent = tFrom(error.message);
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
    const others = usable().filter((agent) => agent.id !== stoppedEngine);
    if (!others.length) return null;
    const from = nameOf(stoppedEngine);
    return h("div", { class: "notice-actions" }, ...others.map((agent) => h("button", {
      class: "secondary small", type: "button",
      onclick: () => {
        if (live) return;
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
    }, t("Carry on with {name}", { name: agent.label ?? agent.name }))));
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
    placeholder: t("Describe a change\nEnter to send · Shift+Enter for a new line"),
    "aria-label": t("Message to the assistant"),
  });
  const defaultPlaceholder = input.placeholder;
  const hint = h("p", { class: "muted" },
    t("Move to a moment in the video, then tell the assistant what to change there."));
  const empty = h(
    "div",
    { class: "chat-empty" },
    h("p", {}, t("Tell the assistant what you would like to change. Your video updates as it works.")),
    hint,
  );
  const editActions = createEditActions({ onEdit, onSave, onDraft: (text) => {
    input.value = input.value.trim() ? `${input.value.trimEnd()}\n\n${text}` : text;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  } });
  const send = h("button", { class: "primary", type: "submit", disabled: true }, t("Send"));
  const stop = h(
    "button",
    { class: "secondary", type: "button", hidden: true, onclick: () => api.agent.stop().catch(() => {}) },
    t("Stop"),
  );
  const picker = h("select", {
    class: "agent-pick",
    "aria-label": t("Assistant"),
    title: t("Who changes your video for you. A change starts with your next message."),
  });
  // A saved look (M10-04, main/kits.js): use one in this video, or keep this video's look under a name.
  const lookPick = h("select", { class: "agent-pick look-pick", "aria-label": t("Saved looks") });
  const lookUse = h("button", { class: "secondary small", type: "button" }, t("Use"));
  const lookName = h("input", { class: "field look-name", type: "text", maxlength: "60", hidden: true,
    placeholder: t("A name, for example your channel"), "aria-label": t("Name for this look") });
  const lookSave = h("button", { class: "ghost small", type: "button" }, t("Save this look"));
  const lookNote = h("p", { class: "muted look-note", role: "status" });
  const lookDraft = (text) => {
    input.value = input.value.trim() ? `${input.value.trim()}\n\n${text}` : text;
    input.focus();
  };
  let savedLooks = [];
  async function renderLooks() {
    const got = await api.looks.list(dir).catch(() => null);
    if (!got) return null;
    const chosen = lookPick.value;
    lookPick.replaceChildren(...(got.looks.length
      ? got.looks.map((look) => h("option", { value: look.name }, look.name))
      : [h("option", { value: "" }, t("No saved looks yet"))]));
    lookPick.disabled = lookUse.disabled = !got.looks.length || Boolean(live);
    if (got.looks.some((look) => look.name === chosen)) lookPick.value = chosen;
    savedLooks = got.looks.map((look) => look.name.toLowerCase());
    return got;
  }
  lookUse.addEventListener("click", async () => {
    const name = lookPick.value;
    if (!name) return;
    try {
      await api.looks.use({ dir, name });
      lookNote.textContent = t("This video now has the look “{name}”. Send the message below to apply it.",
        { name });
      lookDraft("Make this video match the look in STYLE.md: colours, fonts, titles, captions and the ending card.");
    } catch (error) {
      lookNote.textContent = tFrom(error.message);
    }
  });
  lookSave.addEventListener("click", async () => {
    const got = await renderLooks();
    if (!got?.written) {
      lookNote.textContent = t("First the assistant writes this video's look down. Send the message below, then " +
        "press Save this look again.");
      lookDraft("Write down this video's look in STYLE.md: colours (hex), fonts, title style, caption style, the " +
        "ending card and any music bed, exactly enough that another video can match it. Change nothing else.");
      return;
    }
    if (lookName.hidden || !lookName.value.trim()) {
      lookName.hidden = false;
      lookName.focus();
      lookNote.textContent = t("Name the look, then press Save this look.");
      return;
    }
    if (savedLooks.includes(lookName.value.trim().toLowerCase()) &&
      !confirm(t("A look called “{name}” is already saved. Replace it with this video's look?",
        { name: lookName.value.trim() }))) return;
    try {
      const saved = await api.looks.save({ dir, name: lookName.value });
      lookName.hidden = true;
      lookName.value = "";
      lookNote.textContent = t("Saved as “{name}”. Any of your videos can use it now.", { name: saved.name });
      await renderLooks();
    } catch (error) {
      lookNote.textContent = tFrom(error.message);
    }
  });
  lookName.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      lookSave.click();
    }
  });
  void renderLooks();

  const teamBox = h("fieldset", { class: "chat-team" });
  const teamNote = h("p", { class: "msg-note error", role: "status" });
  const modelPick = h("select", {
    class: "agent-pick",
    "aria-label": t("How careful"),
    title: t("How careful the assistant is. Not sure? Leave it on Auto. A change starts with your next message."),
    hidden: true,
  });
  const notice = h("div", { class: "chat-notice", hidden: true });
  const studyBar = createStudyBar(dir, { onAsk: (file) => {
    if (!input.value.trim()) input.value =
      `Look at ${file}. Tell me what is in it: the picture, what is said, the sound, and whether it is sideways. ` +
      "Tell me what needs fixing before you change anything.";
    input.focus();
  } });
  const shortsCard = createShortsCard(dir);
  const accessPick = h("select", {
    class: "agent-pick access-pick",
    title: t("What the assistant may do. A change starts with your next message."),
  });
  // The chosen level in a sentence, always on screen: nobody should have to open a menu to learn what is allowed.
  const accessAbout = h("p", { class: "access-about muted" });
  const modePick = h("select", {
    class: "agent-pick mode-pick",
    title: t("When the assistant asks you before it builds. A change starts with your next message."),
  });
  const modeAbout = h("p", { class: "access-about muted" });
  // What is selected in Studio, said back to the person before they send, with a way to leave it out.
  const pointingName = h("span", {});
  const momentChip = h("div", { class: "pointing chat-moment", hidden: true,
    title: t("The assistant receives this video moment when you send your message.") });
  function renderMoment() {
    momentChip.hidden = editor || moment === null;
    momentChip.textContent = moment === null ? "" : t("At {when}", { when: moment.when });
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
        title: t("Do not tell the assistant about this"),
        "aria-label": t("Do not point at this"),
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
  const testButton = h("button", { class: "secondary small", type: "button" }, t("Test it now"));
  const versionNote = h("div", { class: "chat-version muted", hidden: true }, versionText, testButton);
  testButton.addEventListener("click", async () => {
    const agent = current();
    if (!agent || live) return;
    const name = agent.label ?? agent.name;
    if (!confirmTest(name)) return;
    testButton.disabled = true;
    send.disabled = true;
    testing = true;
    versionText.textContent = testingText(name);
    try {
      const got = await api.agent.checkup(agent.id);
      agent.untested = !got.ok;
      agent.checkup = got;
      versionText.textContent = tFrom(got.said);
      testButton.hidden = got.ok;
    } catch (error) {
      versionText.textContent = tFrom(error.message);
    } finally {
      testing = false;
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
    h("button", { class: "ghost small", type: "button", onclick: () => {
      if (queued && !queued.steer) input.value = input.value.trim() ? `${queued.text}\n\n${input.value.trim()}` : queued.text;
      queued = null;
      renderQueued();
      input.focus();
    } }, t("Cancel")));
  const short = (text, most = 60) => (text.length > most ? `${text.slice(0, most - 3).trimEnd()}…` : text);
  function renderQueued() {
    queuedNote.hidden = !queued;
    const who = nameOf(engine);
    queuedText.textContent = !queued ? ""
      : queued.steer ? t("Stopping {name}, then sending “{message}”.", { name: who, message: short(queued.text) })
        : t("“{message}” waits and goes as soon as {name} has finished.", { message: short(queued.text), name: who });
    later.hidden = now.hidden = !live || Boolean(queued) || !input.value.trim();
  }
  function wait(steer) {
    const text = input.value.trim();
    // One message waits at a time: a second Enter must not quietly replace the first.
    if (!text || !live || queued) return;
    queued = { text, steer };
    input.value = "";
    if (steer) api.agent.stop().catch(() => {});
    renderQueued();
  }
  const later = h("button", { class: "secondary", type: "button", hidden: true, onclick: () => wait(false) },
    t("Send when done"));
  const now = h("button", { class: "secondary", type: "button", hidden: true, onclick: () => wait(true) },
    t("Stop and send now"));
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
    startOver.disabled = running;
    for (const box of teamBox.querySelectorAll("input")) box.disabled = running;
    for (const control of [lookPick, lookUse, lookSave, lookName]) control.disabled = running;
    if (!running) void renderLooks();
    editActions.setRunning(running);
  };

  /** The selection to send with the next message, or null. */
  const pointed = () => (editor && pointing && pointing.key !== dismissed ? pointing : null);

  // `data-pointing` is what the smoke test reads.
  function renderPointing() {
    const shown = pointed();
    pointingChip.hidden = !shown;
    pointingName.textContent = shown ? t("Pointing at {thing}", { thing: pointingText(shown) }) : "";
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
    modePick.replaceChildren(...modes.map((item) => h("option", { value: item.id }, tFrom(item.name))));
    modePick.value = mode ?? "";
    modeAbout.textContent = tFrom(modes.find((item) => item.id === mode)?.about ?? "");
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
        onclick: () => void submit("Yes. Build the plan you just showed me.", false) }, t("Build it")),
      h(
        "button",
        {
          class: "secondary small",
          type: "button",
          onclick: () => {
            input.placeholder = t("Say what to change in the plan");
            input.focus();
          },
        },
        t("Change the plan"),
      ),
    );
    return planActions;
  }

  // `data-access` is what the smoke test reads.
  function renderAccess() {
    accessPick.replaceChildren(...levels.map((level) => h("option", { value: level.id }, tFrom(level.name))));
    accessPick.value = access ?? "";
    accessAbout.textContent = tFrom(levels.find((level) => level.id === access)?.about ?? "");
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
      h("p", {}, h("strong", {}, t("Let the assistant do anything on this computer?"))),
      h(
        "p",
        {},
        t("The assistant will be able to open any program and change or delete any file on this computer, " +
          "without asking you first. Only do this for a video you made yourself or one you trust."),
      ),
      h(
        "div",
        { class: "notice-actions" },
        h("button", { class: "secondary small", type: "button", onclick: () => setAccess("full") },
          t("Yes, allow anything")),
        h("button", { class: "ghost small", type: "button", onclick: () => (accessConfirm.hidden = true) },
          t("Cancel")),
      ),
    );
  });

  async function submit(text, includeMoment = true, purpose = null) {
    if (live || testing) return;
    input.placeholder = defaultPlaceholder;
    // The round's buttons on an earlier reply would act on a change that is no longer the latest (M13-04).
    roundActions?.remove();
    roundActions = null;
    sending = { text, purpose, engine };
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
      const accepted = await api.agent.send({
        dir, text, pointing: Boolean(about), moment: Boolean(watched), purpose, language: language(),
      });
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
    if (!text || !isReady() || testing) return;
    input.value = "";
    void submit(text);
  }

  /** The card that says why the chosen assistant cannot be used yet, with the lines that fix it. */
  function showFix(agent) {
    // The sentence, the one-press "Open PowerShell for me" (M10-27) and the lines to type come from assistants.js:
    // the Settings dialog and Home's "Connect an assistant" show the same card for the same assistant.
    notice.hidden = false;
    notice.replaceChildren(
      h("p", {}, fixSentence(agent)),
      ...fixCard(agent),
      h("button", { class: "secondary small", type: "button", onclick: checkAgents }, t("Check again")),
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
      h("option", { value: "auto" }, t("Auto (saves your allowance)")),
      h("option", { value: "" }, t("Default")),
      ...models.map((model) => h("option", { value: model.id }, model.name)),
    );
    modelPick.value = agent?.model ?? "";
    versionNote.hidden = !agent?.untested;
    testButton.hidden = !agent?.untested;
    versionText.textContent = agent?.untested
      ? [
        t("Your copy of {name} (version {version}) is newer than the one this app was tested with ({tested}). " +
          "It should still work.", { name: agent.product ?? agent.name, version: agent.version, tested: agent.tested }),
        lastTestText(agent),
      ].filter(Boolean).join(" ")
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
      h("legend", {}, t("Your assistants: tick the ones you have")),
      ...agents.map((agent) => {
        const box = h("input", { type: "checkbox", checked: agent.inTeam !== false });
        box.addEventListener("change", async () => {
          // The same rule and call as the Settings dialog's ticks (assistants.js): one always stays ticked.
          const { problem } = await changeTeam(agents, agent, box.checked);
          teamNote.textContent = problem ?? "";
          if (problem) {
            box.checked = agent.inTeam !== false;
            return;
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

  // The Settings dialog checked the assistants again, or changed which ones are ticked (assistants.js).
  const settingsFound = (event) => {
    const found = event.detail?.agents;
    if (!Array.isArray(found)) return;
    agents = found;
    checked = true;
    render();
  };
  window.addEventListener(ASSISTANTS_CHANGED, settingsFound);

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
    if (live) return;
    if (!confirm(t("Start a new conversation? Your video is not changed, but the Undo buttons on earlier replies go " +
      "away (the changes stay in the editor's own history)."))) return;
    await api.agent.reset(dir).catch(() => {});
    replies.clear();
    log.replaceChildren(empty);
  }

  const startOver = h("button", { class: "ghost small", type: "button",
    title: t("Start a new conversation. Your video is not changed."), onclick: reset }, t("Start over"));

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
    askNote.textContent = t("The editor's request is in your message. Add anything you want, then press Send.");
    input.focus();
  };
  window.addEventListener("message", fromEditor);

  // "@" in the message box (M3-03): a list of the video's clips, sounds, pictures and scenes, and the moment
  // the video is at. Choosing one writes a plain `@name` into the text. Nothing else is attached: the
  // assistant reads the file itself. The names come from the main process (main/mentions.js), asked for again
  // each time a new "@" is typed.
  const MENTION_GROUPS = [["video", t("Clips")], ["audio", t("Sounds")], ["image", t("Pictures")],
    ["scene", t("Scenes")]];
  const MENTION_ROWS = 40;
  const mentionList = h("div", { class: "mention-list", id: "chat-mentions", role: "listbox", hidden: true,
    "aria-label": t("Things you can mention") });
  /** What the list can offer: the files the main process last named. */
  let mentionable = [];
  let mentionsLoaded = false;
  let mentionAsk = 0;
  /** The "@" being completed: where it starts, where the caret is, what was typed, and what is offered. */
  let mention = null;
  /** The "@" the person closed with Escape. It stays closed until they start another one. */
  let mentionClosed = null;
  /** The "@" the files were last asked for, so one "@" asks once however much is typed after it. */
  let mentionAskedAt = null;
  let mentionDrawn = "";
  const dropNote = h("p", { class: "composer-note muted", role: "status", hidden: true });
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", "chat-mentions");
  input.setAttribute("aria-expanded", "false");

  /** The words after an "@" must read back as one word, so a name with spaces goes in quotes. */
  const mentionText = (name) => `@${/\s/.test(name) ? `"${name}"` : name}`;

  /** Where the caret is inside an "@" that starts a word, or null. An address like a@b.com is not one. */
  function mentionTrigger() {
    if (input.selectionStart !== input.selectionEnd) return null;
    const caret = input.selectionStart;
    const typed = /(^|\s)@([^\s@]*)$/u.exec(input.value.slice(0, caret));
    return typed ? { start: caret - typed[2].length - 1, caret, query: typed[2].replace(/^"/, "") } : null;
  }

  /** Everything that fits what was typed, in the order shown: this moment, clips, sounds, pictures, scenes. */
  function mentionChoices(query, at) {
    const wanted = query.toLowerCase();
    const choices = [];
    // The words a person can type to find the moment: the English ones, and the same words in their language.
    if (at && ["this moment", "moment", "now", t("This moment").toLowerCase(), at.when]
      .some((word) => word.startsWith(wanted))) {
      choices.push({ group: t("In the video"), id: "moment", label: t("This moment"),
        detail: t("At {when}", { when: at.when }), insert: `@${at.when}` });
    }
    for (const [kind, title] of MENTION_GROUPS) {
      const ranked = mentionable
        .filter((file) => file.kind === kind)
        .map((file) => {
          const name = file.name.toLowerCase();
          return { file, rank: name.startsWith(wanted) ? 0 : name.includes(wanted) ? 1
            : file.path.toLowerCase().includes(wanted) ? 2 : 3 };
        })
        .filter((found) => found.rank < 3)
        .sort((a, b) => a.rank - b.rank);
      for (const { file } of ranked) {
        const folder = file.path.slice(0, file.path.length - file.name.length).replace(/\/$/, "");
        choices.push({ group: title, id: file.path, label: file.name, detail: folder,
          insert: mentionText(file.mention ?? file.name) });
      }
    }
    return choices;
  }

  function closeMentions() {
    if (!mention) return;
    mention = null;
    mentionDrawn = "";
    mentionList.hidden = true;
    mentionList.replaceChildren();
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function paintMentionChoice() {
    const rows = [...mentionList.querySelectorAll('[role="option"]')];
    rows.forEach((row, i) => {
      const on = i === mention?.active;
      row.setAttribute("aria-selected", String(on));
      row.classList.toggle("active", on);
      if (on) {
        input.setAttribute("aria-activedescendant", row.id);
        row.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function drawMentions() {
    const shown = mention.choices.slice(0, MENTION_ROWS);
    // The same list again (a refresh that found nothing new) is left alone: a click needs the row it hit.
    const key = `${mention.query}\n${shown.map((choice) => choice.id).join("\n")}\n${mention.choices.length}`;
    mentionList.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (key !== mentionDrawn) {
      mentionDrawn = key;
      const groups = [];
      shown.forEach((choice, i) => {
        if (groups.at(-1)?.title !== choice.group) groups.push({ title: choice.group, rows: [] });
        groups.at(-1).rows.push(h("div", {
          class: "mention-item", role: "option", id: `chat-mention-${i}`, "aria-selected": "false",
          onclick: () => chooseMention(i),
          onmousemove: () => {
            if (mention && mention.active !== i) {
              mention.active = i;
              paintMentionChoice();
            }
          },
        }, h("span", { class: "mention-name" }, choice.label),
        choice.detail && h("span", { class: "mention-detail" }, choice.detail)));
      });
      const note = !mention.choices.length ? t("Nothing to mention yet. Drop clips onto this chat to add them.")
        : mention.choices.length > shown.length ? t("Keep typing to see the others.") : "";
      mentionList.replaceChildren(
        ...groups.map((group) => h("div", { class: "mention-group", role: "group", "aria-label": group.title },
          h("div", { class: "mention-title", "aria-hidden": "true" }, group.title), ...group.rows)),
        ...(note ? [h("div", { class: "mention-note" }, note)] : []),
      );
    }
    paintMentionChoice();
  }

  /** Open, narrow or close the list to match the "@" at the caret. `refresh` keeps the row that was chosen. */
  function updateMentions(refresh = false) {
    const trigger = mentionTrigger();
    if (!trigger) {
      mentionClosed = null;
      mentionAskedAt = null;
      return closeMentions();
    }
    // A new "@" asks again which files there are, so a clip the assistant just made is on the list.
    if (mentionAskedAt !== trigger.start) {
      mentionAskedAt = trigger.start;
      void refreshMentionable();
    }
    if (mentionClosed === trigger.start) return closeMentions();
    const opening = !mention;
    // The moment is taken when the list opens and kept, so the rows do not change under a pointer.
    const at = opening ? (!editor && moment) || null : mention.at;
    const choices = mentionChoices(trigger.query, at);
    // Nothing fits what was typed: no list. With nothing typed yet, say why it is empty, once that is known.
    if (!choices.length && (trigger.query || !mentionsLoaded)) return closeMentions();
    const same = !opening && mention.start === trigger.start && mention.query === trigger.query;
    const kept = refresh && same ? Math.min(mention.active, Math.max(0, choices.length - 1)) : 0;
    mention = { ...trigger, at, choices, active: kept };
    drawMentions();
  }

  async function refreshMentionable() {
    const ask = ++mentionAsk;
    try {
      const found = await api.mentions.list(dir);
      if (ask !== mentionAsk) return;
      mentionable = Array.isArray(found) ? found : [];
    } catch {
      // Not readable just now: the list keeps what it had.
    }
    mentionsLoaded = true;
    if (document.activeElement === input) updateMentions(true);
  }

  function chooseMention(index) {
    const picked = mention?.choices[index];
    if (!picked) return;
    const { start, caret } = mention;
    const spaced = /^\s/.test(input.value.slice(caret));
    mentionClosed = null;
    closeMentions();
    input.focus();
    input.setSelectionRange(start, caret);
    // Typed in, so the box's own undo still works. The fallback is for a page that refuses.
    const text = spaced ? picked.insert : `${picked.insert} `;
    if (!document.execCommand("insertText", false, text)) {
      input.setRangeText(text, start, caret, "end");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (spaced) input.setSelectionRange(start + text.length + 1, start + text.length + 1);
    // Typing the name in fires "input", which would open the list again on the word just inserted.
    closeMentions();
  }

  /** The keys the open list takes. True when it took the key, so the box does not also act on it. */
  function mentionKey(event) {
    if (!mention || event.isComposing) return false;
    if (event.key === "Escape") {
      mentionClosed = mention.start;
      closeMentions();
      event.stopPropagation();
    } else if (!mention.choices.length) {
      return false;
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const count = Math.min(mention.choices.length, MENTION_ROWS);
      mention.active = (mention.active + (event.key === "ArrowDown" ? 1 : count - 1)) % count;
      paintMentionChoice();
    } else if ((event.key === "Enter" && !event.shiftKey) || (event.key === "Tab" && !event.shiftKey)) {
      chooseMention(mention.active);
    } else {
      return false;
    }
    event.preventDefault();
    return true;
  }

  // The list never takes the pointer's focus away from the box, so choosing a row does not close it first.
  mentionList.addEventListener("mousedown", (event) => event.preventDefault());
  input.addEventListener("input", (event) => {
    askNote.hidden = true;
    dropNote.hidden = true;
    // Typing an "@" starts a new mention, whatever was closed or asked before at the same place in the text.
    if (event.data === "@") mentionClosed = mentionAskedAt = null;
    updateMentions();
  });
  input.addEventListener("click", () => updateMentions());
  input.addEventListener("keyup", (event) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) updateMentions();
  });
  input.addEventListener("blur", closeMentions);

  // Clips dropped from File Explorer onto the chat (M3-03). Each is copied into the video's own files, so the
  // original stays where it was, and the message box gets an "@" for each. The preload reads which path each
  // dropped file really has (files.pathOf); the main process checks every one again before it copies anything.
  const dropHint = h("div", { class: "drop-hint", hidden: true, "aria-hidden": "true" },
    h("p", {}, t("Drop clips to add them to this video")));
  const say = (text, problem = false) => {
    dropNote.hidden = !text;
    dropNote.textContent = text;
    dropNote.classList.toggle("problem", problem);
  };
  const carriesFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes("Files");
  // Enter and leave come in pairs for the panel and everything in it; the hint goes when they balance. A drag
  // that is called off (Escape, or let go outside the window) may not say so, so the hint also goes when the
  // page has heard nothing of the drag for a moment: a drag over the panel is heard from every few dozen
  // milliseconds, held still or not.
  let overChat = 0;
  let hintTimer = 0;
  const hideHint = () => {
    clearTimeout(hintTimer);
    overChat = 0;
    dropHint.hidden = true;
  };
  const dragOver = (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    dropHint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 1500);
  };
  const dragIn = (event) => {
    if (carriesFiles(event)) overChat++;
    dragOver(event);
  };
  const dragOut = () => {
    overChat = Math.max(0, overChat - 1);
    if (overChat === 0) hideHint();
  };

  async function addDropped(paths, dropped) {
    if (live) return say(t("The assistant is still working. Wait for it to finish before adding clips."), true);
    if (!paths.length || paths.length < dropped) {
      return say(t("Only files from File Explorer can be added here, so nothing was added."), true);
    }
    say(t("Adding clips…"));
    try {
      const added = await api.projects.addDropped({ dir, paths });
      await refreshMentionable();
      const byPath = new Map(mentionable.map((file) => [file.path, file]));
      const called = (file) => byPath.get(file)?.mention ?? file.split("/").pop();
      const tokens = added.files.map((file) => mentionText(called(file)));
      const before = input.value.trimEnd();
      input.value = `${before}${before ? " " : ""}${tokens.join(" ")} `;
      input.dispatchEvent(new Event("input"));
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      say(added.count === 1 ? t("Added 1 clip to this video.")
        : t("Added {count} clips to this video.", { count: added.count }));
    } catch (error) {
      say(tFrom(error.message), true);
    }
  }

  const form = h(
    "form",
    { class: "composer", onsubmit: onSubmit },
    askNote,
    dropNote,
    queuedNote,
    pointingChip,
    h("div", { class: "composer-context" }, h("label", { for: "chat-request" }, t("Your message")), momentChip),
    h("div", { class: "composer-field" }, mentionList, input),
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
      h("strong", {}, t("What would you like to change?")),
      h("span", { class: "spacer" }),
      startOver,
    ),
    h("details", { class: "chat-settings" },
      h("summary", {}, t("Assistant and clip settings")),
      teamBox,
      h("div", { class: "chat-head" }, h("label", {}, t("Assistant"), picker), modelPick),
      h("div", { class: "chat-setting-row" }, h("label", { class: "access muted" }, t("Ask me first"), modePick)),
      modeAbout,
      h("div", { class: "chat-setting-row" },
        h("label", { class: "access muted" }, t("What may the assistant do"), accessPick)),
      h("div", { class: "chat-setting-row look-row" },
        h("label", { class: "access muted" }, t("Look"), lookPick), lookUse, lookSave, lookName),
      lookNote,
      versionNote,
      studyBar.element,
    ),
    editActions.element,
    shortsCard.element,
    log,
    notice,
    accessConfirm,
    form,
    dropHint,
  );
  element.addEventListener("dragenter", dragIn);
  element.addEventListener("dragover", dragOver);
  element.addEventListener("dragleave", dragOut);
  element.addEventListener("drop", (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    hideHint();
    // Read at once: the list of dropped files is only valid while the event is being handled.
    const dropped = [...event.dataTransfer.files];
    void addDropped(dropped.map((file) => api.files.pathOf(file)).filter(Boolean), dropped.length);
  });

  input.addEventListener("keydown", (event) => {
    if (mentionKey(event)) return;
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
    // The assistant that wrote this reply, even if the menu was changed while it worked.
    const by = sending?.engine ?? engine;
    const round = roundButtons({ purpose: sending?.purpose, ok: event.ok && !event.plan, engine: by,
      text: event.text ?? live.reply(), files: event.undo?.files, asked: sending?.text, author: reviewing });
    if (sending?.purpose !== "review") reviewing = null;
    roundActions = failed || event.plan ? null : round;
    const settled = live.finish({ ...event, undoAction: undoControl(event.index, event.undo) },
      event.plan ? planButtons() : failed ? carryOnButtons(by, event.changed ?? event.undo?.files, event.limited) : round);
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
        // The review round's buttons stay on the last reply (M13-04).
        const asked = saved.messages[i - 1];
        const author = asked?.purpose === "review" ? saved.messages[i - 2]?.engine : null;
        const reply = agentMessage({ ...message, name: nameOf(message.engine ?? "claude"),
          undoAction: undoControl(i, message.undo),
          actions: waitingPlan ? planButtons()
            : (message.limited || (!message.ok && !message.stopped)) && last
              ? carryOnButtons(message.engine ?? "claude", message.changed ?? message.undo?.files, message.limited)
              : last ? roundButtons({ purpose: message.purpose, ok: message.ok && !message.plan,
                engine: message.engine ?? "claude", text: message.text, files: message.undo?.files,
                asked: asked?.text, author })
                : null });
        replies.set(i, reply);
        if (message.checked) reply.append(checkedNote(message.checked));
        append(reply);
        if (last && !waitingPlan) roundActions = reply.querySelector(".notice-actions");
      }
      // Reopened while an assistant is still working on this video: show it working, with Stop.
      if (saved.running) {
        sending = { text: "", purpose: null, engine: saved.engine };
        live = liveMessage(nameOf(saved.engine));
        append(live.el);
        setRunning(true);
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
        ? t("Click something in the picture or on the timeline, then tell the assistant what to change.")
        : t("Move to a moment in the video, then tell the assistant what to change there.");
      if (!shown) pointing = null;
      renderPointing();
      renderMoment();
    },
    /** Importing footage prepares a request, without spending agent usage or replacing what was typed. */
    draft(text) {
      if (!input.value.trim()) input.value = text;
      input.focus();
    },
    /** A prepared message after whatever is already typed, not sent: the person presses Send (M3-05, a drawing). */
    addToDraft(text) {
      input.value = input.value.trim() ? `${input.value.trimEnd()}\n\n${text}` : text;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      input.dispatchEvent(new Event("input"));
    },
    /** Send now if the agent is ready; otherwise keep it in the box and send once it is. */
    send(text) {
      if (isReady()) return void submit(text, false);
      waiting = text;
      input.value = text;
    },
    destroy() {
      mentionAsk++;
      clearTimeout(hintTimer);
      stopListening();
      window.removeEventListener("message", fromEditor);
      window.removeEventListener(ASSISTANTS_CHANGED, settingsFound);
      clearInterval(watchPointing);
      studyBar.destroy();
      editActions.destroy();
      shortsCard.destroy();
      delete document.body.dataset.agent;
      delete document.body.dataset.access;
      delete document.body.dataset.mode;
      delete document.body.dataset.pointing;
    },
  };
}
