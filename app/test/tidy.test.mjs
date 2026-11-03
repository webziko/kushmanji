// "Tidy my talking" (M10-31): pauses from the sound, slips from the words, and the request for the assistant.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { clipPlan, keepOnly, levelRange, pausesIn, placeInVideo, slipsIn, tidyPlan, tidyRequest }
  from "../src/main/tidy.js";

// Loudness every 50 ms: talking near -16 dB over a busy background near -41 dB, as on the owner's mall clips.
const talk = (seconds) => Array.from({ length: Math.round(seconds / 0.05) }, (_, i) => -16 - (i % 3));
const hush = (seconds) => Array.from({ length: Math.round(seconds / 0.05) }, (_, i) => -41 + (i % 2));

test("a pause is found against the clip's own background, keeping a breath of air at each side", () => {
  const levels = [...talk(2), ...hush(1.2), ...talk(2), ...hush(0.3), ...talk(1)];
  assert.deepEqual(pausesIn(levels), [{ from: 2.1, to: 3.1 }]);
  const range = levelRange(levels);
  assert.ok(range.floor < -39 && range.speech > -18);
});

test("silence at the very start and end is cut to the word, with no breath kept outside it", () => {
  const levels = [...hush(1), ...talk(2), ...hush(1)];
  assert.deepEqual(pausesIn(levels), [{ from: 0, to: 0.9 }, { from: 3.1, to: 4 }]);
});

test("music, noise or silence with no clear speech gives no pauses at all", () => {
  assert.deepEqual(pausesIn(Array(200).fill(-30)), []);
  assert.deepEqual(pausesIn([]), []);
});

test("'um's in English, Hindi and Kannada, and a word said twice, are found from the words", () => {
  const words = [
    { text: "So", start: 0, end: 0.3 }, { text: "um,", start: 0.3, end: 0.7 }, { text: "I", start: 0.8, end: 0.9 },
    { text: "I", start: 1.0, end: 1.1 }, { text: "made", start: 1.1, end: 1.4 }, { text: "उम्म", start: 2, end: 2.4 },
    { text: "ಅ", start: 3, end: 3.3 }, { text: "cake", start: 3.4, end: 3.8 },
  ];
  assert.deepEqual(slipsIn(words).map(({ kind, text, from }) => [kind, text, from]), [
    ["filler", "um,", 0.3], ["repeat", "I", 0.8], ["filler", "उम्म", 2], ["filler", "ಅ", 3],
  ]);
  assert.deepEqual(slipsIn(null), []);
});

test("a slip inside a pause counts once, as the pause; the list is in time order with each item's seconds", () => {
  const items = clipPlan([{ from: 5, to: 6 }], [{ from: 5.2, to: 5.5, kind: "filler", text: "um" },
    { from: 1, to: 1.4, kind: "filler", text: "uh" }]);
  assert.deepEqual(items.map(({ kind, from, seconds }) => [kind, from, seconds]), [["filler", 1, 0.4], ["pause", 5, 1]]);
});

test("the plan covers only clips where someone talks, and the request names every ticked cut", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kushmanji-tidy-José-"));
  const study = path.join(dir, ".hyperframes", "study");
  fs.mkdirSync(path.join(study, "a"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets"));
  fs.writeFileSync(path.join(dir, "assets", "talk.mp4"), "x");
  fs.writeFileSync(path.join(dir, "assets", "music.m4a"), "x");
  fs.writeFileSync(path.join(dir, "assets", "kannada.mp4"), "x");
  fs.writeFileSync(path.join(dir, "assets", "broll.mp4"), "x");
  fs.writeFileSync(path.join(study, "a", "transcript.json"), JSON.stringify([
    { text: "Hello", start: 0, end: 0.5 }, { text: "um", start: 0.6, end: 0.9 }, { text: "friends", start: 1, end: 1.5 },
  ]));
  fs.writeFileSync(path.join(study, "index.json"), JSON.stringify({ clips: [
    { file: "assets/talk.mp4", hasSound: true, seconds: 5.2,
      transcript: { words: ".hyperframes/study/a/transcript.json", wordCount: 3 } },
    { file: "assets/music.m4a", hasSound: true, seconds: 12, transcript: { words: "x", wordCount: 0 } },
    { file: "assets/kannada.mp4", kind: "video", hasSound: true, seconds: 9, transcript: { wordCount: 0 } },
    { file: "assets/broll.mp4", kind: "video", hasSound: false, seconds: 9 },
  ] }));
  const heard = [];
  const plan = await tidyPlan(dir, { levels: async (file) => {
    heard.push(path.basename(file));
    return [...talk(2), ...hush(1.2), ...talk(2)];
  } });
  assert.deepEqual(heard, ["talk.mp4", "kannada.mp4"]);
  assert.equal(plan.clips.length, 2);
  assert.deepEqual(plan.clips[0].items.map((item) => item.kind), ["filler", "pause"]);
  assert.equal(plan.seconds, 2.3);
  const request = tidyRequest(plan);
  assert.match(request, /assets\/talk\.mp4:\n- 0\.60 to 0\.90 \("um"\)\n- 2\.10 to 3\.10 \(pause\)/);
  assert.match(request, /20 to 30 ms sound fade/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("each spot is placed on the whole video's clock; a spot the video does not use is left out", () => {
  const plan = { clips: [{ file: "assets/talk.mp4", items: [
    { from: 2.1, to: 3.1, kind: "pause", seconds: 1 },
    { from: 9, to: 9.5, kind: "filler", text: "um", seconds: 0.5 },
  ] }] };
  const media = [
    { src: "./assets/talk.mp4", start: 10, duration: 5, mediaStart: 1 },
    { src: "assets/music.m4a", start: 0, duration: 40, mediaStart: 0 },
  ];
  const placed = placeInVideo(plan, media);
  assert.deepEqual(placed.clips[0].items.map(({ id, at }) => [id, at]), [[0, 11.1]]);
  assert.equal(placed.unused, 1);
  assert.equal(placed.seconds, 1);
  const unknown = placeInVideo(plan, null);
  assert.deepEqual(unknown.clips[0].items.map(({ id, at }) => [id, at]), [[0, null], [1, null]]);
  assert.deepEqual(keepOnly(unknown, [1, "0", 7]).clips[0].items.map((item) => item.kind), ["filler"]);
});

test("a pause whose cut would be under 0.4 s is not listed", () => {
  const levels = [...talk(2), ...hush(0.55), ...talk(2), ...hush(0.65), ...talk(1)];
  assert.deepEqual(pausesIn(levels), [{ from: 4.65, to: 5.1 }]);
});
