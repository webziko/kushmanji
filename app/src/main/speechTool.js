// Whisper, the speech tool for every language Parakeet does not speak: Kannada, Hindi, Tamil, Japanese... (M10-11).
// HyperFrames cannot get Whisper on Windows by itself: it only builds whisper.cpp from source, which needs git,
// cmake and a C compiler that no ordinary PC has (UP-01). So, when the person says yes, the app fetches
// whisper.cpp's own Windows build into its own folder and the language model into HyperFrames' model folder (where
// `transcribe` looks for it), checks both against their published SHA-256, and points HyperFrames at the program
// with HYPERFRAMES_WHISPER_PATH. Nothing is fetched without that yes, and nothing outside these two folders changes.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { whereAll as defaultWhereAll } from "./agents/launcher.js";
import { collect } from "./proc.js";
import { say } from "./say.js";
import { WHISPER_MODEL } from "./studyPlan.js";

/**
 * Pinned, so what is run is what was checked. To move to a newer build, see docs/MAINTENANCE.md: the size and
 * SHA-256 are on the release page (github.com/ggml-org/whisper.cpp/releases) and in huggingface.co's file list.
 */
export const WHISPER_PROGRAM = {
  url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip",
  bytes: 8_928_640,
  sha256: "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb",
};
// Which model, and why, is in studyPlan.js (WHISPER_MODEL). These are its size and SHA-256.
export const WHISPER_MODEL_FILE = {
  url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${WHISPER_MODEL}.bin`,
  bytes: 3_095_033_483,
  sha256: "64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2",
};
/** Where HyperFrames' `transcribe` looks for models (its own `MODELS_DIR`; it has no setting to move it). */
export const modelFile = (home = os.homedir()) =>
  path.join(home, ".cache", "hyperframes", "whisper", "models", `ggml-${WHISPER_MODEL}.bin`);

/** The program inside the app's folder, wherever the zip put it, or null. */
export function findProgram(folder) {
  const look = (dir, depth) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase() === "whisper-cli.exe") return path.join(dir, entry.name);
    }
    for (const entry of entries) {
      const found = entry.isDirectory() && depth > 0 ? look(path.join(dir, entry.name), depth - 1) : null;
      if (found) return found;
    }
    return null;
  };
  return look(folder, 2);
}

const exists = (file) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

/**
 * Whether Whisper can be used: the program (the person's own, named in HYPERFRAMES_WHISPER_PATH or found on PATH,
 * or ours) and the model. Without the model HyperFrames would fetch 1.6 GB inside the first clip's time limit.
 */
export function whisperReady({ program = process.env.HYPERFRAMES_WHISPER_PATH?.trim(), home = os.homedir() } = {}) {
  return Boolean(program) && exists(program) && exists(modelFile(home)) && !homeProblem(home);
}

/**
 * whisper.cpp's Windows build reads its command line in the old ANSI code page, and stops at once (0xC0000409) when
 * the model's path has any letter outside plain English: "C:\Users\José\..." fails, tried 2026-10-14. HyperFrames
 * keeps the model in the user folder and has no setting to move it, so such a computer cannot use Whisper yet.
 * Said plainly, instead of fetching 3 GB that would not work. A fault in whisper.cpp; see PROGRESS.md, Upstream.
 */
export function homeProblem(home = os.homedir()) {
  return /^[\x20-\x7e]*$/.test(modelFile(home))
    ? null
    : say("The speech tool cannot work on this computer yet: your Windows user folder's name has letters " +
      "it cannot read. This is a fault in Whisper itself, not in your video.");
}

/**
 * Fetch `url` into `file`, checking its length and SHA-256 on the way. Written beside the target and renamed at
 * the end, so a broken download never looks finished. `onBytes(received)` reports progress.
 */
export async function download(url, file, { bytes, sha256, onBytes = () => {}, signal, fetchImpl = fetch } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const part = `${file}.part`;
  const response = await fetchImpl(url, { signal, redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`The download answered ${response.status}.`);
  const hash = crypto.createHash("sha256");
  const out = fs.createWriteStream(part);
  let received = 0;
  try {
    for await (const chunk of response.body) {
      hash.update(chunk);
      received += chunk.length;
      onBytes(received);
      if (!out.write(chunk)) await once(out, "drain");
    }
    out.end();
    await once(out, "finish");
  } catch (error) {
    out.destroy();
    await fs.promises.rm(part, { force: true });
    throw error;
  }
  const digest = hash.digest("hex");
  if (received !== bytes || digest !== sha256) {
    await fs.promises.rm(part, { force: true });
    throw new Error("The download was not the file expected, so it was thrown away.");
  }
  try {
    fs.renameSync(part, file);
  } catch {
    // An antivirus may hold a brand-new file for a moment.
    await new Promise((done) => setTimeout(done, 1_000));
    fs.renameSync(part, file);
  }
}

/** Unpack a zip with the tar.exe every Windows 10 and 11 has (it reads zips), by its full path. */
async function unzip(zip, into) {
  const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  fs.mkdirSync(into, { recursive: true });
  const ran = await collect(spawn(tar, ["-xf", zip, "-C", into], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }),
    { timeoutMs: 120_000 });
  if (ran.code !== 0) throw new Error("The speech tool could not be unpacked.");
}

/** Plain words for what went wrong; the detail is for the log, not the person. */
function plain(error, folder) {
  const code = error?.code ?? error?.cause?.code;
  if (code === "ENOSPC") return say("There is not enough free space on this computer for the speech tool.");
  if (code === "EPERM" || code === "EACCES" || code === "EBUSY")
    return say("The app could not write into {folder}. An antivirus may be blocking it.", { folder });
  if (error?.name === "AbortError") return say("Getting the speech tool was stopped.");
  if (error instanceof TypeError || /fetch|network|ENOTFOUND|ECONN|ETIMEDOUT/i.test(String(error?.message ?? "")))
    return say("The speech tool could not be downloaded. Check the internet connection and try again.");
  return error?.message ?? say("Getting the speech tool did not work.");
}

/**
 * The speech tool for this app: whether it is here, and getting it on request. One download at a time.
 * `folder` is the app's own (`<userData>/tools/whisper`); `emit(status)` reports progress to the window.
 */
export class SpeechTool {
  #folder;
  #emit;
  #home;
  #whereAll;
  #job = null;
  #failed = null;

  constructor({ folder, emit = () => {}, home = os.homedir(), whereAll = defaultWhereAll }) {
    this.#folder = folder;
    this.#emit = emit;
    this.#home = home;
    this.#whereAll = whereAll;
  }

  /**
   * Point HyperFrames at our copy, unless the person named their own Whisper. Called at start and after a
   * download; the CLI and the study both read the variable, and the assistants inherit it.
   */
  useIfPresent() {
    if (process.env.HYPERFRAMES_WHISPER_PATH?.trim()) return;
    // A Whisper the person installed themselves, on PATH, is used as it is: nothing to download.
    const program = findProgram(this.#folder) ?? this.#whereAll("whisper-cli").find((file) => /\.exe$/i.test(file));
    if (program) process.env.HYPERFRAMES_WHISPER_PATH = program;
  }

  status() {
    if (this.#job) return { ...this.#job.status };
    const blocked = homeProblem(this.#home);
    if (blocked) return { state: "blocked", error: blocked };
    if (whisperReady({ home: this.#home })) return { state: "ready" };
    return { state: this.#failed ? "failed" : "missing", error: this.#failed, megabytes: this.#missingMb() };
  }

  /** What "Get it" would really fetch: the 9 MB program alone when HyperFrames already has the model. */
  #missingMb() {
    const program = findProgram(this.#folder) || process.env.HYPERFRAMES_WHISPER_PATH?.trim() ? 0 : WHISPER_PROGRAM.bytes;
    const model = exists(modelFile(this.#home)) ? 0 : WHISPER_MODEL_FILE.bytes;
    return Math.max(1, Math.round((program + model) / 1e6));
  }

  /** Fetch whatever is missing. Resolves to the final status; never rejects. */
  get() {
    if (this.#job) return this.#job.promise;
    if (homeProblem(this.#home)) return Promise.resolve(this.status());
    const job = {
      controller: new AbortController(),
      status: { state: "getting", percent: 0, megabytes: this.#missingMb() },
    };
    this.#job = job;
    this.#failed = null;
    job.promise = this.#get(job)
      .then(() => {
        this.useIfPresent();
        return null;
      })
      .catch((error) => plain(error, this.#folder))
      .then((problem) => {
        this.#job = null;
        this.#failed = problem;
        const status = this.status();
        this.#emit(status);
        return status;
      });
    this.#emit({ ...job.status });
    return job.promise;
  }

  stop() {
    this.#job?.controller.abort();
  }

  async #get(job) {
    const { signal } = job.controller;
    const needProgram = !findProgram(this.#folder) && !process.env.HYPERFRAMES_WHISPER_PATH?.trim();
    const model = modelFile(this.#home);
    const needModel = !exists(model);
    const total = (needProgram ? WHISPER_PROGRAM.bytes : 0) + (needModel ? WHISPER_MODEL_FILE.bytes : 0);
    // Checked first: a download that fills the disk halfway helps nobody.
    try {
      const disk = fs.statfsSync(this.#home);
      if (disk.bavail * disk.bsize < total * 1.1) throw Object.assign(new Error("no space"), { code: "ENOSPC" });
    } catch (error) {
      if (error.code === "ENOSPC") throw error;
      // statfs is not available everywhere; the download itself will say if the disk fills.
    }
    let done = 0;
    let shown = -1;
    const progress = (received) => {
      const percent = total ? Math.floor(((done + received) / total) * 100) : 100;
      if (percent === shown) return;
      shown = percent;
      job.status.percent = percent;
      this.#emit({ ...job.status });
    };
    if (needProgram) {
      const unpacking = `${this.#folder}.new`;
      const zip = path.join(os.tmpdir(), `kushmanji-whisper-${process.pid}.zip`);
      await fs.promises.rm(unpacking, { recursive: true, force: true });
      try {
        await download(WHISPER_PROGRAM.url, zip, { ...WHISPER_PROGRAM, onBytes: progress, signal });
        await unzip(zip, unpacking);
      } finally {
        await fs.promises.rm(zip, { force: true });
      }
      if (!findProgram(unpacking)) throw new Error("The speech tool's download did not hold the program.");
      await fs.promises.rm(this.#folder, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(this.#folder), { recursive: true });
      fs.renameSync(unpacking, this.#folder);
      done += WHISPER_PROGRAM.bytes;
    }
    if (needModel) await download(WHISPER_MODEL_FILE.url, model, { ...WHISPER_MODEL_FILE, onBytes: progress, signal });
  }
}
