# The app's words in Kannada and Hindi

Kushmanji can show its own words in English, ಕನ್ನಡ (Kannada) or हिन्दी (Hindi). The person picks the language on
the first screen, next to "Help". This folder holds the two lists you fill in.

- `kn.js` is Kannada.
- `hi.js` is Hindi.

## How a list works

Each line is the English words on the left and your words on the right:

```js
"Carry on": "",
"Free up {amount}": "",
```

Write your words between the second pair of quotes. Do not change the English on the left: the app finds your
words by it. An empty `""` means "not done yet", and the app shows the English for that line, so you can do the
file a little at a time and nothing breaks.

## Rules

1. **Keep every `{placeholder}` exactly as it is**, curly brackets and all. The app puts a number, a name or a
   file name there. `"{count} minutes ago"` can become your words with `{count}` anywhere in the sentence, where
   it sounds right, but it must still be there, spelled the same.
2. **Keep file names, menu names in quotes, and these names as they are:** Kushmanji, HyperFrames, Claude,
   ChatGPT, Gemini, Whisper, STYLE.md, SHORTS.md. When a sentence names a button, for example "press Save video",
   the name must match what that button says on screen, so translate the button's own line (`"Save video"`) and
   use the same words in every sentence that mentions it. For Windows' own names (PowerShell, File Explorer, the
   Start menu, Downloads) use the name the person sees on their own computer.
3. **Write for a twelve-year-old**, in the same tone as `docs/UX.md`: short, plain, friendly words, the word a
   person already uses at home, not the word of a programmer. If a plain word and a formal word both exist,
   use the plain one. If the best plain word is the English one (for example "timeline" or "Help"), keep it.
4. **Translate whole sentences, not words.** Each line is one thing a person reads. Do not try to match the
   English word for word; say it the way you would say it to a friend.
5. **A line that is two sentences stays two sentences.** A `\n` in the English is a line break; keep it.
6. **Quotes inside a line:** the lines use straight double quotes `"` around the text. If you need a double
   quote inside your words, write `\"`. The curly quotes “ ” need nothing special.
7. **Do not add, remove or reorder lines.** The checks that run with `npm test` fail when a line is missing, is
   not used any more, or has different `{placeholders}` than the English.

## Check your work

From the `app` folder, run `npm test`. The test `words.test.mjs` tells you which line has a problem. Then run
`npm start`, choose your language on the first screen, and look through the screens: Home, a video, Help, the
chat. A phrase still in English means its line is empty.

## For whoever adds a new phrase

Write it as `t("The English text")` in the page's code, with `{name}` placeholders and
`t("...", { name })` for anything that changes. Never build a sentence from pieces, and never put a phrase
that goes to an assistant (a request, a drafted message) through `t()`. Then add the new English line to both
`kn.js` and `hi.js`, with an empty `""`, in the place it appears in the code. The test fails until you do.

A sentence the main process writes for the person is marked `say("The English text {name}", { name })` instead
(`src/main/say.js`), and the page shows it with `tFrom(sentence)`. That includes the message of an error thrown for
a page call: `throw new Error(say("..."))`, shown as `tFrom(error.message)`. A message nobody reads (a value the
page's menus never send, a log line) stays plain English; the test keeps a short list of those. Native windows
(the folder pickers) cannot be marked: the page passes its translated title with the call.
