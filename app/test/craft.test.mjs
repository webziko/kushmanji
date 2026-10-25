// The editing guide every project carries for whichever assistant cuts next.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { GUIDE, GUIDE_FILE, MOTION_GUIDE, MOTION_GUIDE_FILE, writeGuide } from "../src/main/agents/craft.js";
import { HOUSE_PROMPT } from "../src/main/agents/house.js";

test("a project gets the guide, in its own hidden folder, and an unchanged guide is not rewritten", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin guide é "));
  try {
    writeGuide(dir);
    const file = path.join(dir, GUIDE_FILE);
    assert.equal(fs.readFileSync(file, "utf8"), GUIDE);
    const before = fs.statSync(file).mtimeMs;
    writeGuide(dir);
    assert.equal(fs.statSync(file).mtimeMs, before);
    // An old guide left by an earlier version of the app is replaced.
    fs.writeFileSync(file, "old advice");
    writeGuide(dir);
    assert.equal(fs.readFileSync(file, "utf8"), GUIDE);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a folder that cannot be written to does not stop the project opening", () => {
  assert.doesNotThrow(() => writeGuide(path.join(os.tmpdir(), "hfwin-no-such-drive", "\0bad")));
});

test("every assistant is told where the guide is, by the same path the app writes", () => {
  assert.ok(HOUSE_PROMPT.includes(GUIDE_FILE.split(path.sep).join("/")));
});

test("a project gets the motion guide too, and every assistant is told where it is", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin motion ಕನ್ನಡ "));
  try {
    writeGuide(dir);
    assert.equal(fs.readFileSync(path.join(dir, MOTION_GUIDE_FILE), "utf8"), MOTION_GUIDE);
    assert.ok(HOUSE_PROMPT.includes(MOTION_GUIDE_FILE.split(path.sep).join("/")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the motion guide covers what went wrong in the trailer test", () => {
  // The music fade it shows must be the one shape HyperFrames accepts.
  const shown = /data-automation='([^']+)'/.exec(MOTION_GUIDE)?.[1];
  assert.equal(JSON.parse(shown).version, 1);
  for (const lesson of [/change the shape of its screen/, /never washes out a figure/, /Colour changes only between words/,
    /walks in place while the world scrolls/, /seeded generator/, /No plain cross-fade/, /hides the real bold/]) {
    assert.match(MOTION_GUIDE, lesson);
  }
});

test("the editing guide carries the research's lessons (M16-12), with the same safe zones as the motion guide", () => {
  for (const lesson of [/Within three seconds/, /50 ms of air before a word and 80 ms after/, /last clean take/,
    /20 to 30 ms on each side/, /invents "Thank you\."/, /a whoosh on every cut/, /measured it, not that it sounds/]) {
    assert.match(GUIDE, lesson);
  }
  for (const guide of [GUIDE, MOTION_GUIDE]) assert.match(guide, /220 px[^.]*420 px[^.]*140 px/);
});

test("the guide covers what went wrong on the first real video", () => {
  for (const lesson of [/two takes of the same lines/, /cross-fade/, /click or a hole of silence/, /moves everything after it/,
    /never plays past its last picture/, /pictureSeconds/, /only the incoming picture fades in/]) {
    assert.match(GUIDE, lesson);
  }
});
