// The app checks every reply that changed the video, once (M10-03, with the assistant's own check). HyperFrames'
// `lint` reads the project without a browser in a second or two and uses no assistant's allowance. Its mistakes
// ("errors") go under the reply with a button asking the assistant to fix them; its notes ("warnings") are only
// counted, because some are expected (a soft cross-fade's two clips overlap on purpose).
// We also check sound automation attributes (automationCheck.js, M10-26), because broken automation stops "Save video".
import { runCli } from "../cli.js";
import { checkProjectAutomation } from "./automationCheck.js";

const SHOWN = 5;

/** `lint --json`'s answer in the few fields the chat shows: `{ errors, warnings, mistakes: [{ text, where }] }`. */
export function summarise(answer) {
  if (!answer || typeof answer !== "object") return null;
  const findings = Array.isArray(answer.findings) ? answer.findings : [];
  const mistakes = findings.filter((finding) => finding?.severity === "error").slice(0, SHOWN).map((finding) => ({
    text: String(finding.message ?? "").slice(0, 300),
    where: finding.file ? `${String(finding.file).split(/[\\/]/).pop()}${finding.line ? `, line ${finding.line}` : ""}` : "",
    fix: String(finding.fixHint ?? "").slice(0, 300),
  }));
  return { errors: Number(answer.errorCount) || 0, warnings: Number(answer.warningCount) || 0, mistakes };
}

/** Check the project. Null when the check itself could not run: then the chat says nothing. */
export async function checkTurn(dir, { run = runCli } = {}) {
  const autoMistakes = checkProjectAutomation(dir);
  let lintResult = null;
  try {
    const out = await run(["lint", dir, "--json"], { cwd: dir, timeoutMs: 60_000 });
    const text = String(out?.stdout ?? "");
    const jsonStart = text.indexOf("{");
    if (jsonStart !== -1) {
      lintResult = summarise(JSON.parse(text.slice(jsonStart)));
    }
  } catch {
    lintResult = null;
  }
  // If lint could not run, say nothing unless the automation check found mistakes.
  if (!lintResult) {
    if (autoMistakes.length === 0) return null;
    return { errors: autoMistakes.length, warnings: 0, mistakes: autoMistakes.slice(0, SHOWN) };
  }
  const errors = lintResult.errors + autoMistakes.length;
  const warnings = lintResult.warnings;
  // First, because these stop "Save video": never cut off behind five of lint's notes.
  const mistakes = [...autoMistakes, ...lintResult.mistakes].slice(0, SHOWN);
  return { errors, warnings, mistakes };
}
