// The decisions behind the footage study: what counts as footage, which frames are shown, how words become
// lines, and which speech engine is used for which language.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseEngine,
  clock,
  isCurrent,
  kindOf,
  knownLanguage,
  LANGUAGES,
  mayHoldFootage,
  parakeetSpeaks,
  phrasesFrom,
  sheetPlan,
  shortPictureNote,
  slugFor,
  streamLengths,
  STUDY_VERSION,
  transcriptText,
} from "../src/main/studyPlan.js";

test("video and sound are footage, whatever the case of the ending; pictures and pages are not", () => {
  assert.equal(kindOf("assets/Interview.MP4"), "video");
  assert.equal(kindOf("voice.wav"), "audio");
  assert.equal(kindOf("index.html"), null);
  assert.equal(kindOf("assets/logo.png"), null);
});

test("renders, tool folders and hidden folders are never searched for footage", () => {
  for (const name of ["renders", "node_modules", ".hyperframes", ".git", "Snapshots"]) assert.equal(mayHoldFootage(name), false, name);
  assert.equal(mayHoldFootage("assets"), true);
});

test("a clip's folder name is readable where it can be and always its own", () => {
  assert.match(slugFor("assets/Interview take 2.mp4"), /^interview-take-2-[0-9a-f]{8}$/);
  // A name with no Latin letters still gets a folder, and two such names get different ones.
  const telugu = slugFor("assets/వంటకం.mp4");
  assert.match(telugu, /^clip-[0-9a-f]{8}$/);
  assert.notEqual(telugu, slugFor("assets/रसोई.mp4"));
  // The same name in two folders is two clips. Windows ignores case, so two spellings are one.
  assert.notEqual(slugFor("day1/clip.mp4"), slugFor("day2/clip.mp4"));
  assert.equal(slugFor("Assets\\Clip.MP4"), slugFor("assets/clip.mp4"));
});

test("a study is current until the file, the chosen language or the study's own shape changes", () => {
  const found = { size: 10, modifiedMs: 1000.4, spoken: "auto" };
  const entry = { version: STUDY_VERSION, source: { size: 10, modifiedMs: 1000 }, spoken: "auto" };
  assert.equal(isCurrent(entry, found), true);
  assert.equal(isCurrent(entry, { ...found, size: 11 }), false);
  assert.equal(isCurrent(entry, { ...found, modifiedMs: 2000 }), false);
  assert.equal(isCurrent(entry, { ...found, spoken: "hi" }), false);
  assert.equal(isCurrent({ ...entry, version: STUDY_VERSION - 1 }, found), false);
  assert.equal(isCurrent(undefined, found), false);
});

test("a short clip gets a frame every two seconds or so, never fewer than six", () => {
  const [sheet] = sheetPlan(6);
  assert.equal(sheet.times.length, 6);
  assert.deepEqual(sheet.times, [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]);
  assert.deepEqual([sheet.columns, sheet.rows], [4, 2]);
  assert.equal(sheetPlan(40)[0].times.length, 20);
});

test("a very short clip gets what it has, and no clip at all gets nothing", () => {
  assert.equal(sheetPlan(1)[0].times.length, 2);
  assert.equal(sheetPlan(0.2)[0].times.length, 1);
  assert.deepEqual(sheetPlan(0), []);
  assert.deepEqual(sheetPlan(Number.NaN), []);
});

test("an hour of footage gets four full sheets, frames further apart, all inside the clip", () => {
  const sheets = sheetPlan(3600);
  assert.equal(sheets.length, 4);
  assert.ok(sheets.every((sheet) => sheet.times.length === 24 && sheet.columns === 4 && sheet.rows === 6));
  const times = sheets.flatMap((sheet) => sheet.times);
  assert.ok(times[0] > 0 && times.at(-1) < 3600);
  assert.ok(times.every((time, i) => i === 0 || time > times[i - 1]), "in order");
});

test("times read the same in the transcript and on the frames", () => {
  assert.equal(clock(0), "0:00.0");
  assert.equal(clock(75.25), "1:15.3");
  assert.equal(clock(59.96), "1:00.0");
  assert.equal(clock(3723), "1:02:03.0");
});

const word = (text, start, end) => ({ id: `w${start}`, text, start, end });

test("words become lines that end at a sentence, a pause or a sensible length", () => {
  const words = [
    word("Welcome", 0, 0.4), word("to", 0.4, 0.5), word("the", 0.5, 0.6), word("tour.", 0.6, 1.1),
    word("First", 1.2, 1.5), word("we", 1.5, 1.6), word("mix", 1.6, 1.9),
    word("then", 3.5, 3.8), word("rest", 3.8, 4.2),
  ];
  const phrases = phrasesFrom(words);
  assert.deepEqual(phrases.map((phrase) => phrase.text), ["Welcome to the tour.", "First we mix", "then rest"]);
  assert.deepEqual([phrases[1].start, phrases[1].end], [1.2, 1.9]);
  assert.equal(transcriptText(phrases).split("\n")[0], "[0:00.0 - 0:01.1] Welcome to the tour.");
});

