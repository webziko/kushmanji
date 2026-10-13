import { spawn } from "node:child_process";
import { collect } from "./proc.js";

// A saved video comes out as loud as its clips happen to be. The owner's four videos all measured about -19
// LUFS, where YouTube and Instagram play at about -14: a video like that sounds quiet next to everyone else's.
// So the sound of a saved video is brought to the usual loudness, with a limiter so nothing clips. The picture
// is copied, not made again, so this takes seconds.

export const TARGET_LUFS = -14;
// Beyond this much the cause is not "a bit quiet": a nearly silent video would only have its hiss turned up.
const MOST_GAIN_DB = 9;
const MOST_CUT_DB = -6;

/** The loudness FFmpeg's meter reports for the whole file ("I: -19.5 LUFS", last time it is printed), or null. */
export function readLoudness(output) {
  const found = [...String(output ?? "").matchAll(/\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)].pop();
  const lufs = found ? Number(found[1]) : NaN;
  // -70 is the meter's own floor: it means "no sound to measure".
  return Number.isFinite(lufs) && lufs > -69 ? lufs : null;
}

/** How many dB to add to reach the usual loudness, to one decimal, or null when there is nothing worth doing. */
export function gainFor(lufs, target = TARGET_LUFS) {
  if (!Number.isFinite(lufs)) return null;
  const gain = Math.round(Math.max(MOST_CUT_DB, Math.min(MOST_GAIN_DB, target - lufs)) * 10) / 10;
  return Math.abs(gain) < 0.5 ? null : gain;
}

const run = (ffmpeg, args, onChild) => {
  const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  onChild?.(child);
  return collect(child, { timeoutMs: 30 * 60_000 });
};

/**
 * Write `to` as `from` with its sound at the usual loudness. Returns `{ changed, lufs, gain }`; `changed` is
 * false, and `to` is not written, when the video has no sound, is already about right, or FFmpeg fails.
 * `onChild` is handed each program as it starts, so that "Stop saving" can end it.
 */
export async function evenLoudness({ ffmpeg, from, to, onChild }) {
  const measured = await run(ffmpeg, ["-hide_banner", "-nostats", "-i", from, "-map", "0:a:0", "-af", "ebur128", "-f", "null", "-"], onChild);
  const lufs = readLoudness(`${measured.stderr}\n${measured.stdout}`);
  const gain = gainFor(lufs);
  if (measured.code !== 0 || gain === null) return { changed: false, lufs, gain: null };
  const made = await run(ffmpeg, [
    "-hide_banner", "-nostats", "-y", "-i", from,
    "-c:v", "copy", "-af", `volume=${gain}dB,alimiter=limit=0.84:level=disabled`,
    "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", to,
  ], onChild);
  return { changed: made.code === 0, lufs, gain };
}
