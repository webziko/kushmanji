// Stands in for `ffmpeg` and `ffprobe` while an agent works on a project. The files in ./bin put this script
// in front of the real programs on the agent's PATH (see ../mediaTools.js). It checks the command against
// ./rules.js, then either runs the real program with the same arguments or says, in a sentence the agent can
// act on, why it did not.
//
// It runs as its own short-lived process, started by Node or by Electron's own Node, never inside the app.
import { spawn } from "node:child_process";
import { checkCommand } from "./rules.js";

// Not 1, so a refusal is not mistaken for FFmpeg failing on a bad file. 77 is the customary "not permitted".
const REFUSED = 77;

const [tool, ...args] = process.argv.slice(2);
const title = tool === "ffprobe" ? "FFprobe" : "FFmpeg";

function refuse(reason) {
  process.stderr.write(`${title} was not run. ${reason}\n`);
  process.exit(REFUSED);
}

const ASK =
  "If this stops what the person asked for, tell them in one plain sentence: they choose what the assistant may " +
  "do in the menu under the chat box.";

if (tool !== "ffmpeg" && tool !== "ffprobe") refuse("This helper only runs ffmpeg and ffprobe.");

const project = process.env.HFWIN_PROJECT;
if (!project) refuse("This copy of it only works from the chat in Kushmanji.");

if (process.env.HFWIN_ACCESS !== "tools") {
  refuse(
    'This chat is on the "Only this video" level, which does not include FFmpeg. Do not look for another ' +
      "way to run it. A clip can still be trimmed inside the video without FFmpeg, by setting where it starts " +
      'and how long it plays. If the request needs a new media file, tell the person to choose "Also cut my ' +
      'clips" in the "What may the assistant do" menu under the chat box.',
  );
}

const real = process.env[tool === "ffprobe" ? "HFWIN_FFPROBE" : "HFWIN_FFMPEG"];
if (!real) {
  refuse(
    "FFmpeg is not installed on this computer. Tell the person: it can be installed by opening PowerShell and " +
      "running  winget install Gyan.FFmpeg  and then restarting the app.",
  );
}

const verdict = checkCommand(tool, args, { project, cwd: process.cwd() });
if (!verdict.ok) refuse(`${verdict.reason} ${ASK}`);

// FFREPORT makes FFmpeg write a log to any path it names. Our own switches are of no use to FFmpeg.
const DROPPED = /^(FFREPORT|ELECTRON_RUN_AS_NODE)$/i;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !DROPPED.test(key)));

const child = spawn(real, args, { stdio: "inherit", windowsHide: true, env });
child.on("error", (error) => {
  process.stderr.write(`${title} could not start: ${error.message}\n`);
  process.exit(1);
});
child.on("close", (code) => process.exit(code ?? 1));
