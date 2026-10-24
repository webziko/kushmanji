// The second half of "Make shorts" (M17-04). shorts.js has made one video per short beside the source, each with
// the source's STYLE.md, the clips it needs and their study; here the assistant is asked to build them, one after
// the other, while the person keeps working. One at a time because the assistants run one turn at a time. Each
// short's reply lands in that short's own chat, where the person finds it when they open the short.
//
// Every short gets the same request, word for word: what differs is in its SHORT.md. The look is not described
// here at all, only "follow STYLE.md": the owner's three hand-made shorts came out a little different each time
// because each request described the look in its own words (M17-09).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./jsonFile.js";
import { say } from "./say.js";

const RECORD = [".hyperframes", "shorts-made.json"];
const planHash = (dir) => {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(path.join(dir, "SHORTS.md"))).digest("hex");
  } catch {
    return null;
  }
};

/**
 * When the shorts of this very plan were made, and where, or null. Kept in the source video's hidden folder so
 * that, after a restart, the chat does not offer to make the same shorts again (it would make second copies).
 */
export function madeRecord(dir) {
  const record = readJson(path.join(dir, ...RECORD), null);
  const hash = planHash(dir);
  if (!record || !hash || record.plan !== hash) return null;
  const dirs = Array.isArray(record.dirs) ? record.dirs.filter((made) => typeof made === "string") : [];
  return { at: record.at, dirs };
}

export function recordMade(dir, dirs) {
  writeJson(path.join(dir, ...RECORD), { plan: planHash(dir), at: Date.now(), dirs });
}

/** The request each short's assistant receives. Generic: the channel's own name card and colours are in STYLE.md. */
export const SHORT_REQUEST = [
  "Make this upright short. Read SHORT.md first: it says which pieces of which clips to use, in that order, with " +
    "what is said in each. Times are inside each clip's own file. The footage study (.hyperframes/study/index.json) " +
    "has each clip's still frames, words and pictureSeconds.",
  "Read STYLE.md and follow it exactly. Every short of this video is made from the same STYLE.md, so that they " +
    "look like one series: the same fonts, colours, titles, subtitles, name card and ending card. Do not change " +
    "STYLE.md and do not invent a look of your own.",
  "The rules for every short:",
  "- Upright, 1080 by 1920, 30 pictures a second. index.html is already that size; build in it.",
  "- Full screen. A wide clip fills the whole height and is cropped at the sides to keep the person speaking in " +
    "the picture: look at the clip's still frames in the study and place it so their whole face is inside the " +
    "frame for the part used. A slow, gentle push-in is welcome.",
  "- The first two seconds decide everything: the face, the words as a big caption, and the short's title (from " +
    "SHORT.md, four words or fewer) near the top. No logo first, no slow start.",
  "- Subtitles for every spoken line, from the words in SHORT.md and the study, in the language STYLE.md asks " +
    "for (English if it does not say), in STYLE.md's subtitle look, big enough for a phone (about 64 px, two " +
    "lines at most), in the lower middle under the face. Keep every word out of the top 220 px, the bottom " +
    "420 px and the right 140 px: the phone apps cover those with their own buttons.",
  "- Plain, quick cuts, with the sound faded for about a tenth of a second on each side so nothing clicks. Never " +
    "play a clip past its pictureSeconds. Something new every two to four seconds: a cut, a caption, a sticker.",
  "- The lips must match the words: never put the sound of one moment over the picture of another.",
  "- End with STYLE.md's ending card, about two seconds. Music only if STYLE.md names a music file, quiet under " +
    "the speech and clear on the ending card, faded out at the very end.",
  "- Never invent anything: no names, prices, times or places that are not in SHORT.md or the study. Do not " +
    "re-encode any media. Load scripts from the assets folder, not from the internet.",
  "Check once: look at the short at half a second, just after every cut and on the ending card. In each picture " +
    "the face must be whole and no words may sit in the covered edges. Fix what is wrong, once. Do not save or " +
    "render the video.",
  "Then tell me in plain words: how long it is, which part of which clip you used, and what you are unsure about.",
].join("\n");

