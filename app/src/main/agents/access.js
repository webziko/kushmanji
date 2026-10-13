import path from "node:path";

// How much an agent may do on the person's computer. The person picks a level under the chat box; each bridge
// turns it into that agent's own limits (`ACCESS` in claude.js, codex.js, antigravity.js), and mediaTools.js
// puts the FFmpeg check in place. What each level really stops, agent by agent, is in SECURITY.md.

/** In the order the menu shows them, least to most. `about` is the line the person reads under the menu. */
export const LEVELS = [
  {
    id: "project",
    name: "Project only",
    about: "The agent can change this project's files and run HyperFrames. Nothing else.",
  },
  {
    id: "tools",
    name: "Editing tools",
    about: "The agent can also cut, join, convert and colour footage with FFmpeg, only on files inside this project.",
  },
  {
    id: "full",
    name: "Full access",
    about: "The agent can run any program and change any file on this computer without asking.",
  },
];

/** What a project starts on until the person chooses. The owner has still to confirm this (CHECKLIST.md). */
export const DEFAULT_ACCESS = "project";

export const knownAccess = (id) => (LEVELS.some((level) => level.id === id) ? id : null);

/** Windows compares paths without regard to case, so one project has one setting however its path is typed. */
const keyFor = (dir) => path.resolve(dir).toLowerCase();

/**
 * The level for one project. `stored` is the app's own record, `{ byProject, usual }`, kept in the app's
 * settings and never in the project folder: a folder someone sends you must not be able to grant itself access.
 */
export function accessFor(stored, dir) {
  return knownAccess(stored?.byProject?.[keyFor(dir)]) ?? knownAccess(stored?.usual) ?? DEFAULT_ACCESS;
}

/**
 * The record after the person picks `level` for one project. A new project starts on the level last picked,
 * except "full": that is only ever turned on for the one project it was chosen in.
 */
export function withAccess(stored, dir, level) {
  if (!knownAccess(level)) throw new Error("That access level is not known to this app.");
  return {
    byProject: { ...stored?.byProject, [keyFor(dir)]: level },
    usual: level === "full" ? (knownAccess(stored?.usual) ?? DEFAULT_ACCESS) : level,
  };
}

const NOTES = {
  project:
    'Access for this chat is "Project only": you can change files in this project and run HyperFrames commands. ' +
    "FFmpeg and other programs are not available, and you must not look for a way around that. Trimming a clip " +
    "inside the video needs no FFmpeg: set where it starts and how long it plays. If a request truly needs a " +
    "new media file made from footage (a cut saved as its own file, a conversion, a grade baked in), say so in " +
    'one sentence and tell the person to choose "Editing tools" in the access menu under the chat box.',
  tools:
    'Access for this chat is "Editing tools": besides project files and HyperFrames commands, you can run ' +
    "`ffmpeg` and `ffprobe` on files inside this project folder, to cut, join, convert, resize and grade " +
    "footage. Give paths relative to the project folder. Each command is checked before it runs: a path outside " +
    "the project, a network address, or a camera, microphone or screen source is refused, with the reason. In " +
    "Claude Code, run them with the Bash tool, not PowerShell. Never write over the person's original footage: " +
    "save the result as a new file beside it.",
  full:
    'Access for this chat is "Full access": you may run any program this request needs. Still work inside the ' +
    "project folder unless the person asks otherwise, and tell them plainly about anything you installed or " +
    "changed outside it.",
};

/** What an agent is told when a conversation starts, and again when the person changes the level. */
export const accessNote = (level) => NOTES[knownAccess(level) ?? DEFAULT_ACCESS];
