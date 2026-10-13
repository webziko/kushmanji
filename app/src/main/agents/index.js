import path from "node:path";
import { readJson, writeJson } from "../jsonFile.js";
import { readState, updateState } from "../state.js";
import { accessFor, accessNote, LEVELS, withAccess } from "./access.js";
import * as antigravity from "./antigravity.js";
import * as claude from "./claude.js";
import * as codex from "./codex.js";
import { filesChangedSince, handoverNote, recordTurn } from "./journal.js";
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

  /**
   * `emit({ dir, event })` forwards an agent event to the window. `prepare(dir, onStep)`, when given, runs
   * before each turn's agent starts: whatever the project needs first (the footage study). It reports what it
   * is doing through `onStep(label, detail)`, and its failure never stops the chat.
   */
  constructor({ emit, prepare }) {
    this.#emit = emit;
    this.#prepare = prepare;
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
    return Promise.all(
      Object.entries(BRIDGES).map(async ([id, bridge]) => {
        const state = await bridge.status().catch((error) => ({ state: "broken", detail: error.message }));
        const models = state.state === "ready" ? await bridge.models().catch(() => []) : [];
        return {
          id,
          ...bridge.about,
          ...state,
          untested: isNewer(state.version, bridge.about.tested),
          models,
          // A model the agent no longer offers falls back to the agent's own default.
          model: models.some((model) => model.id === chosen[id]) ? chosen[id] : null,
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
      agents: Object.entries(NAMES).map(([id, name]) => ({ id, name })),
      access: accessFor(readState().access, dir),
      accessLevels: LEVELS,
      mode: chat.mode,
      modes: MODES,
    };
  }

  /** How involved the person wants to be in this project. It applies from the next message. */
  chooseMode(dir, mode) {
    if (!knownMode(mode)) throw new Error("That way of working is not known to this app.");
    writeChat(dir, { ...readChat(dir), mode });
  }

  /** How much the agents may do in this project. It applies from the next message. */
  chooseAccess(dir, level) {
    updateState({ access: withAccess(readState().access, dir, level) });
  }

  /** Switch this project's chat to another agent. It applies from the next message. */
  choose(dir, engine) {
    if (!knownEngine(engine)) throw new Error("That agent is not known to this app.");
    writeChat(dir, { ...readChat(dir), engine });
    updateState({ agent: engine });
  }

  /** Pick the model an agent uses, everywhere. `model` null means the agent's own default. */
  async chooseModel(engine, model) {
    if (!knownEngine(engine)) throw new Error("That agent is not known to this app.");
    // Only an id the agent itself lists is accepted: the value ends up on that agent's command line.
    if (model !== null && !(await BRIDGES[engine].models()).some((offered) => offered.id === model)) {
      throw new Error("That model is not offered by this agent.");
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
   * Start one chat turn. `pointing`, when the person has something selected in Studio, is
   * `{ name, kind, when, note }`: what the chat shows beside their message, and what the agent is told.
   * `moment` is the main process's `{ seconds, when, note }` snapshot from the watching screen at Send.
   */
  send({ dir, text, pointing = null, moment = null }) {
    if (this.#active) throw new Error("The agent is still working. Stop it, or wait for it to finish.");
    const message = String(text ?? "").trim();
    if (!message) throw new Error("Type what you want to change first.");
    if (message.length > MAX_REQUEST) throw new Error("That message is too long. Shorten it and send again.");

    const chat = readChat(dir);
    const { engine } = chat;
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
    const handover = handoverNote(dir, engine, NAMES);
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
    const start = () => {
      if (turn.stopped) return this.#onEvent(turn, { type: "done", ok: false, stopped: true });
      turn.handle = BRIDGES[engine].run({
        dir,
        text: preface ? `${preface}\n\nThe person's request now:\n${message}` : message,
        sessionId: turn.resumed,
        model: readState().models?.[engine] ?? null,
        access,
        onEvent: (event) => this.#onEvent(turn, event),
      });
    };
    if (!this.#prepare) return start();
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
      if (this.#active === turn) this.#active = null;
      const chat = readChat(turn.dir);
      // A resumed conversation the agent no longer has (cleared, or made on another machine) fails before it
      // starts. Forget its id so the next message begins a new one instead of failing the same way forever.
      if (!event.ok && !event.stopped && turn.resumed && !turn.sawSession) {
        delete chat.sessions[turn.engine];
        delete chat.told[turn.engine];
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
        at: Date.now(),
      });
      writeChat(turn.dir, chat);
      // A stopped or failed turn is recorded too: it may have changed files before it ended.
      const outcome = event.ok ? "" : event.stopped ? " (stopped before finishing)" : ` (failed: ${event.error ?? "unknown"})`;
      recordTurn(turn.dir, {
        engine: turn.engine,
        asked: turn.asked,
        did: `${turn.text.trim()}${outcome}`.trim(),
        startedAt: turn.startedAt,
      });
    }
    this.#emit({ dir: turn.dir, event });
  }

  stop({ sync = false } = {}) {
    this.#active?.handle?.stop({ sync });
  }
}
