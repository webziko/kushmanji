import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { whereAll } from "./agents/launcher.js";
import { spawnCli } from "./cli.js";
import { readJson, writeJson } from "./jsonFile.js";
import { collect, killTree } from "./proc.js";
import {
  chooseEngine,
  clock,
  isCurrent,
  kindOf,
  knownLanguage,
  LANGUAGES,
  mayHoldFootage,
  phrasesFrom,
  sheetPlan,
  slugFor,
  STUDY_FOLDER,
  STUDY_VERSION,
  transcriptText,
} from "./studyPlan.js";

// The footage study: before anyone cuts, every clip in the project gets a transcript with times, sheets of
// still frames with the time on each, and a line in one index file. Agents read that instead of guessing what
// a clip holds, and all three read the same thing because it lives in the project: .hyperframes/study/.
//
// It runs by itself when a project opens and when footage is added, and a chat turn waits for it. Everything
// is made on this computer: FFmpeg for the pictures, HyperFrames' own `transcribe` for the words.

const MAX_CLIPS = 200;
const MAX_WALKED = 20_000;
const TILE_WIDTH = 320;
const SETTLE_MS = 2000;
const ABOUT =
  "Made by Kushmanji from the footage in this project. Read this before working with a clip. " +
  "Each clip lists its length in seconds, sheets of still frames (`sheets`: open the picture to see the clip; " +
  "`times` gives the second each frame was taken at, row by row from the top left, and the same time is printed " +
  "on the frame), and a transcript (`transcript.text`: one line per phrase with the times it runs between; " +
  "`transcript.words`: every word with its start and end, in HyperFrames' own format). When " +
  "`transcript.languageSure` is false the language was assumed, and the words may be wrong if the speech is not " +
  "in English or another European language. `notes` says, in plain words, what could not be studied. Paths are " +
  "from the project folder. Do not edit this folder: the app rebuilds it when footage changes.";

const posix = (file) => file.split(path.sep).join("/");
const studyDir = (dir) => path.join(dir, ...STUDY_FOLDER);
const indexFile = (dir) => path.join(studyDir(dir), "index.json");

function findTool(name, override) {
  if (override?.trim()) return path.resolve(override.trim());
  return whereAll(name).find((file) => /\.exe$/i.test(file)) ?? null;
}

/** Every video and audio file in the project, as `{ file, kind, size, modifiedMs }` with `file` from the project folder. */
export function findFootage(dir) {
  const found = [];
  let walked = 0;
  const walk = (folder) => {
    let entries = [];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (walked++ > MAX_WALKED || found.length >= MAX_CLIPS) return;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (mayHoldFootage(entry.name)) walk(full);
      } else if (entry.isFile() && kindOf(entry.name)) {
        try {
          const stat = fs.statSync(full);
          if (stat.size > 0) {
            found.push({ file: posix(path.relative(dir, full)), kind: kindOf(entry.name), size: stat.size, modifiedMs: stat.mtimeMs });
          }
        } catch {
          // Gone between the listing and the look: the next scan will not list it.
        }
      }
    }
  };
  walk(dir);
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

/** What the page shows: a short account of the study, without the detail the agents read. */
function summary(dir, job) {
  const index = readJson(indexFile(dir), null);
  const clips = (index?.clips ?? []).map((clip) => ({
    file: clip.file,
    kind: clip.kind,
    seconds: clip.seconds,
    words: clip.transcript?.wordCount ?? null,
    language: clip.transcript?.language ?? null,
    languageSure: clip.transcript?.languageSure ?? null,
    notes: clip.notes ?? [],
  }));
  return {
    running: Boolean(job),
    done: job?.done ?? 0,
    total: job?.total ?? 0,
    current: job?.current ?? null,
    step: job?.step ?? null,
    language: index?.language ?? "auto",
    languages: LANGUAGES,
    clips,
  };
}

export class FootageStudy {
  #emit;
  /** The study running now: `{ dir, promise, child, cancelled, done, total, current, step }`. One at a time. */
  #job = null;
  #watch = null;

  /** `emit({ dir, status })` tells the window when the study starts, moves on, and ends. */
  constructor({ emit }) {
    this.#emit = emit;
  }

