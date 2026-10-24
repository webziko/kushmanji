// The app's own words in Kannada and Hindi (M14-12): the phrases marked in the page's code, the two lists that
// translate them, and the small function that picks and fills one. Plain Node cannot load the page's files (they
// need the window), so the code is read as text and the lists, which are plain modules, are imported.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { translate, translateFrom } from "../src/renderer/translate.js";
import { say } from "../src/main/say.js";

const RENDERER = fileURLToPath(new URL("../src/renderer", import.meta.url));
// Where t() and the language live; they talk about t() in their own comments and are not pages.
const NOT_PAGES = new Set(["words.js", "translate.js"]);
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

const pages = fs.readdirSync(RENDERER).filter((name) => name.endsWith(".js") && !NOT_PAGES.has(name)).sort();
const placeholders = (text) => new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]));

/** The code of a page without its comments, so a sentence about t() in a comment is not taken for a call. */
const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
  .replace(/(^|\s)\/\/.*$/gm, "$1");

/** One string literal at `at`: its text and where it ends, or null for anything else (a name, a template with `${`). */
function literalAt(source, at) {
  const quote = source[at];
  if (quote !== '"' && quote !== "`") return null;
  let end = at + 1;
  while (end < source.length && source[end] !== quote) end += source[end] === "\\" ? 2 : 1;
  if (end >= source.length) return null;
  const inside = source.slice(at + 1, end);
  if (quote === "`") return inside.includes("${") || inside.includes("\\") ? null : { text: inside, end: end + 1 };
  try {
    return { text: JSON.parse(source.slice(at, end + 1)), end: end + 1 };
  } catch {
    return null;
  }
}

/**
 * Every t(...) call in `source`: `{ text, line }` for a call whose first argument is literal text (several literals
 * joined by + count as one sentence), `{ bad, line }` for a call that is anything else. A phrase the list cannot
 * know in advance would silently never be translated, so those are mistakes.
 */
function findCalls(source, name = "t") {
  const code = withoutComments(source);
  const found = [];
  // Not a method (`.t(`) or a class's own (`#say(`), only the function itself.
  for (const match of code.matchAll(new RegExp(`(?<![\\w$.#])${name}\\(`, "g"))) {
    const line = code.slice(0, match.index).split("\n").length;
    let at = match.index + match[0].length;
    let text = "";
    for (;;) {
      while (/\s/.test(code[at] ?? "")) at++;
      const literal = literalAt(code, at);
      if (!literal) { text = null; break; }
      text += literal.text;
      at = literal.end;
      while (/\s/.test(code[at] ?? "")) at++;
      if (code[at] !== "+") break;
      at++;
    }
    // After the sentence the call must end or go on to its values.
    found.push(text !== null && (code[at] === ")" || code[at] === ",") ? { text, line } : { bad: true, line });
  }
  return found;
}

const calls = pages.flatMap((name) =>
  findCalls(fs.readFileSync(path.join(RENDERER, name), "utf8")).map((call) => ({ ...call, name })));

// The main process marks the sentences it writes for the person with say() (M14-15); the page shows them through
// tFrom(), from the same lists. The self-test's own sentences are not the person's, and say.js only defines it.
const MAIN = fileURLToPath(new URL("../src/main", import.meta.url));
const mainFiles = fs.readdirSync(MAIN, { recursive: true })
  .filter((name) => name.endsWith(".js") && !["smoke.js", "say.js"].includes(path.basename(name))).sort();
const mainCalls = mainFiles.flatMap((name) =>
  findCalls(fs.readFileSync(path.join(MAIN, name), "utf8"), "say").map((call) => ({ ...call, name })));
const used = new Set([...calls, ...mainCalls].filter((call) => !call.bad).map((call) => call.text));

const lists = {
  kn: (await import(pathToFileURL(path.join(RENDERER, "words/kn.js")))).default,
  hi: (await import(pathToFileURL(path.join(RENDERER, "words/hi.js")))).default,
};

test("the page's code has phrases marked, and each call gives t() the English text itself", () => {
  assert.ok(used.size > 200, `only ${used.size} phrases found: is the finder reading the files?`);
  const bad = calls.filter((call) => call.bad).map((call) => `${call.name}:${call.line}`);
  assert.deepEqual(bad, [], "t() must be given the English sentence as a string, not a variable or a template");
});

