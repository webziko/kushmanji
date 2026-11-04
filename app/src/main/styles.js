// "Pick a style" (M16-15). The owner (2026-11-02): many styles of motion video, chosen from a picture of each, not by
// name. Each style is a short written contract, the way the research found good motion work is directed
// (docs/RESEARCH.md: "a style is a written contract"): a palette, one family of letters, shapes, how things move, how
// one scene becomes the next, and what to avoid. Picking one writes it into the video as STYLE.md, which every
// assistant is told to follow (house.js), keeping a look the video already had as STYLE.before.md (as kits.js does).
// The pictures are in renderer/styles/<id>.jpg: the same headline drawn in each style (docs/style-previews/), or a
// frame of a video Kushmanji made in it. All wording here is our own.
import fs from "node:fs";
import path from "node:path";
import { say } from "./say.js";

const MARK = "<!-- kushmanji-style:";

const common = [
  "- Letters at least 64 px tall on a 1080-high frame, each line readable for at least 1.5 s, never over a face.",
  "- One idea at a time; something moves from the first frame; every scene grows out of the last one (no crossfades).",
  "- Banned everywhere: lens flares, RGB split, neon glow, bouncy overshoot on words, random drift (use a seeded",
  "  generator for anything scattered).",
];

export const STYLES = {
  story: {
    name: "Friendly story",
    lines: [
      "Flat, friendly illustration with a little paper depth: rounded shapes, no outlines, a soft paper shadow (2 to",
      "4 px, low opacity) under each layer. One main character built once and reused, with blinking eyes, eyebrows that",
      "show mood and a few mouth shapes. Warm coral #F4644A, deep coral #CE4630, cream #FFF4E9 and cocoa #3A2420; one",
      "cool slate (#5E6B78) only for a 'before' or a problem, so colour tells the story. Rounded bold letters (Nunito,",
      "'Segoe UI'). One strong in-out curve for changes, a gentle ease-out for entrances, springs that settle without",
      "bounce, a 120-beats-a-minute grid. Scenes born from the last one: a speech bubble that grows, a push into a screen.",
    ],
  },
  figure: {
    name: "Character on a journey",
    lines: [
      "One drawn figure walks in place while the world scrolls past in layers (far sky slowest and palest, foreground",
      "fastest), and the figure or the scenery changes as the story moves on. Flat rounded shapes in a warm palette on a",
      "cream sky, near limbs in one colour and far limbs in a softer one, feet that never slide, a body that bobs with",
      "each step on a 120-beats-a-minute grid. Short words appear beside the figure, never over it. A gentle light sweep",
      "may brighten, never wash out. One continuous camera, no hard cuts.",
    ],
  },
  words: {
    name: "Bold words",
    lines: [
      "Kinetic type: the words are the picture. Huge, heavy letters (Segoe UI Black or Arial Black, 180 px and more)",
      "on one solid colour, one word outlined or in a second colour, a single block of contrasting colour as a second",
      "shape. Words enter per letter with a sixteenth-note stagger (about 0.12 s) and leave with motion; a finished",
      "phrase holds at least 0.7 s, with a tiny breathing scale. Cut on the beat, two or three colours in all, no",
      "pictures or only one strong one.",
    ],
  },
  paper: {
    name: "Paper cut-out",
    lines: [
      "Layers of cut paper: hills, trees, sun and buildings as flat shapes with soft drop shadows that make each layer",
      "sit a few millimetres above the one behind. Natural greens, a warm yellow sun and a paper-cream sky. Titles on a",
      "white paper strip, slightly turned, in rounded bold letters. Layers slide in from below and settle, the camera",
      "moves slowly sideways for depth, and shapes pop up like a pop-up book. Gentle, handmade, never glossy.",
    ],
  },
  tour: {
    name: "App or website tour",
    lines: [
      "A clean product walk-through: a big rounded window on a pale grey background with a soft shadow, a cursor that",
      "moves with purpose, a coloured ring that highlights what is pressed and a dark label that names it. One accent",
      "colour (blue #2F7DF6 or the brand's own), the rest greys. Segoe UI, short labels. The camera glides and zooms",
      "into each thing being shown, one at a time, then pulls back. Real screens of the product when the video has them.",
    ],
  },
  shapes: {
    name: "Bold shapes",
    lines: [
      "Bauhaus geometry: big circles, half circles, squares and bars in red #E2392B, blue #1F4FB4, yellow #F5C224 and",
      "black on an off-white ground. Titles in heavy black capitals (Arial Black) set flat, left-aligned. Shapes slide,",
      "roll and snap into a balanced composition on each beat, then rearrange for the next idea; one shape carries the",
      "eye from scene to scene. No gradients, no shadows.",
    ],
  },
  night: {
    name: "Midnight calm",
    lines: [
      "Calm and premium: a deep midnight-blue ground with a soft glow from one side, thin pale orbit lines, and one warm",
      "coral dot travelling along them. Warm-white letters in a light weight (Segoe UI Light) with one phrase in coral.",
      "Slow, smooth movement on long gentle curves, generous empty space, one idea per scene. No glow effects beyond the",
      "background's soft light.",
    ],
  },
  // The six below follow families documented by lemomo-ai/lemo-opuscar (MIT) and the owner's "Shorts Animator"
  // idea of painted looks (docs/RESEARCH.md, 2026-11-04); the wording is our own.
  water: {
    name: "Watercolour",
    lines: [
      "A hand-painted page that paints itself: translucent washes on warm cotton paper (#F7F1E6) that darken where",
      "they overlap, soft edges that pool a little darker, a few dry-brush streaks. No vector outlines: a darker",
      "stroke along a form is the only line. Things appear stroke by stroke, structure before detail (a hill's wash,",
      "then its shadow, then the trees). Soft blues, greens and peach; far layers paler. Handwritten notes (Segoe",
      "Print, Ink Free) beside what is painted. Calm and curious; slow camera drift across one painted world.",
    ],
  },
  oil: {
    name: "Oil painting",
    lines: [
      "Thick painted canvas: every area made of visible directional brush strokes in rich colour (deep blue,",
      "ochre, burnt orange, crimson), strokes that move gently on twos (a new frame every second picture) so the",
      "paint shimmers like hand animation. Warm light from one side, bold simple shapes, no fine lines. A serif",
      "title (Georgia) in a warm cream. Emotional and cinematic: slow pushes, colour that spreads from one spot to",
      "the whole scene at the turn of the story.",
    ],
  },
  crayon: {
    name: "Crayon picture book",
    lines: [
      "A child's crayon drawing come to life: wobbly, waxy strokes with paper showing through, bright primary",
      "colours (sun yellow, grass green, sky blue, red) on cream paper, simple stick figures and houses, a sun with",
      "rays. Lines redraw slightly on twos so they wiggle. Big friendly letters (Comic Sans MS, Segoe Print) in red.",
      "Bouncy but gentle springs, things popping in from where they would grow. For bedtime stories, kids' lessons",
      "and family videos.",
    ],
  },
  chalk: {
    name: "Chalkboard lesson",
    lines: [
      "A green school chalkboard in a wooden frame: dusty white chalk strokes that draw themselves, one yellow chalk",
      "accent for what matters, smudges where something was wiped. Handwritten letters (Segoe Print). Diagrams,",
      "arrows and circled words build up step by step as a teacher would draw them; a wipe of the cloth clears the",
      "board between ideas. For explainers, lessons, word origins and myth-busting.",
    ],
  },
  pixel: {
    name: "Pixel game",
    lines: [
      "A 16-bit video game: chunky square pixels on a strict grid (scale by whole numbers only, no smoothing),",
      "a bright sky, grass and dirt tiles, coin blocks, a small hero who walks and jumps in a few frames of",
      "animation. Blocky monospace letters (Consolas) with a hard dark drop shadow. Motion snaps on the beat in",
      "whole pixels; sounds are short chiptune blips. For game-like recaps, levels of a journey and nostalgia.",
    ],
  },
  news: {
    name: "News short",
    lines: [
      "A social news short: a full-screen picture or clip, a red tag (NEW, TODAY), a headline in heavy white",
      "letters on black bars with one key word in yellow, numbers that count up, a ticker along the bottom. Fast but",
      "readable: each line on screen at least 1.8 s, the hook in the first 2 seconds. Hard cuts on the beat, quick",
      "zooms into the picture's detail, captions word by word. For news, reports, facts and data shorts.",
    ],
  },
  ink: {
    name: "Line drawing",
    lines: [
      "Hand-drawn ink on cream paper: single-line drawings in dark brown-black that draw themselves stroke by stroke,",
      "with one red accent line. Handwritten letters (Ink Free, Segoe Print) and an underline that draws in. Drawings",
      "morph into the next drawing instead of cutting. Light, friendly, like a sketchbook; no fills except the accent.",
    ],
  },
};

