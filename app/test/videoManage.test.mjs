// Renaming a video and moving one to the Recycle Bin (M1-10, videoManage.js). Real folders in a temporary place;
// the settings and Electron's Recycle Bin call are small stand-ins, handed in the way projects.js hands in the real ones.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  cleanName, folderFor, forgotten, MAX_NAME_LETTERS, nameOf, remembered, renameVideo, trashVideo,
} from "../src/main/videoManage.js";

/** A projects folder with a few videos in it (each with the meta.json HyperFrames writes), and a folder elsewhere. */
function place(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin manage é "));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, "projects");
  const make = (folder, name = folder, where = root) => {
    const dir = path.join(where, folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), "<html></html>");
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ id: folder, name, createdAt: "2026-10-01T00:00:00Z" }));
    return dir;
  };
  return { base, root, make, elsewhere: path.join(base, "somewhere else") };
}

/** The app's settings, in memory. `update` merges the way state.js does. */
function settings(data = {}) {
  const state = { data: { recentFolders: [], ...data } };
  state.read = () => structuredClone(state.data);
  state.update = (change) => { state.data = { ...state.data, ...structuredClone(change) }; };
  return state;
}

const meta = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
const accessKey = (dir) => path.resolve(dir).toLowerCase();

// ---------------------------------------------------------------- names

test("a video is shown under its meta.json name, or its folder's name when there is none", (t) => {
  const { make, elsewhere } = place(t);
  const named = make("my-trip", "Goa trip 2026");
  assert.equal(nameOf(named), "Goa trip 2026");
  fs.writeFileSync(path.join(named, "meta.json"), "{ not json");
  assert.equal(nameOf(named), "my-trip", "a broken meta.json means the folder's name");
  fs.writeFileSync(path.join(named, "meta.json"), JSON.stringify({ id: "x", name: "   " }));
  assert.equal(nameOf(named), "my-trip", "a blank name means the folder's name");
  fs.rmSync(path.join(named, "meta.json"));
  assert.equal(nameOf(named), "my-trip");
  assert.equal(nameOf(make("plain", "Plain", elsewhere)), "Plain");
});

test("a name is tidied, and an empty one or one over 80 letters is refused with a plain sentence", () => {
  assert.equal(cleanName("  Goa   trip\n 2026 "), "Goa trip 2026");
  assert.equal(cleanName("ಗೋವಾ ಪ್ರವಾಸ"), "ಗೋವಾ ಪ್ರವಾಸ");
  assert.throws(() => cleanName(""), /Type a name for the video\./);
  assert.throws(() => cleanName(" \t\n "), /Type a name for the video\./);
  assert.throws(() => cleanName(null), /Type a name for the video\./);
  assert.throws(() => cleanName(42), /Type a name for the video\./);
  assert.throws(() => cleanName("x".repeat(MAX_NAME_LETTERS + 1)), /That name is too long\. Use 80 letters or fewer\./);
  assert.equal(cleanName("x".repeat(MAX_NAME_LETTERS)).length, MAX_NAME_LETTERS);
  // Letters as a person counts them: 80 emoji are 160 UTF-16 units and still fit.
  assert.equal(Array.from(cleanName("🎬".repeat(MAX_NAME_LETTERS))).length, MAX_NAME_LETTERS);
  assert.throws(() => cleanName("🎬".repeat(MAX_NAME_LETTERS + 1)), /too long/);
});

test("a new name gets its own folder name, with a number when another video has it, and keeps its own", (t) => {
  const { root, make } = place(t);
  make("my-trip");
  make("my-trip-2");
  const exists = (file) => fs.existsSync(file);
  assert.equal(folderFor("Goa trip", "old-name", root, exists), "goa-trip");
  assert.equal(folderFor("My trip", "old-name", root, exists), "my-trip-3");
  assert.equal(folderFor("My trip", "my-trip-2", root, exists), "my-trip-2", "its own folder counts as free");
  assert.equal(folderFor("My trip", "MY-TRIP-2", root, exists), "my-trip-2", "Windows ignores case");
  assert.equal(folderFor("ಗೋವಾ ಪ್ರವಾಸ", "old-name", root, exists), "ಗೋವಾ-ಪ್ರವಾಸ");
  assert.equal(folderFor("CON", "old-name", root, exists), "con-video", "a name Windows refuses gets a suffix");
});

// ---------------------------------------------------------------- remembered paths

