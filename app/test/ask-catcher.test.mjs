// The piece of the "Ask agent" hand-over that runs inside Studio's own page (askAgent.js, catchAgentPrompts). It is
// sent to the page as text, so it cannot be imported: the function is cut out of the source and run in a vm that has a
// stand-in for the page's `window` and `Clipboard`.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { PROMPT_STARTS } from "../src/main/askAgent.js";

const source = fs.readFileSync(new URL("../src/main/askAgent.js", import.meta.url), "utf8");
const body = source.match(/function catchAgentPrompts\([\s\S]*?\n\}\n/)?.[0];

function page() {
  const sent = [];
  const copied = [];
  class Clipboard {
    writeText(text) {
      copied.push(text);
      return Promise.resolve("copied");
    }
  }
  const window = { parent: { postMessage: (message, target) => sent.push({ message, target }) } };
  const context = vm.createContext({ window, Clipboard, RegExp, String, Promise, Array });
  const install = () => vm.runInContext(`(${body})(${JSON.stringify(PROMPT_STARTS)}, ${JSON.stringify("^Element: .*\\nFile: ")})`,
    context);
  return { sent, copied, install, clipboard: new Clipboard(), window };
}

test("the catcher can be cut out of the source", () => {
  assert.ok(body, "the function was found");
});

test("a request for an assistant goes to the chat and not to the clipboard", async () => {
  const { sent, copied, install, clipboard } = page();
  install();
  const result = await clipboard.writeText("## HyperFrames element edit request\nChange the title");
  assert.equal(result, undefined, "Studio is told the copy worked");
  assert.deepEqual(copied, []);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message.source, "kushmanji-studio");
  assert.equal(sent[0].message.type, "ask-agent");
  assert.match(sent[0].message.text, /Change the title/);
});

test("anything else Studio copies still reaches the clipboard, with its own answer", async () => {
  const { sent, copied, install, clipboard } = page();
  install();
  assert.equal(await clipboard.writeText("assets/clip.mp4"), "copied");
  assert.equal(await clipboard.writeText(42), "copied");
  assert.deepEqual(copied, ["assets/clip.mp4", 42]);
  assert.equal(sent.length, 0);
});

test("installing twice does not wrap twice, so one request is handed over once", async () => {
  const { sent, install, clipboard } = page();
  install();
  install();
  await clipboard.writeText("Fix these runtime console errors from the preview");
  assert.equal(sent.length, 1);
});

test("a very long request is cut to what the message box can take", async () => {
  const { sent, install, clipboard } = page();
  install();
  await clipboard.writeText(`Edit the following HyperFrames composition:\n${"x".repeat(50_000)}`);
  assert.equal(sent[0].message.text.length, 20_000);
});

test("an element request is recognised by its two lines even though it starts with the element's name", async () => {
  const { sent, copied, install, clipboard } = page();
  install();
  await clipboard.writeText("Element: Title (h1)\nFile: index.html\nPosition: 1,2");
  await clipboard.writeText("Element: Title but no file line");
  assert.equal(sent.length, 1);
  assert.deepEqual(copied, ["Element: Title but no file line"]);
});
