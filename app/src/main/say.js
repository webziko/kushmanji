// Sentences the main process writes for the person to read (M14-15). They reach the page in English, and the page
// shows them in the chosen language through tFrom() (renderer/words.js), from the same lists as its own words
// (renderer/words/kn.js, hi.js). say() marks a sentence so the words test can find it and insist on its line in
// those lists; with values it fills each {name}, and the page recognises the filled sentence by its pattern.
// Never mark a sentence that goes to an assistant: that stays in English.

/** The English `text` with each `{name}` filled from `values`. */
export function say(text, values) {
  if (!values) return text;
  // A function, not a string, so a `$&` inside a file name is never taken for a replacement pattern.
  return text.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (whole, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : whole);
}
