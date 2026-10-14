// The window opens where it was left (M1-12), unless that place is no longer on any screen.
import assert from "node:assert/strict";
import { test } from "node:test";
import { placeToOpen } from "../src/main/windowPlace.js";

const laptop = [{ x: 0, y: 0, width: 1920, height: 1040 }];
const withMonitor = [...laptop, { x: 1920, y: 0, width: 2560, height: 1400 }];

test("a saved place on a connected screen is used", () => {
  assert.deepEqual(placeToOpen({ x: 100.4, y: 80, width: 1300, height: 820 }, laptop),
    { x: 100, y: 80, width: 1300, height: 820 });
  assert.deepEqual(placeToOpen({ x: 2100, y: 50, width: 1600, height: 1000 }, withMonitor),
    { x: 2100, y: 50, width: 1600, height: 1000 });
});

test("a place on a monitor that is gone, or too small, or not numbers, gives the default", () => {
  assert.equal(placeToOpen({ x: 2100, y: 50, width: 1600, height: 1000 }, laptop), null);
  assert.equal(placeToOpen({ x: 10, y: 10, width: 500, height: 400 }, laptop), null);
  assert.equal(placeToOpen({ x: "a", y: 0, width: 1200, height: 800 }, laptop), null);
  assert.equal(placeToOpen(undefined, laptop), null);
});
