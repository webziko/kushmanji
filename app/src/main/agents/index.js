import fs from "node:fs";
import path from "node:path";
import { cliVersion } from "../cli.js";
import { readJson, writeJson } from "../jsonFile.js";
import { say } from "../say.js";
import { readState, updateState } from "../state.js";
import { accessFor, accessNote, LEVELS, withAccess } from "./access.js";
import { knownLanguage, languageNote } from "./language.js";
import { openSetupWindow, setupScript, STEPS } from "./setup.js";
import * as antigravity from "./antigravity.js";
import { CHECK_REQUEST, judge, makeScratch, testedOk } from "./checkup.js";
import * as claude from "./claude.js";
import * as codex from "./codex.js";
import { filesChangedSince, handoverNote, recapNote, recordTurn } from "./journal.js";
import { usageLimit } from "./limits.js";
import { plainProblem } from "./problems.js";
import { AUTO, sizeModel } from "./sizing.js";
import { isNewer } from "./versions.js";
import { DEFAULT_MODE, knownMode, modeNote, MODES, readPlan, strayFiles } from "./working.js";

// Every agent the app can drive, by the id stored with a chat. Adding one is a module with `about`, `status()`,
// `models()` and `run()` (the contract in docs/ARCHITECTURE.md) and a line here. Nothing else in the app changes.
const BRIDGES = { claude, codex, antigravity };
const DEFAULT_ENGINE = "claude";
const MAX_MESSAGES = 200;
// Longer than any real request; it stops a runaway paste from becoming a runaway bill.
const MAX_REQUEST = 20_000;
// After this many requests in one conversation an assistant starts a fresh one with a recap (M15-04).
const FRESH_AFTER = 6;
// One review by a different assistant, then one round of fixes (M13-04). The page names the purpose; what the
// reviewer is told about it comes from here.
const PURPOSES = new Set(["review", "fix"]);
const REVIEW_NOTE =
  "This request is a review of another assistant's work. Look, do not change: do not edit, create, move or delete " +
  "any file. Read the files it changed and, if you can, look at still frames of the moments it changed. Then reply " +
  "with a short numbered list of the real problems, most important first, each with where it is (a time or a " +
  "file). If it looks right, say so in one line. Your list goes back to the assistant that did the work.";

const NAMES = Object.fromEntries(Object.entries(BRIDGES).map(([id, bridge]) => [id, bridge.about.name]));

// What the chat panel shows lives in the project's own `.hyperframes/` folder, which Studio's server never
// serves. Our file has its own name, so it cannot collide with records the official app or the CLI keep there.
// (The record the agents share with each other is a different file: see journal.js.)
const chatFile = (dir) => path.join(dir, ".hyperframes", "studio-win-chat.json");

const knownEngine = (id) => (Object.hasOwn(BRIDGES, id) ? id : null);
/**
 * The assistants the person has (M15-01, "Your team"): someone with one subscription gets a complete app that
 * never offers the others. Nothing chosen yet means all of them.
 */
function teamOf(state) {
  const chosen = Array.isArray(state?.team) ? state.team.filter((id) => knownEngine(id)) : [];
  return chosen.length ? chosen : Object.keys(BRIDGES);
}

/** The person's model choice for an agent. Nothing chosen yet means "Auto"; null means the agent's own default. */
const chosenModel = (models, engine) => (models && Object.hasOwn(models, engine) ? models[engine] : AUTO);

/** A new project starts with the agent the person last chose anywhere. */
const emptyChat = () => ({
  engine: knownEngine(readState().agent) ?? DEFAULT_ENGINE,
  sessions: {},
  // How many requests each assistant's current conversation has had: a long one starts afresh (M15-04).
  turns: {},
  // How involved the person wants to be in this project: see working.js.
  mode: DEFAULT_MODE,
  // What each agent's conversation was last told about its access and the way of working, so a change is said
  // once, not every turn.
  told: {},
  messages: [],
});

