import { h } from "./dom.js";
import { t } from "./words.js";

// The two questions Home's "⋯" menu asks before it changes a video (M1-10): its new name, and whether to move it to
// the Recycle Bin. Each is a small dialog in the same family as the editing buttons' (styles.css, .edit-action-dialog)
// that resolves when the person has answered. The main process checks everything again; these only ask.

/** The longest name a video may have, in letters. main/videoManage.js refuses a longer one with a sentence. */
const MAX_NAME = 80;

/** Shows `dialog` and resolves with whatever `answer()` holds when it closes. `focus` is the control to start on. */
function ask(dialog, focus, answer) {
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(answer());
    });
    document.body.append(dialog);
    dialog.showModal();
    focus.focus();
  });
}

/** Ask for a video's new name, starting from its current one. Resolves to the name typed, or null (cancelled). */
export function askVideoName(current) {
  let answer = null;
  const field = h("input", {
    class: "field", id: "rename-field", type: "text", value: current, maxlength: String(MAX_NAME),
    autocomplete: "off", spellcheck: "false",
  });
  const ok = h("button", { class: "primary", type: "submit" }, t("OK"));
  const cancel = h("button", { class: "secondary", type: "button", onclick: () => dialog.close() }, t("Cancel"));
  field.addEventListener("input", () => { ok.disabled = !field.value.trim(); });
  const form = h("form", {
    class: "video-form",
    onsubmit: (event) => {
      event.preventDefault();
      const name = field.value.trim();
      if (!name) return;
      answer = name;
      dialog.close();
    },
  },
  h("label", { for: "rename-field" }, t("Name of the video")),
  field,
  h("div", { class: "notice-actions" }, cancel, ok));
  const dialog = h("dialog", { class: "edit-action-dialog video-dialog", "aria-labelledby": "video-dialog-title" },
    h("h2", { id: "video-dialog-title" }, t("Rename this video")), form);
  const shown = ask(dialog, field, () => answer);
  field.select();
  return shown;
}

/**
 * Ask whether to move a video to the Recycle Bin. Names the video and its folder, and says where it goes.
 * Resolves true only for the person's yes; the button that is already pressed when the box opens is "Cancel".
 */
export function askTrash(project) {
  let yes = false;
  const cancel = h("button", { class: "secondary", type: "button", onclick: () => dialog.close() }, t("Cancel"));
  const go = h("button", { class: "primary danger", type: "button", onclick: () => { yes = true; dialog.close(); } },
    t("Move to the Recycle Bin"));
  const dialog = h("dialog", {
    class: "edit-action-dialog video-dialog", "aria-labelledby": "video-dialog-title",
    "aria-describedby": "video-dialog-about",
  },
  h("h2", { id: "video-dialog-title" }, t("Move “{name}” to the Recycle Bin?", { name: project.name })),
  h("p", { class: "video-dialog-path", title: project.dir }, project.dir),
  h("p", { id: "video-dialog-about" }, t("It goes to the Recycle Bin; you can restore it from there.")),
  h("div", { class: "notice-actions" }, cancel, go));
  return ask(dialog, cancel, () => yes);
}