test("what the app remembers by folder moves to the new place: the list, and the access level", () => {
  const from = path.join("C:\\", "Videos", "Trip");
  const to = path.join("C:\\", "Videos", "Goa");
  const state = {
    recentFolders: [path.join("C:\\", "Other"), from.toUpperCase(), to],
    access: { usual: "tools", byProject: { [accessKey(from)]: "full", [accessKey("C:\\Other")]: "project" } },
    agent: "claude",
  };
  const change = remembered(state, from, to);
  assert.deepEqual(change.recentFolders, [path.join("C:\\", "Other"), path.resolve(to)],
    "the entry is moved, and a second entry for the new place is not left beside it");
  assert.deepEqual(change.access, {
    usual: "tools",
    byProject: { [accessKey("C:\\Other")]: "project", [accessKey(to)]: "full" },
  });
  assert.equal("agent" in change, false, "nothing else is touched");
  assert.deepEqual(remembered({ recentFolders: [], access: { byProject: {} } }, from, to), {}, "nothing to move");
  assert.deepEqual(remembered({ recentFolders: ["", null, 7] }, from, to), {}, "odd entries are left alone");
});

test("a video that went to the Recycle Bin is off the list and its access level is forgotten", () => {
  const dir = path.join("C:\\", "Videos", "Trip");
  const state = {
    recentFolders: [dir.toLowerCase(), path.join("C:\\", "Other")],
    access: { usual: "project", byProject: { [accessKey(dir)]: "full", [accessKey("C:\\Other")]: "tools" } },
  };
  const change = forgotten(state, dir);
  assert.deepEqual(change.recentFolders, [path.join("C:\\", "Other")]);
  assert.deepEqual(change.access, { usual: "project", byProject: { [accessKey("C:\\Other")]: "tools" } });
  assert.deepEqual(forgotten({ recentFolders: [] }, dir), {});
});

// ---------------------------------------------------------------- rename

test("a video opened from elsewhere changes its name only: its folder, and the settings, stay as they are", async (t) => {
  const { root, make, elsewhere } = place(t);
  const dir = make("holiday", "holiday", elsewhere);
  const state = settings({ recentFolders: [dir] });
  const done = await renameVideo(dir, "  Goa trip  ", { root, state, why: () => null });
  assert.deepEqual(done, { dir, name: "Goa trip", note: null });
  assert.equal(nameOf(dir), "Goa trip");
  assert.equal(meta(dir).id, "holiday", "the id it was made with stays");
  assert.equal(meta(dir).createdAt, "2026-10-01T00:00:00Z");
  assert.ok(fs.existsSync(path.join(elsewhere, "holiday", "index.html")), "the folder was not renamed");
  assert.deepEqual(state.data.recentFolders, [dir]);
});

test("a video without a meta.json gets one with the new name", async (t) => {
  const { root, make, elsewhere } = place(t);
  const dir = make("bare", "bare", elsewhere);
  fs.rmSync(path.join(dir, "meta.json"));
  await renameVideo(dir, "Bare", { root, state: settings() });
  assert.equal(meta(dir).name, "Bare");
  assert.equal(meta(dir).id, "bare");
});

test("a video in the projects folder is renamed on disk too, and what the app remembers by folder follows it", async (t) => {
  const { root, make } = place(t);
  const dir = make("untitled-video");
  fs.mkdirSync(path.join(dir, ".hyperframes"));
  fs.writeFileSync(path.join(dir, ".hyperframes", "studio-win-chat.json"), JSON.stringify({
    engine: "claude", mode: "guided", messages: [{ role: "user", text: "make it blue" }],
    sessions: { claude: "abc", codex: "def" }, turns: { claude: 3 }, told: { claude: "x" }, sessionId: "old",
  }));
  const state = settings({
    recentFolders: [dir],
    access: { usual: "project", byProject: { [accessKey(dir)]: "full" } },
    agent: "claude",
  });
  const done = await renameVideo(dir, "Goa trip 2026", { root, state, why: () => null });
  const now = path.join(root, "goa-trip-2026");
  assert.deepEqual(done, { dir: now, name: "Goa trip 2026", note: null });
  assert.equal(fs.existsSync(dir), false, "the old folder is gone");
  assert.equal(nameOf(now), "Goa trip 2026");
  assert.ok(fs.existsSync(path.join(now, "index.html")));
  assert.deepEqual(state.data.recentFolders, [now]);
  assert.deepEqual(state.data.access, { usual: "project", byProject: { [accessKey(now)]: "full" } },
    "the access level moved with the video, and the old folder name keeps none");
  assert.equal(state.data.agent, "claude");
  // The conversations were started in the old folder: forgotten, while the chat's messages stay.
  const chat = JSON.parse(fs.readFileSync(path.join(now, ".hyperframes", "studio-win-chat.json"), "utf8"));
  assert.deepEqual(chat.sessions, {});
  assert.deepEqual(chat.turns, {});
  assert.deepEqual(chat.told, {});
  assert.equal("sessionId" in chat, false);
  assert.deepEqual(chat.messages, [{ role: "user", text: "make it blue" }]);
  assert.equal(chat.engine, "claude");
});

