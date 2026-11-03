// "Tidy my talking" (M10-31): the app finds the long pauses, the "um"s and the doubled words in the clips where
// someone talks, shows them with the time each saves, and the person ticks which go. The assistant then makes the
// cuts. Finding them costs no allowance and is the same every time; only the cutting needs an assistant.
//
// Pauses come from the sound, not the words. Measured on the owner's real phone clips (2026-11-03): Whisper's words
// run into each other with no gaps (a word ends where the next begins, stretching across a 1.8 s pause), so gaps
// between words find nothing. And a fixed "silence" level finds nothing either: the clips were filmed in a busy mall,
// the background never drops below about -41 dB while speech sits near -16 dB. So each clip is measured every 50 ms
// and a pause is where it stays near its own background: below the background plus 30% of the way up to speech, for
// at least 0.55 s (M10-20), keeping 0.2 s of air so a cut never clips a breath or a word's tail (M10-19).
// "Um"s and doubled words come from the words, when the speech tool wrote them down (Whisper often leaves "um" out).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { killTree } from "./proc.js";

export const STEP = 0.05;
const SHARE = 0.3;
export const MIN_PAUSE = 0.55;
export const BREATH = 0.2;
// A shorter cut is not worth the person's attention: on the owner's clips, a third of the list was cuts of 0.3 s.
export const MIN_CUT = 0.4;
// Speech has to stand this far above the background, or the clip is music, noise or silence: no pauses then.
const MIN_RANGE_DB = 8;
// A sound file (music, a voiceover) needs this many words before it counts as someone talking. A video with sound
// counts without words: pauses come from the sound, and a speech tool that does not know the language (Parakeet on
// Kannada) writes no words at all. Background sound without speech has too little range to give pauses anyway.
const MIN_WORDS = 3;

// Hesitation sounds, as speech tools write them, in English, Hindi and Kannada. Matched as whole words.
const FILLERS = new Set([
  "um", "umm", "ummm", "uh", "uhh", "uhm", "er", "erm", "ah", "ahh", "hmm", "hm", "mm", "mmm",
  "उम", "उम्म", "अ", "आ", "हम्म", "हं",
  "ಅ", "ಆ", "ಉಮ್", "ಹ್ಮ್", "ಅಂ",
]);

