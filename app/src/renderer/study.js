// The strip at the top of the chat that says what the app knows about the video's clips. The app studies
// every clip by itself (see "The study" in docs/ARCHITECTURE.md); this only shows how far it has got, lets the
// person say which language is spoken, and says in plain words when a clip could not be studied. The person
// reads "The app has watched your clips" (docs/UX.md, "The words").
import { h } from "./dom.js";

const api = window.hfwin;

const STEPS = { reading: "opening it", pictures: "taking pictures", words: "writing down what is said" };

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Notes the study writes for the assistants, who read the same file. Nothing for the person to fix, so not shown.
const forAssistants = (note) =>
  note.startsWith("The language of this clip was assumed") || note.startsWith("The picture ends at");

/** "assets/prepared/04.mp4" becomes "04": a clip as the person knows it, with no folders or file ending. */
const clipName = (file) => file.split(/[\\/]/).pop().replace(/\.[^.]+$/, "") || file;

export function createStudyBar(dir, { onAsk } = {}) {
  let clips = [];
  /** Each clip's file, and the name shown for it. Two clips with the same name show their whole path instead. */
  let names = new Map();
  let destroyed = false;
  let request = 0;
  const clipPick = h("select", { class: "field", "aria-label": "Choose a clip" });
  const content = h("div", { class: "footage-review-content", role: "status" });
  const close = h("button", { class: "secondary", type: "button", onclick: () => review.close() }, "Close");
  const review = h("dialog", { class: "footage-review", "aria-label": "Your clips" },
    h("div", { class: "footage-review-head" }, h("strong", {}, "Your clips"), h("span", { class: "spacer" }), close),
    clipPick, content,
    onAsk && h("button", { class: "primary", type: "button", onclick: () => {
      onAsk(clipPick.value); review.close();
    } }, "Ask the assistant about this clip"),
  );
  document.body.append(review);
  async function showClip() {
    const turn = ++request;
    content.textContent = "Loading what the app saw in this clip…";
    try {
      const clip = await api.study.clip({ dir, file: clipPick.value });
      if (destroyed || turn !== request) return;
      // `false` and "" must not reach replaceChildren: it would write them on the page as text.
      content.replaceChildren(...[
        h("p", {}, `${Number(clip.seconds ?? 0).toFixed(1)} seconds` +
          (clip.width ? ` · ${clip.width} × ${clip.height}` : "")),
        clip.review && h("p", {}, clip.review),
        ...(clip.images ?? []).map((src, i) => h("img", {
          src, alt: `Pictures from ${names.get(clip.file) ?? clip.file}, with the time on each (page ${i + 1})`,
          loading: "lazy",
        })),
        clip.languageSure === false && h("p", { class: "study-notes" },
          "The app guessed the spoken language, so what is said below may be wrong. Check it before you use it " +
          "for subtitles."),
        ...(clip.text
          ? [h("strong", {}, "What is said"), h("pre", {}, clip.text)]
          : [h("p", { class: "muted" }, "No words were written down for this clip.")]),
        ...(clip.notes ?? [])
          .filter((note) => !forAssistants(note))
          .map((note) => h("p", { class: "study-notes" }, note)),
      ].filter(Boolean));
    } catch (error) {
      if (!destroyed && turn === request) content.textContent = error.message;
    }
  }
  clipPick.addEventListener("change", showClip);
  const reviewButton = h("button", { class: "ghost small", type: "button", onclick: () => {
    const selected = clipPick.value;
    clipPick.replaceChildren(...clips.map((clip) => h("option", { value: clip.file }, names.get(clip.file))));
    if (clips.some((clip) => clip.file === selected)) clipPick.value = selected;
    review.showModal();
    void showClip();
  } }, "Review clips");
  const line = h("span", { class: "study-line" });
  const language = h("select", {
    class: "agent-pick",
    title: "The language people speak in your clips. The app uses it to write down what is said.",
  });
  const again = h(
    "button",
    {
      class: "ghost small",
      type: "button",
      title: "Watch every clip again from the start",
      onclick: () => api.study.run(dir).catch(() => {}),
    },
    "Watch again",
  );
  const controls = h("div", { class: "study-controls" },
    h("label", { class: "access muted" }, "Spoken language", language), again, reviewButton);
  const notes = h("ul", { class: "study-notes" });
  const element = h("div", { class: "study", hidden: true }, line, controls, notes);

  // `data-study` is what the smoke test reads: "running", "done", or absent when there is no footage.
  function render(status) {
    clips = status.clips ?? [];
    const plain = clips.map((clip) => clipName(clip.file));
    names = new Map(clips.map((clip, i) =>
      [clip.file, plain.filter((name) => name === plain[i]).length > 1 ? clip.file : plain[i]]));
    element.hidden = !status.running && clips.length === 0;
    if (element.hidden) return delete document.body.dataset.study;
    document.body.dataset.study = status.running ? "running" : "done";
    line.classList.toggle("live", status.running);
    line.textContent = status.running
      ? `The app is watching your clips · clip ${Math.min(status.done + 1, status.total)} of ${status.total}` +
        (status.step ? ` · ${STEPS[status.step] ?? status.step}` : "")
      : `The app has watched ${count(clips.length, "clip", "clips")}`;
    controls.hidden = status.running;

    language.replaceChildren(
      h("option", { value: "auto" }, "Automatic"),
      ...(status.languages ?? []).map((item) => h("option", { value: item.id }, item.name)),
    );
    language.value = status.language ?? "auto";

    // What went wrong, said once however many clips it happened to, then one gentle line when a language was
    // assumed. That assumption is right for most people, so it is a hint, not a warning on every clip.
    const guessed = clips.some((clip) => clip.languageSure === false && clip.words > 0);
    const byNote = new Map();
    for (const clip of clips) {
      for (const note of clip.notes) {
        if (!forAssistants(note)) byNote.set(note, [...(byNote.get(note) ?? []), clip.file]);
      }
    }
    const problems = [...byNote].map(([note, files]) =>
      (files.length === 1 ? `“${names.get(files[0])}”: ${note}` : `${files.length} clips: ${note}`));
    const lines = [
      ...problems.slice(0, 3).map((problem) => h("li", {}, problem)),
      problems.length > 3 && h("li", {}, `…and ${problems.length - 3} more.`),
      guessed &&
        (status.language ?? "auto") === "auto" &&
        h("li", { class: "muted" },
          "If the speech is not in English or another European language, choose the spoken language above."),
    ];
    notes.replaceChildren(...lines.filter(Boolean));
    notes.hidden = notes.childElementCount === 0;
  }

  language.addEventListener("change", () => {
    api.study.setLanguage({ dir, language: language.value === "auto" ? null : language.value }).catch(() => {});
  });

  const stopListening = api.on("study:event", ({ dir: studied, status }) => {
    if (studied === dir) render(status);
  });
  api.study.status(dir).then(render).catch(() => {});

  return {
    element,
    destroy() {
      destroyed = true;
      review.remove();
      stopListening();
      delete document.body.dataset.study;
    },
  };
}
