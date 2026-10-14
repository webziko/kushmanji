import assert from "node:assert/strict";
import { test } from "node:test";
import { folderNameFor } from "../src/main/folderName.js";

test("a video's folder keeps its name in any script, Kannada included", () => {
  assert.equal(folderNameFor("ನನ್ನ ಮೊದಲ ವ್ಲಾಗ್"), "ನನ್ನ-ಮೊದಲ-ವ್ಲಾಗ್");
  assert.equal(folderNameFor("Café Müller's Trip!"), "cafe-muller-s-trip");
  assert.equal(folderNameFor("!!!"), "untitled");
  assert.equal(folderNameFor("con"), "con-video");
});

test("a long name is cut between letters, never inside one, so the folder can always be opened", () => {
  // Adlam letters lie outside the basic plane: each is two UTF-16 units.
  for (const name of ["a" + "𞤀".repeat(60), "𞤀".repeat(60), "x".repeat(47) + "𞤀𞤀"]) {
    const folder = folderNameFor(name);
    assert.doesNotThrow(() => encodeURIComponent(folder), name);
    assert.ok(Array.from(folder).length <= 48);
  }
});
