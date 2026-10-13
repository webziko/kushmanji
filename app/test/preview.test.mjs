import assert from "node:assert/strict";
import { test } from "node:test";
import * as preview from "../src/main/preview.js";

test("readiness recognizes the active project's root and selected scene preview", () => {
  assert.equal(typeof preview.isCompositionPreview, "function", "composition readiness routing is available");
  const current = { serverUrl: "http://127.0.0.1:48620", projectName: "my vlog é" };
  const base = `${current.serverUrl}/api/projects/${encodeURIComponent(current.projectName)}/preview`;
  assert.equal(preview.isCompositionPreview(`${base}?t=0`, current), true);
  assert.equal(preview.isCompositionPreview(`${base}/comp/compositions/intro.html?t=0`, current), true);
  assert.equal(preview.isCompositionPreview(`${base}/thumbnail`, current), false);
  assert.equal(preview.isCompositionPreview(base.replace("48620", "48621"), current), false);
  assert.equal(preview.isCompositionPreview(base.replace(encodeURIComponent(current.projectName), "another"), current), false);
  assert.equal(preview.isCompositionPreview("https://example.com/preview", current), false);
});
