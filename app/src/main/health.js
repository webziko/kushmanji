// A first-run health check for people who have never used a terminal (M5-04). HyperFrames' own `doctor` looks at
// the computer; of its many lines only a few matter to someone making videos in Kushmanji, and those are said here
// in plain words with the one press or the one command that fixes each. The assistants' own sign-in is shown by
// the chat already.
import { runCli } from "./cli.js";
import { say } from "./say.js";

const GB = 1024 ** 3;

// What each of doctor's checks means for a person, when it fails. Checks not named here are left out: they are
// for HyperFrames' developers (its version, Docker, optional music and voice models, the terminal).
const MEANING = {
  FFmpeg: {
    need: true,
    said: say("Kushmanji needs the free program FFmpeg to save your videos, study your clips and make " +
      "editing smooth."),
    // Kushmanji fetches it itself, with the person's yes (ffmpegTool.js, M5-03). FFMPEG_ZIP's size, in MB.
    get: "ffmpeg",
    megabytes: 115,
  },
  FFprobe: {
    need: true,
    said: say("FFprobe, which comes with FFmpeg, is missing. Installing FFmpeg brings it."),
    get: "ffmpeg",
    megabytes: 115,
  },
  Chrome: {
    need: true,
    said: say("Saving a video needs a small browser that HyperFrames downloads once. It is not there yet."),
    // Kushmanji can fetch this one itself, with the person's yes (`health:get`).
    get: "browser",
    megabytes: 100,
  },
};

/**
 * The few lines a person needs from doctor's answer: `{ ready, items: [{ name, ok, need, said, fix, get,
 * megabytes }] }`. `get` names what the app can fetch itself ("ffmpeg", "browser"), `fix` a command to paste.
 */
export function readDoctor(answer) {
  const checks = Array.isArray(answer?.checks) ? answer.checks : [];
  const items = [];
  // The FFmpeg download brings FFprobe too: one line, one button.
  const ffmpegMissing = checks.some((check) => check?.name === "FFmpeg" && !check.ok);
  for (const check of checks) {
    const meaning = MEANING[check?.name];
    if (check?.name === "FFprobe" && ffmpegMissing) continue;
    if (meaning && !check.ok) {
      items.push({ name: check.name, ok: false, need: meaning.need, said: meaning.said, fix: meaning.fix ?? null,
        get: meaning.get ?? null, megabytes: meaning.megabytes ?? null });
    }
  }
  const disk = checks.find((check) => check?.name === "Disk");
  const free = Number(/([\d.]+)\s*GB free/.exec(disk?.detail ?? "")?.[1]);
  if (Number.isFinite(free) && free < 10) {
    items.push({ name: "Disk", ok: false, need: false,
      said: say("Only {free} GB of space is left on this computer. Videos and their copies need room: " +
        "10 GB or more is comfortable.", { free }) });
  }
  const memory = checks.find((check) => check?.name === "Memory");
  const total = Number(/([\d.]+)\s*GB total/.exec(memory?.detail ?? "")?.[1]);
  if (Number.isFinite(total) && total * GB < 6 * GB) {
    items.push({ name: "Memory", ok: false, need: false,
      said: say("This computer has {total} GB of memory. Editing works, but long videos may be slow.",
        { total }) });
  }
  return { ready: !items.some((item) => item.need), items, checked: checks.length > 0 };
}

// Doctor takes seconds and Home is visited often: its answer is kept a while, unless the person asks again.
const KEEP_MS = 10 * 60_000;
let kept = null;

/** Run doctor and read it. When doctor itself cannot run, say nothing rather than something wrong. */
export async function checkHealth({ again = false } = {}) {
  if (!again && kept && Date.now() - kept.at < KEEP_MS) return kept.value;
  const out = await runCli(["doctor", "--json"], { timeoutMs: 120_000 });
  const text = String(out.stdout ?? "");
  let value;
  try {
    value = readDoctor(JSON.parse(text.slice(text.indexOf("{"))));
  } catch {
    value = { ready: true, items: [], checked: false };
  }
  kept = value.checked ? { at: Date.now(), value } : null;
  return value;
}

/** After something was fetched, the next look at the computer must not be the one kept from before. */
export const forgetHealth = () => {
  kept = null;
};

/** Fetch HyperFrames' browser for saving videos (about 100 MB, once). True when it is there afterwards. */
export async function getBrowser() {
  kept = null;
  const out = await runCli(["browser", "ensure"], { timeoutMs: 900_000 });
  return out.code === 0;
}
