import { h } from "./dom.js";

const SEEN = "hfwin-help-seen-v1";
const EDITOR_WORDS = [
  ["Inspector", "Change it", "Change the colour, size and words of the thing you clicked."],
  ["Compositions", "Your scenes", "The pieces of your video, including scenes inside other scenes."],
  ["Assets", "My files", "The clips, pictures and sounds in this video."],
  ["Preview", "Your video", "Watch what your video looks like right now."],
  ["Timeline", "Your clips in order", "Longer bars are longer clips; moving one can affect titles and subtitles."],
  ["Design", "Change it", "Adjust the appearance of the thing you clicked."],
  ["Layers", "What is on top of what", "Choose which picture, title or other piece appears in front."],
  ["Catalog", "Ready-made pieces", "Find titles, effects and scenes you can add."],
  ["Variables", "Things you can swap", "Change a name, colour or other value that a scene makes available."],
  ["Lint", "Check for mistakes", "Look for things that could break the video."],
  ["Renders", "Saved videos", "Find video files made by the editor."],
  ["Export", "Save the video", "Make a video file with the editor's own choices. Save video at the top does it in one press."],
  ["Capture", "Save a picture", "Save a still picture of the current frame."],
  ["Code", "Video instructions", "The written instructions behind the video, for people who want to edit them."],
  ["Window", "Arrange the editor", "Choose which editor panels are shown."],
];

const SECTIONS = [
  { id: "home", name: "Starting out", parts: [
    ["Carry on", "Open the video you changed last, just where you left it. It shows once you have a video."],
    ["From my clips", "Press Choose clips to copy your clips into a new video. Your own files are not changed."],
    ["From an idea", "Say what you want and press Make it. This way of starting is still being tested."],
    ["Blank video", "Start an empty video, then add clips or ask for a title."],
    ["Open a folder", "Open a video that is saved in a folder, from Kushmanji or HyperFrames."],
    ["My videos", "Open a video you have already worked on."],
  ] },
  { id: "watch", name: "Watching and asking for changes", parts: [
    ["Your video", "Press Play to watch, or drag the bar to a moment you want to change."],
    ["The chat", "Tell the assistant what to change in your own words, then press Send."],
    ["At 0:42", "The moment beside your message tells the assistant which part you mean."],
    ["Editing buttons", "See what an action can do, then prepare a message you can check before sending."],
    ["Assistant and clip settings", "Choose your assistant, what it may do, and when it asks you first. " +
      "You can also look at what the app saw in your clips."],
    ["Start over", "Start a new conversation with the assistant. Your video is not changed."],
    ["Edit by hand", "Open the full editor to make changes yourself."],
    ["Save video", "Make a video file in your Downloads folder. A long video takes a while; the count shows how far it is."],
  ] },
  { id: "edit", name: "Editing by hand", parts: [
    ...EDITOR_WORDS.map(([word, plain, sentence]) => [`${plain} (${word})`, sentence]),
    ["Arrow keys", "While the video plays, the left and right arrows skip ten seconds and it keeps playing. " +
      "While it is paused, they move one picture at a time."],
  ] },
];

const WALK = [
  ["Start with your clips",
    "At the start, press Choose clips to copy your clips in, or open a video you already have."],
  ["Watch, then ask for a change",
    "Move to the moment you mean, write what you want in the chat, and press Send when you are ready."],
  ["Check the result",
    "Watch the change, then press Save video to make a video file in your Downloads folder. " +
    "Edit by hand opens the full editor."],
];

/** Help changes only the shell page; editor files and the assistant are never involved. */
export function createHelp() {
  let seen = false;
  try { seen = localStorage.getItem(SEEN) === "1"; } catch { /* Help still works without storage. */ }
  let walking = false;
  let step = 0;
  const title = h("h2", { class: "help-title", id: "help-title", tabindex: "-1" });
  const progress = h("p", { class: "help-progress muted", "aria-live": "polite" });
  const content = h("div", { class: "help-content" });
  const footer = h("div", { class: "help-footer" });
  const dialog = h("dialog", { class: "help-dialog", "aria-labelledby": "help-title" },
    h("div", { class: "help-head" }, title, progress), content, footer);
  document.body.append(dialog);
  function remember() {
    seen = true;
    try { localStorage.setItem(SEEN, "1"); } catch { /* Remember for this session instead. */ }
  }
  function close() {
    if (walking) remember();
    dialog.close();
  }
  dialog.addEventListener("close", () => { if (walking) remember(); });

  function walk() {
    walking = true;
    title.textContent = WALK[step][0];
    progress.textContent = `Step ${step + 1} of ${WALK.length}`;
    content.replaceChildren(...[
      h("p", { class: "help-walk-copy" }, WALK[step][1]),
      step === 1 && h("p", { class: "muted" }, "Sending a message uses your chosen assistant's allowance."),
      step === 2 && h("p", { class: "muted" },
        "Saving a long video takes a while. Subtitles that the app writes by itself are not ready yet."),
    ].filter(Boolean));
    footer.replaceChildren(
      h("button", { class: "ghost help-close", type: "button", onclick: close }, "Skip for now"),
      h("span", { class: "spacer" }),
      h("button", { class: "secondary help-back", type: "button", disabled: step === 0,
        onclick: () => { step--; walk(); } }, "Back"),
      h("button", { class: "primary help-next", type: "button", onclick: () => {
        if (step === WALK.length - 1) close();
        else { step++; walk(); }
      } }, step === WALK.length - 1 ? "Start using Kushmanji" : "Next"),
    );
    title.focus();
  }
  function showWalk() {
    step = 0;
    walk();
    if (!dialog.open) dialog.showModal();
    title.focus();
  }
  function showGuide() {
    walking = false;
    title.textContent = "What is what";
    progress.textContent = "A short guide to this screen";
    const current = document.body.dataset.view === "home" ? "home" : document.body.dataset.screen;
    const ordered = [...SECTIONS].sort((a, b) => Number(b.id === current) - Number(a.id === current));
    content.replaceChildren(...ordered.map(({ id, name, parts }) => h("details", {
      class: "help-section", "data-help": id, open: id === current,
    }, h("summary", {}, name), h("dl", {}, parts.map(([name, sentence]) =>
      h("div", {}, h("dt", {}, name), h("dd", {}, sentence)))))));
    footer.replaceChildren(
      h("button", { class: "secondary help-replay", type: "button", onclick: showWalk }, "Show me around"),
      h("span", { class: "spacer" }),
      h("button", { class: "primary help-close", type: "button", onclick: close }, "Close"),
    );
    if (!dialog.open) dialog.showModal();
    title.focus();
  }
  return {
    show: showGuide,
    button: h("button", { class: "secondary help-button", type: "button", onclick: showGuide,
      title: "What is what, and a quick walkthrough" }, "Help"),
    firstTime() { if (!seen && !dialog.open) showWalk(); },
  };
}

/** Keep the original editor intact and put each word beside its plain meaning in a small glossary. */
export function createEditorWords() {
  return h("details", { class: "editor-words", open: true },
    h("summary", {}, "Editor words in plain language"),
    h("dl", {}, EDITOR_WORDS.map(([word, plain]) => h("div", {}, h("dt", {}, word), h("dd", {}, plain)))));
}