function readChat(dir) {
  const chat = readJson(chatFile(dir), null);
  if (!chat || !Array.isArray(chat.messages)) return emptyChat();
  const engine = knownEngine(chat.engine) ?? DEFAULT_ENGINE;
  // Each agent keeps its own conversation. Chats saved before there was a choice had one `sessionId`.
  const sessions = chat.sessions ?? (chat.sessionId ? { [engine]: chat.sessionId } : {});
  const turns = chat.turns && typeof chat.turns === "object" ? chat.turns : {};
  return {
    engine, sessions, turns, mode: knownMode(chat.mode) ?? DEFAULT_MODE, told: chat.told ?? {}, messages: chat.messages,
  };
}

// Trimmed in place, so a place counted from the chat in memory is the same place on disk.
function writeChat(dir, chat) {
  if (chat.messages.length > MAX_MESSAGES) chat.messages.splice(0, chat.messages.length - MAX_MESSAGES);
  writeJson(chatFile(dir), chat);
}

// The reply that made history entry `id`. Places move once the chat is long enough to be trimmed, so the place the
// page knows is only a first guess.
function replyFor(messages, index, id) {
  if (!id) return index;
  if (messages[index]?.undo?.id === id) return index;
  return messages.findLastIndex((message) => message?.role === "agent" && message.undo?.id === id);
}

/** Runs chat turns, one at a time, and keeps each project's conversation on disk. */
export class AgentRunner {
  #active = null;
  #undoing = null;
  #emit;
  #prepare;
  #history;
  #check;

  /**
   * `emit({ dir, event })` forwards an agent event to the window. `prepare(dir, onStep)`, when given, runs
   * before each turn's agent starts: whatever the project needs first (the footage study). It reports what it
   * is doing through `onStep(label, detail)`, and its failure never stops the chat. `history`, when given, is
   * `{ begin, end, undo }` (turnHistory.js): each turn becomes one entry the person can undo (M2-10). `check(dir)`,
   * when given, looks the project over after a turn that changed it (turnCheck.js, M10-03).
   */
  constructor({ emit, prepare, history, check }) {
    this.#emit = emit;
    this.#prepare = prepare;
    this.#history = history;
    this.#check = check;
  }

  get busy() {
    return this.#active !== null || this.#undoing !== null;
  }

  /**
   * Every agent with its name, state, models, and the commands that fix a missing install or sign-in.
   * `untested` is true when the installed version is newer than the one this app was run against.
   */
  async status() {
    const chosen = readState().models ?? {};
    const team = teamOf(readState());
    return Promise.all(
      Object.entries(BRIDGES).map(async ([id, bridge]) => {
        const state = await bridge.status().catch((error) => ({ state: "broken", detail: error.message }));
        const models = state.state === "ready" ? await bridge.models().catch(() => []) : [];
        return {
          id,
          ...bridge.about,
          ...state,
          // Newer than the version this app was tried with, and not yet tested here (checkup.js).
          untested: isNewer(state.version, bridge.about.tested) && !testedOk(readState().checkups, id, state.version),
          checkup: readState().checkups?.[id] ?? null,
          inTeam: team.includes(id),
          models,
          // Nothing chosen yet means "Auto" (sizing.js). A model the agent no longer offers falls back to the
          // agent's own default.
          model: chosenModel(chosen, id) === AUTO ? AUTO : models.some((model) => model.id === chosen[id]) ? chosen[id] : null,
        };
      }),
    );
  }

  /**
   * "Open PowerShell for me" (M10-27): a window running the assistant's own install or sign-in commands. The id
   * and step are checked against this app's own lists; the commands come from the bridge, never from the page.
   */
  openSetup(engine, step) {
    const bridge = Object.hasOwn(BRIDGES, engine) ? BRIDGES[engine] : null;
    if (!bridge) throw new Error("That assistant is not known to this app.");
    const script = STEPS.includes(step) ? setupScript(bridge.about, step) : null;
    if (!script) throw new Error("That choice is not known to this app.");
    openSetupWindow(script);
    return true;
  }

