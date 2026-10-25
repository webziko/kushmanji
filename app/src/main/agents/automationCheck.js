// Catches broken or unsupported audio automation attributes in project HTML before rendering (M10-26).
// HyperFrames' `lint` does not inspect data-automation attributes, but `hyperframes render` (used by "Save video")
// parses and enforces strict rules on them in node_modules/hyperframes/dist/chunk-USWPZXEA.js
// (originating from @hyperframes/core dist/audioAutomation.js). If any attribute fails those rules, the renderer
// throws an AudioAutomationError, failing the video export with:
// "Audio processing failed for element <id>: <error message>".
//
// Rules enforced by HyperFrames (chunk-USWPZXEA.js):
// 1. Valid JSON: `parseAutomation` parses the attribute text with JSON.parse.
// 2. JSON Object: must be a non-null object, not an array or primitive.
// 3. Version: `version` must equal 1 (HF_AUDIO_AUTOMATION_VERSION = 1).
// 4. Lanes: `lanes` must be an array.
// 5. Lane objects: each lane in `lanes` must be a non-null object.
// 6. Target: `lane.target` must be a string recognized by `parseAutomationTarget`:
//    - "volume" (VOLUME_TARGET)
//    - "rate" (RATE_TARGET)
//    - "fx.preset.<presetId>" (PRESET_TARGET_KEY)
//    - "fx.<nodeId>.<param>"
// 7. Points array: `lane.points` must be an array.
// 8. Points validation: each point must be an object with `t` and `v` as finite numbers:
//    - `t`: finite number >= 0
//    - `v`: finite number
//    - points must be in time order: p[i].t >= p[i - 1].t
//    - optional shape fields: curve (number -1 to 1), viaX/viaY (finite numbers)
//    - at most 512 points per lane (MAX_AUTOMATION_POINTS = 512).
import fs from "node:fs";
import path from "node:path";
import { say } from "../say.js";

const HF_AUDIO_AUTOMATION_VERSION = 1;
const MAX_AUTOMATION_POINTS = 512;
const VOLUME_TARGET = "volume";
const RATE_TARGET = "rate";
const PRESET_TARGET_KEY = "preset";

const FIX_HINT =
  'Use data-automation=\'{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0},{"t":0.5,"v":0.5}]}]}\'.';

/**
 * Checks whether an automation target string is one the HyperFrames renderer recognizes.
 * Follows `parseAutomationTarget` in chunk-USWPZXEA.js.
 */
export function parseAutomationTarget(target) {
  if (typeof target !== "string" || !target) return null;
  if (target === VOLUME_TARGET) return { kind: "volume" };
  if (target === RATE_TARGET) return { kind: "rate" };
  const parts = target.split(".");
  if (parts.length === 3 && parts[0] === "fx" && parts[1] === PRESET_TARGET_KEY) {
    const presetId = parts[2];
    return presetId ? { kind: "preset", presetId } : null;
  }
  if (parts.length !== 3 || parts[0] !== "fx") return null;
  const [, nodeId, param] = parts;
  if (!nodeId || !param) return null;
  return { kind: "fx", nodeId, param };
}