  status(dir) {
    return summary(dir, this.#job?.dir === dir ? this.#job : null);
  }

  /** Start studying this project's footage and keep an eye on the folder for more. */
  open(dir) {
    this.close();
    try {
      let timer = null;
      const watcher = fs.watch(dir, { recursive: true }, (_event, name) => {
        // Only footage counts, and not our own output or a render: those would start a study that finds nothing.
        const file = String(name ?? "");
        if (!kindOf(file) || !file.split(/[\\/]/).slice(0, -1).every(mayHoldFootage)) return;
        clearTimeout(timer);
        // A copy in progress reports many changes. Wait until it has been quiet for a moment.
        timer = setTimeout(() => void this.run(dir), SETTLE_MS);
      });
      watcher.on("error", () => {});
      this.#watch = { dir, watcher, stop: () => clearTimeout(timer) };
    } catch {
      // No watching on this drive (some network shares). The study still runs on open and before each message.
    }
    void this.run(dir);
  }

  close({ sync = false } = {}) {
    this.#watch?.stop();
    this.#watch?.watcher.close();
    this.#watch = null;
    if (this.#job) {
      this.#job.cancelled = true;
      killTree(this.#job.child?.pid, { sync });
    }
  }

  /** The language spoken in this project's footage, chosen by the person. `null` leaves it to the app. */
  setLanguage(dir, code) {
    const language = knownLanguage(code) ?? "auto";
    const index = readJson(indexFile(dir), null) ?? { version: STUDY_VERSION, about: ABOUT, clips: [] };
    writeJson(indexFile(dir), { ...index, language });
    void this.run(dir);
  }

  /**
   * Resolves when this project's study is up to date: at once when nothing has changed. A chat turn waits on
   * this, so the agent never starts from a study that is missing the clip the person just added.
   */
  async ready(dir) {
    await this.run(dir);
  }

  /** Study whatever is new or changed. Joins the study already running for this project. */
  run(dir, { force = false } = {}) {
    if (this.#job?.dir === dir && !this.#job.cancelled) {
      // Asked again while running (more footage arrived): go round once more when this pass ends.
      this.#job.again = true;
      return this.#job.promise;
    }
    const job = { dir, cancelled: false, again: false, child: null, done: 0, total: 0, current: null, step: null };
    // After whatever was running (a project just closed is still winding down), never beside it.
    const before = this.#job?.promise ?? Promise.resolve();
    this.#job = job;
    job.promise = before
      .then(async () => {
        do {
          job.again = false;
          await this.#pass(job, force);
        } while (job.again && !job.cancelled);
      })
      .catch(() => {})
      .finally(() => {
        if (this.#job === job) this.#job = null;
        this.#emit({ dir, status: this.status(dir) });
      });
    return job.promise;
  }

  #tell(job) {
    this.#emit({ dir: job.dir, status: summary(job.dir, job) });
  }

  /** Run one program to its end, remembering it so that closing the project can stop it. */
  async #run(job, child, timeoutMs) {
    job.child = child;
    try {
      return await collect(child, { timeoutMs });
    } finally {
      job.child = null;
    }
  }

  async #pass(job, force) {
    const { dir } = job;
    const old = readJson(indexFile(dir), null);
    const spoken = old?.language ?? "auto";
    const footage = findFootage(dir).map((clip) => ({ ...clip, spoken }));
    // A project with no footage and no study gets no folder: nothing to say.
    if (footage.length === 0 && !old) return;

    const previous = new Map((old?.clips ?? []).map((clip) => [clip.file, clip]));
    const stale = footage.filter((clip) => force || !isCurrent(previous.get(clip.file), clip));
    const kept = footage.filter((clip) => !stale.includes(clip)).map((clip) => previous.get(clip.file));
    const gone = (old?.clips ?? []).filter((clip) => !footage.some((found) => found.file === clip.file));
    if (stale.length === 0 && gone.length === 0) return;

    const tools = {
      ffmpeg: findTool("ffmpeg", process.env.HYPERFRAMES_FFMPEG_PATH),
      ffprobe: findTool("ffprobe", process.env.HYPERFRAMES_FFPROBE_PATH),
      whisper: Boolean(findTool("whisper-cli", process.env.HYPERFRAMES_WHISPER_PATH)),
      parakeet: stale.length > 0 ? await this.#hasParakeet(job) : false,
    };
    job.total = stale.length;
    job.done = 0;
    const studied = [];
    const save = () =>
      writeJson(indexFile(dir), {
        version: STUDY_VERSION,
        about: ABOUT,
        updatedAt: new Date().toISOString(),
        language: spoken,
        clips: [...kept, ...studied].sort((a, b) => a.file.localeCompare(b.file)),
      });

    for (const clip of stale) {
      if (job.cancelled) return;
      job.current = clip.file;
      studied.push(await this.#studyClip(job, clip, tools, previous.get(clip.file)));
      job.done++;
      // Saved after every clip: a long study that is interrupted keeps what it finished.
      if (!job.cancelled) save();
    }
    if (job.cancelled) return;
    save();
    // The study of a clip that is no longer in the project is our own file, and stale: remove it.
    for (const clip of gone) {
      if (clip.study) fs.rmSync(path.join(dir, clip.study), { recursive: true, force: true });
    }
  }

  async #hasParakeet(job) {
    const listed = await this.#run(job, spawnCli(["models", "list", "--json"]), 60_000);
    try {
      return JSON.parse(listed.stdout.trim().split(/\r?\n/).pop()).models.some(
        (model) => model.engine === "parakeet" && model.installed,
      );
    } catch {
      return false;
    }
  }

