// Lighter copies of a project's videos, used only while watching and editing (M16-07). Phone footage is 1080p at
// about 16 Mbps with a keyframe every second: every jump to a moment decodes up to a second of full-size pictures,
// so a jump took 0.3 to 0.4 seconds and a dragged playhead showed one or two pictures a second. A 720p copy with a
// keyframe every half second and no B-frames answers a jump in about 50 ms and follows a drag (measured,
// `docs/FINDINGS.md`). This is what DaVinci Resolve and Premiere call proxies.
//
// The page never knows: a request for `assets/clip.mp4` from Studio's preview is redirected to the copy by the
// main process (`redirect`, wired to the session's onBeforeRequest). "Save video" renders with the CLI in its own
// browser, so it always uses the full files. Until a copy is ready, the original plays.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collect, killTree } from "./proc.js";
import { kindOf, mayHoldFootage } from "./studyPlan.js";

// HyperFrames' file watcher and its undo history both skip `.cache`, so writing a copy here neither reloads the
// editor nor gets copied again into history; the preview server still serves files from it.
export const COPY_FOLDER = [".cache", "kushmanji-preview"];
const SHORT_SIDE = 720;
const LIGHT_BITRATE = 5_000_000;
const LIGHT_CODECS = new Set(["h264", "vp8", "vp9"]);
const COPYABLE_AUDIO = new Set(["aac", "mp3", "opus"]);
// Opening a project already loads Studio, filmstrips and sound pictures: start a little after.
const START_DELAY_MS = 8_000;
const MAX_HTML_FILES = 200;

const toRel = (dir, file) => path.relative(dir, file).split(path.sep).join("/");
const inside = (dir, file) => {
  const rel = path.relative(dir, file);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
};

/** Whether watching this video is heavy enough to deserve a lighter copy. `info` is ffprobe's JSON. */
export function needsLightCopy(info) {
  const video = info?.streams?.find((stream) => stream.codec_type === "video" && !stream.disposition?.attached_pic);
  if (!video) return false;
  const short = Math.min(Number(video.width) || 0, Number(video.height) || 0);
  const rate = Number(video.bit_rate) || Number(info.format?.bit_rate) || 0;
  return short > SHORT_SIDE || rate > LIGHT_BITRATE || !LIGHT_CODECS.has(video.codec_name);
}

/** The copy's file name. It changes whenever the original does, so a copy of an older version is never used. */
export function copyName(rel, stat) {
  const tag = crypto.createHash("sha1")
    .update(`${rel.toLowerCase()}\n${stat.size}\n${Math.round(stat.mtimeMs)}`).digest("hex").slice(0, 12);
  const base = path.basename(rel, path.extname(rel)).toLowerCase().replace(/[^\w-]+/g, "-").slice(0, 40) || "video";
  return `${base}.${tag}.mp4`;
}

/** FFmpeg's arguments for one copy. Timestamps are kept as they are, so the copy stays in step with the sound. */
export function copyArgs(source, target, info) {
  const audio = info?.streams?.find((stream) => stream.codec_type === "audio");
  return [
    "-hide_banner", "-nostdin", "-v", "error", "-y", "-i", source,
    "-map", "0:v:0", "-map", "0:a:0?",
    // The short side becomes at most 720, upright or wide (FFmpeg has already turned a phone's sideways picture).
    "-vf", "scale='if(gte(iw,ih),-2,trunc(min(720,iw)/2)*2)':'if(gte(iw,ih),trunc(min(720,ih)/2)*2,-2)'",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
    // A keyframe every half second and no B-frames: a jump decodes at most fifteen small pictures.
    "-force_key_frames", "expr:gte(t,n_forced*0.5)", "-bf", "0", "-tune", "fastdecode", "-fps_mode", "passthrough",
    ...(audio && !COPYABLE_AUDIO.has(audio.codec_name) ? ["-c:a", "aac", "-b:a", "160k"] : ["-c:a", "copy"]),
    "-movflags", "+faststart", target,
  ];
}

