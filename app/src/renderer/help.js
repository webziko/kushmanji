import { h } from "./dom.js";
import { createProblemReport } from "./report.js";
import { t } from "./words.js";

const SEEN = "hfwin-help-seen-v1";
// The editor's own word first (it stays English: the editor is not translated), then the plain word and a sentence.
const EDITOR_WORDS = [
  ["Inspector", t("Change it"), t("Change the colour, size and words of the thing you clicked.")],
  ["Compositions", t("Your scenes"), t("The pieces of your video, including scenes inside other scenes.")],
  ["Assets", t("My files"), t("The clips, pictures and sounds in this video.")],
  ["Preview", t("Your video"), t("Watch what your video looks like right now.")],
  ["Timeline", t("Your clips in order"),
    t("Longer bars are longer clips; moving one can affect titles and subtitles.")],
  ["Design", t("Change it"), t("Adjust the appearance of the thing you clicked.")],
  ["Layers", t("What is on top of what"), t("Choose which picture, title or other piece appears in front.")],
  ["Catalog", t("Ready-made pieces"), t("Find titles, effects and scenes you can add.")],
  ["Variables", t("Things you can swap"),
    t("Change a name, colour or other value that a scene makes available.")],
  ["Lint", t("Check for mistakes"), t("Look for things that could break the video.")],
  ["Renders", t("Saved videos"), t("Find video files made by the editor.")],
  ["Export", t("Save the video"),
    t("Make a video file with the editor's own choices. Save video at the top does it in one press.")],
  ["Capture", t("Save a picture"), t("Save a still picture of the current frame.")],
  ["Code", t("Video instructions"),
    t("The written instructions behind the video, for people who want to edit them.")],
  ["Window", t("Arrange the editor"), t("Choose which editor panels are shown.")],
];

const SECTIONS = [
  { id: "home", name: t("Starting out"), parts: [
    [t("Carry on"),
      t("Open the video you changed last, just where you left it. It shows once you have a video.")],
    [t("From my clips"),
      t("Press Choose clips to copy your clips into a new video. Your own files are not changed.")],
    [t("From an idea"),
      t("Say what you want and press Make it, then pick how long, which shape and what feel.")],
    [t("Blank video"), t("Start an empty video, then add clips or ask for a title.")],
    [t("Open a folder"), t("Open a video that is saved in a folder, from Kushmanji or HyperFrames.")],
    [t("My videos"), t("Open a video you have already worked on.")],
    [t("Before you start"),
      t("Shows only when this computer still needs something, with how to get it.")],
    [t("unofficial"), t("Press it to read what Kushmanji is and whose engine it runs on.")],
    [t("Language"), t("Choose the language the app speaks. It can only be changed on this screen.")],
    [t("Settings"), t("Language, your assistants, room on this computer and the problem report, all in one place.")],
  ] },
  { id: "watch", name: t("Watching and asking for changes"), parts: [
    [t("Your video"), t("Press Play to watch, or drag the bar to a moment you want to change.")],
    [t("The chat"), t("Tell the assistant what to change in your own words, then press Send.")],
    [t("At 0:42"), t("The moment beside your message tells the assistant which part you mean.")],
    ["@", t("Type @ to name a clip, a picture or this moment. " +
      "You can also drop clips from your folders onto the chat.")],
    [t("While it works"),
      t("Keep typing: Send when done waits for the assistant, Stop and send now changes course.")],
    [t("Undo this change"),
      t("Puts back everything the assistant changed in that reply. Bring it back undoes the undo.")],
    [t("Ask ... to check it"),
      t("Another of your assistants looks the change over and lists what is wrong, once.")],
    [t("Checked for mistakes"),
      t("After every change the app looks for mistakes itself, for free, and says what it found.")],
    [t("Editing buttons"),
      t("See what an action can do, then prepare a message you can check before sending.")],
    [t("Assistant and clip settings"), t("Tick the assistants you have, choose one, what it may do, and when it " +
      "asks you first. Auto uses a quicker setting for small changes to save your allowance. Look saves this " +
      "video's colours, fonts and titles under a name, or gives it a saved look. You can also see what the app " +
      "saw in your clips.")],
    [t("Settings"), t("Language, your assistants, room on this computer and the problem report, all in one place.")],
    [t("Start over"), t("Start a new conversation with the assistant. Your video is not changed.")],
    [t("Edit by hand"), t("Open the full editor to make changes yourself.")],
    [t("Save video"), t("Make a video file in your Downloads folder. A long video takes a while; " +
      "the count shows how far it is.")],
  ] },
  { id: "edit", name: t("Editing by hand"), parts: [
    ...EDITOR_WORDS.map(([word, plain, sentence]) => [`${plain} (${word})`, sentence]),
    [t("Arrow keys"), t("While the video plays, the left and right arrows skip ten seconds and it keeps playing. " +
      "While it is paused, they move one picture at a time.")],
  ] },
];

