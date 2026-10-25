// Gemini's own home (M12-08): links to the person's skills and caches, nothing else of their setup.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { homeEnv, knownConversation, prepareHome } from "../src/main/agents/geminiHome.js";

const temp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `kushmanji ${name} é `));
const same = (a, b) => path.resolve(String(a).replace(/^\\\\\?\\/, "")).toLowerCase() === path.resolve(b).toLowerCase();

test("the home links to the person's skills and caches, and leaves out everything else", () => {
  const real = temp("real home");
  const home = path.join(temp("app data"), "gemini-home");
  try {
    for (const parts of [[".gemini", "skills", "hyperframes"], [".cache", "hyperframes"], [".gemini", "config"]]) {
      fs.mkdirSync(path.join(real, ...parts), { recursive: true });
    }
    fs.writeFileSync(path.join(real, ".gemini", "config", "mcp_config.json"), "{\"mcpServers\":{}}");
    prepareHome(home, real);
    assert.ok(same(fs.readlinkSync(path.join(home, ".gemini", "skills")), path.join(real, ".gemini", "skills")));
    assert.ok(same(fs.readlinkSync(path.join(home, ".cache")), path.join(real, ".cache")));
    assert.ok(fs.existsSync(path.join(home, ".gemini", "skills", "hyperframes")));
    // The helpers' settings are not brought along, and a link to a folder that is not there is not made.
    assert.equal(fs.existsSync(path.join(home, ".gemini", "config")), false);
    assert.equal(fs.existsSync(path.join(home, ".agents")), false);
    // Again: nothing changes.
    prepareHome(home, real);
    assert.ok(same(fs.readlinkSync(path.join(home, ".cache")), path.join(real, ".cache")));
  } finally {
    for (const link of [[".gemini", "skills"], [".cache"]]) {
      try { fs.rmdirSync(path.join(home, ...link)); } catch { /* not made */ }
    }
    fs.rmSync(path.dirname(home), { recursive: true, force: true });
    fs.rmSync(real, { recursive: true, force: true });
  }
});

test("a link to somewhere else is moved to the right place; a real folder is left alone", () => {
  const real = temp("real home");
  const elsewhere = temp("elsewhere");
  const home = temp("gemini home");
  try {
    fs.mkdirSync(path.join(real, ".cache"), { recursive: true });
    fs.mkdirSync(path.join(real, ".gemini", "skills"), { recursive: true });
    fs.symlinkSync(elsewhere, path.join(home, ".cache"), "junction");
    fs.mkdirSync(path.join(home, ".gemini", "skills"), { recursive: true });
    fs.writeFileSync(path.join(home, ".gemini", "skills", "mine.md"), "kept");
    prepareHome(home, real);
    assert.ok(same(fs.readlinkSync(path.join(home, ".cache")), path.join(real, ".cache")));
    assert.ok(fs.existsSync(elsewhere), "the old link's target is never touched");
    assert.equal(fs.readFileSync(path.join(home, ".gemini", "skills", "mine.md"), "utf8"), "kept");
  } finally {
    try { fs.rmdirSync(path.join(home, ".cache")); } catch { /* not made */ }
    for (const dir of [home, real, elsewhere]) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("only a conversation this home has is carried on; the environment changes only the home", () => {
  const home = temp("gemini home");
  try {
    const folder = path.join(home, ".gemini", "antigravity-cli", "conversations");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "398d4d5f-9554-41b1-9830-8de7d8a1f067.db"), "");
    assert.equal(knownConversation(home, "398d4d5f-9554-41b1-9830-8de7d8a1f067"), true);
    assert.equal(knownConversation(home, "635afad6-3b95-464e-b261-2ada5345479f"), false);
    assert.equal(knownConversation(home, "../../secrets"), false);
    assert.equal(knownConversation(home, null), false);
    assert.deepEqual(homeEnv({ PATH: "p", APPDATA: "a", USERPROFILE: "u" }, home),
      { PATH: "p", APPDATA: "a", USERPROFILE: home, HOME: home });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
