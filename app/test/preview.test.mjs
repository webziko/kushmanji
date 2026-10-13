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

test("editor readiness cannot be satisfied by the outgoing simple player's frame", () => {
  assert.equal(typeof preview.studioPreviewFrame, "function", "editor readiness identifies its own frame");
  const current = { serverUrl: "http://127.0.0.1:48620", projectName: "vlog", studioUrl: "http://127.0.0.1:48620/#project/vlog" };
  const simple = { url: "http://127.0.0.1:48620/api/projects/vlog/preview", parent: { url: "file:///app/index.html" } };
  const editor = { url: "http://127.0.0.1:48620/api/projects/vlog/preview/comp/scenes/intro.html", parent: { url: `${current.studioUrl}?v=1&t=0&tab=design&rc=0` } };
  const wrong = { ...editor, parent: { url: "http://127.0.0.1:48621/#project/vlog" } };
  assert.equal(preview.studioPreviewFrame([simple, wrong, editor], current), editor);
  assert.equal(preview.studioPreviewFrame([simple, wrong], current), undefined);
});
