// The app checks every reply that changed the video, once (M10-03, with the assistant's own check). HyperFrames'
// `lint` reads the project without a browser in a second or two and uses no assistant's allowance. Its mistakes
// ("errors") go under the reply with a button asking the assistant to fix them; its notes ("warnings") are only
// counted, because some are expected (a soft cross-fade's two clips overlap on purpose).
import { runCli } from "../cli.js";

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
export async function checkTurn(dir) {
  const out = await runCli(["lint", dir, "--json"], { cwd: dir, timeoutMs: 60_000 });
  const text = String(out.stdout ?? "");
  try {
    return summarise(JSON.parse(text.slice(text.indexOf("{"))));
  } catch {
    return null;
  }
}