test("a long run with no pause is still broken into lines; Hindi's full stop ends a line too", () => {
  const run = Array.from({ length: 30 }, (_, i) => word(`w${i}`, i * 0.3, i * 0.3 + 0.3));
  assert.deepEqual(phrasesFrom(run).map((phrase) => phrase.text.split(" ").length), [14, 14, 2]);
  // A sentence that ends just past the usual length is kept whole instead of leaving one word on its own line.
  const nearly = Array.from({ length: 16 }, (_, i) => word(i === 15 ? "end." : `w${i}`, i * 0.3, i * 0.3 + 0.3));
  assert.equal(phrasesFrom(nearly).length, 1);
  const hindi = [word("नमस्ते", 0, 0.5), word("दोस्तों।", 0.5, 1), word("आज", 1, 1.3)];
  assert.equal(phrasesFrom(hindi).length, 2);
  assert.deepEqual(phrasesFrom([]), []);
});

test("the language menu offers each language once, by a code Whisper takes", () => {
  const ids = LANGUAGES.map((language) => language.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.equal(knownLanguage(id), id);
  assert.ok(ids.includes("hi") && ids.includes("te") && ids.includes("en"));
});

test("a language code is only ever a few letters, because it ends up on a command line", () => {
  assert.equal(knownLanguage("HI"), "hi");
  assert.equal(knownLanguage("auto"), null);
  assert.equal(knownLanguage(null), null);
  assert.throws(() => knownLanguage("hi --model x"));
  assert.throws(() => knownLanguage("../x"));
});

test("Parakeet is used for the languages it speaks, Whisper for the rest", () => {
  assert.equal(parakeetSpeaks("pt-BR"), true);
  assert.equal(parakeetSpeaks("hi"), false);
  assert.equal(chooseEngine({ language: "es", parakeet: true, whisper: true }).engine, "parakeet");
  const hindi = chooseEngine({ language: "hi", parakeet: true, whisper: true });
  assert.equal(hindi.engine, "whisper");
  assert.deepEqual(hindi.args.slice(-2), ["--language", "hi"]);
  assert.equal(hindi.sure, true);
  assert.equal(chooseEngine({ language: "es", parakeet: false, whisper: true }).engine, "whisper");
});

test("a language no installed engine speaks gets a plain reason, not a wrong transcript", () => {
  const hindi = chooseEngine({ language: "hi", parakeet: true, whisper: false });
  assert.equal(hindi.engine, null);
  assert.match(hindi.problem, /Whisper speech engine/);
  assert.match(chooseEngine({ language: "en", parakeet: false, whisper: false }).problem, /No speech engine/);
});

test("with the language left to the app, Parakeet's transcript is marked as a guess", () => {
  const guess = chooseEngine({ language: null, parakeet: true, whisper: false });
  assert.equal(guess.engine, "parakeet");
  assert.equal(guess.sure, false);
  // Whisper alone detects the language itself, so it is not a guess.
  const detected = chooseEngine({ language: null, parakeet: false, whisper: true });
  assert.equal(detected.engine, "whisper");
  assert.equal(detected.sure, true);
  assert.ok(!detected.args.includes("--language"));
  assert.equal(chooseEngine({ language: null, parakeet: false, whisper: false }).engine, null);
});

test("a clip's picture and sound are measured apart, because the picture often stops first", () => {
  // The owner's vlog, clip 03: a file of 15 seconds whose picture is 444 frames long.
  const info = { streams: [
    { codec_type: "video", duration: "14.800000", avg_frame_rate: "30/1", nb_frames: "444" },
    { codec_type: "audio", duration: "15.000000" },
  ] };
  assert.deepEqual(streamLengths(info), { pictureSeconds: 14.8, soundSeconds: 15 });
  // WebM gives no length per stream: the frames are counted. A cover picture inside a song is not a video.
  assert.deepEqual(streamLengths({ streams: [{ codec_type: "video", avg_frame_rate: "25/1", nb_frames: "50" }] }),
    { pictureSeconds: 2, soundSeconds: null });
  assert.deepEqual(streamLengths({ streams: [{ codec_type: "video", duration: "9", disposition: { attached_pic: 1 } }] }),
    { pictureSeconds: null, soundSeconds: null });
  assert.deepEqual(streamLengths(null), { pictureSeconds: null, soundSeconds: null });
});

test("a short picture is said in plain words, and a matching one is not mentioned", () => {
  assert.match(shortPictureNote({ seconds: 15.01, pictureSeconds: 14.8 }), /Never play this clip past 14\.8 seconds/);
  assert.equal(shortPictureNote({ seconds: 15, pictureSeconds: 14.97 }), null);
  assert.equal(shortPictureNote({ seconds: 15, pictureSeconds: null }), null);
});
