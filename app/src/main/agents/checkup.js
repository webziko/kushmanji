// "Test this assistant" (M12-03). The assistants update themselves, sometimes daily, and an update can break one
// without warning (Codex 0.162.1 stopped running commands, M2-22). When the installed version is newer than the
// one this app was tried with, the person can run one small real job in a scratch folder: change a file, run a
// command. The answer is said in plain words and kept for that version, so it is asked once.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CHECK_REQUEST =
  "This is a check-up by the Kushmanji app, not a video request. Do exactly these two things and nothing else: " +
  "1. In the file check.txt, replace the word BEFORE with AFTER. 2. Run `npm run check` once. " +
  "Then reply in one short line.";

/** A scratch folder with one file to change and a project the `check` command can look at. */
export function makeScratch(cliVersion) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kushmanji-checkup-"));
  fs.writeFileSync(path.join(dir, "check.txt"), "BEFORE\n");
  fs.writeFileSync(path.join(dir, "package.json"), `${JSON.stringify({
    name: "kushmanji-checkup", private: true, type: "module",
    scripts: { check: `npx --yes hyperframes@${cliVersion} check` },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /></head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="2" data-width="1280" data-height="720">
      <h1 id="title" class="clip" data-start="0" data-duration="2" data-track-index="0">Check-up</h1>
    </div>
  </body>
</html>
`);
  return dir;
}

/** The check-up's result in plain words: `{ ok, said }`. `name` is the assistant's plain name. */
export function judge(name, { ok, stopped, error, limited, changedFile, ranCommand }) {
  if (stopped) return { ok: false, said: `The test of ${name} was stopped before it finished.` };
  if (limited) return { ok: false, said: `${name} has used up its allowance for now, so it could not be tested.` };
  if (!ok) return { ok: false, said: `${name} did not finish the test: ${error || "it stopped with an error"}.` };
  if (!changedFile) return { ok: false, said: `${name} answered, but could not change a file. Editing videos will not work.` };
  if (!ranCommand) {
    return { ok: false, said: `${name} changed a file but did not run a program. It can edit, but may not be able to ` +
      "check or save videos." };
  }
  return { ok: true, said: `${name} works with Kushmanji: it changed a file and ran a program.` };
}

/** Whether a version was already tested and found working: `checkups` is the app's saved results. */
export const testedOk = (checkups, engine, version) =>
  Boolean(version) && checkups?.[engine]?.version === version && checkups[engine].ok === true;
