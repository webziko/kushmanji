import { h } from "./dom.js";
import { t } from "./words.js";

const api = window.hfwin;

// Requests use existing chat editing; unavailable automation is explained before a message is prepared.
// `label` and `about` are what the person reads. `request` goes to the assistant as it is, in English, because it
// names files and formats the assistants rely on, so it is never put through t().
const ACTIONS = [
  {
    label: t("Fix the sound"),
    about: t("Ask the assistant to even out loud and quiet parts and keep voices clear. " +
      "Taking loud background music out from under a voice needs a cleaning tool this app cannot add yet."),
    request: "Even out the sound in the whole video so voices are clear and the volume stays the same. " +
      "Keep music and clips without speech quieter. Tell me what background noise is left.",
  },
  {
    label: t("Add subtitles"),
    about: t("The app writes down what is said in your clips by itself (Review clips shows it). For a language " +
      "other than English or another European one, choose it under Spoken language first. The assistant turns " +
      "the words into subtitles, translated if you ask. Check them yourself, especially where the speech is " +
      "hard to hear."),
    request: "Add easy-to-read subtitles from what is said in the clips, timed by the words in the footage " +
      "study (.hyperframes/study/index.json). Write them in English, translated where the speech is in " +
      "another language. ",
  },
  {
    label: t("Make it shorter"),
    about: t("Ask the assistant to cut out parts where the same thing is said twice, and long quiet gaps. " +
      "The story stays clear, and titles, subtitles and sounds move along with the clips."),
    request: "Make the whole video shorter by cutting out parts where the same thing is said twice, and long " +
      "quiet gaps. Keep every sentence whole and the story clear. Move titles, subtitles and sounds with the clips.",
  },
  {
    // M10-31: the app finds the spots itself (main/tidy.js); the person ticks which go; the assistant cuts them.
    label: t("Tidy my talking"),
    about: t("The app listens to the clips where someone talks and finds long pauses, \"um\"s and words said " +
      "twice. Untick anything you want to keep, and press ▶ to hear a spot first. The assistant then cuts the " +
      "ticked ones."),
    tidy: true,
  },
  {
    label: t("Add music"),
    about: t("Use Add clips to bring in your own music, then ask the assistant to play it under the video. " +
      "Finding music for you and making new music are not ready yet."),
    request: "Use the music I added with Add clips as quiet background music for the whole video. " +
      "Turn it down while someone is speaking. If I have not added any music, ask me to add some first.",
  },
  {
    label: t("Change the look"),
    about: t("Ask the assistant to change the video's colours, fonts and title style. " +
      "Say in your message how you want it to feel."),
    request: "Change the colours, fonts and titles across the whole video, keeping the clips and timing. " +
      "Make it feel: ",
  },
  {
    // M16-15: chosen from pictures, not names. Each picture (styles/<id>.jpg) shows the same words in one style.
    label: t("Pick a style"),
    about: t("Choose how your video should look and move. Each picture shows one style. The assistant then remakes " +
      "your video in the style you pick, keeping its story, words and timing."),
    styles: true,
  },
  {
    label: t("Add a title"),
    about: t("Give the assistant the words to put on the screen. While you are watching, the moment you are " +
      "at goes with your message. You can also type a different time."),
    request: "Add a title that says: ",
  },
  {
    label: t("Add a voiceover"),
    about: t("Give the assistant the words to read aloud. The built-in voice is free and is made on your computer."),
    request: "Add a voiceover that says: ",
  },
  {
    label: t("Make other sizes"),
    about: t("Make copies of this video in other shapes beside this one. " +
      "You can turn them into upright videos for phones or square posts."),
    otherSizes: true,
  },
  {
    // Step one of M17-04: the assistant only plans. The app then makes each short as its own video from the plan
    // (main/shorts.js) and asks for them one by one; the chat shows "Make them" once SHORTS.md is there.
    label: t("Make shorts"),
    about: t("The assistant picks the best moments for two or three upright shorts (for YouTube Shorts and " +
      "Instagram Reels) and writes them down for you to check. Then the app makes each short as its own " +
      "video, all in this video's look. Each short uses your assistant's allowance, like any other request."),
    request: "Pick the best two or three moments of this video for upright shorts of 15 to 40 seconds each. " +
      "Each short tells one small story and starts on its strongest line. Use the footage study " +
      "(.hyperframes/study/index.json) for the clips, the times inside each clip's own file, and the words. " +
      "A good short opens cold on its strongest line, carries one idea, ends on a finished thought and needs " +
      "nothing outside it. Give each short a hook of at most eight words for the first seconds, and each piece a " +
      "layout: fill (crop around the subject), blur (the whole wide picture on a blurred copy of itself), stack " +
      "(two people talking, one above the other) or screen (a screen recording above the presenter). " +
      "Write the plan into SHORTS.md as one json block in this shape: {\"shorts\": [{\"title\": \"four words or " +
      "fewer\", \"hook\": \"a few words\", \"pieces\": [{\"clip\": \"assets/...mp4\", \"from\": 8.0, \"to\": 14.0, " +
      "\"words\": \"what is said\", \"layout\": \"fill\"}]}]}. If this video has no STYLE.md yet, write its look there first (colours, fonts, titles, " +
      "subtitles, the name card and the ending card), so that every short shares it. Do not make the shorts " +
      "yourself. ",
  },
  {
    label: t("Save video"),
    about: t("Makes one video file from your whole video and puts it in your Downloads folder. It takes a while: " +
      "a four-minute video can take most of an hour. You can keep watching while it works. The assistant " +
      "has to wait until the video is saved."),
    save: true,
  },
];

