import { isCompositionPreview } from "./preview.js";
import { say } from "./say.js";

const ACTIONS = new Set(["state", "play", "pause", "seek", "skip", "volume"]);
const NUMERIC = new Set(["seek", "skip", "volume"]);

/** A selected scene in Studio is not the whole video; only our direct root frame can be controlled. */
export function rootPlayerFrame(mainFrame, current) {
  return mainFrame.framesInSubtree.find((frame) =>
    frame.parent === mainFrame && isCompositionPreview(frame.url, current) &&
    !new URL(frame.url).pathname.includes("/preview/comp/"),
  );
}

// This fixed function runs in the composition's browser frame, which has no preload or Node access.
async function controlInFrame(action, value) {
  const player = window.__player;
  if (!player || window.__renderReady !== true) return { ready: false };
  const finite = (given, fallback) => Number.isFinite(given) ? given : fallback;
  const duration = Math.max(0, finite(player.getDuration(), 0));
  if (action === "play") {
    if (player.getTime() >= duration && duration > 0) await player.seek(0);
    player.play();
  } else if (action === "pause") player.pause();
  else if (action === "seek" || action === "skip") {
    const playing = player.isPlaying();
    const time = Math.max(0, Math.min(duration, action === "skip" ? player.getTime() + value : value));
    await player.seek(time, { keepPlaying: playing });
    // Older runtimes pause on seek even when asked to keep playing.
    if (playing && time < duration && !player.isPlaying()) player.play();
  } else if (action === "volume") {
    window.postMessage({
      source: "hf-parent", type: "control", action: "set-volume", volume: Math.max(0, Math.min(1, value)),
    }, window.location.origin);
  }
  const root = document.querySelector("[data-composition-id]");
  const dimension = (name, fallback) => {
    const number = Number(root?.getAttribute(name));
    return number > 0 && number <= 16384 ? number : fallback;
  };
  return {
    ready: true,
    time: Math.max(0, finite(player.getTime(), 0)),
    duration,
    playing: Boolean(player.isPlaying()),
    width: dimension("data-width", 1920),
    height: dimension("data-height", 1080),
  };
}

/** No caller-supplied script, selector, URL or property name crosses the IPC boundary. */
export async function runPlayerCommand(frame, { action, value } = {}) {
  if (!ACTIONS.has(action)) throw new Error("That playback control is not available.");
  if (NUMERIC.has(action) && (typeof value !== "number" || !Number.isFinite(value)))
    throw new Error("Use a number for the playback position or sound level.");
  return frame.executeJavaScript(
    `(${controlInFrame.toString()})(${JSON.stringify(action)}, ${NUMERIC.has(action) ? value : "null"})`,
    action !== "state",
  );
}

/** Read at Send, before the footage study can delay the turn. Never use a hidden editor scene's clock. */
export async function readPlaybackMoment(frame) {
  const got = frame ? await runPlayerCommand(frame, { action: "state" }) : null;
  if (!got?.ready || !Number.isFinite(got.time) || !Number.isFinite(got.duration))
    throw new Error(say("The video is loading. Wait for the picture, then send your message again."));
  const seconds = Math.floor(Math.max(0, Math.min(got.time, got.duration)) * 1000) / 1000;
  const whole = Math.floor(seconds);
  const when = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  return {
    seconds, when,
    note: `The person is watching the whole video at ${when} (${seconds} seconds from its start). ` +
      "Use this moment to understand “here” or “this part”. It is a position, not a selected element. " +
      "If the request names another time or the whole video, follow that scope.",
  };
}
