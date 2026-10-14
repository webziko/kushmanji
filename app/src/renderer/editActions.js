import { h } from "./dom.js";

// Requests use existing chat editing; unavailable automation is explained before a message is prepared.
const ACTIONS = [
  {
    label: "Fix the sound",
    about: "Ask the assistant to even out loud and quiet parts and keep voices clear. " +
      "Taking loud background music out from under a voice needs a cleaning tool this app cannot add yet.",
    request: "Even out the sound in the whole video so voices are clear and the volume stays the same. " +
      "Keep music and clips without speech quieter. Tell me what background noise is left.",
  },
  {
    label: "Add subtitles",
    about: "Subtitles that the app writes by itself are not ready yet. You can give the assistant the words " +
      "and the times to show them. Check the words yourself, especially where the speech is hard to hear.",
    request: "Add easy-to-read subtitles using these words and times: ",
  },
  {
    label: "Make it shorter",
    about: "Ask the assistant to cut out parts where the same thing is said twice, and long quiet gaps. " +
      "The story stays clear, and titles, subtitles and sounds move along with the clips.",
    request: "Make the whole video shorter by cutting out parts where the same thing is said twice, and long " +
      "quiet gaps. Keep every sentence whole and the story clear. Move titles, subtitles and sounds with the clips.",
  },
  {
    label: "Add music",
    about: "Use Add clips to bring in your own music, then ask the assistant to play it under the video. " +
      "Finding music for you and making new music are not ready yet.",
    request: "Use the music I added with Add clips as quiet background music for the whole video. " +
      "Turn it down while someone is speaking. If I have not added any music, ask me to add some first.",
  },
  {
    label: "Change the look",
    about: "Ask the assistant to change the video's colours, fonts and title style. " +
      "Say in your message how you want it to feel.",
    request: "Change the colours, fonts and titles across the whole video, keeping the clips and timing. " +
      "Make it feel: ",
  },
  {
    label: "Add a title",
    about: "Give the assistant the words to put on the screen. While you are watching, the moment you are " +
      "at goes with your message. You can also type a different time.",
    request: "Add a title that says: ",
  },
  {
    label: "Add a voiceover",
    about: "Give the assistant the words to read aloud. The built-in voice is free and is made on your computer.",
    request: "Add a voiceover that says: ",
  },
  {
    label: "Save video",
    about: "Makes one video file from your whole video and puts it in your Downloads folder. It takes a while: " +
      "a four-minute video can take most of an hour. You can keep watching while it works. The assistant " +
      "has to wait until the video is saved.",
    save: true,
  },
];

export function createEditActions({ onDraft, onEdit, onSave }) {
  const title = h("h2", { id: "edit-action-title" });
  const about = h("p", { id: "edit-action-about" });
  const note = h("p", { class: "muted" });
  let chosen;
  const close = h("button", { class: "secondary edit-action-close", type: "button",
    onclick: () => dialog.close() }, "Cancel");
  const use = h("button", { class: "primary edit-action-use", type: "button", onclick: () => {
    dialog.close();
    if (chosen.request) onDraft(chosen.request);
    else if (chosen.save) onSave();
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
        ? "This writes a message for you. You can change it before pressing Send. Sending uses your chosen assistant."
        : action.save ? "Nothing leaves your computer. You can stop saving at any time."
        : "Your chat and message stay with you in the editor.";
      use.textContent = action.request ? "Write the message" : action.save ? "Save video" : "Open the editor";
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
