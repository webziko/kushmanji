// The person's language, for the assistant (M14-17). The app's screens can be in Kannada or Hindi, but the notes the
// assistants are given name the app's buttons and menus in English ("choose 'Also cut my clips'"), so an assistant
// could tell a Kannada reader to press something they cannot find. This note says which language the person reads
// the app in, and gives the names as they see them, taken from the same lists the page uses (renderer/words), so a
// translation changed there changes here too. The words lists are plain data; nothing else of the page is loaded.
import kn from "../../renderer/words/kn.js";
import hi from "../../renderer/words/hi.js";

const LISTS = { kn: { name: "Kannada", words: kn }, hi: { name: "Hindi", words: hi } };

/** The page's language ids. Anything else the page sends is taken as English. */
export const LANGUAGE_IDS = ["en", ...Object.keys(LISTS)];

export const knownLanguage = (id) => (LANGUAGE_IDS.includes(id) ? id : "en");

// The buttons and menu choices an assistant may tell the person to use, in the English the notes and guides use.
export const SHOWN_NAMES = [
  "What may the assistant do", "Only this video", "Also cut my clips", "Anything on this computer",
  "Ask me first", "Just do it", "Show me the plan first", "Decide with me", "Build it", "Change the plan",
  "Assistant and clip settings", "Your assistants: tick the ones you have", "How careful", "Editing buttons",
  "Edit by hand", "Watch video", "Save video", "Add clips", "Show folder", "Make shorts", "Undo this change",
  "Bring it back", "Start over", "Send", "Stop", "Help", "My videos", "Test it now",
];

/** "" for English; otherwise the note that tells the assistant the language and the names as shown. */
export function languageNote(id) {
  const list = LISTS[knownLanguage(id)];
  if (!list) return "";
  const pairs = SHOWN_NAMES.filter((english) => list.words[english])
    .map((english) => `"${list.words[english]}" (${english})`);
  return `The person reads Kushmanji in ${list.name}. Answer in the language they write to you in. When you ` +
    "name one of the app's buttons or menu choices, write it as they see it on screen, with the English name " +
    `in brackets after it: ${pairs.join("; ")}.`;
}