test("each say() in the main process gives the English sentence itself", () => {
  const bad = mainCalls.filter((call) => call.bad).map((call) => `${call.name}:${call.line}`);
  assert.deepEqual(bad, [], "say() must be given the English sentence as a string, not a variable or a template");
});

for (const [id, list] of Object.entries(lists)) {
  test(`every phrase in the page is a line of ${id}.js`, () => {
    const missing = [...used].filter((text) => !Object.hasOwn(list, text));
    assert.deepEqual(missing, [], `add these to words/${id}.js, with "" until they are translated`);
  });

  test(`every line of ${id}.js is a phrase the page still uses`, () => {
    const stale = Object.keys(list).filter((text) => !used.has(text));
    assert.deepEqual(stale, [], `these lines of words/${id}.js match nothing in the page any more`);
  });

  test(`every line of ${id}.js is text, and a translation keeps the English's {placeholders}`, () => {
    const wrong = [];
    for (const [text, translation] of Object.entries(list)) {
      if (typeof translation !== "string") { wrong.push(`${text}: not text`); continue; }
      if (translation === "") continue;
      const want = [...placeholders(text)].sort().join(",");
      const have = [...placeholders(translation)].sort().join(",");
      if (want !== have) wrong.push(`${text}: has {${have}}, needs {${want}}`);
    }
    assert.deepEqual(wrong, []);
  });
}

test("the lists have the same lines in the same order, so the two translators work from one layout", () => {
  assert.deepEqual(Object.keys(lists.hi), Object.keys(lists.kn));
});

test("a placeholder in the page's English is written {camelCaseName}", () => {
  const odd = [...used].flatMap((text) => [...placeholders(text)].filter((name) => !/^[a-z][A-Za-z0-9]*$/.test(name))
    .map((name) => `${text}: {${name}}`));
  assert.deepEqual(odd, []);
});

/**
 * words.js as the page loads it, with stand-ins for what the page has: storage that answers `stored` (or throws),
 * the document and location. It reads the saved language once at load, so each case imports its own copy (the
 * query makes it a different module) while the stand-ins are in place, and keeps them until `check` is done.
 */
