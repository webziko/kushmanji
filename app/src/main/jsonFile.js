import fs from "node:fs";
import path from "node:path";

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

/** Write beside the target, then rename over it: a crash mid-write leaves the old file, not half of a new one. */
export function writeJson(file, value) {
  const text = JSON.stringify(value, null, 2);
  const temp = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, text);
  try {
    fs.renameSync(temp, file);
  } catch {
    // Windows refuses the rename while an antivirus or indexer holds the target open. Fall back to a plain write.
    fs.writeFileSync(file, text);
    fs.rmSync(temp, { force: true });
  }
}
