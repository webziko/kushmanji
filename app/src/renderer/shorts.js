// The chat's card for "Make shorts" (M17-04). Step one, the assistant's plan in SHORTS.md, is an ordinary request
// (the editing button). Once the plan is there, this card lists the shorts and offers "Make them"; the app then
// makes each short as its own video (main/shorts.js) and asks the assistant to build them one by one
// (main/shortsMaker.js). The card says how far that has got.
import { h } from "./dom.js";

const api = window.hfwin;

const seconds = (value) => `${Math.round(Number(value) || 0)} s`;
const when = (at) => new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "long" });

export function createShortsCard(dir) {
  const element = h("div", { class: "shorts-card", role: "status", hidden: true });
  let destroyed = false;
  let asking = 0;

  const button = (label, onclick, kind = "primary") =>
    h("button", { class: `${kind} small`, type: "button", onclick }, label);

  async function make() {
    element.replaceChildren(h("p", {}, "Making the videos for your shorts…"));
    try {
      show(await api.shorts.make(dir), null);
    } catch (error) {
      element.replaceChildren(h("p", { class: "shorts-problem" }, error.message));
    }
  }

  function show(status, plan) {
    if (destroyed) return;
    const lines = [];
    if (status?.state === "making") {
      lines.push(h("p", {}, `Making your shorts · short ${status.number} of ${status.total}: “${status.title}”. ` +
        (status.waiting ? "It starts as soon as the assistant is free."
          : "The assistant builds them one by one, a few minutes each. Each one appears in My videos.")));
      lines.push(button("Stop after this one", () => api.shorts.stop().catch(() => {}), "secondary"));
    } else if (status?.state === "done") {
      lines.push(h("p", {},
        `Your ${status.total} shorts are made. Open them from My videos to watch and save each one.`));
    } else if (status?.state === "stopped") {
      lines.push(h("p", { class: "shorts-problem" }, status.error ?? "Making the shorts stopped."));
    } else if (plan?.error) {
      lines.push(h("p", { class: "shorts-problem" }, `The plan for shorts cannot be used yet: ${plan.error} ` +
        "Ask the assistant to fix SHORTS.md."));
    } else if (plan?.made) {
      lines.push(h("p", {}, `These ${plan.shorts.length} shorts were made on ${when(plan.made.at)}. ` +
        "Open them from My videos."));
      lines.push(button("Make them again", make, "secondary"));
    } else if (plan?.shorts?.length) {
      const list = plan.shorts.map((short) => `“${short.title}” (${seconds(short.seconds)})`).join(", ");
      const count = plan.shorts.length === 1 ? "1 short" : `${plan.shorts.length} shorts`;
      lines.push(h("p", {}, `${count} planned: ${list}.`));
      lines.push(h("p", { class: "muted" }, "Each becomes its own video next to this one, in this video's look " +
        "(STYLE.md). The assistant builds them one by one, a few minutes each, using its allowance."));
      lines.push(button("Make them", make));
    }
    element.replaceChildren(...lines);
    element.hidden = lines.length === 0;
  }

  async function refresh() {
    const turn = ++asking;
    const [status, plan] = await Promise.all([
      api.shorts.status(dir).catch(() => null),
      api.shorts.plan(dir).catch((error) => ({ error: error.message })),
    ]);
    if (turn === asking) show(status, plan);
  }

  const stopShorts = api.on("shorts:event", ({ dir: source, status }) => {
    if (source !== dir) return;
    // Once the run is over, the plan's own state (made on a date) says the rest.
    if (status.state === "making") show(status, null);
    else void refresh();
  });
  // A reply may have written or changed SHORTS.md.
  const stopAgent = api.on("agent:event", ({ dir: changed, event }) => {
    if (changed === dir && event.type === "done") void refresh();
  });
  void refresh();

  return {
    element,
    destroy() {
      destroyed = true;
      stopShorts();
      stopAgent();
    },
  };
}
