// The title of a native window the main process opens for the person (the three folder and file pickers). The page
// knows the language they chose and this process does not, so the page passes its translated title along with the
// call (M14-16). The page is not trusted, so the title is checked here: ordinary text of a sensible length, or else
// the English title the main process already has.
const MAX_TITLE_CHARS = 200;

/** `given` from the page when it is a plain one-line title of at most 200 characters, otherwise `english`. */
export function dialogTitle(given, english) {
  if (typeof given !== "string") return english;
  const title = given.trim();
  // A control character (a line break, a NUL that would cut the title short) is no part of a title.
  if (!title || title.length > MAX_TITLE_CHARS || /[\u0000-\u001f\u007f]/.test(title)) return english;
  return title;
}
