// An assistant that runs out of its plan's usage stops in the middle of a job (M17-06). Seen twice on 2026-10-14:
// Claude Code said "You've hit your session limit" before its own check, and the chat showed only that line,
// so nobody could tell what was half done. Each assistant words it its own way; this recognises them, so the
// chat can say plainly what happened, which files were changed, and offer to carry on with another assistant.

// What each assistant has been seen to say, or documents saying, when its plan's usage is spent. A passing
// "rate limit" from a server is the same to the person: this assistant cannot go on right now.
const LIMIT = new RegExp([
  "hit your (?:session |weekly |daily |usage )?limit",
  "usage limit",
  "session limit",
  "weekly limit",
  "limit reached",
  "rate[ _-]?limit",
  "quota (?:exceeded|exhausted|reached)",
  "exceeded (?:your |the )?(?:current )?quota",
  "resource[ _]exhausted",
  "out of (?:usage|credits)",
  "insufficient[ _]quota",
  "too many requests",
].join("|"), "i");

// "resets 3pm (Europe/London)", "resets at 15:00", "try again in 2 days", "try again at 4:05 PM".
const WHEN = /\b(?:resets?(?: at)?|try again(?: in| at| after)?)\s+([^.\n|·]{1,40})/i;

// Wording that only ever means the plan is spent, never a video about "rate limits".
const SPENT = new RegExp([
  "(?:hit|reached) (?:your|the) (?:session |weekly |daily |usage )?limit",
  "usage limit reached",
  "limit reached\\|\\d{10}",
  "out of (?:usage|credits)",
  "quota (?:exceeded|exhausted)",
  "resource[ _]exhausted",
  "insufficient[ _]quota",
].join("|"), "i");

/**
 * Whether a finished turn was stopped by the assistant's usage limit, and when it says it will work again.
 * `error` is the turn's error and `text` its reply: some assistants put the limit in the reply and end "ok".
 * A turn that ended `ok` counts only when its reply ends saying the plan is spent: an assistant may well write
 * "rate limits" into a title card.
 */
export function usageLimit({ error, text, ok = false } = {}) {
  const reply = String(text ?? "");
  const said = [error ?? "", reply.slice(-400)].join("\n");
  const found = said.match(LIMIT);
  if (!found) return null;
  if (ok && !error && !SPENT.test(reply.slice(-400))) return null;
  // Claude Code's older wording ends in the reset time as seconds since 1970: "usage limit reached|1760000000".
  const epoch = said.match(/limit reached\|(\d{10})\b/i);
  if (epoch) return { resets: new Date(Number(epoch[1]) * 1000).toISOString() };
  const when = said.slice(found.index).match(WHEN) ?? said.match(WHEN);
  return { resets: when ? when[1].trim().replace(/[\s,;:]+$/, "") : null };
}
