import path from "node:path";
import { readJson, writeJson } from "../jsonFile.js";
import { readState, updateState } from "../state.js";
import { accessFor, accessNote, LEVELS, withAccess } from "./access.js";
import * as antigravity from "./antigravity.js";
import * as claude from "./claude.js";
import * as codex from "./codex.js";
import { filesChangedSince, handoverNote, recordTurn } from "./journal.js";
import { usageLimit } from "./limits.js";
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
  return { engine, sessions, mode: knownMode(chat.mode) ?? DEFAULT_MODE, told: chat.told ?? {}, messages: chat.messages };
}

function writeChat(dir, chat) {
  writeJson(chatFile(dir), { ...chat, messages: chat.messages.slice(-MAX_MESSAGES) });
}

/** Runs chat turns, one at a time, and keeps each project's conversation on disk. */
export class AgentRunner {
  #active = null;
  #emit;
  #prepare;
  #history;

  /**
   * `emit({ dir, event })` forwards an agent event to the window. `prepare(dir, onStep)`, when given, runs
   * before each turn's agent starts: whatever the project needs first (the footage study). It reports what it
   * is doing through `onStep(label, detail)`, and its failure never stops the chat. `history`, when given, is
   * `{ begin, end, undo }` (turnHistory.js): each turn becomes one entry the person can undo (M2-10).
   */
  constructor({ emit, prepare, history }) {
    this.#emit = emit;
    this.#prepare = prepare;
    this.#history = history;
  }

  get busy() {
    return this.#active !== null;
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
          untested: isNewer(state.version, bridge.about.tested),
          inTeam: team.includes(id),
          models,
          // Nothing chosen yet means "Auto" (sizing.js). A model the agent no longer offers falls back to the
          // agent's own default.
          model: chosenModel(chosen, id) === AUTO ? AUTO : models.some((model) => model.id === chosen[id]) ? chosen[id] : null,
        };
      }),
    );
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
    if (!team.length) throw new Error("Keep at least one assistant ticked.");
    if (!team.every((id) => knownEngine(id))) throw new Error("That assistant is not known to this app.");
    updateState({ team });
  }

  /** Switch this project's chat to another agent. It applies from the next message. */
  choose(dir, engine) {
    if (!knownEngine(engine)) throw new Error("That assistant is not known to this app.");
    if (!teamOf(readState()).includes(engine)) throw new Error("Tick that assistant under \"Your assistants\" first.");
    writeChat(dir, { ...readChat(dir), engine });
    updateState({ agent: engine });
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
    const { engine, mode } = readChat(dir);
    writeChat(dir, { ...emptyChat(), engine, mode });
  }

  /**
   * Undo what one assistant turn changed (M2-10), or bring it back when it was undone. `index` is the reply's place
   * in the chat. The files go back as they were; the change is recorded so the next assistant knows.
   */
  async undo(dir, index) {
    if (!this.#history) throw new Error("Undo is not available in this version of the app.");
    if (this.#active?.dir === dir) throw new Error("The assistant is still working. Undo when it has finished.");
    const message = readChat(dir).messages[index];
    if (message?.role !== "agent" || !message.undo?.id) throw new Error("That change cannot be undone.");
    const back = Boolean(message.undo.undoneBy);
    const done = await this.#history.undo(dir, back ? message.undo.undoneBy : message.undo.id);
    const chat = readChat(dir);
    const saved = chat.messages[index];
    if (saved?.undo?.id !== message.undo.id) throw new Error("The chat changed while undoing. Your files were put back.");
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
  send({ dir, text, pointing = null, moment = null }) {
    if (this.#active) throw new Error("The assistant is still working. Press Stop, or wait for it to finish.");
    const message = String(text ?? "").trim();
    if (!message) throw new Error("Type what you want to change first.");
    if (message.length > MAX_REQUEST) throw new Error("That message is too long. Shorten it and send again.");

    const chat = readChat(dir);
    const { engine } = chat;
    if (!teamOf(readState()).includes(engine)) throw new Error("Choose one of your assistants first.");
    // Read from the app's own settings here, never taken from the page or from the project folder.
    const access = accessFor(readState().access, dir);
    // The agent hears its limits and the way of working at the start of a conversation, and again whenever the
    // person changes either.
    const { mode } = chat;
    const terms = `${access}/${mode}`;
    const told = chat.sessions[engine] && chat.told[engine] === terms;
    const limits = told ? "" : [accessNote(access), modeNote(mode)].join("\n\n");
    chat.told = { ...chat.told, [engine]: terms };
    const pointed = pointing ? { name: pointing.name, kind: pointing.kind, when: pointing.when } : null;
    const watched = moment ? { seconds: moment.seconds, when: moment.when } : null;
    chat.messages.push({ role: "user", text: message, ...(pointed ? { pointing: pointed } : {}),
      ...(watched ? { moment: watched } : {}), at: Date.now() });
    writeChat(dir, chat);

    // What other agents did since this one last worked here, so it does not act on a stale picture.
    const handover = handoverNote(dir, engine, { ...NAMES, person: "The person, by hand" });
    const preface = [handover, limits, pointing?.note, moment?.note].filter(Boolean).join("\n\n");
    const turn = {
      dir,
      engine,
      asked: watched ? `At ${watched.when} (${watched.seconds}s into the video): ${message}` : message,
      mode,
      startedAt: Date.now(),
      text: "",
      activities: [],
      resumed: chat.sessions[engine] ?? null,
      sawSession: false,
      handle: null,
    };
    this.#active = turn;
    const start = async () => {
      let model = chosenModel(readState().models, engine);
      if (model === AUTO) {
        const offered = await BRIDGES[engine].models().catch(() => []);
        const sized = sizeModel({ engine, models: offered, text: message, mode, pointing: Boolean(pointing) });
        model = sized.model;
        if (sized.small) {
          const name = offered.find((item) => item.id === model)?.name ?? model;
          this.#onEvent(turn, { type: "activity", label: `${name} for a small change` });
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
    const limit = event.stopped ? null : usageLimit({ error: event.error, text: turn.text });
    if (limit) {
      event = { ...event, ok: false, limited: true, resets: limit.resets,
        changed: filesChangedSince(turn.dir, turn.startedAt).slice(0, 50) };
    }
    // A reply that ends with the mark is a plan waiting for a yes. The page gets the reply without the mark,
    // and the names of any files the agent changed that are not the plan: it was told to change none.
    const read = turn.mode === "build" || !event.ok ? { text: turn.text, plan: false } : readPlan(turn.text);
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
      ...(limit ? { limited: true, resets: limit.resets, changed: event.changed } : {}),
      // Only a turn that changed something can be undone.
      ...(entry?.files.length ? { undo: { id: entry.id, files: entry.files.slice(0, 200) } } : {}),
      at: Date.now(),
    });
    writeChat(turn.dir, chat);
    const index = chat.messages.length - 1;
    event = { ...event, index, undo: chat.messages[index].undo ?? null };
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

  stop({ sync = false } = {}) {
    this.#active?.handle?.stop({ sync });
  }
}
