// Which model Codex is asked for when the person chose none (codex.js): its own default, unless the account no
// longer offers it (the owner's "gpt-6-astra" after a plan change, 2026-10-18).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { configuredModel, fallbackModel, listedModels } from "../src/main/agents/codex.js";

function home(t, { config, cache } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin codex é "));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (config !== undefined) fs.writeFileSync(path.join(dir, "config.toml"), config);
  if (cache !== undefined) fs.writeFileSync(path.join(dir, "models_cache.json"), JSON.stringify(cache));
  return dir;
}

const offered = [{ id: "gpt-6-luna", name: "GPT-6-Luna" }, { id: "gpt-5.6-terra", name: "GPT-5.6-Terra" }];

test("Codex's own default is read from the top of config.toml, not from a profile below it", (t) => {
  assert.equal(configuredModel(home(t, { config: 'model = "gpt-6-astra"\nmodel_reasoning_effort = "max"\n' })), "gpt-6-astra");
  assert.equal(configuredModel(home(t, { config: '[profiles.fast]\nmodel = "gpt-6-luna"\n' })), null);
  assert.equal(configuredModel(home(t, {})), null);
});

test("a default the account no longer offers is replaced by the first model it does offer", () => {
  assert.equal(fallbackModel("gpt-6-astra", offered), "gpt-6-luna");
  assert.equal(fallbackModel("gpt-5.6-terra", offered), null, "an offered default is left to Codex");
  assert.equal(fallbackModel(null, offered), null);
  assert.equal(fallbackModel("gpt-6-astra", []), null, "with no list, nothing is guessed");
});

test("only the models Codex lists for the person are offered", (t) => {
  const dir = home(t, { cache: { models: [
    { slug: "gpt-6-luna", display_name: "GPT-6-Luna", visibility: "list" },
    { slug: "gpt-reserve", display_name: "GPT-Reserve", visibility: "hide" },
  ] } });
  assert.deepEqual(listedModels(dir), [{ id: "gpt-6-luna", name: "GPT-6-Luna" }]);
  assert.deepEqual(listedModels(home(t, {})), []);
});