// The styles to pick from, in the order shown. Their written contracts are in main/styles.js under the same ids.
const STYLE_CARDS = [
  { id: "story", name: t("Friendly story"), about: t("A small story with a friendly drawn character") },
  { id: "figure", name: t("Character on a journey"), about: t("A drawn figure walks through a moving world") },
  { id: "words", name: t("Bold words"), about: t("Huge words that move to the beat") },
  { id: "paper", name: t("Paper cut-out"), about: t("Layers of paper, like a pop-up book") },
  { id: "tour", name: t("App or website tour"), about: t("Show an app or website, one step at a time") },
  { id: "shapes", name: t("Bold shapes"), about: t("Big bright circles and squares") },
  { id: "night", name: t("Midnight calm"), about: t("Calm and premium, deep blue with one warm colour") },
  { id: "water", name: t("Watercolour"), about: t("Soft washes that paint themselves") },
  { id: "oil", name: t("Oil painting"), about: t("Thick moving brush strokes, rich colour") },
  { id: "crayon", name: t("Crayon picture book"), about: t("A child's drawing come to life") },
  { id: "chalk", name: t("Chalkboard lesson"), about: t("Chalk that explains, step by step") },
  { id: "pixel", name: t("Pixel game"), about: t("A 16-bit video game world") },
  { id: "news", name: t("News short"), about: t("Big headlines, a ticker, the facts fast") },
  { id: "ink", name: t("Line drawing"), about: t("Hand-drawn lines that draw themselves") },
];

