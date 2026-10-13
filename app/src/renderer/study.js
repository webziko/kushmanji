// The strip at the top of the chat that says what the app knows about the project's footage. The app studies
// every clip by itself (see "The study" in docs/ARCHITECTURE.md); this only shows how far it has got, lets the
// person say which language is spoken, and says in plain words when a clip could not be studied.
import { h } from "./dom.js";

const api = window.hfwin;

const STEPS = { reading: "reading it", pictures: "taking still frames", words: "writing down the words" };

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function createStudyBar(dir, { onAsk } = {}) {
  let clips = [];
  let destroyed = false;
  let request = 0;
  const clipPick = h("select", { class: "field", "aria-label": "Clip to review" });
  const content = h("div", { class: "footage-review-content", role: "status" });
  const close = h("button", { class: "secondary", type: "button", onclick: () => review.close() }, "Close");
  const review = h("dialog", { class: "footage-review", "aria-label": "Footage review" },
    h("div", { class: "footage-review-head" }, h("strong", {}, "Your footage"), h("span", { class: "spacer" }), close),
    clipPick, content,
    onAsk && h("button", { class: "primary", type: "button", onclick: () => {
      onAsk(clipPick.value); review.close();
    } }, "Ask the agent about this clip"),
  );
  document.body.append(review);
  async function showClip() {
    const turn = ++request;
    content.textContent = "Loading the saved study…";
    try {
      const clip = await api.study.clip({ dir, file: clipPick.value });
      if (destroyed || turn !== request) return;
      content.replaceChildren(
        h("p", {}, `${Number(clip.seconds ?? 0).toFixed(1)} seconds` +
          (clip.width ? ` · ${clip.width} × ${clip.height}` : "")),
        clip.review && h("p", {}, clip.review),
        ...(clip.images ?? []).map((src, i) => h("img", {
          src, alt: `Timestamped frames from ${clip.file}, sheet ${i + 1}`, loading: "lazy",
        })),
        clip.languageSure === false && h("p", { class: "study-notes" },
          "The spoken language was assumed. These words may be wrong; verify them before captioning."),
        clip.text ? h("pre", {}, clip.text) : h("p", { class: "muted" }, "No readable transcript is available."),
        ...(clip.notes ?? []).map((note) => h("p", { class: "study-notes" }, note)),
      );
    } catch (error) {
      if (!destroyed && turn === request) content.textContent = error.message;
    }
  }
  clipPick.addEventListener("change", showClip);
  const reviewButton = h("button", { class: "ghost small", type: "button", onclick: () => {
    const selected = clipPick.value;
    clipPick.replaceChildren(...clips.map((clip) => h("option", { value: clip.file }, clip.file)));
    if (clips.some((clip) => clip.file === selected)) clipPick.value = selected;
    review.showModal();
    void showClip();
  } }, "Review clips");
  const line = h("span", { class: "study-line" });
  const language = h("select", {
    class: "agent-pick",
    title: "The language spoken in your footage. It decides how the words are written down.",
  });
  const again = h(
    "button",
    {
      class: "ghost small",
      type: "button",
      title: "Study every clip again from the start",
      onclick: () => api.study.run(dir).catch(() => {}),
    },
    "Study again",
  );
  const controls = h("div", { class: "study-controls" },
    h("label", { class: "access muted" }, "Spoken language", language), again, reviewButton);
  const notes = h("ul", { class: "study-notes" });
  const element = h("div", { class: "study", hidden: true }, line, controls, notes);

  // `data-study` is what the smoke test reads: "running", "done", or absent when there is no footage.
  function render(status) {
    clips = status.clips ?? [];
    element.hidden = !status.running && clips.length === 0;
    if (element.hidden) return delete document.body.dataset.study;
    document.body.dataset.study = status.running ? "running" : "done";
    line.classList.toggle("live", status.running);
    line.textContent = status.running
      ? `Studying your footage · clip ${Math.min(status.done + 1, status.total)} of ${status.total}` +
        (status.step ? ` · ${STEPS[status.step] ?? status.step}` : "")
      : `Footage studied · ${count(clips.length, "clip", "clips")}`;
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
        if (!note.startsWith("The language of this clip was assumed")) byNote.set(note, [...(byNote.get(note) ?? []), clip.file]);
      }
    }
    const problems = [...byNote].map(([note, files]) => (files.length === 1 ? `${files[0]}: ${note}` : `${files.length} clips: ${note}`));
    const lines = [
      ...problems.slice(0, 3).map((problem) => h("li", {}, problem)),
      problems.length > 3 && h("li", {}, `…and ${problems.length - 3} more.`),
      guessed &&
        (status.language ?? "auto") === "auto" &&
        h("li", { class: "muted" }, "Not in English or another European language? Choose the spoken language above."),
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
