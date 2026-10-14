// The editor's "Ask agent" requests that go to the chat instead of the clipboard (M3-02).
import assert from "node:assert/strict";
import { test } from "node:test";
import { isAgentPrompt, isStudioFrame } from "../src/main/askAgent.js";

test("Studio's requests for an assistant are recognised by how they begin", () => {
  for (const text of ["## HyperFrames element edit request v1\n...", "Edit the following HyperFrames composition:\n\nTime range:",
    'Fix these HyperFrames lint issues for project "vlog":', "Fix these runtime console errors from the composition preview",
    'Using /hyperframes, add the "Lower third" block', "Element: Title (h1)\nFile: index.html\nPosition: 10,20"]) {
    assert.equal(isAgentPrompt(text), true, text);
  }
});

test("anything else Studio copies still goes to the clipboard", () => {
  for (const text of ["assets/clip-01.mp4", "winget install ffmpeg", '{"time":1.2}', "", null]) {
    assert.equal(isAgentPrompt(text), false, String(text));
  }
});

test("only the open project's Studio page, directly in the app's page, gets the catcher", () => {
  const mainFrame = { url: "file:///app/index.html" };
  const current = { studioUrl: "http://127.0.0.1:48620/#project/vlog" };
  const studio = { url: "http://127.0.0.1:48620/#project/vlog?t=3", parent: mainFrame };
  assert.equal(isStudioFrame(studio, mainFrame, current), true);
  assert.equal(isStudioFrame({ ...studio, url: "http://127.0.0.1:48620/api/projects/vlog/preview" }, mainFrame, current), false);
  assert.equal(isStudioFrame({ ...studio, parent: studio }, mainFrame, current), false);
  assert.equal(isStudioFrame({ ...studio, url: "http://127.0.0.1:9999/" }, mainFrame, current), false);
  assert.equal(isStudioFrame(studio, mainFrame, null), false);
});
