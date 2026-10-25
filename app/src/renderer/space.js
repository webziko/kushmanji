import { h } from "./dom.js";
import { t } from "./words.js";

const api = window.hfwin;

/**
 * How much room HyperFrames' undo copies take (M16-09, main/storage.js), and a button that frees what belongs to
 * videos that were deleted. Home's foot and the Settings dialog both show it, with this one piece of code. Asked
 * after the screen is drawn: counting takes a few seconds.
 *
 * `none` is what to say when there is nothing to show (Home says nothing), `failed` when the count could not be made.
 * `working()` says whether an assistant is working on a video: it keeps the undo copies of that video busy, so
 * "Free up" waits (Home has no assistant, so it never waits there). Answers the "Free up" button, or null.
 */
export async function showSpace(line, { none = "", failed = none, working = () => false } = {}) {
  const status = await api.storage.status().catch(() => null);
  if (!line.isConnected) return null;
  if (!status?.historyBytes) {
    line.textContent = status ? none : failed;
    return null;
  }
  const free = h("button", { class: "ghost small", type: "button", disabled: working() },
    t("Free up {amount}", { amount: status.freeable }));
  free.addEventListener("click", async () => {
    if (working()) return;
    if (!confirm(t("Free up to {amount}? This removes the undo copies of videos you have deleted and old picture " +
      "caches. Videos you still have keep theirs.", { amount: status.freeable }))) return;
    free.disabled = true;
    const done = await api.storage.free().catch(() => null);
    line.textContent = done?.freedBytes > 0
      ? t("Freed {amount}.", { amount: done.freed }) : t("Nothing could be freed just now.");
  });
  line.replaceChildren(
    t("Undo copies of your videos take {amount} on this computer.", { amount: status.history }),
    ...(status.freeableBytes > 0
      ? [" ", t("Up to {amount} can be freed (deleted videos, old caches).", { amount: status.freeable }), " ", free]
      : []),
  );
  return status.freeableBytes > 0 ? free : null;
}