export function createEditActions({ dir, onDraft, onEdit, onSave, onOtherSizes }) {
  const title = h("h2", { id: "edit-action-title" });
  const about = h("p", { id: "edit-action-about" });
  const note = h("p", { class: "muted" });
  const choices = h("div", { class: "size-choices", hidden: true });
  const tidyList = h("div", { class: "tidy-list", hidden: true });
  let chosen;
  let pickedStyle = null;

  const styleCards = STYLE_CARDS.map((style) => h("button", {
    class: "style-card", type: "button", "aria-pressed": "false", "data-style": style.id,
    onclick: () => {
      pickedStyle = style.id;
      for (const card of styleGrid.children) card.setAttribute("aria-pressed", String(card.dataset.style === style.id));
      use.disabled = false;
    },
  }, h("img", { src: `styles/${style.id}.jpg`, alt: "", width: "320", height: "180" }),
  h("span", { class: "style-name" }, style.name), h("span", { class: "style-about muted" }, style.about)));
  const styleGrid = h("div", { class: "style-grid", hidden: true }, styleCards);
  let tidyStop = null;

  const clock = (seconds) => {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  };
  const tidyKind = (item) => item.kind === "pause" ? t("Long pause")
    : item.kind === "filler" ? t("\"{word}\"", { word: item.text })
    : t("\"{word}\" said twice", { word: item.text });

  // Hearing a spot: the watching screen's player jumps to just before it and plays a little past it.
  async function hear(item) {
    clearTimeout(tidyStop);
    const command = (action, value) => api.player.command({ dir, action, value });
    try {
      await command("seek", Math.max(0, item.at - 0.6));
      await command("play");
      tidyStop = setTimeout(() => void command("pause").catch(() => {}), (item.seconds + 1.2) * 1000);
    } catch {
      // The player is still loading: the button simply does nothing this time.
    }
  }

  function tidyTotal() {
    const kept = [...tidyList.querySelectorAll("input:checked")];
    const seconds = kept.reduce((sum, box) => sum + Number(box.dataset.seconds), 0);
    tidyList.querySelector(".tidy-total").textContent =
      t("{count} spots ticked: the video gets {seconds} seconds shorter.", { count: kept.length, seconds: seconds.toFixed(1) });
    use.disabled = kept.length === 0;
  }

  function renderTidy(found) {
    if (found?.needsFfmpeg) {
      tidyList.dataset.state = "ffmpeg";
      tidyList.replaceChildren(h("p", {}, t("This needs FFmpeg. Home's \"Before you start\" can get it with one press.")));
      return;
    }
    const items = Array.isArray(found?.items) ? found.items : [];
    if (items.length === 0) {
      tidyList.dataset.state = "empty";
      tidyList.replaceChildren(h("p", {}, t("No long pauses or \"um\"s were found where someone talks.")));
      return;
    }
    const watching = document.body.dataset.screen !== "edit";
    const rows = items.map((item) => {
      const box = h("input", { type: "checkbox", value: String(item.id), checked: true,
        "data-seconds": String(item.seconds), onchange: tidyTotal });
      const play = h("button", { class: "secondary tidy-hear", type: "button", "aria-label": t("Hear it"),
        disabled: !watching || item.at === null,
        title: watching ? t("Hear it") : t("Go back to Watch video to hear it"), onclick: () => void hear(item) }, "▶");
      return h("li", { class: "tidy-item" }, play,
        h("label", {}, box, h("span", { class: "tidy-what" }, tidyKind(item)),
          h("span", { class: "muted" }, item.at === null ? item.file
            : t("at {time}, {seconds} s", { time: clock(item.at), seconds: item.seconds.toFixed(1) }))));
    });
    tidyList.dataset.state = "done";
    tidyList.replaceChildren(h("p", { class: "tidy-total" }), h("ul", {}, rows));
    tidyTotal();
  }

  const shapeLabels = {
    upright: t("Upright (9:16, for Shorts and Reels)"),
    square: t("Square (1:1)"),
  };

  function renderChoices(shapes) {
    choices.replaceChildren(
      ...shapes.map((shape) => {
        const box = h("input", { type: "checkbox", value: shape, checked: true });
        box.addEventListener("change", () => {
          const selected = choices.querySelectorAll("input:checked").length;
          use.disabled = selected === 0;
        });
        return h("label", { class: "size-choice" }, box, shapeLabels[shape] ?? shape);
      }),
    );
    use.disabled = shapes.length === 0;
  }

  const close = h("button", { class: "secondary edit-action-close", type: "button",
    onclick: () => dialog.close() }, t("Cancel"));
  const use = h("button", { class: "primary edit-action-use", type: "button", onclick: () => {
    dialog.close();
    if (chosen.request) onDraft(chosen.request);
    else if (chosen.styles) {
      if (pickedStyle) void api.styles.use({ dir, id: pickedStyle }).then((made) => onDraft(made.request)).catch(() => {});
    } else if (chosen.tidy) {
      const keep = [...tidyList.querySelectorAll("input:checked")].map((box) => Number(box.value));
      void api.tidy.request({ dir, keep }).then(onDraft).catch(() => {});
    } else if (chosen.save) onSave();
    else if (chosen.otherSizes) {
      const selected = [...choices.querySelectorAll("input:checked")].map((b) => b.value);
      if (selected.length > 0 && onOtherSizes) onOtherSizes(selected);
    } else onEdit();
  } });
  const dialog = h("dialog", { class: "edit-action-dialog", "aria-labelledby": "edit-action-title",
    "aria-describedby": "edit-action-about" },
    title, about, choices, tidyList, styleGrid, note, h("div", { class: "notice-actions" }, close, use),
  );
  dialog.addEventListener("close", () => clearTimeout(tidyStop));
  document.body.append(dialog);
  const buttons = ACTIONS.map((action) => h("button", {
    class: "secondary edit-action", type: "button", onclick: () => {
      chosen = action;
      title.textContent = action.label;
      about.textContent = action.about;
      if (action.otherSizes) {
        choices.hidden = false;
        renderChoices(["upright", "square"]);
        if (dir && api?.sizes?.shapes) {
          void api.sizes.shapes(dir).then((offered) => {
            if (chosen === action && dialog.open && Array.isArray(offered)) {
              renderChoices(offered);
            }
          }).catch(() => {});
        }
      } else {
        choices.hidden = true;
        choices.replaceChildren();
        use.disabled = false;
      }
      tidyList.hidden = !action.tidy;
      styleGrid.hidden = !action.styles;
      if (action.styles) {
        pickedStyle = null;
        for (const card of styleGrid.children) card.setAttribute("aria-pressed", "false");
        use.disabled = true;
      }
      if (action.tidy) {
        use.disabled = true;
        tidyList.dataset.state = "listening";
        tidyList.replaceChildren(h("p", { class: "muted" }, t("Listening to your clips...")));
        if (dir && api?.tidy?.plan) {
          void api.tidy.plan(dir).then((found) => {
            if (chosen === action && dialog.open) renderTidy(found);
          }).catch(() => {
            if (chosen !== action || !dialog.open) return;
            tidyList.dataset.state = "failed";
            tidyList.replaceChildren(h("p", {}, t("The app could not listen to your clips. Try again in a moment.")));
          });
        }
      }
      note.textContent = action.styles
        ? t("This saves the style in your video's STYLE.md and writes a message for you. Sending uses your chosen assistant.")
        : action.tidy
        ? t("This writes a message for you with the ticked spots. Sending uses your chosen assistant.")
        : action.request
        ? t("This writes a message for you. You can change it before pressing Send. Sending uses your chosen assistant.")
        : action.save ? t("Nothing leaves your computer. You can stop saving at any time.")
        : action.otherSizes
          ? t("The new video appears in My videos and opens with a prepared message. Sending uses your chosen assistant.")
          : t("Your chat and message stay with you in the editor.");
      use.textContent = action.styles ? t("Use this style")
        : action.request || action.tidy ? t("Write the message")
        : action.save ? t("Save video")
        : action.otherSizes ? t("Make other sizes") : t("Open the editor");
      dialog.showModal();
    },
  }, action.label));
  return {
    element: h("details", { class: "edit-actions", open: true },
      h("summary", {}, t("Editing buttons")), h("div", { class: "edit-action-grid" }, buttons)),
    setRunning(running) {
      for (const button of buttons) button.disabled = running;
    },
    destroy() { dialog.remove(); },
  };
}