test("a name that is taken by another video gets a number, and a Kannada name keeps its letters", async (t) => {
  const { root, make } = place(t);
  make("goa-trip");
  const first = await renameVideo(make("one"), "Goa trip", { root, state: settings() });
  assert.equal(path.basename(first.dir), "goa-trip-2");
  const second = await renameVideo(make("two"), "ಗೋವಾ ಪ್ರವಾಸ", { root, state: settings() });
  assert.equal(path.basename(second.dir), "ಗೋವಾ-ಪ್ರವಾಸ");
  assert.equal(nameOf(second.dir), "ಗೋವಾ ಪ್ರವಾಸ");
  // Typing the name it already has does not move it to another number.
  const again = await renameVideo(first.dir, "Goa trip", { root, state: settings() });
  assert.equal(again.dir, first.dir);
  assert.equal(again.note, null);
});

test("a video in use keeps its folder name: the new name is kept, and one plain sentence says so", async (t) => {
  for (const [why, sentence] of [
    ["open", /while the video is open\./],
    ["saving", /while the video is being saved\./],
    ["working", /while the assistant is working\./],
  ]) {
    const { root, make } = place(t);
    const dir = make("busy-video");
    const state = settings({ recentFolders: [dir] });
    const done = await renameVideo(dir, "New name", { root, state, why: () => why });
    assert.equal(done.dir, dir);
    assert.match(done.note, /^The name is changed\. /);
    assert.match(done.note, sentence);
    assert.equal(nameOf(dir), "New name");
    assert.ok(fs.existsSync(dir), "the folder did not move");
    assert.deepEqual(state.data.recentFolders, [dir], "the settings are untouched");
  }
});

test("when Windows refuses the rename, the folder keeps its name and the new name stays", async (t) => {
  for (const code of ["EBUSY", "EPERM", "EACCES"]) {
    const { root, make } = place(t);
    const dir = make("held-open");
    const state = settings({ recentFolders: [dir] });
    let tries = 0;
    const rename = async () => { tries++; throw Object.assign(new Error(`${code}: busy`), { code }); };
    const done = await renameVideo(dir, "Held shut", { root, state, why: () => null, rename, wait: async () => {} });
    assert.equal(tries, 3, `${code} is tried three times`);
    assert.equal(done.dir, dir);
    assert.match(done.note, /Windows would not rename the folder just now, so it keeps its old name\.$/);
    assert.equal(nameOf(dir), "Held shut");
    assert.deepEqual(state.data.recentFolders, [dir]);
  }
  // Another kind of failure is not tried again.
  const { root, make } = place(t);
  const dir = make("gone");
  let tries = 0;
  const rename = async () => { tries++; throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); };
  const done = await renameVideo(dir, "Gone away", { root, state: settings(), rename });
  assert.equal(tries, 1);
  assert.match(done.note, /Windows would not rename the folder/);
});

test("a rename that Windows refuses only once goes through on the next try", async (t) => {
  const { root, make } = place(t);
  const dir = make("slow-antivirus");
  let tries = 0;
  const rename = async (from, to) => {
    if (++tries === 1) throw Object.assign(new Error("EBUSY"), { code: "EBUSY" });
    fs.renameSync(from, to);
  };
  const done = await renameVideo(dir, "Fast now", { root, state: settings(), rename, wait: async () => {} });
  assert.equal(tries, 2);
  assert.equal(done.note, null);
  assert.equal(path.basename(done.dir), "fast-now");
});

test("a folder name that would be too long for Windows is not used", async (t) => {
  const { root, make } = place(t);
  const dir = make("short");
  const done = await renameVideo(dir, "A longer name", { root, state: settings(), tooDeep: () => true });
  assert.equal(done.dir, dir);
  assert.match(done.note, /too long for Windows\.$/);
  assert.equal(nameOf(dir), "A longer name");
});