  async #studyClip(job, clip, tools, before) {
    const { dir } = job;
    const source = path.join(dir, clip.file);
    const folder = path.join(studyDir(dir), slugFor(clip.file));
    const inProject = (file) => posix(path.relative(dir, file));
    // The same file studied again only because the spoken language changed: its pictures are still right.
    const sameFile =
      before?.version === STUDY_VERSION &&
      before.source?.size === clip.size &&
      before.source?.modifiedMs === Math.round(clip.modifiedMs) &&
      before.sheets?.length > 0 &&
      before.sheets.every((sheet) => fs.existsSync(path.join(dir, sheet.file)));
    if (!sameFile) fs.rmSync(folder, { recursive: true, force: true });
    fs.mkdirSync(folder, { recursive: true });

    const entry = {
      file: clip.file,
      kind: clip.kind,
      seconds: null,
      hasSound: null,
      study: inProject(folder),
      sheets: [],
      transcript: null,
      notes: [],
      version: STUDY_VERSION,
      spoken: clip.spoken,
      source: { size: clip.size, modifiedMs: Math.round(clip.modifiedMs) },
    };
    if (!tools.ffmpeg || !tools.ffprobe) {
      entry.notes.push("FFmpeg is not installed on this computer, so this clip could not be studied.");
      return entry;
    }

    job.step = "reading";
    this.#tell(job);
    const probed = await this.#run(
      job,
      spawn(tools.ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", source], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      }),
      60_000,
    );
    let info = null;
    try {
      info = JSON.parse(probed.stdout);
    } catch {
      // Handled just below.
    }
    const video = info?.streams?.find((stream) => stream.codec_type === "video" && stream.disposition?.attached_pic !== 1);
    const audio = info?.streams?.find((stream) => stream.codec_type === "audio");
    const seconds = Number(info?.format?.duration);
    if (!info || !(seconds > 0)) {
      entry.notes.push("This file could not be read as video or sound.");
      return entry;
    }
    entry.seconds = Math.round(seconds * 100) / 100;
    entry.hasSound = Boolean(audio);
    if (video) {
      const [num, den] = String(video.avg_frame_rate ?? "0/1").split("/").map(Number);
      Object.assign(entry, {
        width: video.width,
        height: video.height,
        fps: den ? Math.round((num / den) * 100) / 100 : null,
      });
    }

    if (video && sameFile) {
      entry.sheets = before.sheets;
    } else if (video && !job.cancelled) {
      job.step = "pictures";
      this.#tell(job);
      entry.sheets = await this.#sheets(job, { source, folder, seconds, tall: video.height > video.width, tools });
      for (const sheet of entry.sheets) sheet.file = inProject(sheet.file);
      if (entry.sheets.length === 0) entry.notes.push("Still frames could not be taken from this clip.");
    }

