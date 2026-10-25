// "Open PowerShell for me" (M10-27): only the bridge's own commands, in a window the person can see.
import assert from "node:assert/strict";
import { test } from "node:test";
import { openSetupWindow, setupScript } from "../src/main/agents/setup.js";
import { about as claude } from "../src/main/agents/claude.js";
import { about as codex } from "../src/main/agents/codex.js";
import { about as antigravity } from "../src/main/agents/antigravity.js";

test("signing in runs only the sign-in line; installing runs the installer, refreshes PATH, then signs in", () => {
  assert.equal(setupScript(claude, "signIn"), "claude auth login");
  const install = setupScript(claude, "install");
  assert.ok(install.startsWith("irm https://claude.ai/install.ps1 | iex; $env:Path = "));
  assert.ok(install.endsWith("; claude auth login"));
  assert.equal(setupScript(codex, "signIn"), "codex login");
  assert.equal(setupScript(antigravity, "signIn"), "agy");
});

test("anything else runs nothing", () => {
  assert.equal(setupScript(claude, "uninstall"), null);
  assert.equal(setupScript({}, "signIn"), null);
  assert.equal(setupScript(undefined, "install"), null);
});

test("a hidden PowerShell opens a normal window and hands it the script encoded, so no quote can break out", () => {
  const calls = [];
  const script = "irm https://claude.ai/install.ps1 | iex; $env:Path = 'x' + \"y\"; claude auth login";
  openSetupWindow(script, {
    spawnImpl: (file, args, options) => {
      calls.push({ file, args, options });
      return { on() {}, unref() {} };
    },
  });
  assert.equal(calls[0].file, "powershell.exe");
  assert.equal(calls[0].options.windowsHide, true);
  const inner = calls[0].args.at(-1);
  assert.match(inner, /^Start-Process -FilePath powershell\.exe -WindowStyle Normal -ArgumentList '-NoExit','-EncodedCommand','[A-Za-z0-9+/=]+'$/);
  const encoded = /'([A-Za-z0-9+/=]+)'$/.exec(inner)[1];
  assert.equal(Buffer.from(encoded, "base64").toString("utf16le"), script);
});
