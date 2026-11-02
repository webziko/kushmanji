// Requests from Studio's page that Kushmanji refuses (studioRequests.js).
import assert from "node:assert/strict";
import { test } from "node:test";
import { refused, STUDIO_REQUESTS } from "../src/main/studioRequests.js";

test("Studio's question 'show the desktop app button?' is refused, on any port", () => {
  assert.equal(refused("http://127.0.0.1:48620/api/open-in-desktop"), true);
  assert.equal(refused("http://127.0.0.1:48621/api/open-in-desktop?x=1"), true);
  assert.ok(STUDIO_REQUESTS.some((pattern) => pattern.includes("/api/open-in-desktop")));
});

test("everything else Studio asks its server goes through", () => {
  assert.equal(refused("http://127.0.0.1:48620/api/projects/demo/preview/index.html"), false);
  assert.equal(refused("http://127.0.0.1:48620/api/open-in-desktop-later"), false);
  assert.equal(refused("http://example.com/api/open-in-desktop"), false);
  assert.equal(refused("not a url"), false);
});
