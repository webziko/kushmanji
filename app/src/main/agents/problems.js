// Plain words for the two other ways a turn stops short (M2-12; the usage limit is limits.js): the assistant was
// signed out in the middle of a job, or the internet went away. Each assistant prints these its own way, often as
// a stack of technical lines; the person needs one sentence and what to do.
import { say } from "../say.js";

const SIGNED_OUT = new RegExp([
  "not logged in", "not signed in", "please (?:log|sign) ?in", "log ?in again", "sign ?in again",
  "invalid (?:api )?key", "authentication (?:failed|error|required)", "\\bunauthori[sz]ed\\b", "\\b401\\b",
  "token (?:has )?expired", "oauth token", "credentials? (?:are |is )?(?:missing|invalid|expired)",
].join("|"), "i");

const OFFLINE = new RegExp([
  "getaddrinfo", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENETUNREACH",
  "network (?:error|is unreachable)", "fetch failed", "socket hang up", "could not resolve host",
  "unable to connect", "no internet", "connection (?:error|refused|reset|timed out)",
].join("|"), "i");

/**
 * `{ kind, said }` for a failed turn whose error is one of these, or null. `name` is the assistant's plain name and
 * `signIn` the command that signs it in again, when it has one.
 */
export function plainProblem({ error }, { name = "The assistant", signIn = "" } = {}) {
  const text = String(error ?? "");
  if (!text) return null;
  if (SIGNED_OUT.test(text)) {
    // Two whole sentences instead of one with a piece added, so each can be translated.
    return { kind: "signed-out", said: signIn
      ? say("{name} is signed out, so it stopped. Sign in again (open PowerShell and run: {command}), then " +
        "send your message again. Anything it changed so far is still in your video, and Undo works as usual.",
      { name, command: signIn })
      : say("{name} is signed out, so it stopped. Sign in again, then send your message again. Anything it " +
        "changed so far is still in your video, and Undo works as usual.", { name }) };
  }
  if (OFFLINE.test(text)) {
    return { kind: "offline", said: say("{name} could not reach the internet, so it stopped. Check the " +
      "connection, then send your message again. Anything it changed so far is still in your video.",
    { name }) };
  }
  return null;
}
