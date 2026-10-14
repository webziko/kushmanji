// Saved looks (M10-04): names that are safe file names, saving a video's STYLE.md and using it in another.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { hasStyle, kitFileName, listKits, saveKit, useKit } from "../src/main/kits.js";

function place(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin looks é "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const looks = path.join(root, "looks");
  const one = path.join(root, "City vlog");
  const two = path.join(root, "Short 1");
  fs.mkdirSync(one);
  fs.mkdirSync(two);
  return { looks, one, two };
}

test("a look's name becomes a safe file name, in any language", () => {
  assert.equal(kitFileName("Happy with Shisha!"), "Happy with Shisha.md");
  assert.equal(kitFileName("  ಕನ್ನಡ   look "), "ಕನ್ನಡ look.md");
  assert.equal(kitFileName("../../secret"), "secret.md");
  assert.equal(kitFileName("CON"), "CON look.md");
  assert.throws(() => kitFileName("///"), /Give the look a name/);
});

test("a video's look is saved under a name and used by another video, keeping what that one had", (t) => {
  const { looks, one, two } = place(t);
  assert.throws(() => saveKit(looks, one, "Shisha"), /no look written down yet/);
  fs.writeFileSync(path.join(one, "STYLE.md"), "# Look\nTitles: Fredoka, #F4644A\n");
  assert.deepEqual(saveKit(looks, one, "Happy with Shisha"), { name: "Happy with Shisha" });
  assert.deepEqual(listKits(looks), [{ name: "Happy with Shisha" }]);
  fs.writeFileSync(path.join(two, "STYLE.md"), "# The old look\n");
  useKit(looks, two, "Happy with Shisha");
  assert.match(fs.readFileSync(path.join(two, "STYLE.md"), "utf8"), /Fredoka/);
  assert.match(fs.readFileSync(path.join(two, "STYLE.before.md"), "utf8"), /The old look/);
  assert.equal(hasStyle(two), true);
  assert.throws(() => useKit(looks, two, "Gone"), /no longer saved/);
});

test("with no looks folder yet, there are no looks", (t) => {
  const { looks } = place(t);
  assert.deepEqual(listKits(looks), []);
});
