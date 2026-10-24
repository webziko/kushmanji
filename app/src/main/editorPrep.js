// "Getting the editor ready" (M16-10). The first time a project opens in "Edit by hand", Studio asks its server for
// the sound pictures of every clip ("waveform" and "peaks", each decoding a clip's whole sound), and for a minute
// or two on the owner's PC every jump took 1 to 5 s (M16-08). Studio's page remembers those pictures: on a six-clip
// project, twelve such requests the first time and none after a reload (measured 2026-10-24). Its filmstrip
// pictures are decoded again on every open, and later opens are not slow, so they are not counted.
//
// Nothing is added to Studio's page. The main process sees the requests the page already makes (the session's
// webRequest events, shared with lightCopies.js) and tells the page while some are running.

const PREPARING = /^\/api\/projects\/([^/]+)\/(?:waveform|peaks)\//;

/** The project a request prepares the editor for, or null. Only the running preview server's own requests. */
export function preparedProject(url, current) {
  try {
    const given = new URL(url);
    if (!current?.serverUrl || given.origin !== current.serverUrl) return null;
    const route = given.pathname.match(PREPARING);
    return route ? decodeURIComponent(route[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Says `{ dir, preparing: true }` once preparing requests have run for `showAfterMs` (a quick one is no news), and
 * `{ dir, preparing: false }` once none has run for `quietMs` (Studio asks in waves). `maxMs` ends a note that a
 * lost request would otherwise keep up for good.
 */
export class EditorPrep {
  #emit;
  #timers;
  #wait;
  #running = new Set();
  #dir = null;
  #shown = false;
  #timer = { show: null, hide: null, max: null };

  constructor({
    emit, showAfterMs = 800, quietMs = 2500, maxMs = 300_000, timers = { set: setTimeout, clear: clearTimeout },
  }) {
    this.#emit = emit;
    this.#timers = timers;
    this.#wait = { show: showAfterMs, hide: quietMs, max: maxMs };
  }

  /** A request is starting. `current` is the running preview's `{ dir, serverUrl, projectName }`. */
  started(details, current) {
    const name = preparedProject(details?.url, current);
    if (!name || name !== current.projectName) return;
    // Another project opened: what was said about the last one no longer holds.
    if (this.#dir !== null && this.#dir !== current.dir) this.reset();
    this.#dir = current.dir;
    this.#running.add(details.id);
    this.#cancel("hide");
    if (!this.#shown && this.#timer.show === null)
      this.#after("show", () => this.#running.size > 0 && this.#say(true));
  }

  /** A request finished, failed or was cancelled. */
  ended(details) {
    if (!this.#running.delete(details?.id) || this.#running.size > 0) return;
    this.#cancel("show");
    if (this.#shown && this.#timer.hide === null)
      this.#after("hide", () => this.#running.size === 0 && this.#say(false));
  }

  /** The editor closed or another project opened: forget the running requests and take the note down. */
  reset() {
    this.#running.clear();
    this.#cancel("show");
    this.#cancel("hide");
    if (this.#shown) this.#say(false);
    this.#dir = null;
  }

  #say(preparing) {
    this.#shown = preparing;
    this.#cancel("max");
    if (preparing) this.#after("max", () => this.reset());
    this.#emit({ dir: this.#dir, preparing });
  }

  #after(which, then) {
    this.#timer[which] = this.#timers.set(() => {
      this.#timer[which] = null;
      then();
    }, this.#wait[which]);
  }

  #cancel(which) {
    if (this.#timer[which] !== null) this.#timers.clear(this.#timer[which]);
    this.#timer[which] = null;
  }
}
