import crypto from "node:crypto";
import path from "node:path";

// The decisions behind the footage study, kept free of files and programs so they can be unit-tested. The work
// itself is in study.js. What the study is for and where it lives is in docs/ARCHITECTURE.md ("The study").

/** Bump when the files a study writes change shape, so every clip is studied again. */
export const STUDY_VERSION = 1;
/** Inside the project, so any agent reads the same study and nothing depends on this computer. */
export const STUDY_FOLDER = [".hyperframes", "study"];

const VIDEO = new Set(".mp4 .mov .m4v .mkv .webm .avi .wmv .mpg .mpeg .mts .m2ts .3gp .flv".split(" "));
const AUDIO = new Set(".mp3 .wav .m4a .aac .flac .ogg .opus .wma .aif .aiff".split(" "));
// Not footage: tools' own folders, and what the app or HyperFrames made from the footage.
const SKIPPED = new Set(["node_modules", "renders", "snapshots", "dist", "out"]);

/** "video", "audio", or null for a file the study leaves alone. */
export function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  return VIDEO.has(ext) ? "video" : AUDIO.has(ext) ? "audio" : null;
}

/** Whether a folder inside the project may hold footage. Hidden folders never do. */
export const mayHoldFootage = (name) => !name.startsWith(".") && !SKIPPED.has(name.toLowerCase());

/**
 * The folder name for one clip's study. A file can be named in any script, so the readable part is only what
 * survives in plain letters, and a short fingerprint of the whole path keeps two clips from sharing a folder.
 */
export function slugFor(relative) {
  const key = relative.split(/[\\/]/).join("/").toLowerCase();
  const print = crypto.createHash("sha1").update(key).digest("hex").slice(0, 8);
  const readable = path
    .basename(relative, path.extname(relative))
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase();
  return `${readable || "clip"}-${print}`;
}

/** A clip's study is current when the file has not changed since and the study's shape is today's. */
export const isCurrent = (entry, found) =>
  Boolean(entry) &&
  entry.version === STUDY_VERSION &&
  entry.source?.size === found.size &&
  entry.source?.modifiedMs === Math.round(found.modifiedMs) &&
  entry.spoken === found.spoken;

/**
 * How long a clip's picture and its sound really last, from ffprobe's own report. They often differ: a file
 * trimmed to 15 seconds can hold 15 seconds of sound and 14.8 of picture, and a clip played to the end of the
 * file then freezes on its last frame before every join (measured on the owner's vlog, 2026-10-13).
 */
export function streamLengths(info) {
  const hundredths = (seconds) => (seconds > 0 ? Math.round(seconds * 100) / 100 : null);
  const length = (stream) => {
    if (!stream) return null;
    if (Number(stream.duration) > 0) return hundredths(Number(stream.duration));
    // Some containers (WebM, MKV) give no length per stream: count the frames instead.
    const [num, den] = String(stream.avg_frame_rate ?? "0/1").split("/").map(Number);
    return num > 0 && den > 0 && Number(stream.nb_frames) > 0 ? hundredths((Number(stream.nb_frames) * den) / num) : null;
  };
  const streams = info?.streams ?? [];
  return {
    pictureSeconds: length(streams.find((stream) => stream.codec_type === "video" && stream.disposition?.attached_pic !== 1)),
    soundSeconds: length(streams.find((stream) => stream.codec_type === "audio")),
  };
}

/** The sentence an agent reads when a clip's picture stops before the file does, or null when it does not. */
export function shortPictureNote({ seconds, pictureSeconds }) {
  if (!(pictureSeconds > 0) || !(seconds - pictureSeconds > 0.05)) return null;
  return `The picture ends at ${pictureSeconds} seconds; the sound runs on to ${seconds}. ` +
    `Never play this clip past ${pictureSeconds} seconds, or its last frame freezes.`;
}

const COLUMNS = 4;
const ROWS = 6;
const MAX_SHEETS = 4;

/**
 * Which moments of a clip to show, and how they are laid out. About one picture every two seconds, never fewer
 * than six for a clip long enough to have them, never more than four sheets' worth: a long clip gets pictures
 * further apart, not more of them. Each moment is the middle of its stretch, which avoids a black first frame.
 */
export function sheetPlan(seconds) {
  if (!(seconds > 0)) return [];
  const most = COLUMNS * ROWS * MAX_SHEETS;
  const count = Math.max(1, Math.min(most, Math.max(Math.ceil(seconds / 2), Math.min(6, Math.floor(seconds * 2)))));
  const times = Array.from({ length: count }, (_, i) => Math.round((((i + 0.5) * seconds) / count) * 100) / 100);
  const sheets = [];
  for (let from = 0; from < times.length; from += COLUMNS * ROWS) {
    const slice = times.slice(from, from + COLUMNS * ROWS);
    sheets.push({ columns: Math.min(COLUMNS, slice.length), rows: Math.ceil(slice.length / COLUMNS), times: slice });
  }
  return sheets;
}

