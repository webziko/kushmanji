import { h } from "./dom.js";
import { t, tFrom } from "./words.js";

// What the chat's "Assistant and clip settings" and the Settings dialog both say about the assistants (M7-03): their
// names, what each is good for, the state each is in, the card that gets a missing one installed or signed in, the
// tick that says "I have this one" and the one-small-job test. It lives here once so the two places cannot drift
// apart. The pure parts are unit-tested; the parts that build buttons are covered by the self-test.

// What each assistant is good for, under "Your assistants" (M15-01). Plain, and true of every plan.
export const GOOD_FOR = {
  claude: t("careful editing and planning a whole video"),
  codex: t("editing, and it can make pictures"),
  antigravity: t("editing, and watching many clips without using much"),
};

// Said beside an assistant's name in the menu when it cannot be used yet.
export const STATE_NOTES = {
  "not-installed": t("not on this computer yet"),
  "not-signed-in": t("sign in first"),
  broken: t("will not start"),
};

/** "ChatGPT (Codex)": the plain name first, the maker's own product name beside it so it can be recognised. */
export const menuName = (agent) =>
  agent.label && agent.product && agent.label !== agent.product ? `${agent.label} (${agent.product})` : agent.name;

/**
 * Said on `window` when the Settings dialog has a newer answer about the assistants (a fresh check, or a changed
 * tick). An open chat takes it over, so it does not keep offering an assistant that was just unticked.
 */
export const ASSISTANTS_CHANGED = "kushmanji:assistants";

export function announceAssistants(agents) {
  // Copies, so the chat and the dialog never change each other's list behind its back.
  window.dispatchEvent(new CustomEvent(ASSISTANTS_CHANGED, { detail: { agents: agents.map((agent) => ({ ...agent })) } }));
}

// ---------------------------------------------------------------- "I have this one"

/** The ids that would be ticked if `agent` were set to `on`. An agent with no `inTeam` (an older answer) counts as ticked. */
export const tickedAfter = (agents, agent, on) =>
  agents.filter((item) => (item === agent ? on : item.inTeam !== false)).map((item) => item.id);

/**
 * Tick or untick one assistant. At least one always stays ticked: the chat needs someone to talk to. Answers
 * `{ problem }` with a sentence when it was refused (then nothing changed), or `{ problem: null }` once the main
 * process has kept it and `agents` says so. `setTeam` is the main process's call, given so a test can stand in.
 */
export async function changeTeam(agents, agent, on, setTeam = (ids) => window.hfwin.agent.setTeam(ids)) {
  const ticked = tickedAfter(agents, agent, on);
  if (!ticked.length) return { problem: t("Keep at least one assistant ticked.") };
  try {
    await setTeam(ticked);
  } catch (error) {
    return { problem: tFrom(error.message) };
  }
  for (const item of agents) item.inTeam = ticked.includes(item.id);
  return { problem: null };
}

// ---------------------------------------------------------------- an assistant that cannot be used yet

/** The sentence that says why an assistant cannot be used yet. */
export function fixSentence(agent) {
  const who = menuName(agent);
  return agent.state === "not-installed" ? t("{name} is not on this computer yet.", { name: who })
    : agent.state === "not-signed-in" ? t("{name} needs you to sign in first.", { name: who })
      : t("{name} is on this computer, but it will not start.", { name: who });
}

/** What "Open PowerShell for me" would do: install it, sign in, or nothing (it is ready, or broken in a way it cannot mend). */
export const setupStep = (agent) =>
  agent.state === "not-installed" ? "install" : agent.state === "not-signed-in" ? "signIn" : null;

/** The lines that fix it, as the bridge lists them: the same ones "Open PowerShell for me" runs. */
export function setupCommands(agent) {
  if (agent.state === "not-installed") return [...(agent.install ?? []), ...(agent.signIn ?? [])];
  return agent.state === "not-signed-in" ? (agent.signIn ?? []) : [];
}

/**
 * One press instead of typing (M10-27): the main process opens PowerShell running exactly the lines in
 * `setupCommands`. The button and the sentence under it, or nothing when there is nothing to run.
 */
export function openForMe(agent) {
  const step = setupStep(agent);
  if (!step || !setupCommands(agent).length) return [];
  return [
    h("button", {
      class: "primary small", type: "button",
      onclick: () => window.hfwin.agent.openSetup({ engine: agent.id, step }).catch(() => {}),
    }, t("Open PowerShell for me")),
    h("p", { class: "muted" }, t("A window opens and does it for you. When it has finished, come back here " +
      "and press Check again. To do it yourself instead, open PowerShell (search for it in the Start menu) " +
      "and type the lines below.")),
  ];
}

/** What the assistant's program said when it would not start, for whoever helps. Nothing for any other state. */
export const brokenDetail = (agent) =>
  agent.state === "broken" && agent.detail ? [h("p", { class: "muted" }, agent.detail)] : [];

/** The lines to type, each with a "Copy" beside it. */
export const commandLines = (agent) =>
  setupCommands(agent).map((command) =>
    h("div", { class: "command" },
      h("code", {}, command),
      h("button", { class: "ghost small", type: "button", onclick: () => navigator.clipboard.writeText(command) },
        t("Copy"))));

/** An assistant's state in plain words: ready with its version, or why it cannot be used yet. */
export function stateText(agent) {
  if (agent.state === "ready") {
    return agent.version ? t("Ready · version {version}", { version: agent.version }) : t("Ready");
  }
  return fixSentence(agent);
}

// ---------------------------------------------------------------- "Test it now"

/** Asks first: the test uses a little of the assistant's allowance (M12-03, main/agents/checkup.js). */
export const confirmTest = (name) =>
  confirm(t("Test {name} with one small job? It changes one word in a practice folder and runs one check. " +
    "It takes a minute and uses a little of its allowance. Your videos are not touched.", { name }));

export const testingText = (name) => t("Testing {name}… this takes about a minute.", { name });

/** How the last test of this version went, or "" when there has been none. */
export const lastTestText = (agent) =>
  agent.checkup && agent.checkup.version === agent.version
    ? t("Last test: {said}", { said: tFrom(agent.checkup.said) }) : "";
