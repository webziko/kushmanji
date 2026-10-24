// The pure part of the app's own words (M14-12): the exact English text in, the chosen language's text out. It lives
// apart from words.js because words.js reads the saved language and the page when it loads, which plain Node (the
// unit tests) does not have.

/**
 * `text` is the English sentence exactly as written in the code and `table` the chosen language's list of
 * "English text": "its translation", or nothing for English. A missing or empty translation shows the English, so a
 * half-finished list never leaves a hole on screen. `{name}` in the chosen text is replaced by String(values.name);
 * one that `values` does not have is left as it is, which shows the mistake instead of hiding it.
 */
export function translate(text, table, values) {
  const found = table && Object.hasOwn(table, text) ? table[text] : "";
  const chosen = typeof found === "string" && found !== "" ? found : text;
  if (!values) return chosen;
  // A function, not a string, so a `$&` inside a person's file name is never taken for a replacement pattern.
  return chosen.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (whole, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : whole);
}

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
const escape = (text) => text.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
/** Per list: each line with placeholders as a pattern, the most fixed words first, so the closest one wins. */
const patterns = new WeakMap();

function patternsOf(table) {
  if (!patterns.has(table)) {
    const made = Object.keys(table).filter((text) => /\{[A-Za-z][A-Za-z0-9]*\}/.test(text))
      .map((text) => {
        const names = [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
        const fixed = text.replace(PLACEHOLDER, "");
        // split() with the capturing group gives the fixed words and the names in turn.
        const source = text.split(PLACEHOLDER).map((part, index) => (index % 2 ? "([\\s\\S]+?)" : escape(part))).join("");
        return { text, names, fixed: fixed.length, pattern: new RegExp(`^${source}$`) };
      })
      // A line that is nothing but placeholders would match any sentence at all.
      .filter((entry) => entry.fixed > 0)
      .sort((a, b) => b.fixed - a.fixed);
    patterns.set(table, made);
  }
  return patterns.get(table);
}

/**
 * A sentence the main process wrote with say() (main/say.js), already filled in English: its exact line in `table`,
 * or the line whose pattern it fits, filled with the parts it had. Anything else is shown as it came.
 */
export function translateFrom(sentence, table) {
  if (typeof sentence !== "string" || !table) return sentence;
  if (Object.hasOwn(table, sentence)) return translate(sentence, table);
  for (const { text, names, pattern } of patternsOf(table)) {
    const match = sentence.match(pattern);
    if (match) return translate(text, table, Object.fromEntries(names.map((name, index) => [name, match[index + 1]])));
  }
  return sentence;
}
