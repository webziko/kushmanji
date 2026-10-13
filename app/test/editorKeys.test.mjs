// Which key presses in "Edit by hand" become a ten-second skip.
import assert from "node:assert/strict";
import { test } from "node:test";
import { arrowSkip, SKIP_SECONDS } from "../src/main/editorKeys.js";

const down = (key, more = {}) => ({ type: "keyDown", key, ...more });

test("a plain arrow going down skips ten seconds forward or back", () => {
  assert.equal(SKIP_SECONDS, 10);
  assert.equal(arrowSkip(down("ArrowRight")), 10);
  assert.equal(arrowSkip(down("ArrowLeft")), -10);
});

test("the editor keeps every other key: held arrows, Shift for ten frames, shortcuts, the key coming up", () => {
  assert.equal(arrowSkip(down("ArrowRight", { isAutoRepeat: true })), 0);
  for (const held of ["shift", "control", "alt", "meta"]) assert.equal(arrowSkip(down("ArrowRight", { [held]: true })), 0);
  assert.equal(arrowSkip({ type: "keyUp", key: "ArrowRight" }), 0);
  assert.equal(arrowSkip(down("ArrowUp")), 0);
  assert.equal(arrowSkip(down("l")), 0);
  assert.equal(arrowSkip(undefined), 0);
});
