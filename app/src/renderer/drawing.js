import { h } from "./dom.js";
import { t, tFrom } from "./words.js";

const api = window.hfwin;

// Drawing on the picture (M3-05). A transparent layer lies exactly over the video's picture on the watching screen
// (not over the dark bars around it); the person marks the place with a coral pen, and "Send to the chat" has the
// main process take a picture of the window there (main/drawings.js), so the frame and the marks are one image in
// the project's `.hyperframes/notes`. Its path goes into the chat's message box, where the person presses Send.
const PEN = "#F4644A";
const PEN_WIDTH = 6;
const MOST_NOTE = 300;

/**
 * The message put in the chat's box. It goes to the assistant as it is, in English, because it names a file the
 * assistant has to open: never put through t(). The path is written exactly as the main process returned it.
 */
export function drawingMessage({ file, when, note }) {
  return `I drew on the picture at ${when} (${file}, my marks are in coral): ${note}`;
}

/**
 * `place()` is the picture's box inside `screen` (left, top, width, height in pixels); `when()` is the moment being
 * watched as "0:42". `onSent({ file, when, note })` hears a saved drawing; `onClosed()` hears the layer going away,
 * however it went, so the player can give its controls back.
 */
export function createDrawing({ dir, screen, status, place, when, onSent, onClosed }) {
  let strokes = [];
  let pen = null;
  let busy = false;
  let waiting = false;
  let opened = 0;
  let open = false;

  const marks = h("canvas", { class: "player-marks", role: "img",
    "aria-label": t("Drawing on the picture. Use a mouse, a pen or a finger.") });
  const layer = h("div", { class: "player-draw-layer", hidden: true }, marks);
  const context = marks.getContext("2d");

  const field = h("input", { class: "field player-draw-note", type: "text", maxlength: String(MOST_NOTE),
    autocomplete: "off", placeholder: t("What should change here?"), "aria-label": t("What should change here?") });
  const undo = h("button", { class: "secondary player-draw-undo", type: "button", onclick: () => {
    strokes.pop();
    paint();
    refresh();
  } }, t("Undo"));
  const clear = h("button", { class: "secondary player-draw-clear", type: "button", onclick: () => {
    strokes = [];
    paint();
    refresh();
  } }, t("Clear"));
  const cancel = h("button", { class: "ghost player-draw-cancel", type: "button", onclick: () => close() }, t("Cancel"));
  const submit = h("button", { class: "primary player-draw-send", type: "submit" }, t("Send to the chat"));
  const bar = h("form", { class: "player-drawbar", "aria-label": t("Draw on the picture"), hidden: true,
    onsubmit: (event) => {
      event.preventDefault();
      void send();
    } },
    field,
    h("div", { class: "player-draw-buttons" }, undo, clear, h("span", { class: "spacer" }), cancel, submit),
  );
  screen.append(layer);

  /** What can be pressed now: nothing to take back or send before the first line. */
  function refresh() {
    undo.disabled = clear.disabled = busy || strokes.length === 0;
    submit.disabled = busy || waiting || strokes.length === 0;
    cancel.disabled = busy;
    field.disabled = busy;
  }

  function style() {
    context.lineWidth = PEN_WIDTH;
    context.lineCap = context.lineJoin = "round";
    context.strokeStyle = context.fillStyle = PEN;
  }

  /** Every line again, from where they are in the picture (0 to 1), so a resized window keeps them in place. */
  function paint() {
    const width = marks.clientWidth;
    const height = marks.clientHeight;
    if (!width || !height) return;
    const ratio = window.devicePixelRatio || 1;
    const wide = Math.round(width * ratio);
    const high = Math.round(height * ratio);
    if (marks.width !== wide || marks.height !== high) {
      marks.width = wide;
      marks.height = high;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    style();
    for (const stroke of strokes) {
      const [first, ...rest] = stroke;
      context.beginPath();
      if (rest.length === 0) {
        context.arc(first.x * width, first.y * height, PEN_WIDTH / 2, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.moveTo(first.x * width, first.y * height);
      for (const point of rest) context.lineTo(point.x * width, point.y * height);
      context.stroke();
    }
  }

  /** Put the layer exactly over the picture. Called whenever the player's size or the picture's shape changes. */
  function layout() {
    if (!open) return;
    const box = place();
    layer.style.left = `${box.left}px`;
    layer.style.top = `${box.top}px`;
    layer.style.width = `${box.width}px`;
    layer.style.height = `${box.height}px`;
    paint();
  }

  const at = (event) => {
    const box = marks.getBoundingClientRect();
    const clamp = (value) => Math.min(1, Math.max(0, value));
    return { x: clamp((event.clientX - box.left) / (box.width || 1)), y: clamp((event.clientY - box.top) / (box.height || 1)) };
  };
  marks.addEventListener("pointerdown", (event) => {
    // One pen at a time (a second finger is ignored), and for a mouse only the left button.
    if (pen !== null || busy || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    try {
      marks.setPointerCapture(event.pointerId);
    } catch { /* a pointer that is no longer there: the lines still follow the events that do arrive */ }
    const stroke = [at(event)];
    strokes.push(stroke);
    pen = { id: event.pointerId, stroke };
    paint();
    refresh();
  });
  marks.addEventListener("pointermove", (event) => {
    if (!pen || event.pointerId !== pen.id) return;
    // A mouse button let go outside the window (or a missed pointerup) must not leave a line following the mouse.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      pen = null;
      return;
    }
    const width = marks.clientWidth;
    const height = marks.clientHeight;
    style();
    const batch = event.getCoalescedEvents?.() ?? [];
    for (const each of batch.length ? batch : [event]) {
      const next = at(each);
      const last = pen.stroke.at(-1);
      // A point closer than a pixel to the last adds nothing but weight.
      if (Math.hypot((next.x - last.x) * width, (next.y - last.y) * height) < 1) continue;
      context.beginPath();
      context.moveTo(last.x * width, last.y * height);
      context.lineTo(next.x * width, next.y * height);
      context.stroke();
      pen.stroke.push(next);
    }
  });
  const lift = (event) => {
    if (pen && event.pointerId === pen.id) pen = null;
  };
  marks.addEventListener("pointerup", lift);
  marks.addEventListener("pointercancel", lift);

  // Escape puts the layer away, unless a window (Help) is open or another part of the page already used the key.
  const keys = (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || busy || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    close();
  };

  async function send() {
    if (!open || busy || waiting || strokes.length === 0) return;
    const mine = opened;
    busy = true;
    refresh();
    status(t("Saving the picture…"));
    // The box is the layer's own: exactly the picture, with the marks on it.
    const box = marks.getBoundingClientRect();
    const sent = { when: when(), note: field.value.trim().slice(0, MOST_NOTE) };
    try {
      const file = await api.notes.saveDrawing({ dir, rect: { x: box.x, y: box.y, width: box.width, height: box.height } });
      if (mine !== opened) return;
      busy = false;
      close();
      onSent({ ...sent, file });
    } catch (error) {
      if (mine !== opened) return;
      busy = false;
      refresh();
      status(tFrom(error.message));
    }
  }

  function close() {
    if (!open) return;
    open = false;
    opened++;
    busy = false;
    pen = null;
    strokes = [];
    field.value = "";
    layer.hidden = bar.hidden = true;
    delete screen.dataset.drawing;
    document.removeEventListener("keydown", keys);
    status("");
    onClosed();
  }

  return {
    bar,
    get active() { return open; },
    /** Lay the layer over the picture and take the pen: the player has already stopped the video. */
    show() {
      if (open) return;
      open = true;
      opened++;
      strokes = [];
      field.value = "";
      layer.hidden = bar.hidden = false;
      screen.dataset.drawing = "true";
      document.addEventListener("keydown", keys);
      layout();
      refresh();
      status(t("Draw on the picture with a mouse, a pen or a finger, then press “Send to the chat”."));
      field.focus();
    },
    close,
    layout,
    /** While the video loads again (the assistant changed it) the picture cannot be taken. */
    wait(on) {
      waiting = on;
      refresh();
    },
  };
}