    // The words are written afresh every time. Old ones left behind (the language was changed, and no engine
    // here speaks the new one) would be found by an agent and believed.
    for (const old of ["transcript.json", "transcript.txt"]) fs.rmSync(path.join(folder, old), { force: true });
    if (audio && !job.cancelled) {
      job.step = "words";
      this.#tell(job);
      const made = await this.#transcript(job, { source, folder, seconds, spoken: clip.spoken, tools });
      if (made.problem) entry.notes.push(made.problem);
      if (made.transcript) {
        entry.transcript = {
          ...made.transcript,
          words: inProject(made.transcript.words),
          text: inProject(made.transcript.text),
        };
        if (!made.transcript.languageSure && made.transcript.wordCount > 0) {
          entry.notes.push(
            "The language of this clip was assumed, not known. If the speech is not in English or another " +
              "European language, the transcript is wrong: the person should choose the spoken language in the app.",
          );
        }
      }
    }
    return entry;
  }

  /** The time printed on a frame. Arial is on every Windows PC; without a font file the frame goes unstamped. */
  #stamp(seconds) {
    const font = path.join(process.env.SystemRoot ?? "C:\\Windows", "Fonts", "arial.ttf");
    if (!fs.existsSync(font)) return "";
    // In a filter a colon ends an option, so the one after the drive letter and the ones in the time are escaped.
    const escaped = (text) => text.replaceAll("\\", "/").replaceAll(":", "\\:");
    return (
      `,drawtext=fontfile='${escaped(font)}':text='${escaped(clock(seconds))}':x=6:y=6:fontsize=20:` +
      "fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4"
    );
  }

  /** One small frame per moment, then the frames laid out as sheets. Returns `[{ file, columns, rows, times }]`. */
  async #sheets(job, { source, folder, seconds, tall, tools }) {
    const plan = sheetPlan(seconds);
    const times = plan.flatMap((sheet) => sheet.times);
    const tiles = path.join(folder, "tiles");
    fs.mkdirSync(tiles, { recursive: true });
    const scale = tall ? `scale=w=-2:h=${TILE_WIDTH}` : `scale=w=${TILE_WIDTH}:h=-2`;
    const tile = (i) => path.join(tiles, `tile-${String(i).padStart(3, "0")}.jpg`);
    // Seeking to each moment is quick whatever the clip's length; decoding all of an hour-long clip is not.
    const grab = async (i, stamped) => {
      const filter = scale + (stamped ? this.#stamp(times[i]) : "");
      const args = ["-y", "-v", "error", "-ss", String(times[i]), "-i", source, "-frames:v", "1", "-vf", filter, "-q:v", "4", tile(i)];
      const ran = await this.#run(job, spawn(tools.ffmpeg, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }), 60_000);
      return ran.code === 0 && fs.existsSync(tile(i));
    };
    // An FFmpeg built without text drawing fails on the first frame; then none are stamped.
    const stamped = await grab(0, true);
    if (!stamped && !(await grab(0, false))) return [];
    for (let i = 1; i < times.length; i++) {
      if (job.cancelled) return [];
      // A moment that cannot be read (damaged footage) gets the frame before it, so the sheet keeps its shape.
      if (!(await grab(i, stamped))) fs.copyFileSync(tile(i - 1), tile(i));
    }

    const sheets = [];
    for (const [n, sheet] of plan.entries()) {
      const file = path.join(folder, `sheet-${n + 1}.jpg`);
      const first = plan.slice(0, n).reduce((count, earlier) => count + earlier.times.length, 0);
      const ran = await this.#run(
        job,
        spawn(
          tools.ffmpeg,
          [
            "-y", "-v", "error",
            "-start_number", String(first),
            "-i", path.join(tiles, "tile-%03d.jpg"),
            "-frames:v", "1",
            "-vf", `tile=${sheet.columns}x${sheet.rows}`,
            "-q:v", "3",
            file,
          ],
          { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
        ),
        120_000,
      );
      if (ran.code === 0 && fs.existsSync(file)) sheets.push({ file, ...sheet });
    }
    fs.rmSync(tiles, { recursive: true, force: true });
    return sheets;
  }

  /** The words of one clip. Returns `{ transcript }`, `{ problem }`, or both when there is a transcript to doubt. */
  async #transcript(job, { source, folder, seconds, spoken, tools }) {
    const language = spoken === "auto" ? null : spoken;
    const choice = chooseEngine({ language, parakeet: tools.parakeet, whisper: tools.whisper });
    if (!choice.engine) return { problem: choice.problem };

    // `transcribe` writes transcript.json into the folder it is given, so each clip gets its own.
    const ran = await this.#run(
      job,
      spawnCli(["transcribe", source, "--dir", folder, "--json", ...choice.args]),
      // Generous: a slow laptop on battery, a first run that loads the model.
      Math.max(180_000, seconds * 6000),
    );
    let reply = null;
    try {
      reply = JSON.parse(ran.stdout.trim().split(/\r?\n/).pop());
    } catch {
      // Handled just below.
    }
    const wordsFile = path.join(folder, "transcript.json");
    const words = readJson(wordsFile, null);
    if (!reply?.ok || !Array.isArray(words)) {
      return { problem: ran.timedOut ? "Transcribing this clip took too long and was stopped." : "The speech in this clip could not be transcribed." };
    }
    const phrases = phrasesFrom(words);
    const textFile = path.join(folder, "transcript.txt");
    fs.writeFileSync(textFile, `${transcriptText(phrases)}\n`);
    const text = phrases.map((phrase) => phrase.text).join(" ");
    return {
      transcript: {
        words: wordsFile,
        text: textFile,
        wordCount: words.length,
        engine: reply.engine ?? choice.engine,
        // Chosen by the person, or detected by Whisper. Parakeet does not say which language it heard.
        language: language ?? reply.detectedLanguage ?? null,
        languageSure: choice.sure,
        opening: text.length > 240 ? `${text.slice(0, 240)}…` : text,
      },
    };
  }
}