test("an empty or too long name changes nothing, and neither does a name that cannot be written", async (t) => {
  const { root, make } = place(t);
  const dir = make("steady", "Steady");
  const state = settings();
  await assert.rejects(renameVideo(dir, "   ", { root, state }), /Type a name for the video\./);
  await assert.rejects(renameVideo(dir, undefined, { root, state }), /Type a name for the video\./);
  await assert.rejects(renameVideo(dir, "x".repeat(81), { root, state }), /too long/);
  assert.equal(nameOf(dir), "Steady");
  assert.ok(fs.existsSync(dir));
  // meta.json that is a folder cannot be replaced: refused before the folder is touched.
  const stuck = make("stuck");
  fs.rmSync(path.join(stuck, "meta.json"));
  fs.mkdirSync(path.join(stuck, "meta.json"));
  await assert.rejects(renameVideo(stuck, "Fresh start", { root, state }), /The new name could not be saved\./);
  assert.ok(fs.existsSync(stuck), "the folder was not renamed");
  assert.deepEqual(state.data.recentFolders, []);
});

test("a rename never leaves a half-written meta.json behind", async (t) => {
  const { root, make } = place(t);
  const dir = make("tidy");
  await renameVideo(dir, "Tidy up", { root, state: settings() });
  const now = path.join(root, "tidy-up");
  assert.deepEqual(fs.readdirSync(now).sort(), ["index.html", "meta.json"]);
});

// ---------------------------------------------------------------- the Recycle Bin

test("a video goes to the Recycle Bin: Electron is asked for that exact folder, and the list forgets it", async (t) => {
  const { root, make, elsewhere } = place(t);
  const dir = make("old-video", "Old video", elsewhere);
  const state = settings({
    recentFolders: [dir, path.join(elsewhere, "keep")],
    access: { usual: "project", byProject: { [accessKey(dir)]: "full", [accessKey("C:\\keep")]: "tools" } },
  });
  const asked = [];
  await trashVideo(dir, {
    root, home: os.homedir(), state, why: () => null,
    trashItem: async (file) => { asked.push(file); },
  });
  assert.deepEqual(asked, [dir]);
  assert.deepEqual(state.data.recentFolders, [path.join(elsewhere, "keep")]);
  assert.deepEqual(state.data.access.byProject, { [accessKey("C:\\keep")]: "tools" },
    "its access level goes too: a new video under the same name must not inherit it");
  // Nothing in this module deletes: the fake Recycle Bin did nothing, so the files are all still there.
  assert.ok(fs.existsSync(path.join(dir, "index.html")));
});

test("a video that is open, being saved or being worked on is not moved, and nothing is touched", async (t) => {
  for (const [why, sentence] of [
    ["open", /This video is open\./],
    ["saving", /This video is being saved\./],
    ["working", /The assistant is still working\./],
  ]) {
    const { root, make } = place(t);
    const dir = make("in-use");
    const state = settings({ recentFolders: [dir] });
    let asked = 0;
    await assert.rejects(
      trashVideo(dir, { root, home: os.homedir(), state, why: () => why, trashItem: async () => { asked++; } }),
      sentence);
    assert.equal(asked, 0, "the Recycle Bin was not asked");
    assert.deepEqual(state.data.recentFolders, [dir]);
    assert.ok(fs.existsSync(dir));
  }
});

test("when the Recycle Bin cannot take it, it is said plainly and the video stays on the list", async (t) => {
  const { root, make } = place(t);
  const dir = make("stays");
  const state = settings({ recentFolders: [dir] });
  const trashItem = async () => { throw new Error("EPERM: operation not permitted, C:\\secret\\path"); };
  await assert.rejects(trashVideo(dir, { root, home: os.homedir(), state, why: () => null, trashItem }), (error) => {
    assert.equal(error.message, "Windows could not move this video to the Recycle Bin, so nothing was changed.");
    assert.doesNotMatch(error.message, /EPERM|secret/, "no code and no path in the sentence");
    return true;
  });
  assert.deepEqual(state.data.recentFolders, [dir]);
  assert.ok(fs.existsSync(dir));
});

test("a drive, the home folder, the projects folder and the folders around them are not moved from here", async (t) => {
  const { root } = place(t);
  const home = path.join(path.dirname(root), "home", "kish");
  const asked = [];
  const env = { root, home, state: settings(), why: () => null, trashItem: async (file) => { asked.push(file); } };
  for (const dir of [path.parse(root).root, home, root, path.dirname(root), path.dirname(home)]) {
    await assert.rejects(trashVideo(dir, env), /holds much more than one video/, dir);
  }
  assert.deepEqual(asked, []);
  // A video inside any of them is fine, and so is one in a folder with a similar name.
  await trashVideo(path.join(home, "Videos", "trip"), env);
  await trashVideo(path.join(`${root}-old`, "trip"), env);
  assert.equal(asked.length, 2);
});
