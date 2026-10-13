import { h } from "./dom.js";

// Requests use existing chat editing; unavailable automation is explained before a message is prepared.
const ACTIONS = [
  {
    label: "Fix the sound",
    about: "Ask the assistant to balance loud and quiet parts and keep speech clear. " +
      "Removing strong background music from a voice needs a cleaning tool the app cannot set up yet.",
    request: "Balance the sound in the whole video so speech is clear and the volume is even. " +
      "Keep music and clips without speech quieter. Tell me what background noise remains.",
  },
  {
    label: "Add subtitles",
    about: "Automatic subtitles are not ready here yet. You can give the assistant the words and times " +
      "to put on screen. Check the words yourself, especially when speech is unclear.",
    request: "Add easy-to-read subtitles using these words and times: ",
  },
  {
    label: "Make it shorter",
    about: "Ask the assistant to remove repeated takes and long gaps across the video. " +
      "It should keep the story clear and move titles, subtitles and sounds with the clips.",
    request: "Make the whole video shorter by removing repeated takes and long gaps. " +
      "Keep speech complete and the story clear. Move titles, subtitles and sounds with the clips.",
  },
  {
    label: "Add music",
    about: "Use Add footage to bring in your own music file, then ask the assistant to place it under the video. " +
      "Finding stock music and making new music are not available here yet.",
    request: "Use a music file I have added with Add footage as background music for the whole video. " +
      "Keep it quiet under speech. If there is no music file, ask me to add one first.",
  },
  {
    label: "Change the look",
    about: "Ask the assistant to change the video's colours, fonts and title style. " +
      "Describe the feeling you want in the message.",
    request: "Change the colours, fonts and titles across the whole video, keeping the clips and timing. " +
      "Make it feel: ",
  },
  {
    label: "Add a title",
    about: "Give the assistant the words to put on screen. In the watching screen, your current moment " +
      "goes with the message. You can also type a different time.",
    request: "Add a title that says: ",
  },
  {
    label: "Add a voiceover",
    about: "Give the assistant the words to read aloud. The built-in voice is free and made on your computer.",
    request: "Add a voiceover that says: ",
  },
  {
    label: "Save the video",
    about: "One-click saving is not ready yet. The full editor has an Export button for making a video file, " +
      "but its saving choices still need checking on Windows. This button opens that editor.",
  },
];

export function createEditActions({ onDraft, onEdit }) {
  const title = h("h2", { id: "edit-action-title" });
  const about = h("p", { id: "edit-action-about" });
  const note = h("p", { class: "muted" });
  let chosen;
  const close = h("button", { class: "secondary edit-action-close", type: "button",
    onclick: () => dialog.close() }, "Cancel");
  const use = h("button", { class: "primary edit-action-use", type: "button", onclick: () => {
    dialog.close();
    if (chosen.request) onDraft(chosen.request);
    else onEdit();
  } });
  const dialog = h("dialog", { class: "edit-action-dialog", "aria-labelledby": "edit-action-title",
    "aria-describedby": "edit-action-about" },
    title, about, note, h("div", { class: "notice-actions" }, close, use),
  );
  document.body.append(dialog);
  const buttons = ACTIONS.map((action) => h("button", {
    class: "secondary edit-action", type: "button", onclick: () => {
      chosen = action;
      title.textContent = action.label;
      about.textContent = action.about;
      note.textContent = action.request
        ? "This prepares a message. You can change it before pressing Send. Sending uses your chosen assistant."
        : "Your chat and message stay with you in the editor.";
      use.textContent = action.request ? "Write request" : "Open editor";
      dialog.showModal();
    },
  }, action.label));
  return {
    element: h("details", { class: "edit-actions", open: true },
      h("summary", {}, "Editing buttons"), h("div", { class: "edit-action-grid" }, buttons)),
    setRunning(running) {
      for (const button of buttons) button.disabled = running;
    },
    destroy() { dialog.remove(); },
  };
}