const WALK = [
  [t("Start with your clips"),
    t("At the start, press Choose clips to copy your clips in, or open a video you already have.")],
  [t("Watch, then ask for a change"),
    t("Move to the moment you mean, write what you want in the chat, and press Send when you are ready.")],
  [t("Check the result"),
    t("Watch the change, then press Save video to make a video file in your Downloads folder. " +
    "Edit by hand opens the full editor.")],
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
  // The problem report (M9-07): shown in File Explorer, ready to be sent to whoever helps. Nothing private is in it.
  const report = createProblemReport();
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
    progress.textContent = t("Step {number} of {total}", { number: step + 1, total: WALK.length });
    content.replaceChildren(...[
      h("p", { class: "help-walk-copy" }, WALK[step][1]),
      step === 1 && h("p", { class: "muted" }, t("Sending a message uses your chosen assistant's allowance.")),
      step === 2 && h("p", { class: "muted" },
        t("Saving a long video takes a while. For subtitles, the app writes down what is said in your clips; " +
          "check the words before you use them.")),
    ].filter(Boolean));
    footer.replaceChildren(
      h("button", { class: "ghost help-close", type: "button", onclick: close }, t("Skip for now")),
      h("span", { class: "spacer" }),
      h("button", { class: "secondary help-back", type: "button", disabled: step === 0,
        onclick: () => { step--; walk(); } }, t("Back")),
      h("button", { class: "primary help-next", type: "button", onclick: () => {
        if (step === WALK.length - 1) close();
        else { step++; walk(); }
      } }, step === WALK.length - 1 ? t("Start using Kushmanji") : t("Next")),
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
    title.textContent = t("What is what");
    progress.textContent = t("A short guide to this screen");
    const current = document.body.dataset.view === "home" ? "home" : document.body.dataset.screen;
    const ordered = [...SECTIONS].sort((a, b) => Number(b.id === current) - Number(a.id === current));
    content.replaceChildren(...ordered.map(({ id, name, parts }) => h("details", {
      class: "help-section", "data-help": id, open: id === current,
    }, h("summary", {}, name), h("dl", {}, parts.map(([name, sentence]) =>
      h("div", {}, h("dt", {}, name), h("dd", {}, sentence)))))), report.element);
    report.reset();
    footer.replaceChildren(
      h("button", { class: "secondary help-replay", type: "button", onclick: showWalk }, t("Show me around")),
      h("span", { class: "spacer" }),
      h("button", { class: "primary help-close", type: "button", onclick: close }, t("Close")),
    );
    if (!dialog.open) dialog.showModal();
    title.focus();
  }
  return {
    show: showGuide,
    button: h("button", { class: "secondary help-button", type: "button", onclick: showGuide,
      title: t("What is what, and a quick walkthrough") }, t("Help")),
    firstTime() { if (!seen && !dialog.open) showWalk(); },
  };
}

/** Keep the original editor intact and put each word beside its plain meaning in a small glossary. */
export function createEditorWords() {
  return h("details", { class: "editor-words", open: true },
    h("summary", {}, t("Editor words in plain language")),
    h("dl", {}, EDITOR_WORDS.map(([word, plain]) => h("div", {}, h("dt", {}, word), h("dd", {}, plain)))));
}
