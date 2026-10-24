// The app's own words in the language the person chose (M14-12): English, Kannada or Hindi. Every phrase a person
// reads on screen goes through t("the English text"). The English text is the key: a language's list
// (words/kn.js, words/hi.js) says what to show instead, and a phrase it does not have shows in English.
// Read words/README.md before adding a phrase or writing a list.
import kn from "./words/kn.js";
import hi from "./words/hi.js";
import { translate, translateFrom } from "./translate.js";

export const LANGUAGES = [
  { id: "en", name: "English" },
  { id: "kn", name: "ಕನ್ನಡ · Kannada" },
  { id: "hi", name: "हिन्दी · Hindi" },
];

const KEY = "kushmanji-language";
const TABLES = { kn, hi };

function saved() {
  // Storage can throw (blocked site data, a private window): the app then simply stays in English.
  try {
    const id = localStorage.getItem(KEY);
    return LANGUAGES.some((item) => item.id === id) ? id : "en";
  } catch {
    return "en";
  }
}

// Read once. The language only changes through setLanguage, which draws the whole page again.
const current = saved();
// The page's own language, for screen readers, hyphenation and the right font. Plain Node has no page.
if (typeof document !== "undefined") document.documentElement.lang = current;

export const language = () => current;

/** Dates and numbers in the chosen language ("kn-IN": Kannada month names); the computer's own for English. */
export const locale = () => (current === "en" ? undefined : `${current}-IN`);

/**
 * Keep the choice and draw every screen again in it. Only offered on Home, where nothing is in progress.
 * False when the choice could not be kept (then nothing is reloaded: the page would come back in the old language).
 */
export function setLanguage(id) {
  const next = LANGUAGES.some((item) => item.id === id) ? id : "en";
  try {
    localStorage.setItem(KEY, next);
  } catch {
    return false;
  }
  // The window refuses navigations, and a reload the page starts is one: the main process does it instead.
  // (A plain page, such as the unit test's stand-in, has no bridge and reloads itself.)
  const bridge = globalThis.window?.hfwin?.app;
  if (bridge?.reload) bridge.reload().catch(() => {});
  else location.reload();
  return true;
}

/** The chosen language's version of the exact English `text`; `values` fills each `{name}` in it. */
export const t = (text, values) => translate(text, TABLES[current], values);

/**
 * A sentence the main process wrote with say() (M14-15), in the chosen language. The one way to translate text the
 * page holds in a variable: use it only on what comes from the main process, never on a phrase of the page's own.
 */
export const tFrom = (sentence) => translateFrom(sentence, TABLES[current]);
