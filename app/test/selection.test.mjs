// Pointing instead of describing: what the chat shows for Studio's selection, and what the agent is told.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readPlan, strayFiles, modeNote, MODES, PLAN_MARK } from "../src/main/agents/working.js";
import { pointingAt, pointingNote } from "../src/main/selection.js";

// As Studio really reports a selected clip (read from a running project, trimmed).
const clip = {
  schemaVersion: 1,
  compositionPath: "index.html",
  sourceFile: "index.html",
  currentTime: 40.2,
  target: { id: "v04", hfId: "hf-82nz", selector: "#v04" },
  label: "V04",
  tagName: "video",
  textContent: null,
  dataAttributes: { "hf-id": "hf-82nz", start: "26.205", duration: "15.005", label: "City Centre" },
};
const title = {
  compositionPath: "index.html",
  sourceFile: "compositions/g00.html",
  currentTime: 1,
  target: { id: null, selector: ".headline", selectorIndex: 0 },
  label: "H1",
  tagName: "h1",
  textContent: "  A bored\n day ",
  dataAttributes: {},
};

test("a selected clip is named the way the person named it, with where it sits on the timeline", () => {
  assert.deepEqual(pointingAt(clip, "t1"), { key: "hf-82nz@t1", name: "City Centre", kind: "video clip", when: "0:26 to 0:41" });
});

test("selected words are shown as the words themselves", () => {
  const shown = pointingAt(title, "t1");
  assert.equal(shown.kind, "text");
  assert.equal(shown.name, "A bored day");
  assert.equal(shown.when, "");
});

test("selecting something else, or the same thing again later, is a new selection", () => {
  assert.notEqual(pointingAt(clip, "t1").key, pointingAt(title, "t1").key);
  assert.notEqual(pointingAt(clip, "t1").key, pointingAt(clip, "t2").key);
});

test("nothing selected, or something unreadable, shows nothing", () => {
  assert.equal(pointingAt(null), null);
  assert.equal(pointingAt({}), null);
  assert.equal(pointingAt("v04"), null);
  assert.equal(pointingNote(null), "");
});

test("the agent is told which element, which file and where, in a form it can find", () => {
  const note = pointingNote(clip);
  assert.match(note, /the video clip "City Centre" \(<video id="v04" data-hf-id="hf-82nz">\)/);
  assert.match(note, /File: index\.html/);
  assert.match(note, /starts at 26\.205s, lasts 15\.005s/);
  assert.match(note, /playhead was at 40\.2s/);
  const words = pointingNote(title);
  assert.match(words, /selector \.headline/);
  assert.match(words, /File: compositions\/g00\.html, shown in index\.html/);
  assert.match(words, /Its words: "A bored day"/);
});

test("a selection cannot flood the request: every field is cut to length", () => {
  const huge = { ...title, textContent: "x".repeat(5000), label: "y".repeat(5000), sourceFile: "z".repeat(5000) };
  assert.ok(pointingNote(huge).length < 1500);
  assert.ok(pointingAt(huge).name.length <= 61);
});

// ------------------------------------------------------------------ the way of working

test("each way of working has a name, a line for the person and a note for the agent", () => {
  for (const mode of MODES) {
    assert.ok(mode.name && mode.about, mode.id);
    assert.match(modeNote(mode.id), new RegExp(`"${mode.name}"`));
  }
  assert.ok(!modeNote("build").includes(PLAN_MARK), "building needs no mark");
  assert.ok(modeNote("review").includes(PLAN_MARK) && modeNote("codirect").includes(PLAN_MARK));
  assert.equal(modeNote("nonsense"), modeNote("build"));
});

test("a reply that ends with the mark is a plan, shown without the mark", () => {
  assert.deepEqual(readPlan(`Here is the plan.\n\nShall I build it?\n\n${PLAN_MARK}\n`), {
    text: "Here is the plan.\n\nShall I build it?",
    plan: true,
  });
  // Agents decorate. Bold, a full stop or lower case is still the mark.
  assert.equal(readPlan("Plan.\n**Plan ready.**").plan, true);
  assert.equal(readPlan("Plan.\n`PLAN READY`").text, "Plan.");
});

test("a reply that only mentions the mark, or does not end with it, is an ordinary reply", () => {
  const said = `I will write ${PLAN_MARK} when the plan is done.\nNot yet.`;
  assert.deepEqual(readPlan(said), { text: said, plan: false });
  assert.equal(readPlan("").plan, false);
  assert.equal(readPlan(undefined).plan, false);
});

test("while waiting for a yes, only the plan's own files may have changed", () => {
  assert.deepEqual(strayFiles(["STORYBOARD.md", "BRIEF.md", "design.MD"]), []);
  assert.deepEqual(strayFiles(["STORYBOARD.md", "index.html", "assets/cut.mp4", "notes/plan.md"]), [
    "index.html",
    "assets/cut.mp4",
    "notes/plan.md",
  ]);
});
