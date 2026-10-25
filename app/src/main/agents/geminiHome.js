// Gemini's own home (M12-08, 2026-10-25). Gemini's `agy` loads, on every message, everything the person set up for
// their other work in Antigravity: helpers (MCP servers) such as Firebase and GitHub started through `npx ...@latest`,
// helpers on remote servers, and plugins. Measured on the owner's PC with agy kept running: a one-word reply took
// 23 to 24 s, and the model, `--effort low` and leaving out `--sandbox` changed nothing. With USERPROFILE and HOME
// pointed at an empty folder for agy alone it took 3.5 to 5 s (12 s for the first), and the sign-in still worked,
// because agy keeps it under AppData, not in the home folder (docs/FINDINGS.md). ANTIGRAVITY_GEMINI_DIR and
// ANTIGRAVITY_CONFIG_REL_DIR do not move the helper list, so the home is what changes.
//
// The home lives in Kushmanji's own settings folder and holds links, not copies: `.gemini/skills` and
// `.agents/skills` (the HyperFrames skills, so Gemini still knows how to make videos) and `.cache` (so the commands
// Gemini runs share HyperFrames' browser, Whisper model and undo history instead of fetching them again). Nothing
// else of the person's setup is in it, and their Antigravity is not changed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LINKS = [[".gemini", "skills"], [".agents", "skills"], [".cache"]];

const plain = (file) => path.resolve(String(file).replace(/^\\\\\?\\/, "")).toLowerCase();

/** Make `link` a junction to `target`. A real folder already there is left alone: agy or the person made it. */
function linkTo(link, target) {
  let stat = null;
  try {
    stat = fs.lstatSync(link);
  } catch {
    // Not there yet.
  }
  if (stat && !stat.isSymbolicLink()) return false;
  if (stat) {
    if (plain(fs.readlinkSync(link)) === plain(target)) return true;
    // A junction is removed with rmdir, which takes away the link and never what it points at.
    fs.rmdirSync(link);
  }
  if (!fs.existsSync(target)) return false;
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(target, link, "junction");
  return true;
}

/** Make Gemini's home in `folder`, with links to the person's skills and caches. Returns the folder. */
export function prepareHome(folder, realHome = os.homedir()) {
  fs.mkdirSync(path.join(folder, ".gemini"), { recursive: true });
  for (const parts of LINKS) {
    try {
      linkTo(path.join(folder, ...parts), path.join(realHome, ...parts));
    } catch {
      // A link Windows refuses: Gemini works without it, only slower to set up its own.
    }
  }
  return folder;
}

/** The environment agy runs with: its own home, everything else as given. */
export const homeEnv = (env, folder) => ({ ...env, USERPROFILE: folder, HOME: folder });

/** Whether agy, run with this home, has the conversation `id` (it keeps each as conversations/<id>.db). */
export function knownConversation(folder, id) {
  if (typeof id !== "string" || !/^[\w-]{8,64}$/.test(id)) return false;
  return fs.existsSync(path.join(folder, ".gemini", "antigravity-cli", "conversations", `${id}.db`));
}
