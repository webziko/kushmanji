// Requests from Studio's page that Kushmanji refuses (studioRequests.js).
import assert from "node:assert/strict";
import { test } from "node:test";
import { cliEnv } from "../src/main/cli.js";
import { refused, STUDIO_REQUESTS } from "../src/main/studioRequests.js";

test("Studio's question 'show the desktop app button?' is refused, on any port", () => {
  assert.equal(refused("http://127.0.0.1:48620/api/open-in-desktop"), true);
  assert.equal(refused("http://127.0.0.1:48621/api/open-in-desktop?x=1"), true);
  assert.ok(STUDIO_REQUESTS.some((pattern) => pattern.includes("/api/open-in-desktop")));
});

test("Studio's usage reports to PostHog are refused, and only over https on posthog.com", () => {
  assert.equal(refused("https://us.i.posthog.com/e/"), true);
  assert.equal(refused("https://eu-assets.i.posthog.com/static/array.js"), true);
  assert.equal(refused("https://posthog.com/"), true);
  assert.equal(refused("https://notposthog.com/e/"), false);
  assert.equal(refused("https://posthog.com.evil.example/e/"), false);
  assert.ok(STUDIO_REQUESTS.includes("https://*.posthog.com/*"));
});

test("the CLI runs with HyperFrames' reporting switched off", () => {
  const env = cliEnv({ PATH: "x" }, { A: "1" }, "C:\\p");
  assert.equal(env.HYPERFRAMES_NO_TELEMETRY, "1");
  assert.equal(env.DO_NOT_TRACK, "1");
  assert.equal(env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(env.HYPERFRAMES_DESKTOP_PROJECT, "C:\\p");
  assert.equal(env.A, "1");
  assert.equal("HYPERFRAMES_DESKTOP_PROJECT" in cliEnv({}, {}), false);
});

test("everything else Studio asks its server goes through", () => {
  assert.equal(refused("http://127.0.0.1:48620/api/projects/demo/preview/index.html"), false);
  assert.equal(refused("http://127.0.0.1:48620/api/open-in-desktop-later"), false);
  assert.equal(refused("http://example.com/api/open-in-desktop"), false);
  assert.equal(refused("not a url"), false);
});
