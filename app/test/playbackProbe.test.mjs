// The playback measurement's arithmetic: what counts as a hold at a join, a frozen ending and a jumping clock.
import assert from "node:assert/strict";
import { test } from "node:test";
import { jumpSummary, jumpTargets, summarise } from "../src/main/playbackProbe.js";

// Two clips of one second each at 10 pictures a second. The first one's picture stops 0.3 seconds early, the
// way the owner's vlog clips did; the second had its first picture drawn at page load, long before its turn.
function recording() {
  const clips = [{ id: "a", start: 0, duration: 1 }, { id: "b", start: 1, duration: 1 }];
  const frames = { a: [], b: [[5, 0]] };
  const samples = [];
  for (let ms = 100; ms <= 2000; ms += 50) {
    const id = ms <= 1000 ? "a" : "b";
    samples.push([ms, ms, [[id, ms % 1000, 4, 0]]]);
  }
  for (let ms = 100; ms <= 700; ms += 100) frames.a.push([ms, ms]);
  for (let ms = 1100; ms <= 2000; ms += 100) frames.b.push([ms, ms - 1000]);
  return { clips, frames, samples, gaps: [[900, 60]], quality: { a: { shown: 7, dropped: 2 } }, visible: "visible" };
}

test("a join is timed from the last moving picture of one clip to the first of the next", () => {
  const run = summarise(recording(), { from: 0, seconds: 2 });
  assert.equal(run.clockSpeed, 1);
  assert.deepEqual(run.playheadJumps, []);
  assert.deepEqual(run.cuts, [{ from: "a", to: "b", at: 1, heldMs: 400 }]);
  const [a, b] = run.perClip;
  assert.equal(a.frozenEndMs, 300);
  assert.equal(a.dropped, 2);
  // The picture drawn at page load is not b's first moving picture, only proof that it was ready.
  assert.equal(b.firstPictureReadyBeforeItsTurn, true);
  assert.equal(b.pictures, 10);
  assert.equal(b.slowStartMs, 50);
  assert.equal(run.pageHitches.over50ms, 1);
});

test("a playhead that is dragged or skips is reported, so a spoiled run is not mistaken for a slow one", () => {
  const spoiled = recording();
  spoiled.samples.push([2050, 9000, []]);
  const run = summarise(spoiled, { from: 0, seconds: 2 });
  assert.deepEqual(run.playheadJumps, [{ afterSeconds: 2.05, from: 2, to: 9 }]);
  assert.equal(run.nothingPlayingMs, 50);
});

test("jumps are summed up by their middle and slowest time, and a jump with no picture is counted apart", () => {
  const got = jumpSummary([{ pictureMs: 300 }, { pictureMs: 100 }, { pictureMs: null }, { pictureMs: 200 }]);
  assert.deepEqual(got, { jumps: 4, middleMs: 200, slowestMs: 300, neverShown: 1 });
  assert.deepEqual(jumpSummary([]), { jumps: 0, middleMs: null, slowestMs: null, neverShown: 0 });
});

test("jump moments spread over the video and stay inside it", () => {
  const at = jumpTargets(270);
  assert.equal(at.length, 8);
  assert.ok(at.every((time) => time > 0 && time < 269.5));
  assert.ok(at.every((time) => Math.abs(time - Math.round(time)) > 0.05), "no jump lands on a whole second");
  assert.ok(jumpTargets(2).every((time) => time < 1.5));
});
