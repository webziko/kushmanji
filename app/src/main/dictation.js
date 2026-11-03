// Speak instead of typing (M3-06; the owner's yes on 2026-11-04). The page records the person's voice (sound only,
// the app's own page only: main.js) and hands the recording here. It is written down on this computer by the same
// speech tools the footage study uses: Parakeet for English and the other European languages, Whisper for Kannada
// and Hindi. Nothing is kept: the recording and its words live in a temporary folder that is deleted at once, and
// the words go back to the message box, where the person reads them before pressing Send.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { spawnCli } from "./cli.js";
import { collect } from "./proc.js";
import { chooseEngine } from "./studyPlan.js";
import { say } from "./say.js";

// A minute of speech in the page's format is well under a megabyte; this only stops something unreasonable.
export const MAX_BYTES = 8 * 1024 * 1024;

// The language the person reads the app in is the one they are most likely to speak. English is left to Parakeet,
// which also hears the other European languages by itself.
const SPOKEN = { en: null, kn: "kn", hi: "hi" };

/** The spoken language to listen for, from the page's language; null means "let Parakeet work it out". */
export const spokenFor = (pageLanguage) => (Object.hasOwn(SPOKEN, pageLanguage) ? SPOKEN[pageLanguage] : null);

/** The recording as bytes, or null when it is not a recording this app should hear. */
export function recordingBytes(audio) {
  const bytes = audio instanceof Uint8Array ? audio : audio instanceof ArrayBuffer ? new Uint8Array(audio) : null;
  return bytes && bytes.length > 0 && bytes.length <= MAX_BYTES ? bytes : null;
}

/** The words of a transcript, as one line of text. */
export function spokenText(words) {
  return (Array.isArray(words) ? words : [])
    .map((word) => String(word?.text ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.!?;:।])/g, "$1")
    .trim();
}

/**
 * Hear one recording. `tools` says what this computer has: `{ ffmpeg, parakeet, whisper }`. Returns `{ text }`, or
 * `{ text: "", problem }` with a plain sentence.
 */
export async function hear(audio, { pageLanguage = "en", tools, run = { spawnCli, spawn } } = {}) {
  const bytes = recordingBytes(audio);
  if (!bytes) return { text: "", problem: say("That recording could not be used. Try again, a little shorter.") };
  if (!tools?.ffmpeg) {
    return { text: "", problem: say("This needs FFmpeg. Home's \"Before you start\" can get it with one press.") };
  }
  const language = spokenFor(pageLanguage);
  const choice = chooseEngine({ language, parakeet: tools.parakeet, whisper: tools.whisper });
  if (!choice.engine) {
    return {
      text: "",
      problem: language
        ? say("To write down this language, the speech tool must be on this computer first: open a video, " +
          "choose the language under Spoken language, and press Get it.")
        : say("No speech tool is on this computer yet, so your words could not be written down."),
    };
  }
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "kushmanji-voice-"));
  try {
    const recording = path.join(folder, "voice.webm");
    const sound = path.join(folder, "voice.wav");
    fs.writeFileSync(recording, bytes);
    const converted = await collect(run.spawn(tools.ffmpeg,
      ["-hide_banner", "-loglevel", "error", "-y", "-i", recording, "-ac", "1", "-ar", "16000", sound],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }), { timeoutMs: 60_000 });
    if (converted.code !== 0 || !fs.existsSync(sound)) {
      return { text: "", problem: say("That recording could not be used. Try again, a little shorter.") };
    }
    // Whisper on a processor takes a while (it always hears at least 30 s); Parakeet answers in seconds.
    const heard = await collect(run.spawnCli(["transcribe", sound, "--dir", folder, "--json", ...choice.args]),
      { timeoutMs: choice.engine === "whisper" ? 600_000 : 180_000 });
    let words = [];
    try {
      words = JSON.parse(fs.readFileSync(path.join(folder, "transcript.json"), "utf8"));
    } catch {
      // Nothing written: said just below.
    }
    const text = spokenText(words);
    if (heard.timedOut) return { text: "", problem: say("Writing down what you said took too long, so it was stopped.") };
    return text
      ? { text }
      : { text: "", problem: say("No words were heard. Speak a little closer to the microphone and try again.") };
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
