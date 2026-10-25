// "Copy credits" after "Save video" (M8-12): a video that uses free pictures or sounds "with credit" must credit
// them where it is posted. The assistant's free-media tool (agents/tools/freeMedia.mjs) keeps each file's record in
// `assets/free-media/ledger.json`; this reads it back for the page, as plain one-line credits, only for the files
// that need one. Nothing here writes, and a missing or unreadable ledger is simply "no credits needed".
import fs from "node:fs";
import path from "node:path";

const MAX_LINES = 50;

const oneLine = (text, max = 400) => String(text ?? "").replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ").trim().slice(0, max);

/** The credit lines this video needs, ready to paste under it where it is posted. */
export function creditsNeeded(dir) {
  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(path.join(dir, "assets", "free-media", "ledger.json"), "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(ledger)) return [];
  return ledger.filter((record) => record?.license === "by").slice(0, MAX_LINES).map((record) => {
    const credit = oneLine(record.attribution) || `"${oneLine(record.title, 120)}" by ${oneLine(record.creator, 120)}`;
    const page = /^https:\/\/[^\s]+$/.test(String(record.page ?? "")) ? ` ${record.page}` : "";
    return `${credit}${page}`;
  });
}
