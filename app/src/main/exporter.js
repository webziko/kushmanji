import fs from "node:fs";
import path from "node:path";
import { spawnCli } from "./cli.js";
import { evenLoudness } from "./loudness.js";
import { killTree } from "./proc.js";
import { say } from "./say.js";

// "Save video": the app makes the video file itself, with HyperFrames' own `render`, and puts it in the
// person's Downloads folder. The owner asked for it in so many words ("this export everything i want ai to do"):
// before this, saving meant opening the full editor and finding its Export button. No assistant is involved and
// nothing leaves the computer.
//
// One video is saved at a time: a render already uses every processor core, and two would both crawl.
//
// The video is first made under a working name ("... .making.mp4"), then its sound is brought to the usual
// loudness (loudness.js) into the real name. Only a finished video ever carries the real name.

const TAIL_LINES = 12;

/** "City Centre vlog 2026-10-14 03.15": the project's name and the time, with nothing Windows refuses in a name. */
export function exportName(projectName, when = new Date()) {
  const two = (n) => String(n).padStart(2, "0");
  const stamp = `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())} ${two(when.getHours())}.${two(when.getMinutes())}`;
  const clean = String(projectName ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .trim()
    .slice(0, 80);
  // Windows keeps a few names for devices, whatever follows the dot.
  const safe = !clean || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean) ? "Video" : clean;
  return `${safe} ${stamp}`;
}

/** A free file name in the folder: "name.mp4", then "name (2).mp4"... */
export function freeFile(folder, name, exists = fs.existsSync) {
  for (let n = 1; n < 1000; n++) {
    const file = path.join(folder, `${name}${n === 1 ? "" : ` (${n})`}.mp4`);
    if (!exists(file)) return file;
  }
  throw new Error(
    say("Too many saved videos have the same name. Move some out of the Downloads folder first."));
}

/** How far along one line of the command's output says the work is, 0 to 100, or null if it does not say. */
export function progressFrom(line) {
  const machine = /^@hf-progress (\{.*\})\s*$/.exec(line);
  if (machine) {
    try {
      const percent = Number(JSON.parse(machine[1]).pct);
      return Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : null;
    } catch {
      return null;
    }
  }
  const drawn = /(\d{1,3})%/.exec(line);
  return drawn && Number(drawn[1]) <= 100 ? Number(drawn[1]) : null;
}

export class ExportManager {
  #job = null;
  #last = null;
  #emit;
  #folder;
  #ffmpeg;

  /**
   * `emit(payload)` tells the page; `folder()` is where saved videos go (the person's Downloads);
   * `ffmpeg()` is the FFmpeg program for the loudness step, or null to leave the sound as it is.
   */
  constructor({ emit, folder, ffmpeg = () => null }) {
    this.#emit = emit;
    this.#folder = folder;
    this.#ffmpeg = ffmpeg;
  }

  /** The project being saved right now, or null. */
  get dir() {
    return this.#job?.dir ?? null;
  }

  /** The file "Show the file" may reveal: only the one this app last finished. */
  get lastFile() {
    return this.#last?.file ?? null;
  }

  /** What the page shows for this project: saving (with how far), the last result, or nothing yet. */
  status(dir) {
    if (this.#job?.dir === dir) return { state: "saving", percent: this.#job.percent, name: path.basename(this.#job.file) };
    if (this.#job) return { state: "busy" };
    return this.#last?.dir === dir ? this.#last.status : { state: "idle" };
  }

  start(dir) {
    if (this.#job) {
      throw new Error(
        this.#job.dir === dir
          ? say("This video is already being saved.")
          : say("Another video is being saved. Wait for it to finish, or stop it first."),
      );
    }
    const folder = this.#folder();
    fs.mkdirSync(folder, { recursive: true });
    const file = freeFile(folder, exportName(path.basename(dir)));
    const making = file.replace(/\.mp4$/, ".making.mp4");
    const child = spawnCli(["render", dir, "--output", making], { cwd: dir, projectDir: dir });
    const job = { dir, file, making, child, percent: 0, tail: [], stopped: false };
    this.#job = job;
    this.#last = null;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let pending = "";
    const read = (chunk) => {
      pending += chunk;
      const lines = pending.split(/\r?\n|\r/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const percent = progressFrom(line);
        if (percent === null) {
          if (line.trim()) job.tail.push(line.trim());
          if (job.tail.length > TAIL_LINES) job.tail.shift();
        } else if (percent > job.percent) {
          job.percent = percent;
          this.#tell(job);
        }
      }
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    const sizeOf = (given) => {
      try {
        return fs.statSync(given).size;
      } catch {
        return 0;
      }
    };
    const finish = async (code, problem) => {
      if (this.#job !== job) return;
      if (!job.stopped && code === 0 && sizeOf(making) > 0) {
        // The picture is done. The sound's loudness takes a few seconds more; without FFmpeg it stays as it is.
        const ffmpeg = this.#ffmpeg();
        let evened = false;
        if (ffmpeg) {
          job.percent = 100;
          this.#tell(job);
          const even = await evenLoudness({ ffmpeg, from: making, to: file, onChild: (program) => (job.child = program) })
            .catch(() => ({ changed: false }));
          evened = even.changed && sizeOf(file) > 0;
        }
        if (!evened && !job.stopped) {
          fs.rmSync(file, { force: true });
          fs.renameSync(making, file);
        }
      }
      this.#job = null;
      fs.rmSync(making, { force: true });
      const size = sizeOf(file);
      const made = !job.stopped && code === 0 && size > 0;
      // A stopped or failed save leaves no half-written file behind to be mistaken for the video.
      if (!made) fs.rmSync(file, { force: true });
      const status = made
        ? { state: "saved", name: path.basename(file), megabytes: Math.round(size / 104857.6) / 10 }
        : job.stopped
          ? { state: "stopped" }
          : {
              state: "failed",
              message: problem ?? say("The video could not be saved."),
              detail: job.tail.slice(-6).join("\n"),
            };
      this.#last = { dir, file: made ? file : null, status };
      this.#emit({ dir, status });
    };
    child.on("error", (error) =>
      void finish(1, say("The video could not be saved: {message}", { message: error.message })));
    child.on("close", (code) => void finish(code));
    this.#tell(job);
    return this.status(dir);
  }

  /** Stop saving. The half-made file is removed when the program has ended. */
  stop({ sync = false } = {}) {
    const job = this.#job;
    if (!job) return false;
    job.stopped = true;
    killTree(job.child.pid, { sync });
    if (sync) for (const file of [job.file, job.making]) fs.rmSync(file, { force: true });
    return true;
  }

  #tell(job) {
    this.#emit({ dir: job.dir, status: this.status(job.dir) });
  }
}