  history(dir) {
    const chat = readChat(dir);
    return {
      messages: chat.messages,
      engine: chat.engine,
      running: this.#active?.dir === dir,
      // Names only, so the chat can draw at once. `status()` starts each tool and takes seconds.
      // `label` is the plain name the person reads ("ChatGPT"), `product` the maker's own ("Codex"): docs/UX.md.
      agents: Object.entries(BRIDGES).map(([id, { about }]) => ({
        id, name: about.name, label: about.label ?? about.name, product: about.product ?? about.name,
        inTeam: teamOf(readState()).includes(id),
      })),
      access: accessFor(readState().access, dir),
      accessLevels: LEVELS,
      mode: chat.mode,
      modes: MODES,
    };
  }

  /** How involved the person wants to be in this project. It applies from the next message. */
  chooseMode(dir, mode) {
    if (!knownMode(mode)) throw new Error("That choice is not known to this app.");
    writeChat(dir, { ...readChat(dir), mode });
  }

  /** How much the agents may do in this project. It applies from the next message. */
  chooseAccess(dir, level) {
    updateState({ access: withAccess(readState().access, dir, level) });
  }

  /** Which assistants the person has. At least one: the chat needs someone to talk to. */
  setTeam(engines) {
    const team = [...new Set((Array.isArray(engines) ? engines : []).map(String))];
    if (!team.length) throw new Error(say("Keep at least one assistant ticked."));
    if (!team.every((id) => knownEngine(id))) throw new Error("That assistant is not known to this app.");
    updateState({ team });
  }

  /** Switch this project's chat to another agent. It applies from the next message. */
  choose(dir, engine) {
    if (!knownEngine(engine)) throw new Error("That assistant is not known to this app.");
    if (!teamOf(readState()).includes(engine)) {
      throw new Error(say("Tick that assistant under \"Your assistants\" first."));
    }
    writeChat(dir, { ...readChat(dir), engine });
    updateState({ agent: engine });
    void this.prewarm(dir);
  }