/**
 * Builds the shorts one after the other. `send({ dir, text })` starts a chat turn (AgentRunner.send), `choose(dir,
 * engine)` picks the assistant for a short's chat, `emit({ dir, status })` tells the window. `agentEvent` must be
 * called with every event the assistants report, so the next short starts when the last one is done.
 */
export class ShortsMaker {
  #send;
  #choose;
  #emit;
  #job = null;
  /** The last finished run of each source video, so its chat can say what was made after the fact. */
  #last = new Map();

  constructor({ send, choose, emit = () => {} }) {
    this.#send = send;
    this.#choose = choose;
    this.#emit = emit;
  }

  status(dir) {
    if (this.#job?.dir === dir) return this.#public(this.#job);
    return this.#last.get(dir) ?? { state: "idle" };
  }

  /** Whether shorts are being made right now, from any video: the person's own requests must wait. */
  get busy() {
    return Boolean(this.#job);
  }

  /** `shorts`: `[{ dir, title }]`, already made on disk. `engine`: the assistant the source video's chat uses. */
  start(dir, shorts, { engine }) {
    if (this.#job) throw new Error("Shorts are already being made. Wait until they are done.");
    if (!shorts.length) throw new Error("There are no shorts to make.");
    this.#job = { dir, shorts, engine, index: -1, made: [], waiting: false, error: null };
    this.#next();
    return this.status(dir);
  }

  /** Stop after the short that is being built now. The person's Stop in a chat stops that short itself. */
  stop() {
    if (!this.#job) return;
    this.#end("stopped", say("Stopped. The shorts made so far are kept."));
  }

  agentEvent({ dir, event } = {}) {
    const job = this.#job;
    if (!job || event?.type !== "done") return;
    // The person's own request finished while a short was waiting for the assistant to be free.
    if (job.waiting) return void this.#next();
    const current = job.shorts[job.index];
    if (!current || dir !== current.dir) return;
    if (!event.ok) {
      // One whole sentence per reason, not one with a reason slotted in, so each can be translated.
      const values = { number: job.index + 1, title: current.title };
      return this.#end("stopped", event.limited
        ? say("Short {number}, \"{title}\", was not finished: the assistant ran out of its allowance. " +
          "Open it from My videos to carry on.", values)
        : event.stopped
          ? say("Short {number}, \"{title}\", was not finished: it was stopped. " +
            "Open it from My videos to carry on.", values)
          : say("Short {number}, \"{title}\", was not finished: the assistant could not finish it. " +
            "Open it from My videos to carry on.", values));
    }
    job.made.push(current);
    this.#next();
  }

  #next() {
    const job = this.#job;
    job.waiting = false;
    if (job.index === -1 || job.made.length === job.index + 1) job.index++;
    if (job.index >= job.shorts.length) return this.#end("done", null);
    const current = job.shorts[job.index];
    try {
      this.#choose(current.dir, job.engine);
      this.#send({ dir: current.dir, text: SHORT_REQUEST });
    } catch (error) {
      // The person is talking to the assistant in another video: this short starts when that reply is in.
      if (/still working|being undone/i.test(String(error?.message))) {
        job.waiting = true;
        return this.#tell();
      }
      return this.#end("stopped", say("Short {number} could not start: {message}",
        { number: job.index + 1, message: error?.message ?? error }));
    }
    this.#tell();
  }

  #end(state, error) {
    const job = this.#job;
    this.#job = null;
    const status = { state, total: job.shorts.length, made: job.made.map(({ dir, title }) => ({ dir, title })), error };
    this.#last.set(job.dir, status);
    this.#emit({ dir: job.dir, status });
  }

  #tell() {
    this.#emit({ dir: this.#job.dir, status: this.#public(this.#job) });
  }

  #public(job) {
    return {
      state: "making",
      total: job.shorts.length,
      number: job.index + 1,
      title: job.shorts[job.index]?.title ?? "",
      waiting: job.waiting,
      made: job.made.map(({ dir, title }) => ({ dir, title })),
    };
  }
}
