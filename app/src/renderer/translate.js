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
