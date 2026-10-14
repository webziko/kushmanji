import { h } from "./dom.js";

const api = window.hfwin;
const clock = (seconds) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** The same video the editor shows, with ordinary playback controls around it. */
export function createPlayer(dir, { onLoading, onReady, onError, onTime, onHelp }) {
  let active = false;
  let source = null;
  let generation = 0;
  let pollTimer;
  let refreshTimer;
  let seekTimer;
  let scrubbing = false;
  let state = { ready: false, time: 0, duration: 0, playing: false, width: 1920, height: 1080 };
  let resumeTime = 0;
  let resumePlaying = false;
  let sound = 1;
  let lastSound = 1;
  const frame = h("iframe", { class: "studio", title: "Your video", tabindex: "-1", "aria-hidden": "true" });
  const note = h("p", { class: "player-note", role: "status" });
  const time = h("span", { class: "player-time" }, "0:00 / 0:00");
  const command = (action, value) => api.player.command({ dir, action, value });

  const control = async (action, value) => {
    if (!active || !state.ready) return;
    const current = generation;
    try {
      const got = await command(action, value);
      if (active && current === generation && got.ready) update(got);
    } catch (error) {
      if (active && current === generation) note.textContent = error.message;
    }
  };
  const toggle = () => control(state.playing ? "pause" : "play");
  const play = h("button", { class: "primary player-play", type: "button", onclick: toggle }, "Play");
  const picture = h("button", {
    class: "player-picture", type: "button", disabled: true, "aria-label": "Play video", onclick: toggle,
  });
  const screen = h("div", { class: "player-screen" }, frame, picture);
  const seek = h("input", {
    class: "player-seek", type: "range", min: "0", max: "0", step: "0.01", value: "0",
    "aria-label": "Playback position",
  });
  const volume = h("input", {
    class: "player-volume", type: "range", min: "0", max: "1", step: "0.05", value: "1",
    "aria-label": "Sound level",
  });
  const setSound = () => {
    volume.value = String(sound);
    mute.textContent = sound === 0 ? "Muted" : "Sound";
    mute.setAttribute("aria-pressed", String(sound === 0));
    mute.setAttribute("aria-label", sound === 0 ? "Restore sound" : "Mute sound");
    void control("volume", sound);
  };
  const mute = h("button", {
    class: "ghost player-mute", type: "button", "aria-label": "Mute sound", "aria-pressed": "false",
    onclick: () => {
      if (sound > 0) { lastSound = sound; sound = 0; }
      else sound = lastSound;
      setSound();
    },
  }, "Sound");
  volume.addEventListener("input", () => {
    sound = Number(volume.value);
    if (sound > 0) lastSound = sound;
    setSound();
  });
  seek.addEventListener("input", () => {
    scrubbing = true;
    clearTimeout(seekTimer);
    time.textContent = `${clock(Number(seek.value))} / ${clock(state.duration)}`;
    seekTimer = setTimeout(async () => {
      await control("seek", Number(seek.value));
      scrubbing = false;
    }, 60);
  });
  const full = h("button", {
    class: "ghost player-fullscreen", type: "button", onclick: async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await element.requestFullscreen();
      } catch { note.textContent = "Full screen did not open. Try again."; }
    },
  }, "Full screen");
  const controls = h("fieldset", { class: "player-controls", "aria-label": "Playback controls", disabled: true },
    h("div", { class: "player-progress" }, seek, time),
    h("div", { class: "player-buttons" },
      h("button", { class: "secondary player-back", type: "button", title: "Go back 10 seconds",
        onclick: () => control("skip", -10) }, "Back 10s"),
      play,
      h("button", { class: "secondary player-forward", type: "button", title: "Skip forward 10 seconds",
        onclick: () => control("skip", 10) }, "Forward 10s"),
      h("span", { class: "spacer" }), mute, volume, full,
    ),
  );
  const element = h("section", { class: "player", "aria-label": "Video player" },
    h("div", { class: "player-heading" }, h("strong", {}, "Your video"),
      h("span", { class: "muted" }, "Space to play · Arrow keys skip 10 seconds"),
      h("button", { class: "secondary player-help", type: "button", onclick: onHelp }, "Help")),
    screen, controls, note,
  );

  function fit() {
    const scale = Math.min(screen.clientWidth / state.width, screen.clientHeight / state.height);
    frame.style.width = `${state.width}px`;
    frame.style.height = `${state.height}px`;
    frame.style.transform = `translate(-50%, -50%) scale(${Math.max(0, scale)})`;
  }
  const size = new ResizeObserver(fit);
  size.observe(screen);

  function update(got) {
    state = got;
    onTime(got.time);
    play.textContent = got.playing ? "Pause" : "Play";
    picture.setAttribute("aria-label", got.playing ? "Pause video" : "Play video");
    seek.max = String(got.duration);
    if (!scrubbing) {
      seek.value = String(got.time);
      time.textContent = `${clock(got.time)} / ${clock(got.duration)}`;
    }
    seek.setAttribute("aria-valuetext", `${clock(got.time)} of ${clock(got.duration)}`);
    fit();
  }

  async function poll(current, deadline, restoring = true) {
    if (!active || current !== generation) return;
    try {
      let got = await command("state");
      if (!active || current !== generation) return;
      if (got.ready) {
        if (restoring) {
          await command("pause");
          got = await command("seek", Math.min(resumeTime, got.duration));
          await command("volume", sound);
          if (resumePlaying && resumeTime < got.duration) got = await command("play");
          if (!active || current !== generation) return;
          controls.disabled = picture.disabled = false;
          note.textContent = "";
          onReady();
        }
        update(got);
        restoring = false;
      } else if (Date.now() >= deadline) {
        onError("The video's picture did not finish loading. Try again.");
        return;
      }
    } catch (error) {
      if (active && current === generation && Date.now() >= deadline) { onError(error.message); return; }
    }
    if (active && current === generation)
      pollTimer = setTimeout(() => poll(current, deadline, restoring), 250);
  }

  function reload() {
    if (!active || !source) return;
    if (state.ready) { resumeTime = state.time; resumePlaying = state.playing; }
    state = { ...state, ready: false };
    onTime(null);
    controls.disabled = picture.disabled = true;
    clearTimeout(pollTimer);
    clearTimeout(seekTimer);
    scrubbing = false;
    generation++;
    note.textContent = "Loading your video…";
    onLoading();
    const url = new URL(source);
    url.searchParams.set("_hfwin", String(generation));
    frame.src = url.href;
  }
  frame.addEventListener("load", () => {
    if (!active || !source) return;
    clearTimeout(pollTimer);
    void poll(++generation, Date.now() + 45_000);
  });
  const refresh = () => {
    clearTimeout(refreshTimer);
    if (active) refreshTimer = setTimeout(reload, 400);
  };
  const unwatch = api.on("preview:changed", ({ dir: changed }) => { if (changed === dir) refresh(); });
  const endTurn = api.on("agent:event", ({ dir: changed, event }) => {
    if (changed === dir && event.type === "done") refresh();
  });
  const keys = (event) => {
    if (!active || !state.ready || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest?.("input, textarea, select, [contenteditable], .chat, dialog[open]")) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      void control("skip", event.key === "ArrowLeft" ? -10 : 10);
    } else if (event.code === "Space" && !event.target.closest?.("button")) {
      event.preventDefault();
      void toggle();
    }
  };
  const fullscreen = () => {
    full.textContent = document.fullscreenElement === element ? "Exit full screen" : "Full screen";
  };
  document.addEventListener("keydown", keys);
  document.addEventListener("fullscreenchange", fullscreen);

  function suspend() {
    if (state.ready) resumeTime = state.time;
    resumePlaying = false;
    state = { ...state, ready: false };
    onTime(null);
    active = false;
    generation++;
    clearTimeout(pollTimer);
    clearTimeout(refreshTimer);
    clearTimeout(seekTimer);
    controls.disabled = picture.disabled = true;
    frame.removeAttribute("src");
  }

  return {
    element,
    open(started) {
      source = `${started.serverUrl}/api/projects/${encodeURIComponent(started.projectName)}/preview`;
      active = true;
      reload();
    },
    suspend,
    destroy() {
      suspend();
      size.disconnect();
      unwatch();
      endTurn();
      document.removeEventListener("keydown", keys);
      document.removeEventListener("fullscreenchange", fullscreen);
    },
  };
}
