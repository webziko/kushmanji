import { h } from "./dom.js";

const api = window.hfwin;

/**
 * "Save video": one press makes the video file in the person's Downloads folder. The work is the main process's
 * (`main/exporter.js`); this is the button, the count beside it, and "Show the file" afterwards.
 */
export function createSaveVideo(dir) {
  let state = "idle";
  const status = h("span", { class: "muted save-status", role: "status" });
  const show = h("button", {
    class: "ghost save-show", type: "button", hidden: true, title: "Show the saved video in File Explorer",
    onclick: () => api.save.show().catch(() => {}),
  }, "Show the file");
  const button = h("button", {
    class: "secondary save-video", type: "button",
    title: "Make a video file from your whole video and put it in your Downloads folder.",
    onclick: () => (state === "saving" ? api.save.stop().catch(() => {}) : start()),
  }, "Save video");

  // `data-save` is what the smoke test reads.
  function render(next) {
    state = next?.state ?? "idle";
    document.body.dataset.save = state;
    button.disabled = state === "busy";
    button.textContent = state === "saving" ? "Stop saving" : "Save video";
    show.hidden = state !== "saved";
    status.removeAttribute("title");
    if (state === "saving") status.textContent = `Saving your video… ${next.percent}%`;
    else if (state === "busy") status.textContent = "Another video is being saved.";
    else if (state === "saved") {
      status.textContent = `Saved in Downloads: ${next.name} (${next.megabytes} MB)`;
      // The bar is narrow; the whole name is there on hover.
      status.title = status.textContent;
    }
    else if (state === "stopped") status.textContent = "Saving stopped. No file was kept.";
    else if (state === "failed") {
      status.textContent = next.message;
      if (next.detail) status.title = next.detail;
    } else status.textContent = "";
  }

  async function start() {
    if (state === "saving" || state === "busy") return;
    try {
      render(await api.save.start(dir));
    } catch (error) {
      render({ state: "failed", message: error.message });
    }
  }

  const stopListening = api.on("save:event", ({ dir: changed, status: next }) => {
    if (changed === dir) render(next);
    // Another project's save ending frees this button.
    else if (state === "busy" && next.state !== "saving") render({ state: "idle" });
  });
  api.save.status(dir).then(render).catch(() => {});

  return {
    button, status, show, start,
    destroy() {
      stopListening();
      delete document.body.dataset.save;
    },
  };
}