  /**
   * Start this video's assistant before the person sends anything, when its bridge can (Gemini: its start-up is
   * about 12 s, antigravity.js). The next message's conversation, model and access are guessed the way `send`
   * chooses them, with the model for a small change under Auto, as most chat messages are. A wrong guess costs
   * only the early start: `send` then starts its own.
   */
  async prewarm(dir) {
    try {
      const chat = readChat(dir);
      const { engine } = chat;
      const bridge = BRIDGES[engine];
      if (!bridge?.prewarm || this.#active || !teamOf(readState()).includes(engine)) return;
      const resumed = (chat.turns?.[engine] ?? 0) < FRESH_AFTER ? chat.sessions[engine] ?? null : null;
      let model = chosenModel(readState().models, engine);
      if (model === AUTO) {
        const offered = await bridge.models().catch(() => []);
        model = sizeModel({ engine, models: offered, text: "Change one word.", mode: chat.mode }).model;
      }
      if (this.#active) return;
      bridge.prewarm({ dir, model, access: accessFor(readState().access, dir), sessionId: resumed });
    } catch {
      // Starting early is only a head start; the message itself still starts the assistant.
    }
  }

  /** Close the assistants kept running for the open video: it closed, or the app quits. */
  release({ sync = false } = {}) {
    for (const bridge of Object.values(BRIDGES)) bridge.closeAll?.({ sync });
  }

  /** Pick the model an agent uses, everywhere. `model` null means the agent's own default, AUTO the app's choice. */
  async chooseModel(engine, model) {
    if (!knownEngine(engine)) throw new Error("That assistant is not known to this app.");
    // Only an id the agent itself lists is accepted: the value ends up on that agent's command line.
    if (model !== null && model !== AUTO && !(await BRIDGES[engine].models()).some((offered) => offered.id === model)) {
      throw new Error("That choice is not offered by this assistant.");
    }
    updateState({ models: { ...readState().models, [engine]: model } });
  }

  /** Start over: every agent forgets its conversation and the chat is cleared. Project files, and the shared
   *  record of what was done to them, are untouched. */
  reset(dir) {
    if (this.#active?.dir === dir) this.stop();
    for (const bridge of Object.values(BRIDGES)) bridge.forget?.(dir);
    const { engine, mode } = readChat(dir);
    writeChat(dir, { ...emptyChat(), engine, mode });
  }

  /**
   * "Test this assistant" (M12-03): one small real job in a scratch folder, change a file and run a program. It uses
   * a little of the assistant's allowance, so the page asks first. The answer is kept for the installed version.
   */
  async checkup(engine) {
    if (!knownEngine(engine)) throw new Error("That assistant is not known to this app.");
    if (this.#active || this.#undoing) {
      throw new Error(say("An assistant is still working. Test this one when it has finished."));
    }
    // Claimed before the first wait, so a message sent meanwhile is refused and Stop reaches the test.
    const turn = { dir: null, checkup: true, stopped: false, handle: { stop() { turn.stopped = true; } } };
    this.#active = turn;
    const bridge = BRIDGES[engine];
    const name = bridge.about.label ?? NAMES[engine];
    let dir = null;
    let state;
    let result;
    try {
      state = await bridge.status().catch(() => ({ state: "broken" }));
      if (state.state !== "ready") {
        return { ok: false, said: say("{name} can be tested once it is installed and signed in.", { name }) };
      }
      let model = chosenModel(readState().models, engine);
      if (model === AUTO) {
        model = sizeModel({ engine, models: await bridge.models().catch(() => []), text: "Change one word." }).model;
      }
      if (turn.stopped) return { ok: false, said: say("The test of {name} was stopped.", { name }) };
      dir = makeScratch(cliVersion);
      turn.dir = dir;
      let text = "";
      const activities = [];
      const done = await new Promise((resolve) => {
        turn.handle = bridge.run({ dir, text: CHECK_REQUEST, sessionId: null, model, access: "project",
          onEvent: (event) => {
            if (event.type === "activity") activities.push(event.label);
            else if (event.type === "text") text += event.text;
            else if (event.type === "done") resolve(event);
          } });
      });
      let changedFile = false;
      try {
        changedFile = /\bAFTER\b/.test(fs.readFileSync(path.join(dir, "check.txt"), "utf8"));
      } catch { /* the file is gone: not changed as asked */ }
      result = judge(name, { ...done, limited: Boolean(usageLimit({ error: done.error, text, ok: done.ok })), changedFile,
        ranCommand: activities.includes("Running a program") });
    } finally {
      if (this.#active === turn) this.#active = null;
      // The assistant says it is done a moment before it exits, and Windows will not remove a folder a running
      // program is working in: retried for a while, in the background, and never a reason to lose the answer.
      if (dir) fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }, () => {});
    }
    updateState({ checkups: { ...readState().checkups,
      [engine]: { version: state.version ?? null, ok: result.ok, said: result.said, at: new Date().toISOString() } } });
    return { ...result, version: state.version ?? null };
  }

  /**
   * Undo what one assistant turn changed (M2-10), or bring it back when it was undone. `index` is the reply's place
   * in the chat and `id` the change it made, which finds the reply when older messages were trimmed. The files go
   * back as they were; the change is recorded so the next assistant knows.
   */
  async undo(dir, index, id = null) {
    if (!this.#history) throw new Error("Undo is not available in this version of the app.");
    if (this.#active?.dir === dir) {
      throw new Error(say("The assistant is still working. Undo when it has finished."));
    }
    if (this.#undoing) throw new Error(say("A change is still being undone. Try again in a moment."));
    this.#undoing = dir;
    try {
      return await this.#undo(dir, index, id);
    } finally {
      this.#undoing = null;
    }
  }

  async #undo(dir, index, id) {
    const before = readChat(dir).messages;
    index = replyFor(before, index, id);
    const message = before[index];
    if (message?.role !== "agent" || !message.undo?.id) throw new Error(say("That change cannot be undone."));
    const back = Boolean(message.undo.undoneBy);
    const done = await this.#history.undo(dir, back ? message.undo.undoneBy : message.undo.id);
    const chat = readChat(dir);
    const saved = chat.messages[replyFor(chat.messages, index, message.undo.id)];
    if (saved?.undo?.id !== message.undo.id) {
      throw new Error(say("The chat changed while undoing. Your files were put back."));
    }
    saved.undo = back ? { id: saved.undo.id, files: saved.undo.files } : { ...saved.undo, undoneBy: done.id };
    writeChat(dir, chat);
    const files = saved.undo.files.slice(0, 8).join(", ");
    recordTurn(dir, {
      engine: "person",
      asked: back ? "Bring back a change" : "Undo a change",
      did: `${back ? "Brought back" : "Undid"} what ${NAMES[saved.engine] ?? "an assistant"} changed: ${files}`,
      startedAt: Date.now(),
    });
    return saved.undo;
  }

  /**
   * Start one chat turn. `pointing`, when the person has something selected in Studio, is
   * `{ name, kind, when, note }`: what the chat shows beside their message, and what the agent is told.
   * `moment` is the main process's `{ seconds, when, note }` snapshot from the watching screen at Send.
   */
  send({ dir, text, pointing = null, moment = null, purpose = null, language = "en" }) {
    if (this.#active) {
      throw new Error(say("The assistant is still working. Press Stop, or wait for it to finish."));
    }
    if (this.#undoing) throw new Error(say("A change is still being undone. Send again in a moment."));
    if (purpose !== null && !PURPOSES.has(purpose)) throw new Error("That kind of request is not known to this app.");
    const message = String(text ?? "").trim();
    if (!message) throw new Error(say("Type what you want to change first."));
    if (message.length > MAX_REQUEST) {
      throw new Error(say("That message is too long. Shorten it and send again."));
    }

    const chat = readChat(dir);
    const { engine } = chat;
    if (!teamOf(readState()).includes(engine)) throw new Error(say("Choose one of your assistants first."));
    // Every request in a resumed conversation sends all of it again, so a long one spends the person's allowance
    // on old words. After a few requests the assistant starts afresh, with a recap from the shared record (M15-04).
    const sofar = chat.turns?.[engine] ?? 0;
    const fresh = Boolean(chat.sessions[engine]) && sofar >= FRESH_AFTER;
    if (fresh) {
      delete chat.sessions[engine];
      delete chat.told[engine];
    }
    // Counted from one whenever a conversation begins, a lost one included (#finish forgets it).
    chat.turns = { ...chat.turns, [engine]: chat.sessions[engine] ? sofar + 1 : 1 };
    // Read from the app's own settings here, never taken from the page or from the project folder.
    const access = accessFor(readState().access, dir);
    // The agent hears its limits and the way of working at the start of a conversation, and again whenever the
    // person changes either.
    // The person's language goes with them (M14-17): the names the assistant quotes must be the ones on screen.
    const { mode } = chat;
    const shown = knownLanguage(language);
    const terms = `${access}/${mode}/${shown}`;
    const told = chat.sessions[engine] && chat.told[engine] === terms;
    const limits = told ? "" : [accessNote(access), modeNote(mode), languageNote(shown)].filter(Boolean).join("\n\n");
    chat.told = { ...chat.told, [engine]: terms };
    const pointed = pointing ? { name: pointing.name, kind: pointing.kind, when: pointing.when } : null;
    const watched = moment ? { seconds: moment.seconds, when: moment.when } : null;
    chat.messages.push({ role: "user", text: message, ...(pointed ? { pointing: pointed } : {}),
      ...(watched ? { moment: watched } : {}), ...(purpose ? { purpose } : {}), at: Date.now() });
    writeChat(dir, chat);

    // What other agents did since this one last worked here, so it does not act on a stale picture.
    const names = { ...NAMES, person: "The person, by hand" };
    const handover = fresh ? recapNote(dir, names) : handoverNote(dir, engine, names);
    const preface = [handover, limits, purpose === "review" ? REVIEW_NOTE : "", pointing?.note, moment?.note]
      .filter(Boolean).join("\n\n");
    const turn = {
      dir,
      engine,
      asked: watched ? `At ${watched.when} (${watched.seconds}s into the video): ${message}` : message,
      mode,
      purpose,
      startedAt: Date.now(),
      text: "",
      activities: [],
      resumed: chat.sessions[engine] ?? null,
      sawSession: false,
      handle: null,
    };
    this.#active = turn;
    if (fresh) {
      this.#onEvent(turn, { type: "activity", label: say("A fresh conversation, to save your allowance") });
    }
    const begin = async () => {
      let model = chosenModel(readState().models, engine);
      if (model === AUTO) {
        const offered = await BRIDGES[engine].models().catch(() => []);
        const sized = sizeModel({ engine, models: offered, text: message, mode, pointing: Boolean(pointing) });
        model = sized.model;
        if (sized.small) {
          const name = offered.find((item) => item.id === model)?.name ?? model;
          this.#onEvent(turn, { type: "activity", label: say("{name} for a small change", { name }) });
        }
      }
      if (turn.stopped) return this.#onEvent(turn, { type: "done", ok: false, stopped: true });
      // Everything the assistant writes from here becomes one entry in HyperFrames' history, so it can be undone.
      if (this.#history) {
        const who = BRIDGES[engine].about.label ?? NAMES[engine];
        turn.historyOpen = Boolean(await this.#history.begin(dir, who).catch(() => null));
        if (turn.stopped) return this.#onEvent(turn, { type: "done", ok: false, stopped: true });
      }
      turn.handle = BRIDGES[engine].run({
        dir,
        text: preface ? `${preface}\n\nThe person's request now:\n${message}` : message,
        sessionId: turn.resumed,
        model,
        access,
        onEvent: (event) => this.#onEvent(turn, event),
      });
    };
    // A bridge that throws instead of reporting must not leave the chat busy for good.
    const start = () => begin().catch((error) => this.#onEvent(turn, { type: "done", ok: false,
      error: error?.message ?? String(error) }));
    // Stop works from the first moment, even while the model is being chosen or the footage studied.
    const waiting = { stop() { turn.stopped = true; } };
    if (!this.#prepare) {
      turn.handle = waiting;
      return void start();
    }
    // Stop must work while the preparation is still going: it ends the wait, and the preparation carries on
    // behind the scenes for the next message.
    const halted = new Promise((resolve) => {
      turn.handle = {
        stop() {
          turn.stopped = true;
          resolve();
        },
      };
    });
    const step = (label, detail) => this.#onEvent(turn, { type: "activity", label, detail });
    void Promise.race([Promise.resolve().then(() => this.#prepare(dir, step)), halted])
      .catch(() => {})
      .then(start);
  }

  #onEvent(turn, event) {
    if (event.type === "session") {
      turn.sawSession = true;
      const chat = readChat(turn.dir);
      writeChat(turn.dir, { ...chat, sessions: { ...chat.sessions, [turn.engine]: event.id } });
    } else if (event.type === "text") {
      turn.text += event.text;
    } else if (event.type === "activity") {
      // Each kind of step once, in the order first seen: a long run alternates between two of them all day.
      if (!turn.activities.includes(event.label)) turn.activities.push(event.label);
    } else if (event.type === "done") {
      if (turn.ending) return;
      turn.ending = true;
      // The assistant has finished; Stop while its history entry closes must not reach a process id that is gone
      // and may already be another program's.
      turn.handle = { stop() {} };
      // The turn stays the active one until its history entry is closed, or the next turn's would swallow it.
      if (turn.historyOpen) {
        void this.#history.end(turn.dir).catch(() => null).then((entry) => this.#finish(turn, event, entry));
        return;
      }
      return this.#finish(turn, event, null);
    }
    this.#emit({ dir: turn.dir, event });
  }

  /** The end of a turn: saved, recorded for the other assistants, and sent to the page. */
  #finish(turn, event, entry) {
    if (this.#active === turn) this.#active = null;
    const chat = readChat(turn.dir);
    // A resumed conversation the agent no longer has (cleared, or made on another machine) fails before it
    // starts. Forget its id so the next message begins a new one instead of failing the same way forever.
    if (!event.ok && !event.stopped && turn.resumed && !turn.sawSession) {
      delete chat.sessions[turn.engine];
      delete chat.told[turn.engine];
    }
    // Stopped by its plan's usage limit part-way through (M17-06): the page says so plainly, names the files it
    // had already changed, and offers another assistant. Some assistants end such a turn "ok".
    const limit = event.stopped ? null : usageLimit({ error: event.error, text: turn.text, ok: event.ok });
    if (limit) {
      event = { ...event, ok: false, limited: true, resets: limit.resets,
        changed: filesChangedSince(turn.dir, turn.startedAt).slice(0, 50) };
    }
    // Signed out or offline part-way through (M2-12): one plain sentence instead of the assistant's own lines.
    const problem = !event.ok && !event.stopped && !limit ? plainProblem(event, {
      name: BRIDGES[turn.engine].about.label ?? NAMES[turn.engine],
      signIn: BRIDGES[turn.engine].about.signIn?.[0] ?? "",
    }) : null;
    if (problem) event = { ...event, error: problem.said, problem: problem.kind };
    // A reply that ends with the mark is a plan waiting for a yes. The page gets the reply without the mark,
    // and the names of any files the agent changed that are not the plan: it was told to change none.
    const read = turn.mode === "build" || turn.purpose || !event.ok
      ? { text: turn.text, plan: false } : readPlan(turn.text);
    // A reviewer was told to change nothing; whatever it changed anyway is named to the person.
    if (turn.purpose === "review") event = { ...event, touched: filesChangedSince(turn.dir, turn.startedAt) };
    if (read.plan) {
      turn.text = read.text;
      event = { ...event, plan: true, text: read.text, touched: strayFiles(filesChangedSince(turn.dir, turn.startedAt)) };
    }
    chat.messages.push({
      role: "agent",
      engine: turn.engine,
      text: turn.text,
      activities: turn.activities,
      ok: event.ok,
      stopped: Boolean(event.stopped),
      error: event.error ?? null,
      ...(read.plan ? { plan: true, touched: event.touched } : {}),
      ...(turn.purpose ? { purpose: turn.purpose, ...(event.touched?.length ? { touched: event.touched } : {}) } : {}),
      ...(limit ? { limited: true, resets: limit.resets, changed: event.changed } : {}),
      // How much of the assistant's allowance the reply used, when it said (usage.js, M15-05).
      ...(event.usage ? { usage: event.usage } : {}),
      // Only a turn that changed something can be undone.
      ...(entry?.files.length ? { undo: { id: entry.id, files: entry.files.slice(0, 200) } } : {}),
      at: Date.now(),
    });
    writeChat(turn.dir, chat);
    const index = chat.messages.length - 1;
    // `engine` names who answered, for the problem report (log.js); the page does not need it.
    event = { ...event, index, undo: chat.messages[index].undo ?? null, engine: turn.engine };
    if (this.#check && (entry?.files.length || filesChangedSince(turn.dir, turn.startedAt).length)) {
      this.#checkReply(turn.dir, index);
    }
    // A stopped or failed turn is recorded too: it may have changed files before it ended.
    const outcome = event.ok ? "" : event.stopped ? " (stopped before finishing)" : limit
      ? " (stopped by its usage limit before finishing; its work is unchecked)"
      : ` (failed: ${event.error ?? "unknown"})`;
    recordTurn(turn.dir, {
      engine: turn.engine,
      asked: turn.asked,
      did: `${turn.text.trim()}${outcome}`.trim(),
      startedAt: turn.startedAt,
    });
    this.#emit({ dir: turn.dir, event });
  }

  /** Look the project over after a reply that changed it, and add what was found to that reply. */
  #checkReply(dir, index) {
    const at = readChat(dir).messages[index]?.at;
    void Promise.resolve().then(() => this.#check(dir)).catch(() => null).then((checked) => {
      if (!checked) return;
      const chat = readChat(dir);
      // Found by its time: a reply that came in meanwhile may have trimmed the oldest message.
      const reply = chat.messages.findLast((message) => message?.role === "agent" && message.at === at);
      if (!reply) return;
      reply.checked = checked;
      writeChat(dir, chat);
      this.#emit({ dir, event: { type: "checked", index, checked } });
    });
  }

  stop({ sync = false } = {}) {
    this.#active?.handle?.stop({ sync });
  }
}
