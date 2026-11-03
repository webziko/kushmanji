// Keep the computer from going to sleep while Kushmanji is doing a long job for the person (M4-05): saving a video
// (a four-minute video takes most of an hour here) or an assistant working (a big request runs 20 minutes or more).
// A PC that sleeps half way stops the job; the person comes back to nothing. The official HyperFrames app keeps the
// computer awake the same way. Only the system is kept awake: the screen may still turn off, which saves power and
// does not stop the job. Released as soon as no job is running, so an idle Kushmanji never holds the PC awake.

/**
 * `blocker` is Electron's powerSaveBlocker (passed in, so a test can count its calls). `set(reason, on)` turns one
 * reason on or off; the blocker is held while any reason is on.
 */
export class KeepAwake {
  #blocker;
  #reasons = new Set();
  #id = null;

  constructor({ blocker }) {
    this.#blocker = blocker;
  }

  /** The reasons keeping the computer awake right now, for the self-test and the problem report. */
  get reasons() {
    return [...this.#reasons];
  }

  set(reason, on) {
    if (on) this.#reasons.add(reason);
    else this.#reasons.delete(reason);
    try {
      if (this.#reasons.size > 0 && this.#id === null) {
        this.#id = this.#blocker.start("prevent-app-suspension");
      } else if (this.#reasons.size === 0 && this.#id !== null) {
        if (this.#blocker.isStarted(this.#id)) this.#blocker.stop(this.#id);
        this.#id = null;
      }
    } catch {
      // Staying awake is a kindness; a job must never fail because Windows refused it.
    }
  }
}
