// Speak instead of typing (M3-06): which speech tool hears the person, and what comes back for the message box.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { hear, MAX_BYTES, recordingBytes, spokenFor, spokenText } from "../src/main/dictation.js";

test("the app's language says which language to listen for; English is left to Parakeet", () => {
  assert.equal(spokenFor("en"), null);
  assert.equal(spokenFor("kn"), "kn");
  assert.equal(spokenFor("hi"), "hi");
  assert.equal(spokenFor("toString"), null);
});

test("only a recording of a sensible size is heard", () => {
  assert.equal(recordingBytes(new Uint8Array(10)).length, 10);
  assert.equal(recordingBytes(new ArrayBuffer(4)).length, 4);
  assert.equal(recordingBytes(new Uint8Array(0)), null);
  assert.equal(recordingBytes(new Uint8Array(MAX_BYTES + 1)), null);
  assert.equal(recordingBytes("not sound"), null);
});

test("the words come back as one line, with stops kept against their word", () => {
  assert.equal(spokenText([{ text: "Make" }, { text: "the" }, { text: " title " }, { text: "bigger" }, { text: "." }]),
    "Make the title bigger.");
  assert.equal(spokenText(null), "");
});

/** A program that "runs": it writes what the real one would, then ends. */
function fakeRun(onTranscribe) {
  const finished = (child) => {
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stderr.setEncoding = () => {};
    child.kill = () => {};
    queueMicrotask(() => child.emit("close", 0));
    return child;
  };
  return {
    spawn: (_ffmpeg, args) => {
      fs.writeFileSync(args.at(-1), "RIFF");
      return finished(new EventEmitter());
    },
    spawnCli: (args) => {
      onTranscribe(args);
      fs.writeFileSync(path.join(args[args.indexOf("--dir") + 1], "transcript.json"),
        JSON.stringify([{ text: "Add", start: 0, end: 0.2 }, { text: "music", start: 0.2, end: 0.6 }]));
      return finished(new EventEmitter());
    },
  };
}

test("a recording is heard by Parakeet in English and Whisper in Kannada, and nothing is left behind", async () => {
  const seen = [];
  const tools = { ffmpeg: "ffmpeg.exe", parakeet: true, whisper: true };
  const english = await hear(new Uint8Array([1, 2, 3]), { pageLanguage: "en", tools, run: fakeRun((args) => seen.push(args)) });
  assert.deepEqual(english, { text: "Add music" });
  const kannada = await hear(new Uint8Array([1, 2, 3]), { pageLanguage: "kn", tools, run: fakeRun((args) => seen.push(args)) });
  assert.deepEqual(kannada, { text: "Add music" });
  assert.deepEqual(seen[0].slice(-2), ["--engine", "parakeet"]);
  assert.deepEqual(seen[1].slice(-4), ["--model", "large-v3", "--language", "kn"]);
  const folders = seen.map((args) => args[args.indexOf("--dir") + 1]);
  assert.ok(folders.every((folder) => !fs.existsSync(folder)), "the recording's folder is deleted");
});

test("without FFmpeg or a speech tool for the language, it says so plainly instead of guessing", async () => {
  const noFfmpeg = await hear(new Uint8Array([1]), { tools: { ffmpeg: null, parakeet: true } });
  assert.match(noFfmpeg.problem, /FFmpeg/);
  const noWhisper = await hear(new Uint8Array([1]), { pageLanguage: "hi", tools: { ffmpeg: "f", parakeet: true, whisper: false } });
  assert.match(noWhisper.problem, /Spoken language/);
  assert.equal(noWhisper.text, "");
});
