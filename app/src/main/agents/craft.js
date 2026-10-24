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
- A clip never plays past its last picture. A file's sound is often a little longer than its picture (0.2
  seconds is common). Take the picture's length from the footage study ("pictureSeconds" in
  .hyperframes/study/index.json), not the file's length, and end the clip there or earlier. A clip that plays
  to the end of its file freezes on its last frame just before the join.

## Joining two clips

- Inside one scene: a plain cut.
- Between two scenes, places or times of day: a soft cross-fade of 0.3 to 0.5 seconds, the next clip fading in
  over the end of the last. Use HyperFrames' own clip fades and overlapping tracks for this.
- In a cross-fade only the incoming picture fades in, on top of the outgoing one, which stays solid until its
  clip ends. Fading both at once lets the background show through as a dark flash in the middle of the join.
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

// The motion guide (M16-11, 2026-10-25): what premium code-made motion design does, for titles, logo stings,
// trailers and animated scenes. Written in Kushmanji's own words from research into eight open projects of videos
// made by Claude (lemo-opuscar, ClaudeAnimationBase, mg-styles-15, Papermotion and others, MIT or CC BY 4.0;
// none copied, see docs/RESEARCH.md) and HyperFrames' own skills, plus what went wrong in the owner's trailer test:
// a frame drawn around a figure where the owner meant the video's own screen, a light sweep that washed figures
// out, and a music fade in a shape HyperFrames refuses, which stopped "Save video". Rules are short and numeric so
// that all three assistants can follow them, not only the one the sources were tuned on.
export const MOTION_GUIDE_FILE = path.join(".hyperframes", "MOTION_GUIDE.md");

export const MOTION_GUIDE = `# How to make motion design look premium

Read this before you make or change titles, animated graphics, a logo sting, a trailer, transitions or any
animated scene. Where the person has asked for something else, the person wins.

## Plan first

- Write a short beat sheet into STORYBOARD.md before code: each moment's start time, what moves, what the
  viewer reads. For a whole new film, show it and wait for a yes unless the person said "just make it".
- Pick a tempo: 120 beats a minute (a beat is 0.5 s, a bar 2 s) unless the music sets one. Land cuts and key
  actions on beats.
- Something moves in the first 0.5 s. The hero moment lands at 60 to 75% of the film. The last picture holds
  0.8 to 1.2 s, still breathing a little (a scale of 1.00 to 1.01), never frozen.

## The look is a contract

- Follow STYLE.md (or write it first): one family of lettering, one accent colour, two or three easing curves,
  one kind of transition. Every shot obeys it.
- Logos and brand files are used as they are: scale them, never redraw or recolour them.

## Easing and timing

- A small vocabulary: one strong in-out curve for changes of state (for example cubic-bezier(0.7, 0, 0.3, 1)),
  one gentle ease-out for entrances, springs that settle within about 0.4 s. No bouncy overshoot on words unless
  the look asks for it.
- Anticipation before a big move (6 to 8 frames the other way), follow-through after it. Parts of one thing move
  2 to 4 frames apart, never all at once. Groups stagger by about 0.06 s.
- Squash and stretch on landings: 10 to 15%, never more.

## Transitions

- Grow each transition out of the content: morph the last shape into the next, match a pose across the cut, or
  wipe with a shape from the scene. No plain cross-fade between scenes, no spin or zoom for its own sake.

## Shapes and characters

- Morphing outlines: the same number of points, the same direction, a matched first point; pass very different
  shapes through a simple bridge shape (a circle or capsule); look at the middle frames.
- A character is a rig, not a set of drawings: groups for body, head, arms and legs, each turning at its joint,
  and a few numbers (pose, proportions) driven by one master value on the timeline.
- A walk: the figure walks in place while the world scrolls past; the feet never slide (the leg swing follows
  the distance travelled); the body bobs twice per step cycle; arms swing against the legs.

## Depth and light

- Three to five parallax layers: the far ones slowest and palest, the near ones fastest and darkest.
- One light direction. A light sweep only brightens and never washes out a figure or a word (at most about 20%
  where it crosses them). Grain and vignette last, and subtle.

## Not by default (a look may ask for one on purpose)

- Lens flares, RGB split, neon glow, random drift or shake, particle bursts with no cause, bouncy easing
  everywhere, default cross-fades. Never Math.random or the clock: use a seeded generator.

## Words on screen

- Big and few: one idea per word group; a headline at least 9% of the frame's short side in a trailer, body text
  at least 2.6%. Fully readable for letters / 15 + 1.5 seconds, and never less than 1.5 s.
- Colour changes only between words, never inside one. Never over a face or a figure's head.
- Words enter with motion (per letter or per word, a short stagger) and leave with motion, not a plain fade.
- Safe margins: about 5% of the frame. Upright videos for Shorts and Reels: nothing important within 160 px of
  the top, 320 px of the bottom or 60 px of the sides (at 1080 by 1920).

## "Any size" and other shapes

- Lay a scene out from the frame's width and height (percentages or CSS variables), never fixed pixels, so the
  same scene works at 16:9, 9:16 and 1:1.
- When a video is about changing shape, change the shape of its screen (a rounded rectangle holding the whole
  scene, re-framing it as it morphs), not a box drawn around one object.

## Sound

- A music fade is data-automation in HyperFrames' own shape, and only that shape:
  data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0},{"t":0.5,"v":0.5}]}]}'
  Any other shape passes the check but stops "Save video".
- A sound effect has a cause on screen, and its peak lands one frame after the picture.

## Before you say it is done

- Look at the film with look_at_video: a picture every 0.5 to 1 s across it, and pictures 0.2 s apart around
  every morph and big move. Look at the hardest seconds first.
- Look for: shapes tangled in the middle of a morph, words cut off or over a figure, a figure washed out by
  light, a blank or frozen stretch longer than 3 s, the last picture.
- Fix what is wrong once, then say what you checked and what you are unsure about.
`;

/** Put the current guides in a project. A project the app cannot write to simply goes without them. */
export function writeGuide(dir) {
  for (const [name, text] of [[GUIDE_FILE, GUIDE], [MOTION_GUIDE_FILE, MOTION_GUIDE]]) {
    try {
      const file = path.join(dir, name);
      if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === text) continue;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    } catch {
      // Read-only folder, full disk: editing still works, with one less piece of advice.
    }
  }
}
