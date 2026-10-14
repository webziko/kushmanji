// Kushmanji's face on HyperFrames' editor (studioFace.js, M14-14). The stylesheet leans on two things in Studio's
// built files: the logo's label and the names of its accent colours. A HyperFrames update that renames either
// would bring the HeyGen logo or the green back without a sound; this test says so first.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { STUDIO_CSS } from "../src/main/studioFace.js";

const require = createRequire(import.meta.url);
const assets = path.join(path.dirname(require.resolve("hyperframes/package.json")), "dist", "studio", "assets");
const built = (extension) => fs.readdirSync(assets).filter((name) => name.endsWith(extension))
  .map((name) => fs.readFileSync(path.join(assets, name), "utf8")).join("\n");

test("Studio still labels its logo the way the stylesheet hides it", () => {
  assert.match(STUDIO_CSS, /svg\[aria-label="Hyperframes"\]/);
  assert.ok(built(".js").includes('"aria-label":"Hyperframes"'), "Studio's logo label changed: update STUDIO_CSS");
});

test("Studio still takes its accent from the four colours the stylesheet replaces", () => {
  const css = built(".css");
  for (const name of ["--color-accent", "--color-accent-hover", "--color-accent-ink", "--color-on-accent"]) {
    assert.ok(css.includes(`${name}:`), `Studio no longer defines ${name}: update STUDIO_CSS`);
    assert.match(STUDIO_CSS, new RegExp(`${name}: #[0-9a-f]{6} !important`));
  }
});