/** Decode common HTML entities from quoted attribute text. */
export function decodeHtml(text) {
  return String(text)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Validates a raw data-automation attribute string against the renderer's rules.
 * Returns `{ ok: true }` or `{ ok: false, error: string }`.
 */
export function validateAutomation(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "Automation attribute is empty." };
  }
  let obj;
  try {
    obj = JSON.parse(decodeHtml(raw));
  } catch (err) {
    return { ok: false, error: `Automation is not valid JSON: ${err.message}` };
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { ok: false, error: "Automation must be a JSON object." };
  }
  if (obj.version !== HF_AUDIO_AUTOMATION_VERSION) {
    return { ok: false, error: `Unsupported automation version: ${String(obj.version)}` };
  }
  if (!Array.isArray(obj.lanes)) {
    return { ok: false, error: "Automation is missing a `lanes` array." };
  }
  for (let i = 0; i < obj.lanes.length; i++) {
    const lane = obj.lanes[i];
    if (typeof lane !== "object" || lane === null || Array.isArray(lane)) {
      return { ok: false, error: `Lane ${i} is not an object.` };
    }
    if (typeof lane.target !== "string" || !parseAutomationTarget(lane.target)) {
      return { ok: false, error: `Lane ${i} has an unreadable target: ${String(lane.target)}` };
    }
    if (!Array.isArray(lane.points)) {
      return { ok: false, error: `Lane ${i} is missing a \`points\` array.` };
    }
    if (lane.points.length > MAX_AUTOMATION_POINTS) {
      return { ok: false, error: `Lane ${i} exceeds maximum of ${MAX_AUTOMATION_POINTS} points.` };
    }
    for (let j = 0; j < lane.points.length; j++) {
      const p = lane.points[j];
      if (typeof p !== "object" || p === null || Array.isArray(p)) {
        return { ok: false, error: `Lane ${i} point ${j} is not an object.` };
      }
      if (typeof p.t !== "number" || !Number.isFinite(p.t) || p.t < 0) {
        return { ok: false, error: `Lane ${i} point ${j} time must be a non-negative number.` };
      }
      if (typeof p.v !== "number" || !Number.isFinite(p.v)) {
        return { ok: false, error: `Lane ${i} point ${j} value must be a number.` };
      }
      if (j > 0 && p.t < lane.points[j - 1].t) {
        return { ok: false, error: `Lane ${i} points must be in time order.` };
      }
      if (p.curve !== undefined) {
        if (typeof p.curve !== "number" || !Number.isFinite(p.curve) || p.curve < -1 || p.curve > 1) {
          return { ok: false, error: `Lane ${i} point ${j} curve must be a number between -1 and 1.` };
        }
      }
      if (p.viaX !== undefined || p.viaY !== undefined) {
        if (typeof p.viaX !== "number" || !Number.isFinite(p.viaX) ||
            typeof p.viaY !== "number" || !Number.isFinite(p.viaY)) {
          return { ok: false, error: `Lane ${i} point ${j} via coordinates must be finite numbers.` };
        }
      }
    }
  }
  return { ok: true };
}

/** Formats one automation mistake in the exact shape summarise() returns. */
export function formatMistake(filePath, line) {
  const file = filePath ? String(filePath).split(/[\\/]/).pop() : "";
  const where = `${file}${line ? `, line ${line}` : ""}`;
  return {
    text: say("A sound's fade is written in a form the video cannot be saved with."),
    where,
    fix: FIX_HINT.slice(0, 300),
  };
}

/**
 * Plain-text scan of HTML content for data-automation attributes with single or double quotes.
 * Returns an array of mistakes in the summarise() shape.
 */
export function scanHtmlAutomation(content, filePath = "") {
  if (typeof content !== "string" || !content) return [];
  const ATTR_RE = /\bdata-automation\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const mistakes = [];
  let match;
  while ((match = ATTR_RE.exec(content)) !== null) {
    const raw = match[1] ?? match[2];
    const check = validateAutomation(raw);
    if (!check.ok) {
      const line = content.slice(0, match.index).split("\n").length;
      mistakes.push(formatMistake(filePath, line));
    }
  }
  return mistakes;
}

/** Recursively collects all `.html` files in `folder`. */
function findHtmlFiles(folder) {
  const results = [];
  try {
    const entries = fs.readdirSync(folder, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        results.push(...findHtmlFiles(full));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
        results.push(full);
      }
    }
  } catch {
    // If the directory cannot be read, ignore it.
  }
  return results.sort((a, b) => a.localeCompare(b));
}

/**
 * Checks index.html and all .html files under compositions/ in `projectDir`.
 * Returns an array of mistakes for any invalid automation attribute found.
 */
export function checkProjectAutomation(projectDir) {
  if (!projectDir || typeof projectDir !== "string") return [];
  const files = [];
  const indexHtml = path.join(projectDir, "index.html");
  if (fs.existsSync(indexHtml)) {
    files.push(indexHtml);
  }
  const compDir = path.join(projectDir, "compositions");
  if (fs.existsSync(compDir)) {
    files.push(...findHtmlFiles(compDir));
  }

  const mistakes = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf8");
      mistakes.push(...scanHtmlAutomation(content, file));
    } catch {
      // Ignored if file cannot be read.
    }
  }
  return mistakes;
}
