// A first video from an idea, guided (M7-02): the request the three choices make.
import assert from "node:assert/strict";
import { test } from "node:test";
import { guidedRequest } from "../src/renderer/guided.js";

test("the starting choices make a 30 second upright cheerful video in four parts", () => {
  const request = guidedRequest("  A day at the beach with my dog  ");
  assert.ok(request.startsWith("A day at the beach with my dog\n\n"));
  assert.match(request, /about 30 seconds long, upright, 1080 × 1920/);
  assert.match(request, /cheerful and bright/);
  assert.match(request, /hook in the first two seconds/);
  assert.match(request, /call to action at the end/);
});

test("each choice changes its part of the request", () => {
  const request = guidedRequest("Bakery intro", { length: 0, shape: 0, feel: 3 });
  assert.match(request, /about 15 seconds long, wide, 1920 × 1080, for YouTube, and like a short story\./);
});
