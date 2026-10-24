// The title of a native folder window comes from the page (M14-16), so it is checked: plain text, or the English.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dialogTitle } from "../src/main/dialogTitle.js";

const ENGLISH = "Choose a folder of video clips";

test("a plain title from the page is used, in any script, without the spaces around it", () => {
  assert.equal(dialogTitle("ವಿಡಿಯೋ ಕ್ಲಿಪ್‌ಗಳ ಫೋಲ್ಡರ್ ಆರಿಸಿ", ENGLISH), "ವಿಡಿಯೋ ಕ್ಲಿಪ್‌ಗಳ ಫೋಲ್ಡರ್ ಆರಿಸಿ");
  assert.equal(dialogTitle("  वीडियो का फ़ोल्डर खोलें ", ENGLISH), "वीडियो का फ़ोल्डर खोलें");
  assert.equal(dialogTitle("Add clips (your own files are not changed)", ENGLISH),
    "Add clips (your own files are not changed)");
});

test("anything that is not a short one-line text falls back to the English title", () => {
  for (const given of [undefined, null, 5, {}, ["title"], true, "", "   ", "two\nlines", "tab\there", "nul\u0000cut",
    "x".repeat(201)]) {
    assert.equal(dialogTitle(given, ENGLISH), ENGLISH, JSON.stringify(given));
  }
});

test("a title of exactly 200 characters is still used", () => {
  const longest = "x".repeat(200);
  assert.equal(dialogTitle(longest, ENGLISH), longest);
});
