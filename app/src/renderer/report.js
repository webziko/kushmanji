import { h } from "./dom.js";
import { t, tFrom } from "./words.js";

/**
 * The problem report (M9-07): shown in File Explorer, ready to be sent to whoever helps. Nothing private is in it
 * (main/log.js). Help's guide and the Settings dialog both end with it. `element` is the block to place, and `reset()`
 * clears the sentence a failed press left under the button.
 */
export function createProblemReport({ className = "help-report" } = {}) {
  const note = h("p", { class: "muted", role: "status" });
  const element = h("div", { class: className },
    h("p", {}, t("If something goes wrong, send this file to whoever helps you. " +
      "It has no messages, words or files in it.")),
    h("button", { class: "secondary help-report-show", type: "button", onclick: () => {
      note.textContent = "";
      window.hfwin.logs.show().catch((error) => { note.textContent = tFrom(error.message); });
    } }, t("Show the problem report")),
    note);
  return { element, reset: () => { note.textContent = ""; } };
}
