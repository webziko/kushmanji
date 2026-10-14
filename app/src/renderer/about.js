import { h } from "./dom.js";

/**
 * "About Kushmanji" (M14-06): what the app is, whose engine it runs on, and that it is not HeyGen's. HyperFrames'
 * licence asks for the credit; saying "unofficial" plainly is a hard rule of this project (AGENTS.md). Opened from
 * the "unofficial" tag in the header. `info()` gives the versions once the main process has answered.
 */
export function createAbout(info) {
  const versions = h("p", { class: "muted" });
  const close = h("button", { class: "secondary", type: "button" }, "Close");
  const dialog = h("dialog", { class: "help-dialog about-dialog", "aria-labelledby": "about-title" },
    h("h2", { id: "about-title" }, h("img", { class: "about-wordmark", src: "brand/wordmark.svg", alt: "Kushmanji" })),
    h("p", {}, "A free app for making videos by talking to an AI assistant."),
    h("p", {}, "It is built on HyperFrames, the open-source video engine made by HeyGen, used under its Apache 2.0 " +
      "licence. Kushmanji is not made by HeyGen and is not an official HeyGen app."),
    h("p", {}, "The assistants are your own: Claude, ChatGPT and Gemini, each with its own sign-in. Kushmanji keeps " +
      "no passwords and adds no tracking of its own."),
    versions,
    h("div", { class: "notice-actions" }, close));
  close.addEventListener("click", () => dialog.close());
  document.body.append(dialog);
  return {
    show() {
      const known = info();
      versions.textContent = known
        ? `App ${known.appVersion} · HyperFrames ${known.cliVersion} · Electron ${known.electron}`
        : "";
      if (!dialog.open) dialog.showModal();
    },
  };
}
