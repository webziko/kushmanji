import { h } from "./dom.js";

// A first video from an idea, guided (M7-02). Three quick choices a person can tap, then a request with a shape that
// works for short videos: a hook in the first seconds, the main moment, a turn, and a call to action. "Just make
// it" sends the idea as it was typed.
const QUESTIONS = [
  { id: "length", label: "How long?", choices: [
    ["15 seconds", "about 15 seconds long"], ["30 seconds", "about 30 seconds long"],
    ["1 minute", "about one minute long"], ["Longer", "a few minutes long"]] },
  { id: "shape", label: "Which shape?", choices: [
    ["Wide (YouTube)", "wide, 1920 × 1080, for YouTube"],
    ["Upright (Shorts, Reels)", "upright, 1080 × 1920, for YouTube Shorts, Instagram Reels and TikTok"],
    ["Square", "square, 1080 × 1080"]] },
  { id: "feel", label: "What should it feel like?", choices: [
    ["Cheerful", "cheerful and bright"], ["Calm", "calm and gentle"], ["Bold", "bold and energetic"],
    ["Like a story", "like a short story"]] },
];
const STARTING = { length: 1, shape: 1, feel: 0 };

/** The request for an idea and the picked answers (by index into each question's choices). Exported for tests. */
export function guidedRequest(idea, picked = STARTING) {
  const said = (id) => {
    const question = QUESTIONS.find((item) => item.id === id);
    return question.choices[picked[id] ?? STARTING[id]]?.[1] ?? question.choices[STARTING[id]][1];
  };
  return `${idea.trim()}\n\nMake it ${said("length")}, ${said("shape")}, and ${said("feel")}. ` +
    "Shape it in four parts: a hook in the first two seconds that makes people stay, the main moment that shows " +
    "what it is about, a turn or surprise, and a short call to action at the end. Keep words on screen short and " +
    "easy to read on a phone.";
}

/** Ask the three questions. Resolves to the request to send, the idea alone ("Just make it"), or null (closed). */
export function askGuided(idea) {
  return new Promise((resolve) => {
    const picked = { ...STARTING };
    const rows = QUESTIONS.map((question) => {
      const buttons = question.choices.map(([label], index) => {
        const button = h("button", { class: "chip", type: "button", "aria-pressed": String(index === picked[question.id]) },
          label);
        button.addEventListener("click", () => {
          picked[question.id] = index;
          for (const other of buttons) other.setAttribute("aria-pressed", String(other === button));
        });
        return button;
      });
      return h("fieldset", { class: "guided-row" }, h("legend", {}, question.label), ...buttons);
    });
    let answer = null;
    const make = h("button", { class: "primary", type: "button" }, "Make it");
    const skip = h("button", { class: "ghost", type: "button" }, "Just make it");
    const dialog = h("dialog", { class: "help-dialog guided-dialog", "aria-labelledby": "guided-title" },
      h("h2", { id: "guided-title" }, "A few quick choices"),
      h("p", { class: "muted" }, idea),
      ...rows,
      h("div", { class: "notice-actions" }, skip, make));
    make.addEventListener("click", () => { answer = guidedRequest(idea, picked); dialog.close(); });
    skip.addEventListener("click", () => { answer = idea; dialog.close(); });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(answer);
    });
    document.body.append(dialog);
    dialog.showModal();
    make.focus();
  });
}
