import fs from "node:fs";
import path from "node:path";

// The editing guide: what a careful human editor does without thinking, written down for an assistant that has
// never watched a video. The owner's first real video came back cut too hard, with the same take twice and no
// joins between clips; this is the answer to "it should know how to edit".
//
// It is a file in the project, not part of every request: an assistant reads it when it is about to cut or
// arrange footage, and a request to change one word costs nothing extra. The app rewrites it when a project
// opens, so every project carries the current guide.

export const GUIDE_FILE = path.join(".hyperframes", "EDITING_GUIDE.md");

export const GUIDE = `# How to edit a video well

Read this before you cut, arrange or re-time footage. It is short on purpose. Where the person has asked for
something else, the person wins.

## The story

- Open on the best five seconds: a face, a greeting, the title. Not a slow pan.
- One idea per clip. Order the clips so that each one answers "and then what?".
- Never keep two takes of the same lines. Keep the one with the clearer voice and the look at the camera, and
  say which one you dropped.
- Keep the person on screen. A moment where they talk, smile, point or wave is worth more than any shop shelf.
- End on a goodbye, not on a cut-off sentence.

## Where to cut

- Cut on a breath, between sentences. Never inside a word.
- Trim dead air at the start and end of a talking clip (more than about 0.4 seconds of nothing).
- A shot of things (shelves, a street, a view) earns 2 to 5 seconds, longer only if something happens in it.
- Mix long and short shots. A run of clips that are all the same length feels like a slideshow.
- Trimming needs no new file: set where the clip starts in its file and how long it plays.

## Joining two clips

- Inside one scene: a plain cut.
- Between two scenes, places or times of day: a soft cross-fade of 0.3 to 0.5 seconds, the next clip fading in
  over the end of the last. Use HyperFrames' own clip fades and overlapping tracks for this.
- Sound always joins softly, even on a plain cut: fade each clip's sound out and in over 0.15 to 0.3 seconds, so
  there is never a click or a hole of silence.
- At most two kinds of join in one video. A different wipe on every cut looks like a demo.
- No label, title or subtitle may start or end within half a second of a join.

## Sound

- The voice comes first. A talking clip sits at about -18 to -16 LUFS.
- A clip with no talking (music in a shop, a street) sits 8 to 10 dB under the voice: quiet, never silent.
- Music under a voice sits 15 to 20 dB under it and dips further while the person speaks.
- No jump of more than about 3 dB from one clip to the next.

## Words on screen

- A label is one idea in five words or fewer. It stays at least 2.5 seconds, longer for more words.
- One label on screen at a time. Never over a face. Never in the bottom strip, which belongs to subtitles.
- It arrives in half a second or less and leaves faster than it came.
- Subtitles: bottom centre, two lines at most, about 42 letters a line, on with the first word, off with the
  last, at least one second. Use the person's checked words, never your own translation.
- One look for the whole video: the same lettering, colours and corners on every label.

## Movement

- A slow push-in on a talking face (to about 104 percent over the clip) keeps a still shot alive.
- Movement has a reason: to arrive, to leave, to point at something. Nothing shakes or spins for its own sake.
- Things ease in. Nothing snaps.

## Before you say it is done

- Look at a still frame just before and just after each join you changed, at each label, at the first five
  seconds and the last five.
- Check that every label, sound and subtitle still sits on the clip it was made for. Moving or removing one
  clip moves everything after it.
- Say what you changed in plain words, and what you are unsure about.
`;

/** Put the current guide in a project. A project the app cannot write to simply goes without it. */
export function writeGuide(dir) {
  try {
    const file = path.join(dir, GUIDE_FILE);
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === GUIDE) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, GUIDE);
  } catch {
    // Read-only folder, full disk: editing still works, with one less piece of advice.
  }
}