const plainWord = (text) => String(text ?? "").toLowerCase().normalize("NFC").replace(/[\s.,!?;:"'“”‘’()…\-–—।]+/gu, "");
const rounded = (seconds) => Math.round(seconds * 100) / 100;

/** The background and speech levels of a clip, in dB: its quietest tenth and its loudest tenth. */
export function levelRange(levels) {
  const sorted = levels.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const at = (share) => sorted[Math.floor((sorted.length - 1) * share)];
  return { floor: at(0.1), speech: at(0.9) };
}

/**
 * The parts to cut out of long pauses, from a clip's loudness every `step` seconds. Each pause keeps `breath`
 * seconds of air, half at each side. Returns `[{ from, to }]` in the clip's own seconds.
 */
export function pausesIn(levels, { step = STEP, share = SHARE, minPause = MIN_PAUSE, breath = BREATH } = {}) {
  const range = levelRange(levels);
  if (!range || range.speech - range.floor < MIN_RANGE_DB) return [];
  const threshold = range.floor + share * (range.speech - range.floor);
  const cuts = [];
  let start = null;
  for (let i = 0; i <= levels.length; i++) {
    const quiet = i < levels.length && levels[i] < threshold;
    if (quiet && start === null) start = i;
    if (!quiet && start !== null) {
      const from = start * step;
      const to = i * step;
      if (to - from >= minPause) {
        // At the very start or end of a clip there is no word to protect on that side.
        const before = start === 0 ? 0 : breath / 2;
        const after = i === levels.length ? 0 : breath / 2;
        if (to - after - (from + before) >= MIN_CUT - 1e-9) cuts.push({ from: rounded(from + before), to: rounded(to - after) });
      }
      start = null;
    }
  }
  return cuts;
}

/** "Um"s, and the first of a word said twice in a row, from the words with their times. */
export function slipsIn(words) {
  const list = Array.isArray(words) ? words.filter((w) => Number.isFinite(w?.start) && Number.isFinite(w?.end)) : [];
  const slips = [];
  list.forEach((word, i) => {
    const plain = plainWord(word.text);
    if (!plain) return;
    if (FILLERS.has(plain)) {
      slips.push({ from: rounded(word.start), to: rounded(word.end), kind: "filler", text: String(word.text).trim() });
      return;
    }
    const next = list[i + 1];
    if (next && plainWord(next.text) === plain && next.start - word.end < 1) {
      slips.push({ from: rounded(word.start), to: rounded(next.start), kind: "repeat", text: String(word.text).trim() });
    }
  });
  return slips;
}

/** Pauses and slips of one clip as one list in time order, a slip inside a pause counted once (as the pause). */
export function clipPlan(pauses, slips) {
  const items = pauses.map((pause) => ({ ...pause, kind: "pause" }));
  for (const slip of slips) {
    if (!items.some((item) => item.kind === "pause" && slip.from >= item.from - 0.05 && slip.to <= item.to + 0.05)) {
      items.push(slip);
    }
  }
  return items
    .filter((item) => item.to - item.from >= 0.1)
    .sort((a, b) => a.from - b.from)
    .map((item) => ({ ...item, seconds: rounded(item.to - item.from) }));
}

/** A clip's loudness every 50 ms, read by FFmpeg from its sound (speech band only, so rumble and hiss count less). */
export function soundLevels(file, { ffmpeg = "ffmpeg", spawnImpl = spawn, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawnImpl(ffmpeg, [
      "-hide_banner", "-nostats", "-i", file, "-vn", "-af",
      `highpass=f=90,lowpass=f=4000,aresample=16000,asetnsamples=${Math.round(16000 * STEP)},` +
        "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
      "-f", "null", "-",
    ], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let text = "";
    const timer = setTimeout(() => killTree(child.pid), timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { text += chunk; });
    const done = () => {
      clearTimeout(timer);
      resolve([...text.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) => (m[1] === "-inf" ? -120 : Number(m[1]))));
    };
    child.on("error", done);
    child.on("close", done);
  });
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/**
 * The plan for a whole video: every studied clip where someone talks, with its pauses and slips. Reads the footage
 * study (`.hyperframes/study/index.json`); clips without words (music, silent b-roll) are left alone.
 * Returns `{ clips: [{ file, seconds, items }], seconds }`, the total time the cuts would save.
 */
export async function tidyPlan(dir, { ffmpeg = "ffmpeg", levels = soundLevels } = {}) {
  const index = readJson(path.join(dir, ".hyperframes", "study", "index.json"));
  const clips = [];
  for (const clip of index?.clips ?? []) {
    if (!clip?.hasSound) continue;
    if (clip.kind !== "video" && (clip.transcript?.wordCount ?? 0) < MIN_WORDS) continue;
    const file = path.join(dir, clip.file);
    if (!fs.existsSync(file)) continue;
    const words = clip.transcript?.words ? readJson(path.join(dir, clip.transcript.words)) ?? [] : [];
    const items = clipPlan(pausesIn(await levels(file, { ffmpeg })), slipsIn(words));
    if (items.length) clips.push({ file: clip.file, seconds: clip.seconds ?? null, items });
  }
  const seconds = rounded(clips.flatMap((clip) => clip.items).reduce((sum, item) => sum + item.seconds, 0));
  return { clips, seconds };
}

// A file named the way the composition writes it ("./assets/a.mp4", "assets%20b.mp4") and the way the study does.
const fileKey = (file) => {
  let text = String(file ?? "").split(/[?#]/)[0].replaceAll("\\", "/").replace(/^\.?\//, "");
  try {
    text = decodeURI(text);
  } catch {
    // Not percent-encoded after all.
  }
  return text.toLowerCase();
};

/**
 * Each item placed on the whole video's clock (`at`, seconds) from where the composition plays its clip (`media`,
 * from player.js). An item the video does not use is left out and counted in `unused`. Without `media` (the
 * picture was not ready) every item stays, with `at` null, so the list still shows; it just cannot be played.
 * Every kept item gets an `id`, which is how the page names the ones the person keeps ticked.
 */
export function placeInVideo(plan, media) {
  let id = 0;
  let unused = 0;
  const clips = [];
  for (const clip of plan.clips) {
    const uses = Array.isArray(media)
      ? media.filter((use) => fileKey(use.src) === fileKey(clip.file) && use.duration > 0)
      : null;
    const items = [];
    for (const item of clip.items) {
      if (!uses) {
        items.push({ ...item, id: id++, at: null });
        continue;
      }
      const use = uses.find((each) => item.from >= each.mediaStart - 0.05 &&
        item.to <= each.mediaStart + each.duration + 0.05);
      if (!use) {
        unused++;
        continue;
      }
      items.push({ ...item, id: id++, at: rounded(use.start + item.from - use.mediaStart) });
    }
    if (items.length) clips.push({ ...clip, items });
  }
  const seconds = rounded(clips.flatMap((clip) => clip.items).reduce((sum, item) => sum + item.seconds, 0));
  return { clips, seconds, unused };
}

/** The same plan with only the items whose ids are in `keep`. */
export function keepOnly(plan, keep) {
  const ids = new Set(Array.isArray(keep) ? keep.filter(Number.isInteger) : []);
  return { clips: plan.clips.map((clip) => ({ ...clip, items: clip.items.filter((item) => ids.has(item.id)) })) };
}

const time = (seconds) => seconds.toFixed(2);

/**
 * The message for the assistant: exactly what to cut, clip by clip, in the clip's own seconds, and how to cut it.
 * `plan` is what tidyPlan returned, holding only the items the person kept ticked.
 */
export function tidyRequest(plan) {
  const lines = [
    "Tidy my talking: cut these parts out of the video where it uses them. Times are in each clip's own seconds " +
      "(from the start of the file), already leaving a little air; cut exactly these and nothing else.",
  ];
  for (const clip of plan.clips) {
    if (!clip.items.length) continue;
    lines.push("", `${clip.file}:`);
    for (const item of clip.items) {
      const what = item.kind === "pause" ? "pause" : item.kind === "filler" ? `"${item.text}"` : `"${item.text}" said twice`;
      lines.push(`- ${time(item.from)} to ${time(item.to)} (${what})`);
    }
  }
  lines.push("",
    "Cut only between words, with a 20 to 30 ms sound fade at each join so nothing clicks. Where a part is not in " +
    "the video, skip it. Keep the pictures in step with the sound, and move everything after a cut (titles, " +
    "subtitles, music cues) earlier by the same amount. Then look at the joins and tell me how much shorter it is.");
  return lines.join("\n");
}
