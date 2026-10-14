// Home's picture of each video (M14-07): the box the page may capture, and pictures too dark to keep.
import assert from "node:assert/strict";
import { test } from "node:test";
import { captureBox, isDark } from "../src/main/covers.js";

const WINDOW = { width: 1440, height: 900 };

test("the box to capture is kept inside the window", () => {
  assert.deepEqual(captureBox({ x: 24.4, y: 103, width: 1018, height: 643 }, WINDOW),
    { x: 24, y: 103, width: 1018, height: 643 });
  assert.deepEqual(captureBox({ x: -50, y: 800, width: 400, height: 400 }, WINDOW),
    { x: 0, y: 800, width: 350, height: 100 });
});

test("a box that is not numbers, too small, or outside the window is refused", () => {
  assert.equal(captureBox({ x: "a", y: 0, width: 10, height: 10 }, WINDOW), null);
  assert.equal(captureBox({ x: 0, y: 0, width: 20, height: 400 }, WINDOW), null);
  assert.equal(captureBox({ x: 2000, y: 0, width: 400, height: 400 }, WINDOW), null);
  assert.equal(captureBox(null, WINDOW), null);
});

test("a nearly black picture is not kept as the video's picture", () => {
  const pixels = (value) => Buffer.alloc(480 * 270 * 4, value);
  assert.equal(isDark(pixels(4)), true);
  assert.equal(isDark(pixels(90)), false);
  assert.equal(isDark(Buffer.alloc(0)), true);
});