/** 75.25 → "1:15.3"; an hour or more → "1:02:03.0". The form the transcript and the pictures both use. */
export function clock(seconds) {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const s = (tenths % 600) / 10;
  const m = Math.floor(tenths / 600) % 60;
  const h = Math.floor(tenths / 36_000);
  const tail = `${String(s.toFixed(1)).padStart(4, "0")}`;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${tail}` : `${m}:${tail}`;
}

const SENTENCE_END = /[.?!।॥。？！…]["')\]]?$/;

/**
 * Word timings grouped into lines a person, or an agent, can read and cut by: a line ends at the end of a
 * sentence, at a pause, or when it has grown long. `words` is HyperFrames' own transcript, [{ text, start, end }].
 */
export function phrasesFrom(words, { maxWords = 14, pause = 0.7 } = {}) {
  const phrases = [];
  let line = [];
  const close = () => {
    if (line.length === 0) return;
    phrases.push({ start: line[0].start, end: line.at(-1).end, text: line.map((word) => word.text).join(" ") });
    line = [];
  };
  for (const [i, word] of words.entries()) {
    if (typeof word?.text !== "string" || !word.text.trim()) continue;
    line.push({ ...word, text: word.text.trim() });
    const next = words[i + 1];
    const gap = next ? next.start - word.end : 0;
    // A sentence about to end is allowed to: "…rests for two" / "hours." reads worse than one longer line.
    const endsSoon = words.slice(i + 1, i + 4).some((later) => SENTENCE_END.test(String(later?.text ?? "").trim()));
    if ((line.length >= maxWords && !endsSoon) || line.length >= maxWords + 3 || gap > pause || SENTENCE_END.test(word.text.trim())) close();
  }
  close();
  return phrases;
}

/** The readable transcript: one line per phrase, each with the times it runs between. */
export const transcriptText = (phrases) =>
  phrases.map((phrase) => `[${clock(phrase.start)} - ${clock(phrase.end)}] ${phrase.text}`).join("\n");

// The languages the Parakeet model transcribes, as its own model card lists them (upstream's
// packages/cli/src/whisper/parakeet.ts carries the same list).
const PARAKEET = new Set("en es fr de bg hr cs da nl et fi el hu it lv lt mt pl pt ro sk sl sv ru uk".split(" "));
export const parakeetSpeaks = (language) => PARAKEET.has(String(language).toLowerCase().split(/[-_]/, 1)[0]);

/**
 * The languages the "Spoken language" menu offers, each in its own script first. Whisper knows about a hundred;
 * these are the most spoken, and the app accepts any two- or three-letter code typed into the project's study.
 */
export const LANGUAGES = [
  ["en", "English"], ["hi", "हिन्दी · Hindi"], ["te", "తెలుగు · Telugu"], ["ta", "தமிழ் · Tamil"],
  ["kn", "ಕನ್ನಡ · Kannada"], ["ml", "മലയാളം · Malayalam"], ["mr", "मराठी · Marathi"], ["bn", "বাংলা · Bengali"],
  ["gu", "ગુજરાતી · Gujarati"], ["pa", "ਪੰਜਾਬੀ · Punjabi"], ["ur", "اردو · Urdu"], ["ne", "नेपाली · Nepali"],
  ["es", "Español · Spanish"], ["pt", "Português · Portuguese"], ["fr", "Français · French"],
  ["de", "Deutsch · German"], ["it", "Italiano · Italian"], ["nl", "Nederlands · Dutch"],
  ["pl", "Polski · Polish"], ["ru", "Русский · Russian"], ["uk", "Українська · Ukrainian"],
  ["tr", "Türkçe · Turkish"], ["ar", "العربية · Arabic"], ["fa", "فارسی · Persian"], ["he", "עברית · Hebrew"],
  ["zh", "中文 · Chinese"], ["ja", "日本語 · Japanese"], ["ko", "한국어 · Korean"], ["vi", "Tiếng Việt · Vietnamese"],
  ["th", "ไทย · Thai"], ["id", "Bahasa Indonesia · Indonesian"], ["ms", "Bahasa Melayu · Malay"],
  ["tl", "Tagalog · Filipino"], ["sw", "Kiswahili · Swahili"], ["el", "Ελληνικά · Greek"], ["sv", "Svenska · Swedish"],
  ["da", "Dansk · Danish"], ["fi", "Suomi · Finnish"], ["cs", "Čeština · Czech"], ["ro", "Română · Romanian"],
  ["hu", "Magyar · Hungarian"],
].map(([id, name]) => ({ id, name }));

/** A language code as Whisper takes it, or null for "work it out". Anything else is refused: it reaches a command line. */
export function knownLanguage(code) {
  if (code == null || code === "" || code === "auto") return null;
  const tidy = String(code).trim().toLowerCase();
  if (!/^[a-z]{2,3}$/.test(tidy)) throw new Error("That language is not known to this app.");
  return tidy;
}

/** A multilingual model that is fast enough on an ordinary laptop. English-only models end in ".en". */
const WHISPER_MODEL = "small";

/**
 * Which speech engine transcribes a clip, given the language the person chose (null when they left it to the
 * app) and which engines this computer has. Returns `{ engine, args, sure }`, where `sure` is false when the
 * language was assumed rather than chosen or detected, or `{ engine: null, problem }` in plain words.
 */
export function chooseEngine({ language, parakeet, whisper }) {
  if (language) {
    if (parakeet && parakeetSpeaks(language)) return { engine: "parakeet", args: ["--engine", "parakeet"], sure: true };
    if (whisper) {
      return { engine: "whisper", args: ["--engine", "whisper", "--model", WHISPER_MODEL, "--language", language], sure: true };
    }
    return {
      engine: null,
      problem: parakeetSpeaks(language)
        ? "No speech engine is installed on this computer, so this clip has no transcript."
        : "This language needs the Whisper speech engine, which is not on this computer yet, so this clip has no transcript.",
    };
  }
  // Left to the app. Parakeet works the language out itself, but only among its own (English and 24 other
  // European languages): speech in any other comes out as nonsense spelled in Latin letters. Hence `sure: false`.
  if (parakeet) return { engine: "parakeet", args: ["--engine", "parakeet"], sure: false };
  // Whisper's multilingual model detects the language and reports it.
  if (whisper) return { engine: "whisper", args: ["--engine", "whisper", "--model", WHISPER_MODEL], sure: true };
  return { engine: null, problem: "No speech engine is installed on this computer, so this clip has no transcript." };
}