/** The project's HTML pages: the root and its folders, never hidden, tool or render folders. */
function htmlFiles(dir) {
  const found = [];
  const walk = (folder, depth) => {
    let entries = [];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= MAX_HTML_FILES) return;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (depth < 3 && mayHoldFootage(entry.name)) walk(full, depth + 1);
      } else if (entry.isFile() && /\.html?$/i.test(entry.name)) found.push(full);
    }
  };
  walk(dir, 0);
  return found;
}

/** Videos the project's pages use, as project-relative paths in the order they first appear. */
export function videosUsed(dir) {
  const seen = new Map();
  for (const page of htmlFiles(dir)) {
    let html = "";
    try {
      html = fs.readFileSync(page, "utf8");
    } catch {
      continue;
    }
    for (const [, given] of html.matchAll(/\bsrc\s*=\s*["']([^"'<>]+)["']/gi)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(given) || given.startsWith("//")) continue;
      let clean = given.split(/[?#]/)[0];
      try {
        clean = decodeURIComponent(clean);
      } catch {
        continue;
      }
      if (kindOf(clean) !== "video") continue;
      // Studio serves every page with the project folder as its base; a page in a folder may also mean its own.
      const candidates = [path.join(dir, clean), path.join(path.dirname(page), clean)];
      const file = candidates.find((candidate) => inside(dir, candidate) && fs.existsSync(candidate));
      if (!file) continue;
      const rel = toRel(dir, file);
      if (!rel.split("/").some((part) => part.startsWith(".")) && !seen.has(rel.toLowerCase())) seen.set(rel.toLowerCase(), rel);
    }
  }
  return [...seen.values()];
}

/** The project-relative video a request to Studio's preview asks for, or null for anything else. */
export function requestedFile(url, { serverUrl, projectName }) {
  try {
    const given = new URL(url);
    if (given.origin !== serverUrl) return null;
    const route = given.pathname.match(/^\/api\/projects\/([^/]+)\/preview\/(.+)$/);
    if (!route || decodeURIComponent(route[1]) !== projectName) return null;
    const rel = decodeURIComponent(route[2]);
    if (kindOf(rel) !== "video" || rel.split(/[\\/]/).some((part) => part === ".." || part.startsWith("."))) return null;
    return rel;
  } catch {
    return null;
  }
}

/**
 * Makes the copies for the open project, one at a time and below normal priority, and answers which request
 * should be redirected to which copy. One project at a time, like the preview server.
 */
export class LightCopies {
  #tools;
  #emit;
  #job = null;

  /** `tools()` gives `{ ffmpeg, ffprobe }` (null when missing); `emit({ dir, status })` reports progress. */
  constructor({ tools, emit = () => {} }) {
    this.#tools = tools;
    this.#emit = emit;
  }

  status(dir) {
    const job = this.#job;
    if (!job || job.dir !== dir) return { state: "idle", done: 0, total: 0 };
    return { ...job.status };
  }

  /** Start on a newly opened project. The copies already made are used at once. */
  start(dir, { delayMs = START_DELAY_MS } = {}) {
    this.stop();
    // `light`: names of versions already found light enough, so an assistant's every change does not probe them.
    const job = { dir, stopped: false, child: null, timer: null, again: false, running: false, light: new Set(),
      status: { state: "waiting", done: 0, total: 0 } };
    this.#job = job;
    job.timer = setTimeout(() => void this.#run(job), delayMs);
  }

  /** The project's files changed: an assistant may have added a clip. Look again once the current pass ends. */
  refresh(dir) {
    const job = this.#job;
    if (!job || job.dir !== dir || job.stopped) return;
    if (job.running) job.again = true;
    else if (!job.timer) job.timer = setTimeout(() => void this.#run(job), 2_000);
  }

  stop({ sync = false } = {}) {
    const job = this.#job;
    if (!job) return;
    this.#job = null;
    job.stopped = true;
    clearTimeout(job.timer);
    if (job.child) killTree(job.child.pid, { sync });
  }

  /**
   * The copy to load instead of `url`, or null. Runs for every request to Studio's server, so it only looks at
   * the disk: the copy's name says which version of the original it was made from.
   */
  redirect(url, current) {
    const job = this.#job;
    if (!job || !current || path.resolve(current.dir).toLowerCase() !== path.resolve(job.dir).toLowerCase()) return null;
    const rel = requestedFile(url, current);
    if (!rel) return null;
    const file = path.join(job.dir, rel);
    if (!inside(job.dir, file)) return null;
    let name;
    try {
      name = copyName(toRel(job.dir, file), fs.statSync(file));
      if (!fs.statSync(path.join(job.dir, ...COPY_FOLDER, name)).isFile()) return null;
    } catch {
      return null;
    }
    return `${current.serverUrl}/api/projects/${encodeURIComponent(current.projectName)}/preview/` +
      `${COPY_FOLDER.join("/")}/${encodeURIComponent(name)}`;
  }

  #report(job, change) {
    Object.assign(job.status, change);
    if (!job.stopped) this.#emit({ dir: job.dir, status: { ...job.status } });
  }

  async #run(job) {
    job.timer = null;
    if (job.stopped || job.running) return;
    job.running = true;
    try {
      do {
        job.again = false;
        await this.#pass(job);
      } while (job.again && !job.stopped);
    } finally {
      job.running = false;
    }
  }

  async #pass(job) {
    const { ffmpeg, ffprobe } = this.#tools();
    if (!ffmpeg || !ffprobe) return this.#report(job, { state: "unavailable", done: 0, total: 0 });
    const folder = path.join(job.dir, ...COPY_FOLDER);
    const wanted = new Set();
    const todo = [];
    for (const rel of videosUsed(job.dir)) {
      if (job.stopped) return;
      const source = path.join(job.dir, rel);
      let stat;
      try {
        stat = fs.statSync(source);
      } catch {
        continue;
      }
      const name = copyName(rel, stat);
      wanted.add(name);
      if (job.light.has(name) || fs.existsSync(path.join(folder, name))) continue;
      const probed = await collect(spawn(ffprobe, ["-v", "error", "-print_format", "json", "-show_format",
        "-show_streams", source], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }), { timeoutMs: 60_000 });
      let info = null;
      try {
        info = JSON.parse(probed.stdout);
      } catch {
        continue;
      }
      if (needsLightCopy(info)) todo.push({ source, name, info, seconds: Number(info.format?.duration) || 60 });
      else job.light.add(name);
    }
    this.#report(job, { state: todo.length ? "making" : "ready", done: 0, total: todo.length, failed: 0 });

    for (const item of todo) {
      if (job.stopped) return;
      fs.mkdirSync(folder, { recursive: true });
      const part = path.join(folder, `${item.name}.part.mp4`);
      const child = spawn(ffmpeg, copyArgs(item.source, part, item.info), {
        windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      });
      job.child = child;
      // The person is watching and editing while this runs: the copy waits for them, not the other way round.
      try {
        os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
      } catch { /* the copy is still made, only less politely */ }
      const made = await collect(child, { timeoutMs: Math.max(120_000, item.seconds * 20_000) });
      job.child = null;
      if (job.stopped) {
        fs.rmSync(part, { force: true });
        return;
      }
      if (made.code === 0) {
        try {
          fs.renameSync(part, path.join(folder, item.name));
        } catch {
          // An antivirus scanner may hold a brand-new file for a moment.
          await new Promise((done) => setTimeout(done, 1_000));
          try { fs.renameSync(part, path.join(folder, item.name)); } catch { job.status.failed++; }
        }
      } else {
        fs.rmSync(part, { force: true });
        job.status.failed++;
      }
      this.#report(job, { done: job.status.done + 1 });
    }

    // Copies of versions that are gone. Only this app's own files in its own folder are ever removed.
    let left = [];
    try {
      left = fs.readdirSync(folder);
    } catch { /* nothing made yet */ }
    for (const name of left) {
      if (!wanted.has(name) && /\.[0-9a-f]{12}\.mp4$|\.part\.mp4$/.test(name)) fs.rmSync(path.join(folder, name), { force: true });
    }
    if (!job.stopped) this.#report(job, { state: "ready" });
  }
}
