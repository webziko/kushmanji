import { app } from "electron";
import os from "node:os";
import path from "node:path";
import { readJson, writeJson } from "./jsonFile.js";

/** Where projects made in the app live. The same folder the official app documents, so a project made here is
 *  found by the official Windows build when it ships. HFWIN_PROJECTS_ROOT redirects it (the smoke test does). */
export const projectsRoot = () =>
  process.env.HFWIN_PROJECTS_ROOT || path.join(os.homedir(), ".hyperframes-studio");

const stateFile = () => path.join(app.getPath("userData"), "state.json");

const DEFAULTS = { recentFolders: [] };

export const readState = () => ({ ...DEFAULTS, ...readJson(stateFile(), {}) });

export function updateState(change) {
  const next = { ...readState(), ...change };
  writeJson(stateFile(), next);
  return next;
}
