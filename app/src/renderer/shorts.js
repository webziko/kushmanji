// The chat's card for "Make shorts" (M17-04). Step one, the assistant's plan in SHORTS.md, is an ordinary request
// (the editing button). Once the plan is there, this card lists the shorts and offers "Make them"; the app then
// makes each short as its own video (main/shorts.js) and asks the assistant to build them one by one
// (main/shortsMaker.js). The card says how far that has got.
import { h } from "./dom.js";
import { locale, t, tFrom } from "./words.js";

const api = window.hfwin;

const seconds = (value) => t("{count} s", { count: Math.round(Number(value) || 0) });
const when = (at) => new Date(at).toLocaleDateString(locale(), { day: "numeric", month: "long" });

export function createShortsCard(dir) {
  const element = h("div", { class: "shorts-card", role: "status", hidden: true });
  let destroyed = false;
  let asking = 0;

  const button = (label, onclick, kind = "primary") =>
    h("button", { class: `${kind} small`, type: "button", onclick }, label);

  async function make() {
    element.replaceChildren(h("p", {}, t("Making the videos for your shorts…")));
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
      lines.push(h("p", {}, [
        t("Making your shorts · short {number} of {total}: “{title}”.",
          { number: status.number, total: status.total, title: status.title }),
        status.waiting ? t("It starts as soon as the assistant is free.")
          : t("The assistant builds them one by one, a few minutes each. Each one appears in My videos."),
      ].join(" ")));
      lines.push(button(t("Stop after this one"), () => api.shorts.stop().catch(() => {}), "secondary"));
    } else if (status?.state === "done") {
      lines.push(h("p", {},
        t("Your {count} shorts are made. Open them from My videos to watch and save each one.",
          { count: status.total })));
    } else if (status?.state === "stopped") {
      lines.push(h("p", { class: "shorts-problem" },
        status.error != null ? tFrom(status.error) : t("Making the shorts stopped.")));
    } else if (plan?.error) {
      lines.push(h("p", { class: "shorts-problem" }, [
        t("The plan for shorts cannot be used yet: {problem}", { problem: plan.error }),
        t("Ask the assistant to fix SHORTS.md."),
      ].join(" ")));
    } else if (plan?.made) {
      lines.push(h("p", {}, [
        t("These {count} shorts were made on {date}.", { count: plan.shorts.length, date: when(plan.made.at) }),
        t("Open them from My videos."),
      ].join(" ")));
      lines.push(button(t("Make them again"), make, "secondary"));
    } else if (plan?.shorts?.length) {
      const list = plan.shorts.map((short) => `“${short.title}” (${seconds(short.seconds)})`).join(", ");
      lines.push(h("p", {}, plan.shorts.length === 1 ? t("1 short planned: {list}.", { list })
        : t("{count} shorts planned: {list}.", { count: plan.shorts.length, list })));
      lines.push(h("p", { class: "muted" }, t("Each becomes its own video next to this one, in this video's look " +
        "(STYLE.md). The assistant builds them one by one, a few minutes each, using its allowance.")));
      lines.push(button(t("Make them"), make));
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
