// The access level: which one a project is on, and what the person's choices change.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { accessFor, accessNote, DEFAULT_ACCESS, knownAccess, LEVELS, withAccess } from "../src/main/agents/access.js";
import { GUARD, mediaToolsEnv, SHIM_DIR } from "../src/main/agents/mediaTools.js";

const A = "C:\\Videos\\José Müller\\wedding film";
const B = "D:\\work\\product demo";

test("a project nobody has chosen for starts on the default level", () => {
  assert.equal(accessFor(undefined, A), DEFAULT_ACCESS);
  assert.equal(accessFor({}, A), DEFAULT_ACCESS);
});

test("a choice belongs to its project, however the path is typed", () => {
  const stored = withAccess(undefined, A, "tools");
  assert.equal(accessFor(stored, A.toUpperCase()), "tools");
  assert.equal(accessFor(stored, `${A}\\`), "tools");
});

test("a new project starts on the level last chosen", () => {
  const stored = withAccess(undefined, A, "tools");
  assert.equal(accessFor(stored, B), "tools");
});

test("full access never carries over to another project", () => {
  let stored = withAccess(undefined, A, "tools");
  stored = withAccess(stored, A, "full");
  assert.equal(accessFor(stored, A), "full");
  assert.equal(accessFor(stored, B), "tools", "the other project keeps the last level that was not full");
  assert.equal(accessFor(withAccess(undefined, A, "full"), B), DEFAULT_ACCESS);
});

test("a level the app does not know is refused, and one found in a damaged record is ignored", () => {
  assert.throws(() => withAccess(undefined, A, "root"));
  assert.equal(accessFor({ byProject: { [path.resolve(A).toLowerCase()]: "root" }, usual: "everything" }, A), DEFAULT_ACCESS);
  assert.equal(knownAccess("__proto__"), null);
});

test("every level has a name, a line for the person and a note for the agent", () => {
  for (const level of LEVELS) {
    assert.ok(level.name && level.about, level.id);
    assert.match(accessNote(level.id), new RegExp(`"${level.name}"`), "the agent is told the level by the name the person sees");
  }
  assert.equal(accessNote("nonsense"), accessNote(DEFAULT_ACCESS));
});

const find = { real: (name) => `C:\\ffmpeg\\bin\\${name}.exe`, node: () => "C:\\node\\node.exe" };

test("below full access, the check goes in front of FFmpeg on the agent's PATH", () => {
  const env = mediaToolsEnv({ Path: "C:\\Windows", HOME: "x" }, { dir: A, access: "tools" }, find);
  assert.equal(env.Path, `${SHIM_DIR};C:\\Windows`, "our folder first, the spelling of Path kept");
  assert.equal(env.PATH, undefined, "no second PATH beside the one Windows uses");
  assert.equal(env.HFWIN_ACCESS, "tools");
  assert.equal(env.HFWIN_PROJECT, A);
  assert.equal(env.HFWIN_GUARD, GUARD);
  assert.equal(env.HFWIN_FFMPEG, "C:\\ffmpeg\\bin\\ffmpeg.exe");
  assert.equal(env.HOME, "x");
});

test("HyperFrames' own commands are pointed at the real FFmpeg, not at the check", () => {
  const env = mediaToolsEnv({ PATH: "C:\\Windows" }, { dir: A, access: "project" }, find);
  assert.equal(env.HYPERFRAMES_FFMPEG_PATH, "C:\\ffmpeg\\bin\\ffmpeg.exe");
  assert.equal(env.HYPERFRAMES_FFPROBE_PATH, "C:\\ffmpeg\\bin\\ffprobe.exe");
  assert.equal(env.HFWIN_ACCESS, "project");
});

test("at full access nothing is put in front", () => {
  const before = { PATH: "C:\\Windows" };
  assert.deepEqual(mediaToolsEnv(before, { dir: A, access: "full" }, find), before);
});

test("a computer with no FFmpeg still gets the check, which then says so", () => {
  const env = mediaToolsEnv({ PATH: "C:\\Windows" }, { dir: A, access: "tools" }, { real: () => null, node: find.node });
  assert.equal(env.HFWIN_FFMPEG, undefined);
  assert.equal(env.HYPERFRAMES_FFMPEG_PATH, undefined);
  assert.ok(env.PATH.startsWith(SHIM_DIR));
});
