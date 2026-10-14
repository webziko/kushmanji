import fs from "node:fs";
import path from "node:path";

const within = (root, file) => {
  const relative = path.relative(root, file);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
};

/** Project records are untrusted: a supplied path must stay in this project's actual study directory. */
export function readClipStudy(dir, file) {
  const root = fs.realpathSync.native(dir);
  const study = path.join(root, ".hyperframes", "study");
  const read = (relative, limit) => {
    const target = path.resolve(root, relative);
    if (!within(study, target) || !within(study, fs.realpathSync.native(target)) ||
      fs.statSync(target).size > limit) {
      throw new Error("The app cannot show what it saw in this clip.");
    }
    return fs.readFileSync(target);
  };
  const index = JSON.parse(read(path.join(".hyperframes", "study", "index.json"), 2_000_000));
  const clip = index.clips?.find((item) => item.file === file);
  if (!clip) throw new Error("The app has not finished watching this clip yet. Try again in a moment.");
  const images = (clip.sheets ?? []).slice(0, 4).map(({ file: picture }) => {
    if (!/\.(jpe?g|png)$/i.test(picture)) throw new Error("One of this clip's pictures cannot be shown.");
    return `data:image/${/\.png$/i.test(picture) ? "png" : "jpeg"};base64,${read(picture, 6_000_000).toString("base64")}`;
  });
  return {
    file: clip.file,
    seconds: clip.seconds,
    width: clip.width,
    height: clip.height,
    notes: clip.notes ?? [],
    review: typeof clip.review === "string" ? clip.review.slice(0, 4000) : "",
    images,
    text: clip.transcript?.text ? read(clip.transcript.text, 2_000_000).toString("utf8") : "",
    languageSure: clip.transcript?.languageSure ?? null,
  };
}
