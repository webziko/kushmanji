import { h } from "./dom.js";
import { language, t, tFrom } from "./words.js";

// Speak instead of typing (M3-06). A microphone button beside Send: press to talk, press again to stop. The sound
// goes to the main process, which writes the words down on this computer (main/dictation.js) and sends them back
// for the message box, where the person reads them before pressing Send. Nothing is kept.

// Long enough for a request, short enough that a forgotten button does not record for ever.
const LONGEST_MS = 60_000;

/** `onText(words)` puts the words in the message box; `onNote(sentence)` shows a sentence, "" to clear it. */
export function createMic({ onText, onNote }) {
  let state = "idle";
  let recorder = null;
  let stream = null;
  let chunks = [];
  let started = 0;
  let ticker = null;
  let limit = null;

  const button = h("button", { class: "secondary mic-button", type: "button", "aria-pressed": "false",
    title: t("Speak instead of typing"), "aria-label": t("Speak instead of typing"), onclick: () => void toggle() }, "🎤");

  function show(next) {
    state = next;
    button.dataset.state = next;
    button.setAttribute("aria-pressed", String(next === "recording"));
    button.disabled = next === "hearing";
    button.textContent = next === "recording" ? "■" : "🎤";
    button.title = next === "recording" ? t("Stop and write down what I said") : t("Speak instead of typing");
    button.setAttribute("aria-label", button.title);
  }

  function release() {
    clearInterval(ticker);
    clearTimeout(limit);
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
  }

  async function start() {
    onNote("");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (error) {
      release();
      onNote(error?.name === "NotFoundError"
        ? t("No microphone was found on this computer.")
        : t("Kushmanji may not use the microphone. In Windows Settings, open Privacy and security, then " +
          "Microphone, and let desktop apps use it."));
      return;
    }
    chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
    recorder.addEventListener("stop", () => void finish());
    recorder.start();
    started = Date.now();
    show("recording");
    const listening = () => onNote(t("Listening... {seconds} s. Press ■ when you have finished.",
      { seconds: Math.round((Date.now() - started) / 1000) }));
    listening();
    ticker = setInterval(listening, 1000);
    limit = setTimeout(() => recorder?.state === "recording" && recorder.stop(), LONGEST_MS);
  }

  async function finish() {
    release();
    show("hearing");
    onNote(t("Writing down what you said..."));
    try {
      const audio = new Uint8Array(await new Blob(chunks, { type: "audio/webm" }).arrayBuffer());
      chunks = [];
      const heard = await window.hfwin.voice.hear({ audio, language: language() });
      if (heard?.text) {
        onText(heard.text);
        onNote("");
      } else {
        onNote(heard?.problem ? tFrom(heard.problem) : t("No words were heard."));
      }
    } catch (error) {
      onNote(tFrom(error.message));
    } finally {
      show("idle");
    }
  }

  async function toggle() {
    if (state === "idle") await start();
    else if (state === "recording") recorder?.stop();
  }

  show("idle");
  return { element: button, get state() { return state; } };
}
