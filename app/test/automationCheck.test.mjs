// Tests for checking data-automation attributes (M10-26).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  checkProjectAutomation,
  parseAutomationTarget,
  scanHtmlAutomation,
  validateAutomation,
} from "../src/main/agents/automationCheck.js";

test("valid shape passes validation and scan", () => {
  const valid = '{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0},{"t":0.5,"v":0.5}]}]}';
  assert.deepEqual(validateAutomation(valid), { ok: true });

  const html = `<audio id="bgm" data-automation='${valid}'></audio>`;
  assert.deepEqual(scanHtmlAutomation(html, "index.html"), []);
});

test("optional curve and via coordinates pass when valid", () => {
  const withShape = JSON.stringify({
    version: 1,
    lanes: [
      {
        target: "volume",
        points: [
          { t: 0, v: 0, curve: -0.5 },
          { t: 1, v: 1, viaX: 0.2, viaY: 0.8 },
        ],
      },
    ],
  });
  assert.deepEqual(validateAutomation(withShape), { ok: true });
});

test("Gemini's {'volume':[...]} shape without version and lanes is caught", () => {
  const gemini = '{"volume":[{"t":0,"v":0},{"t":1,"v":1}]}';
  const check = validateAutomation(gemini);
  assert.equal(check.ok, false);
  assert.match(check.error, /Unsupported automation version: undefined/);

  const html = `<audio id="bgm" data-automation='${gemini}'></audio>`;
  const mistakes = scanHtmlAutomation(html, "index.html");
  assert.equal(mistakes.length, 1);
  assert.equal(mistakes[0].text, "A sound's fade is written in a form the video cannot be saved with.");
  assert.equal(mistakes[0].where, "index.html, line 1");
  assert.match(mistakes[0].fix, /data-automation/);
});

test("version 2 is rejected", () => {
  const v2 = '{"version":2,"lanes":[{"target":"volume","points":[{"t":0,"v":1}]}]}';
  const check = validateAutomation(v2);
  assert.equal(check.ok, false);
  assert.match(check.error, /Unsupported automation version: 2/);
});

test("broken JSON is rejected", () => {
  const broken = '{"version":1,"lanes":[{ broken';
  const check = validateAutomation(broken);
  assert.equal(check.ok, false);
  assert.match(check.error, /Automation is not valid JSON/);
});

test("points that are not numbers are rejected", () => {
  const stringTime = JSON.stringify({
    version: 1,
    lanes: [{ target: "volume", points: [{ t: "0", v: 1 }] }],
  });
  assert.equal(validateAutomation(stringTime).ok, false);

  const stringVal = JSON.stringify({
    version: 1,
    lanes: [{ target: "volume", points: [{ t: 0, v: "loud" }] }],
  });
  assert.equal(validateAutomation(stringVal).ok, false);

  const missingVal = JSON.stringify({
    version: 1,
    lanes: [{ target: "volume", points: [{ t: 0 }] }],
  });
  assert.equal(validateAutomation(missingVal).ok, false);
});

test("points that are not in time order are rejected", () => {
  const outOfOrder = JSON.stringify({
    version: 1,
    lanes: [{ target: "volume", points: [{ t: 1, v: 0 }, { t: 0.5, v: 1 }] }],
  });
  const check = validateAutomation(outOfOrder);
  assert.equal(check.ok, false);
  assert.match(check.error, /points must be in time order/);
});

test("a lane with an unknown target is rejected; known targets are accepted", () => {
  const unknown = JSON.stringify({
    version: 1,
    lanes: [{ target: "unknown-target", points: [{ t: 0, v: 1 }] }],
  });
  assert.equal(validateAutomation(unknown).ok, false);

  assert.ok(parseAutomationTarget("volume"));
  assert.ok(parseAutomationTarget("rate"));
  assert.ok(parseAutomationTarget("fx.preset.warm"));
  assert.ok(parseAutomationTarget("fx.eq.gain"));
  assert.equal(parseAutomationTarget("fx.incomplete"), null);
  assert.equal(parseAutomationTarget("pan"), null);
});

test("double-quoted and single-quoted attributes are scanned", () => {
  const singleQuoted = `<audio id="a1" data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0}]}]}'></audio>`;
  assert.deepEqual(scanHtmlAutomation(singleQuoted, "index.html"), []);

  const doubleQuoted = `<audio id="a2" data-automation="{&quot;version&quot;:1,&quot;lanes&quot;:[{&quot;target&quot;:&quot;volume&quot;,&quot;points&quot;:[{&quot;t&quot;:0,&quot;v&quot;:0}]}]}"></audio>`;
  assert.deepEqual(scanHtmlAutomation(doubleQuoted, "index.html"), []);

  const badSingle = `<audio id="b1" data-automation='{"volume":[{"t":0,"v":0}]}'></audio>`;
  assert.equal(scanHtmlAutomation(badSingle, "index.html").length, 1);

  const badDouble = `<audio id="b2" data-automation="{&quot;version&quot;:2,&quot;lanes&quot;:[]}"></audio>`;
  assert.equal(scanHtmlAutomation(badDouble, "index.html").length, 1);
});

test("finds bad automation in a compositions/ file and reports where", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kushmanji-auto-"));
  try {
    const compDir = path.join(tempDir, "compositions");
    fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(
      path.join(compDir, "intro.html"),
      `<!DOCTYPE html>
<html>
<body>
  <audio id="bgm" data-automation='{"volume":[{"t":0,"v":0}]}'></audio>
</body>
</html>`,
      "utf8"
    );

    const mistakes = checkProjectAutomation(tempDir);
    assert.equal(mistakes.length, 1);
    assert.equal(mistakes[0].text, "A sound's fade is written in a form the video cannot be saved with.");
    assert.equal(mistakes[0].where, "intro.html, line 4");
    assert.match(mistakes[0].fix, /data-automation/);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows lock cleanup fallback
    }
  }
});

test("a project with no automation at all reports no mistakes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kushmanji-auto-"));
  try {
    fs.writeFileSync(
      path.join(tempDir, "index.html"),
      `<!DOCTYPE html>
<html>
<body>
  <video src="assets/vlog.mp4" data-start="0" data-end="5"></video>
</body>
</html>`,
      "utf8"
    );
    const compDir = path.join(tempDir, "compositions");
    fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, "titles.html"), "<div>Title</div>", "utf8");

    const mistakes = checkProjectAutomation(tempDir);
    assert.deepEqual(mistakes, []);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows lock cleanup fallback
    }
  }
});
