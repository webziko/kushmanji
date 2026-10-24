// The assistant hears the person's language and the app's names as shown on their screen (M14-17).
import assert from "node:assert/strict";
import { test } from "node:test";
import { knownLanguage, languageNote, SHOWN_NAMES } from "../src/main/agents/language.js";
import kn from "../src/renderer/words/kn.js";
import hi from "../src/renderer/words/hi.js";

test("English needs no note, and an unknown language is taken as English", () => {
  assert.equal(languageNote("en"), "");
  assert.equal(knownLanguage("fr"), "en");
  assert.equal(knownLanguage({ toString: () => "kn" }), "en");
  assert.equal(languageNote("<script>"), "");
});

test("in Kannada the menu choices are named as the person sees them, with the English after", () => {
  const note = languageNote("kn");
  assert.match(note, /reads Kushmanji in Kannada/);
  assert.ok(note.includes(`"${kn["Also cut my clips"]}" (Also cut my clips)`));
  assert.ok(languageNote("hi").includes(`"${hi["Edit by hand"]}" (Edit by hand)`));
});

test("every name the note gives has its line in both lists, so none is quietly left out", () => {
  for (const english of SHOWN_NAMES) {
    assert.ok(kn[english], `kn.js has no "${english}"`);
    assert.ok(hi[english], `hi.js has no "${english}"`);
  }
});