export const STYLE_IDS = Object.keys(STYLES);

/** The STYLE.md text for a style: a mark, so a later pick knows it is one of ours, then the contract. */
export function styleText(id) {
  const style = STYLES[id];
  return [
    `${MARK} ${id} -->`,
    `# Style: ${style.name}`,
    "",
    "Every scene of this video follows this style. Keep it true if you change the video.",
    "",
    ...style.lines,
    "",
    "Always:",
    ...common,
    "",
  ].join("\n");
}

/**
 * Write a style into the video as its STYLE.md. A look the video had of its own (written by the person or an
 * assistant, not a style picked here) is kept as STYLE.before.md first. Returns `{ name }`.
 */
export function useStyle(dir, id) {
  if (!Object.hasOwn(STYLES, id)) throw new Error("That choice is not known to this app.");
  if (!fs.existsSync(dir)) throw new Error(say("The video's folder could not be found."));
  const target = path.join(dir, "STYLE.md");
  let current = null;
  try {
    current = fs.readFileSync(target, "utf8");
  } catch {
    // No look yet.
  }
  if (current?.trim() && !current.startsWith(MARK)) fs.copyFileSync(target, path.join(dir, "STYLE.before.md"));
  fs.writeFileSync(target, styleText(id));
  return { name: STYLES[id].name };
}

/** The message for the assistant once a style is picked. In English: it names a file the assistants rely on. */
export function styleRequest(id) {
  return `Restyle this video in the "${STYLES[id].name}" style written in STYLE.md: colours, letters, shapes, ` +
    "movement and how one scene becomes the next. Keep its story, words, clips, music and timing. If an earlier " +
    "look is in STYLE.before.md, keep what still fits (the logo, the name) and follow STYLE.md for everything else. " +
    "Then look at it at a few moments and tell me what changed.";
}
