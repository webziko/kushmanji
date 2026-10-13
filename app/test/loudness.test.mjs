// The loudness step of "Save video": reading FFmpeg's meter and deciding how much to raise the sound.
import assert from "node:assert/strict";
import { test } from "node:test";
import { gainFor, readLoudness, TARGET_LUFS } from "../src/main/loudness.js";

test("the whole file's loudness is the last figure the meter prints", () => {
  const output = "[Parsed_ebur128_0] t: 1 TARGET:-23 LUFS M: -20.1 S:-120.7 I: -21.3 LUFS LRA: 0\n" +
    "  Integrated loudness:\n    I:         -19.5 LUFS\n    Threshold: -30.2 LUFS\n";
  assert.equal(readLoudness(output), -19.5);
  assert.equal(readLoudness("Output file does not contain any stream"), null);
  // The meter's floor means there was no sound to measure.
  assert.equal(readLoudness("    I:         -70.0 LUFS"), null);
  assert.equal(readLoudness(undefined), null);
});

test("a quiet video is raised to the usual loudness, a loud one lowered, a right one left alone", () => {
  assert.equal(TARGET_LUFS, -14);
  assert.equal(gainFor(-19.5), 5.5);
  assert.equal(gainFor(-10), -4);
  assert.equal(gainFor(-14.3), null);
  assert.equal(gainFor(null), null);
  assert.equal(gainFor(NaN), null);
});

test("a nearly silent video is not turned up until its hiss is the loudest thing in it", () => {
  assert.equal(gainFor(-40), 9);
  assert.equal(gainFor(0), -6);
});
