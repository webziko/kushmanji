// A picture of each video for Home (M14-07). Taken from the app's own window as the person leaves the watching
// screen, so it shows the video as they last saw it, titles and all; nothing has to be rendered for it. Kept in the
// project's hidden `.cache` folder beside the lighter copies, which HyperFrames' watcher and history both skip.
import fs from "node:fs";
import path from "node:path";
import { COPY_FOLDER } from "./lightCopies.js";

const WIDTH = 480;
const MAX_BYTES = 400_000;

export const coverFile = (dir) => path.join(dir, ...COPY_FOLDER, "cover.jpg");

/** Whether a picture is nearly all black (a fade, the dark first frame of a title): not worth keeping. BGRA. */
export function isDark(bitmap, { every = 61 } = {}) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 2 < bitmap.length; i += 4 * every) {
    sum += bitmap[i] + bitmap[i + 1] + bitmap[i + 2];
    count++;
  }
  return count === 0 || sum / (count * 3) < 20;
}

/** The screen box the page asks to capture, kept inside the window. Null when it is not a usable box. */
export function captureBox(rect, bounds) {
  const values = ["x", "y", "width", "height"].map((key) => Math.round(Number(rect?.[key])));
  if (values.some((value) => !Number.isFinite(value))) return null;
  const [x, y, width, height] = values;
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(bounds.width, x + width);
  const bottom = Math.min(bounds.height, y + height);
  return right - left >= 32 && bottom - top >= 32 ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/** Keep `image` (an Electron NativeImage) as the project's cover. False when it was empty or nearly black. */
export function saveCover(dir, image) {
  if (!image || image.isEmpty()) return false;
  const small = image.resize({ width: WIDTH, quality: "good" });
  if (isDark(small.toBitmap())) return false;
  const file = coverFile(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, small.toJPEG(80));
  try {
    fs.renameSync(temp, file);
  } catch {
    // Windows refuses to replace a file another program (an indexer, an antivirus) has open for a moment.
    fs.copyFileSync(temp, file);
    fs.rmSync(temp, { force: true });
  }
  return true;
}

/** The cover as a data URL for Home's page (its content policy allows `data:` pictures), or null. */
export function readCover(dir) {
  try {
    const file = coverFile(dir);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_BYTES) return null;
    return `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
  } catch {
    return null;
  }
}
