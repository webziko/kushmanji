// "Getting the editor ready" (M16-10): which of Studio's requests count, and when the note goes up and down.
import assert from "node:assert/strict";
import { test } from "node:test";
import { EditorPrep, preparedProject } from "../src/main/editorPrep.js";

const current = { dir: "C:\\Users\\José\\Videos\\Day out", serverUrl: "http://127.0.0.1:48620", projectName: "day out" };
const url = (route) => `${current.serverUrl}/api/projects/day%20out/${route}`;

/** Timers the test moves by hand. */
function clock() {
  let now = 0;
  let next = 1;
  const due = new Map();
  return {
    timers: {
      set: (fn, ms) => { due.set(next, { at: now + ms, fn }); return next++; },
      clear: (id) => due.delete(id),
    },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...due].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= now && due.delete(id)) timer.fn();
      }
    },
  };
}

function watch() {
  const said = [];
  const time = clock();
  const prep = new EditorPrep({ emit: (payload) => said.push(payload), timers: time.timers });
  return { said, time, prep };
}

test("only the sound pictures of the open project's clips count", () => {
  assert.equal(preparedProject(url("waveform/assets/clip-1.mp4"), current), "day out");
  assert.equal(preparedProject(url("peaks/assets/clip%201.mp4"), current), "day out");
  // Filmstrip pictures are decoded on every open, and thumbnails are redrawn after every change.
  assert.equal(preparedProject(url("preview/assets/clip-1.mp4"), current), null);
  assert.equal(preparedProject(url("thumbnail/index.html?t=0"), current), null);
  // Another server, or no editor running.
  assert.equal(preparedProject("http://127.0.0.1:48621/api/projects/day%20out/peaks/a.mp4", current), null);
  assert.equal(preparedProject(url("peaks/a.mp4"), null), null);
  assert.equal(preparedProject("not a url", current), null);
});

test("the note goes up while the clips are prepared and down once Studio has been quiet", () => {
  const { said, time, prep } = watch();
  prep.started({ id: 1, url: url("waveform/assets/a.mp4") }, current);
  prep.started({ id: 2, url: url("peaks/assets/a.mp4") }, current);
  time.advance(800);
  assert.deepEqual(said, [{ dir: current.dir, preparing: true }]);
  prep.ended({ id: 1 });
  prep.ended({ id: 2 });
  time.advance(1000);
  // Studio asks in waves: a new one within the quiet time keeps the note up.
  prep.started({ id: 3, url: url("peaks/assets/b.mp4") }, current);
  prep.ended({ id: 3 });
  time.advance(2499);
  assert.equal(said.length, 1);
  time.advance(1);
  assert.deepEqual(said.at(-1), { dir: current.dir, preparing: false });
});

test("a quick request, as on a later open, is no news", () => {
  const { said, time, prep } = watch();
  prep.started({ id: 1, url: url("peaks/assets/a.mp4") }, current);
  time.advance(300);
  prep.ended({ id: 1 });
  time.advance(10_000);
  assert.deepEqual(said, []);
});

test("closing the video, or opening another, takes the note down", () => {
  const { said, time, prep } = watch();
  prep.started({ id: 1, url: url("peaks/assets/a.mp4") }, current);
  time.advance(900);
  prep.reset();
  assert.deepEqual(said.at(-1), { dir: current.dir, preparing: false });
  prep.started({ id: 2, url: url("peaks/assets/a.mp4") }, current);
  time.advance(900);
  const other = { ...current, dir: "D:\\Other", projectName: "other" };
  prep.started({ id: 3, url: `${current.serverUrl}/api/projects/other/peaks/b.mp4` }, other);
  assert.deepEqual(said.slice(-2), [{ dir: current.dir, preparing: true }, { dir: current.dir, preparing: false }]);
  time.advance(800);
  assert.deepEqual(said.at(-1), { dir: other.dir, preparing: true });
});

test("a request that never ends cannot keep the note up for good", () => {
  const { said, time, prep } = watch();
  prep.started({ id: 1, url: url("peaks/assets/a.mp4") }, current);
  time.advance(800);
  time.advance(300_000);
  assert.deepEqual(said.at(-1), { dir: current.dir, preparing: false });
  // An end that comes after that changes nothing.
  prep.ended({ id: 1 });
  time.advance(5000);
  assert.equal(said.length, 2);
});
