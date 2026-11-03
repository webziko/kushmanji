// "Pick a style" (M16-15): each style has a picture and a written contract, and picking one never loses a look.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { STYLE_IDS, styleRequest, styleText, useStyle } from "../src/main/styles.js";

const RENDERER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "renderer");

test("every style has its picture, and the page offers exactly these styles", () => {
  assert.ok(STYLE_IDS.length >= 6);
  for (const id of STYLE_IDS) assert.ok(fs.existsSync(path.join(RENDERER, "styles", `${id}.jpg`)), `${id}.jpg`);
  const page = fs.readFileSync(path.join(RENDERER, "editActions.js"), "utf8");
  const offered = [...page.matchAll(/\{ id: "([a-z]+)", name: t\(/g)].map((match) => match[1]);
  assert.deepEqual(offered, STYLE_IDS);
});

test("a style's STYLE.md names it, carries the rules every style shares, and is marked as one of ours", () => {
  const text = styleText("paper");
  assert.match(text, /^<!-- kushmanji-style: paper -->\n# Style: Paper cut-out/);
  assert.match(text, /Banned everywhere/);
  assert.match(styleRequest("paper"), /"Paper cut-out" style written in STYLE\.md/);
});

test("picking a style keeps the video's own look as STYLE.before.md, but not a style picked here before", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kushmanji-style-ಕನ್ನಡ-"));
  fs.writeFileSync(path.join(dir, "STYLE.md"), "# My own look\nCoral and cream.\n");
  assert.deepEqual(useStyle(dir, "night"), { name: "Midnight calm" });
  assert.equal(fs.readFileSync(path.join(dir, "STYLE.before.md"), "utf8"), "# My own look\nCoral and cream.\n");
  useStyle(dir, "ink");
  assert.equal(fs.readFileSync(path.join(dir, "STYLE.before.md"), "utf8"), "# My own look\nCoral and cream.\n");
  assert.match(fs.readFileSync(path.join(dir, "STYLE.md"), "utf8"), /# Style: Line drawing/);
  assert.throws(() => useStyle(dir, "toString"), /not known/);
  fs.rmSync(dir, { recursive: true, force: true });
});
