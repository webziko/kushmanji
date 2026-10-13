// How involved the person wants to be. The three ways are upstream's own (docs/guides/general-video.mdx), so a
// project planned here reads the same to the HyperFrames skills: "Build it for me", "Review the story first",
// "Co-direct it".
//
// In the last two the agent plans first and waits for a yes. The wait is an instruction, not a lock: the agent
// keeps its usual access, so that a small change ("make the title red") needs no ceremony. What makes it
// trustworthy is the check afterwards: the app looks at which files a planning turn changed, and tells the
// person if anything but the plan was touched (`strayFiles`).

/** In the order the menu shows them. `about` is the line the person reads under the menu. */
export const MODES = [
  {
    id: "build",
    name: "Build it for me",
    about: "The agent makes the creative choices and shows you a finished first version.",
  },
  {
    id: "review",
    name: "Review the story first",
    about: "The agent shows you its plan and waits for your yes before it builds anything.",
  },
  {
    id: "codirect",
    name: "Co-direct it",
    about: "You decide step by step: the story, then the look, then motion and sound. The agent waits for your yes at each.",
  },
];

export const DEFAULT_MODE = "build";
export const knownMode = (id) => (MODES.some((mode) => mode.id === id) ? id : null);

/** The line an agent ends a message with when it has stopped to wait for a yes. The app turns it into buttons. */
export const PLAN_MARK = "PLAN READY";

const PLAN =
  "The plan says, in plain words: the story in order; for footage, which clips and which parts of them, with " +
  "their times from the study in .hyperframes/study/index.json; how the video opens and why that holds " +
  "attention; where titles, graphics and pictures go; the length. Save it in the project's plan files " +
  "(STORYBOARD.md, with BRIEF.md and DESIGN.md when they apply), then tell the person the plan in a few short " +
  `lines, ask if you should build it, and end your message with a line that says only ${PLAN_MARK}. Change ` +
  "nothing but the plan files until the person says yes. ";
const SMALL =
  "A small change to one thing (a word, a colour, a timing, one clip's place) needs no plan: just make it.";

const NOTES = {
  build:
    'The person chose "Build it for me": make the creative decisions yourself, build, and show a finished ' +
    "first version. Do not stop to ask for approval. Still keep the plan files current.",
  review:
    'The person chose "Review the story first". When a request makes a video, re-cuts footage, or changes the ' +
    `story or the look as a whole, do not build yet: plan first. ${PLAN}${SMALL}`,
  codirect:
    'The person chose "Co-direct it": they want to decide with you, one step at a time. For a request that ' +
    "makes or reshapes a video, go in this order and stop after each step: the story, then the look (colours, " +
    "type, the style of titles), then motion, transitions and sound. At each step offer two or three clear " +
    `options where taste matters, with the one you would pick. ${PLAN}Do the same at every later step, and ` +
    `build a step only after the yes for it. ${SMALL}`,
};

/** What an agent is told when a conversation starts, and again when the person changes how they want to work. */
export const modeNote = (mode) => NOTES[knownMode(mode) ?? DEFAULT_MODE];

/**
 * Split an agent's reply from the mark that says it is waiting. Returns `{ text, plan }`: the reply as the
 * person should see it, and whether it ended with the mark.
 */
export function readPlan(reply) {
  const lines = String(reply ?? "").trimEnd().split(/\r?\n/);
  const last = (lines.at(-1) ?? "").replace(/[*_`#>\s.]/g, "").toUpperCase();
  if (last !== PLAN_MARK.replace(/\s/g, "")) return { text: String(reply ?? ""), plan: false };
  return { text: lines.slice(0, -1).join("\n").trimEnd(), plan: true };
}

/**
 * Of the files a planning turn changed, the ones that are not the plan. A plan is writing: the Markdown files
 * at the top of the project. Anything else changed before the person said yes is worth telling them about.
 */
export const strayFiles = (changed) => changed.filter((file) => !/^[^/\\]+\.md$/i.test(file));