let copies = 0;
async function withPage({ stored = null, blocked = false }, check) {
  const seen = { saved: null, reloads: 0, lang: null };
  const document = { documentElement: { set lang(value) { seen.lang = value; } } };
  const storage = {
    getItem() { if (blocked) throw new Error("blocked"); return stored; },
    setItem(key, value) { if (blocked) throw new Error("blocked"); seen.saved = [key, value]; },
  };
  const location = { reload() { seen.reloads++; } };
  const stand = { localStorage: storage, document, location };
  const before = Object.fromEntries(Object.keys(stand).map((name) =>
    [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(stand))
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  try {
    const words = await import(`../src/renderer/words.js?copy=${++copies}`);
    await check(words, seen);
  } finally {
    for (const [name, descriptor] of Object.entries(before)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

test("the language is English until the person chooses another, and the page is told which", async () => {
  await withPage({}, ({ language, t }, seen) => {
    assert.equal(language(), "en");
    assert.equal(seen.lang, "en");
    assert.equal(t("Save video"), "Save video");
  });
  await withPage({ stored: "kn" }, ({ language }, seen) => {
    assert.equal(language(), "kn");
    assert.equal(seen.lang, "kn");
  });
  await withPage({ stored: "hi" }, ({ language }) => assert.equal(language(), "hi"));
});

test("a saved language the app does not have, or storage that throws, means English", async () => {
  await withPage({ stored: "zz" }, ({ language }) => assert.equal(language(), "en"));
  await withPage({ blocked: true }, ({ language }, seen) => {
    assert.equal(language(), "en");
    assert.equal(seen.lang, "en");
  });
});

// The lists are filled now, so this uses a phrase no list has; the empty-entry case is translate()'s own test.
test("a line the chosen language does not have shows the English, and placeholders are filled either way", async () => {
  await withPage({ stored: "kn" }, ({ t }) => {
    assert.equal(t("A phrase no list has"), "A phrase no list has");
    assert.match(t("Free up {amount}", { amount: "2 GB" }), /2 GB/);
    assert.notEqual(t("Save video"), "Save video", "the Kannada list is used");
  });
});

test("choosing a language keeps it and draws the page again; one that cannot be kept changes nothing", async () => {
  await withPage({}, ({ setLanguage }, seen) => {
    assert.equal(setLanguage("hi"), true);
    assert.deepEqual(seen.saved, ["kushmanji-language", "hi"]);
    assert.equal(seen.reloads, 1);
    assert.equal(setLanguage("zz"), true, "an unknown choice is kept as English");
    assert.deepEqual(seen.saved, ["kushmanji-language", "en"]);
  });
  await withPage({ blocked: true }, ({ setLanguage }, seen) => {
    assert.equal(setLanguage("kn"), false);
    assert.equal(seen.reloads, 0, "the page would come back in the old language, so it is not reloaded");
  });
});

test("the menu offers English, Kannada and Hindi, each by its own name", async () => {
  await withPage({}, ({ LANGUAGES }) => {
    assert.deepEqual(LANGUAGES.map((item) => item.id), ["en", "kn", "hi"]);
    assert.deepEqual(LANGUAGES.map((item) => item.name), ["English", "ಕನ್ನಡ · Kannada", "हिन्दी · Hindi"]);
  });
});

test("translate gives the chosen language's words, or the English when there are none", () => {
  const table = { "Save video": "Table text", "Empty one": "" };
  assert.equal(translate("Save video", table), "Table text");
  assert.equal(translate("Save video"), "Save video", "English has no table");
  assert.equal(translate("Save video", {}), "Save video", "a missing line shows the English");
  assert.equal(translate("Empty one", table), "Empty one", "an empty line counts as missing");
  assert.equal(translate("toString", table), "toString", "a name from Object.prototype is not a translation");
});

test("translate fills each {name} with the value, in the chosen text or in the English", () => {
  const table = { "Saved {count} in {folder}": "{folder} has {count} saved" };
  assert.equal(translate("Saved {count} in {folder}", table, { count: 3, folder: "Videos" }), "Videos has 3 saved");
  assert.equal(translate("Saved {count} in {folder}", null, { count: 3, folder: "Videos" }), "Saved 3 in Videos");
  assert.equal(translate("{n} and {n}", null, { n: 0 }), "0 and 0", "every one is replaced, and 0 is a value");
  assert.equal(translate("Hello {name}", null, {}), "Hello {name}", "a missing value is left to be noticed");
  assert.equal(translate("Open {name}", null, { name: "$& $1 {name}" }), "Open $& $1 {name}",
    "a value is text, never a replacement pattern");
  assert.equal(translate("Plain {braces} stay", null), "Plain {braces} stay", "no values, nothing is replaced");
});

test("a sentence from the main process is found by its exact line, or by the pattern of a line with values", () => {
  const table = {
    "Whisper is ready": "Whisper ಸಿದ್ಧ",
    "Studied {done} of {total} clips": "{total} ರಲ್ಲಿ {done} ಕ್ಲಿಪ್",
    "Studied {count} clips": "{count} ಕ್ಲಿಪ್‌ಗಳನ್ನು ನೋಡಿದೆ",
    "{start} to {end}": "{start} ರಿಂದ {end}",
    "{name}": "only placeholders",
  };
  assert.equal(translateFrom("Whisper is ready", table), "Whisper ಸಿದ್ಧ");
  assert.equal(translateFrom(say("Studied {done} of {total} clips", { done: 3, total: 19 }), table), "19 ರಲ್ಲಿ 3 ಕ್ಲಿಪ್");
  assert.equal(translateFrom("Studied 3 of 19 clips", table), "19 ರಲ್ಲಿ 3 ಕ್ಲಿಪ್", "the line with the most fixed words wins");
  assert.equal(translateFrom("Something new", table), "Something new", "a line that is only placeholders matches nothing");
  // An assistant's own words and a command go through too, and must come out as they went in.
  assert.equal(translateFrom("Could not connect to the server", table), "Could not connect to the server",
    "a line with little fixed text is not a pattern");
  assert.equal(translateFrom("Whisper is ready", null), "Whisper is ready", "English has no table");
  assert.equal(translateFrom(undefined, table), undefined);
});

test("say() fills the English the way the page's lists expect", () => {
  assert.equal(say("Plain"), "Plain");
  assert.equal(say("{done} of {total} ($&)", { done: 0, total: "$1" }), "0 of $1 ($&)");
  assert.equal(say("Hello {name}", {}), "Hello {name}");
});
