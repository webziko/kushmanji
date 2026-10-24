// FFmpeg with one press (M5-03). Kushmanji needs it to save videos, study clips and make the lighter copies, and a
// stranger's PC rarely has it. The health check used to offer a winget line to paste into PowerShell, which someone
// who has never used a terminal cannot be expected to do. Now, when the person presses "Get it now", the app
// fetches Gyan's "essentials" build (the one winget installs), checks it against the SHA-256 GitHub publishes,
// unpacks it into its own folder and points HyperFrames, the app and the assistants at it with
// HYPERFRAMES_FFMPEG_PATH and HYPERFRAMES_FFPROBE_PATH (HyperFrames' `doctor` and `render` both read them).
// Nothing is fetched without that press, and an FFmpeg the person already has is used as it is.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { whereAll as defaultWhereAll } from "./agents/launcher.js";
import { say } from "./say.js";
import { download, unzip } from "./speechTool.js";

/**
 * Pinned, so what is run is what was checked. A numbered release, not a nightly: its address does not change. To
 * move to a newer one, see docs/MAINTENANCE.md: GitHub's release API gives each file's size and "digest".
 */
export const FFMPEG_ZIP = {
  url: "https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip",
  bytes: 114_768_076,
  sha256: "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba",
};

/** The zip unpacked takes about three times its size; asked for before a byte is fetched. */
const ROOM_NEEDED = FFMPEG_ZIP.bytes * 4;

/** `{ ffmpeg, ffprobe }` inside `folder`, where the zip puts them (`ffmpeg-<version>-essentials_build\bin`). */
export function findPrograms(folder) {
  const look = (dir, depth) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    const names = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name.toLowerCase()));
    if (names.has("ffmpeg.exe") && names.has("ffprobe.exe"))
      return { ffmpeg: path.join(dir, "ffmpeg.exe"), ffprobe: path.join(dir, "ffprobe.exe") };
    for (const entry of entries) {
      const found = entry.isDirectory() && depth > 0 ? look(path.join(dir, entry.name), depth - 1) : null;
      if (found) return found;
    }
    return null;
  };
  return look(folder, 3);
}

const isFile = (file) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

/** Plain words for what went wrong; the detail is for the log, not the person. */
function plain(error, folder) {
  const code = error?.code ?? error?.cause?.code;
  if (code === "ENOSPC") return say("There is not enough free space on this computer for FFmpeg.");
  if (code === "EPERM" || code === "EACCES" || code === "EBUSY")
    return say("The app could not write into {folder}. An antivirus may be blocking it.", { folder });
  if (error?.name === "AbortError") return say("Getting FFmpeg was stopped.");
  if (error instanceof TypeError || /fetch|network|ENOTFOUND|ECONN|ETIMEDOUT/i.test(String(error?.message ?? "")))
    return say("FFmpeg could not be downloaded. Check the internet connection and try again.");
  return error?.message || say("Getting FFmpeg did not work.");
}

/**
 * FFmpeg for this app: whether it is here, and getting it on request. One download at a time. `folder` is the
 * app's own (`<userData>/tools/ffmpeg`); `emit(status)` reports progress. `source` and `fetchImpl` are for tests.
 */
export class FfmpegTool {
  #folder;
  #emit;
  #whereAll;
  #source;
  #fetchImpl;
  #job = null;
  #failed = null;

  constructor({ folder, emit = () => {}, whereAll = defaultWhereAll, source = FFMPEG_ZIP, fetchImpl = fetch }) {
    this.#folder = folder;
    this.#emit = emit;
    this.#whereAll = whereAll;
    this.#source = source;
    this.#fetchImpl = fetchImpl;
  }

  /** An FFmpeg the person installed (named in the variables or on PATH) comes first: nothing to download. */
  #theirs() {
    const named = process.env.HYPERFRAMES_FFMPEG_PATH?.trim();
    if (named) return isFile(named);
    return this.#whereAll("ffmpeg").some((file) => /\.exe$/i.test(file));
  }

  /** Point HyperFrames at our copy when the person has none. Called at start and after a download. */
  useIfPresent() {
    if (this.#theirs()) return;
    const ours = findPrograms(this.#folder);
    if (!ours) return;
    process.env.HYPERFRAMES_FFMPEG_PATH = ours.ffmpeg;
    process.env.HYPERFRAMES_FFPROBE_PATH = ours.ffprobe;
  }

  status() {
    if (this.#job) return { ...this.#job.status };
    if (this.#theirs() || findPrograms(this.#folder)) return { state: "ready" };
    return { state: this.#failed ? "failed" : "missing", error: this.#failed, megabytes: this.megabytes };
  }

  /** What "Get it now" fetches, in the megabytes the person sees. */
  get megabytes() {
    return Math.round(this.#source.bytes / 1e6);
  }

  /** Fetch FFmpeg. Resolves to the final status; never rejects. */
  get() {
    if (this.#job) return this.#job.promise;
    if (this.status().state === "ready") return Promise.resolve(this.status());
    const job = {
      controller: new AbortController(),
      status: { state: "getting", percent: 0, megabytes: this.megabytes },
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
    // Checked first: a download that fills the disk halfway helps nobody.
    try {
      const disk = fs.statfsSync(path.dirname(this.#folder));
      if (disk.bavail * disk.bsize < ROOM_NEEDED) throw Object.assign(new Error("no space"), { code: "ENOSPC" });
    } catch (error) {
      if (error.code === "ENOSPC") throw error;
      // The folder's parent may not exist yet, or statfs may be missing: the download itself will say.
    }
    let shown = -1;
    const progress = (received) => {
      const percent = Math.floor((received / this.#source.bytes) * 100);
      if (percent === shown) return;
      shown = percent;
      job.status.percent = percent;
      this.#emit({ ...job.status });
    };
    const unpacking = `${this.#folder}.new`;
    const zip = path.join(os.tmpdir(), `kushmanji-ffmpeg-${process.pid}.zip`);
    await fs.promises.rm(unpacking, { recursive: true, force: true });
    try {
      await download(this.#source.url, zip, {
        ...this.#source, onBytes: progress, signal: job.controller.signal, fetchImpl: this.#fetchImpl,
      });
      await unzip(zip, unpacking, { problem: say("FFmpeg could not be unpacked.") });
    } finally {
      await fs.promises.rm(zip, { force: true });
    }
    if (!findPrograms(unpacking)) {
      await fs.promises.rm(unpacking, { recursive: true, force: true });
      throw new Error(say("The FFmpeg download did not hold the programs."));
    }
    await fs.promises.rm(this.#folder, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(this.#folder), { recursive: true });
    fs.renameSync(unpacking, this.#folder);
  }
}
