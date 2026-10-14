import fs from "node:fs";
import path from "node:path";
import { runCli } from "./cli.js";
import { folderNameFor } from "./folderName.js";
import { projectsRoot, readState, updateState } from "./state.js";

const MAX_RECENT = 30;

/** Windows compares paths without regard to case, so `C:\Videos\Demo` and `c:\videos\demo` are one project. */
const pathKey = (dir) => path.resolve(dir).toLowerCase();

/** A HyperFrames project is a folder with a root composition. */
export const isProject = (dir) =>
  typeof dir === "string" && path.isAbsolute(dir) && fs.existsSync(path.join(dir, "index.html"));

/** Projects under the app's own folder are its own; any other folder was opened from elsewhere. */
const isExternal = (dir) => !pathKey(dir).startsWith(pathKey(projectsRoot()) + path.sep);

export const projectAt = (dir) => describe(path.resolve(dir), isExternal(dir));

function describe(dir, external) {
  let modifiedAt = 0;
  try {
    modifiedAt = fs.statSync(path.join(dir, "index.html")).mtimeMs;
  } catch {
    // Listed a moment ago and gone now; it sorts last and the next listing drops it.
  }
  return { dir, name: path.basename(dir), modifiedAt, external };
}

/** Projects made in the app, then folders opened from elsewhere, newest first. */
export function listProjects() {
  const root = projectsRoot();
  const seen = new Set();
  const projects = [];
  const add = (dir, external) => {
    const key = pathKey(dir);
    if (seen.has(key) || !isProject(dir)) return;
    seen.add(key);
    projects.push(describe(dir, external));
  };
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    // No projects folder until the first project is made.
  }
  for (const entry of entries) if (entry.isDirectory()) add(path.join(root, entry.name), false);
  for (const dir of readState().recentFolders) add(dir, true);
  return projects.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export async function createProject(name) {
  const root = projectsRoot();
  fs.mkdirSync(root, { recursive: true });
  const base = folderNameFor(name);
  let folder = base;
  for (let n = 2; fs.existsSync(path.join(root, folder)); n++) folder = `${base}-${n}`;
  // Skills are skipped here because that step reaches GitHub and can take a minute; it is its own task (M2-08).
  const result = await runCli(["init", folder, "--non-interactive"], {
    cwd: root,
    env: { HYPERFRAMES_SKIP_SKILLS: "1" },
    timeoutMs: 120_000,
  });
  const dir = path.join(root, folder);
  if (result.code !== 0 || !isProject(dir)) {
    const detail = (result.stderr || result.stdout).trim().split(/\r?\n/).slice(-6).join("\n");
    throw new Error(
      result.timedOut
        ? "Making the video took too long."
        : `Could not make the video.\n${detail}`,
    );
  }
  return describe(dir, false);
}

export function rememberFolder(dir) {
  if (!isExternal(dir)) return;
  const key = pathKey(dir);
  const others = readState().recentFolders.filter((other) => pathKey(other) !== key);
  updateState({ recentFolders: [path.resolve(dir), ...others].slice(0, MAX_RECENT) });
}

/** Drops a folder from the list. The files are never touched. */
export function forgetFolder(dir) {
  const key = pathKey(dir);
  updateState({
    recentFolders: readState().recentFolders.filter((other) => pathKey(other) !== key),
  });
}
