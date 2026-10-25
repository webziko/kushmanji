import { ASSISTANTS_CHANGED, fixCard, GOOD_FOR, menuName, stateText } from "./assistants.js";
import { h } from "./dom.js";
import { t } from "./words.js";

// Home's "Connect an assistant" (M10-09). A stranger on a fresh PC has no assistant installed or signed in, and until
// now Home said nothing: they found out in a video's chat. When none of the assistants the person ticked can be used,
// Home shows this card in the place of "Before you start", one row for each of the three, with the install or sign-in
// card the chat and the Settings dialog show (assistants.js) and one "Check again". It is added only after the answer
// is in, so Home itself never waits for it. The pure parts are unit-tested; the card is covered by the self-test.

// ---------------------------------------------------------------- what the answer means

/** The assistants the person ticked. An answer with none ticked counts everyone, as the main process does. */
export function team(agents) {
  const ticked = agents.filter((agent) => agent.inTeam !== false);
  return ticked.length ? ticked : agents;
}

/** An answer that says, for every assistant, what state it is in. Anything less asks nothing of the person. */
export const complete = (agents) =>
  Array.isArray(agents) && agents.length > 0 && agents.every((agent) => typeof agent?.state === "string");

/** True when one of the assistants the person ticked can be used. */
export const canMakeVideos = (agents) => complete(agents) && team(agents).some((agent) => agent.state === "ready");

/** True when the person needs to connect one: a complete answer in which none of the ticked ones is ready. */
export const needsConnecting = (agents) => complete(agents) && !canMakeVideos(agents);

/**
 * The card's rows: all three assistants, ticked or not. `said` is the state in the chat's own words; an assistant
 * that works but is not ticked says so, because the card would otherwise appear with a ready row and no way to see
 * why. `needsFix` rows get the install or sign-in card.
 */
export function rows(agents) {
  const mine = new Set(team(agents));
  return agents.map((agent) => ({
    id: agent.id,
    agent,
    name: menuName(agent),
    goodFor: GOOD_FOR[agent.id] ?? "",
    said: agent.state === "ready" && !mine.has(agent)
      ? t("Ready, but not ticked yet. Open Settings and tick “I have this one” beside it.") : stateText(agent),
    needsFix: agent.state !== "ready",
  }));
}

/** The one line that replaces the card once an assistant can be used. */
export function readyLine(agents) {
  const ready = team(agents).filter((agent) => agent.state === "ready");
  return ready.length === 1
    ? t("{name} is ready. You can make a video now.", { name: ready[0].label ?? ready[0].name })
    : t("Your assistants are ready. You can make a video now.");
}

/**
 * Ask once, unless an assistant is working (`working()`), and say what Home should do: nothing (`skipped`, or an
 * answer that is fine, or no answer at all) or show the card. `status` is the main process's call, given so a test
 * can stand in; it starts each tool and takes seconds.
 */
export async function lookAtAssistants({ working = () => false, status }) {
  if (working()) return { skipped: true, show: false, agents: null };
  const agents = await Promise.resolve().then(status).catch(() => null);
  return { skipped: false, show: needsConnecting(agents), agents };
}

// ---------------------------------------------------------------- the card

/** Only the newest card is kept up to date: a new Home visit, or a step of the self-test, takes over. */
let generation = 0;
let unwatch = () => {};

function rowItem(row) {
  const fix = row.needsFix ? fixCard(row.agent) : [];
  return h("li", { class: "connect-assistant", "data-engine": row.id, "data-state": row.agent.state },
    h("div", { class: "connect-who" },
      h("strong", {}, row.name),
      h("span", { class: "muted" }, row.goodFor),
      h("p", { class: "connect-state" }, row.said)),
    fix.length ? h("div", { class: "connect-fix" }, ...fix) : null);
}

/**
 * Fill `box` (Home's hidden section) once the assistants have been asked. `box.dataset.state` says where it is:
 * "checking" while the answer is awaited, then "needed" (the card), "none" (nothing to show), "skipped" (an assistant
 * was working, so nobody was asked) or "ready" (the card, after "Check again" found one). The box stays hidden until
 * there is something to say. Resolves when the first answer is shown.
 */
export async function showConnect(box, { working = () => false, status = () => window.hfwin.agent.status() } = {}) {
  const mine = ++generation;
  unwatch();
  unwatch = () => {};
  box.hidden = true;
  box.dataset.state = "checking";
  box.replaceChildren();
  const found = await lookAtAssistants({ working, status });
  // Home was drawn again, or left, while the tools were starting.
  const live = () => mine === generation && box.isConnected;
  if (!live()) return;
  if (!found.show) {
    box.dataset.state = found.skipped ? "skipped" : "none";
    return;
  }

  let agents = found.agents;
  let checking = false;
  let failed = false;
  const list = h("ul", { class: "connect-list" });
  const problem = h("p", { class: "msg-note error connect-failed", role: "status", hidden: true },
    t("Your assistants could not be checked just now."));
  const again = h("button", { class: "secondary small connect-check", type: "button", onclick: () => void check() },
    t("Check again"));

  function ready() {
    box.dataset.state = "ready";
    box.replaceChildren(h("p", { class: "connect-ready" }, readyLine(agents)));
    unwatch();
    unwatch = () => {};
  }

  function paint() {
    if (canMakeVideos(agents)) return ready();
    list.replaceChildren(...rows(agents).map(rowItem));
    problem.hidden = !failed;
    again.disabled = checking;
    again.textContent = checking ? t("Checking…") : t("Check again");
  }

  /** "Check again": asks every assistant again, so there is one button for the whole card. */
  async function check() {
    if (checking) return;
    checking = true;
    failed = false;
    paint();
    const answer = await Promise.resolve().then(status).catch(() => null);
    if (!live()) return;
    checking = false;
    if (complete(answer)) agents = answer;
    else failed = true;
    paint();
  }

  // The Settings dialog checked the assistants too, or changed which ones are ticked: this card takes it over, so it
  // does not go on asking for an assistant that was just signed in from there.
  const changed = (event) => {
    if (!live()) return unwatch();
    const answer = event.detail?.agents;
    if (!complete(answer)) return;
    agents = answer;
    failed = false;
    paint();
  };
  window.addEventListener(ASSISTANTS_CHANGED, changed);
  unwatch = () => window.removeEventListener(ASSISTANTS_CHANGED, changed);

  box.dataset.state = "needed";
  box.replaceChildren(
    h("h2", {}, t("Connect an assistant")),
    h("p", { class: "connect-about" },
      t("Kushmanji makes your videos with an AI assistant you already pay for (Claude, ChatGPT or Gemini), " +
        "and you need at least one.")),
    list,
    problem,
    again);
  paint();
  box.hidden = false;
}
