# Maintenance

This app sits on top of five things that update on their own schedules: three AI agents, the HyperFrames CLI,
and Electron. None of them ask first. This page is the routine for each.

## The agents update (weekly, sometimes daily)

Claude Code and Antigravity update themselves in the background. Codex updates when someone runs
`npm install -g @openai/codex@latest`. Any update can change the events an agent prints, a flag's name, or the
models on offer.

**How the app copes by itself**

- Unknown events are ignored, so a new kind of event cannot crash a chat.
- Model lists are not hard-coded. Codex's comes from Codex's own list, Antigravity's from `agy models`, and
  Claude Code's are aliases ("opus", "sonnet") that follow the newest model.
- A model that disappears falls back to the agent's default.
- Each bridge names the newest version it was run against (`about.tested`). When the installed agent is newer,
  the chat shows a quiet note saying so. That note is the signal to do the routine below.

**The routine when the note appears, or an agent misbehaves**

1. Run that agent's test: `npm run smoke:agent`, `npm run smoke:codex` or `npm run smoke:antigravity`.
2. If it passes, set `about.tested` in that agent's file to the installed version. Done.
3. If it fails, see what the agent prints now. `app/.smoke/result.json` has the reply; for the raw events, run
   the agent by hand with the flags from its bridge file and compare with what the bridge expects.
4. Fix the bridge, add a line to "What changed in each agent" below, run the test again.

**What changed in each agent**

| Date | Agent | What changed | What we did |
| --- | --- | --- | --- |
| 2026-10-12 | Gemini CLI | Google switched it off for personal accounts | Built the Antigravity (`agy`) bridge instead |
| 2026-10-12 | Codex 0.145.0 | Refused the model in its own settings (`gpt-6.1-sol`) | Updated Codex to 0.162.1 |
| 2026-10-12 | Antigravity 1.3.3 | A Google Cloud telemetry add-on installed by the Antigravity IDE had a command that does not work on Windows and blocked every tool call | Switched it off: `"enabled": false` in `~/.gemini/config/plugins/googlecloudtools.datacloud_telemetry/hooks.json`. If an Antigravity update switches it back on, Gemini will stop editing again with "blocked by a failing pre-tool hook" |
| 2026-10-12 | Codex 0.162.1 | Its sandbox setup now checks a file inside the Codex *desktop app's* folder (`%LOCALAPPDATA%\OpenAI\Codex\runtimes\cua_node\...\node_repl.exe`). While that app is open the file is in use, the setup fails, and every command Codex tries is refused: "Failed to create unified exec process: helper_unknown_error: setup refresh had errors". File edits still work, so a turn looked successful. 0.145.0 had no such step. The log is `~/.codex/.sandbox/sandbox.<date>.log` | The bridge starts the turn again with Codex's other built-in sandbox (`-c windows.sandbox="unelevated"`), which has no setup step and worked with the desktop app open; it keeps using it until the app is closed (`SANDBOX_FALLBACK` in `codex.js`). Only if that fails too does the chat say so. `codex sandbox <command>` runs a command in the sandbox with no AI usage: useful for checking by hand |
| 2026-10-12 | Antigravity 1.3.3 | Events nest their payload (`{"event":"step_update","step_update":{...}}`); Google's reference shows it flat | The bridge reads both |

## The HyperFrames CLI updates (several times a week)

The version is pinned exactly in `app/package.json`. Moving to a newer one is a deliberate change:

1. Read upstream's release notes for anything about `preview`, `init`, `tts`, `transcribe` or `media-use`.
2. Change the version in `app/package.json`, run `npm install`.
3. `npm run check && npm test && npm run smoke`, then one agent test.
4. Check `preview --json` still prints the ready line `preview.js` waits for.
5. The lighter copies (`lightCopies.js`) lean on three upstream facts: the preview route
   `/api/projects/:id/preview/<path>` serves any project file outside `.hyperframes` with Range requests, and
   Studio's file watcher (`WATCHER_EXCLUDED_DIRS`) and undo history (`isHistoryPath`) skip `.cache`. If one of
   them changes, the copies stop being used or start reloading the editor. Check with the playback measurement
   (`CONTRIBUTING.md`): `pictureShortSides` must read `[720]` once the copies are made.

## The installer

`.github/workflows/installer.yml` builds `Kushmanji-Setup-<version>.exe` for every push. When it fails after a
change to `package.json`, an electron-builder or Electron update is the usual cause: build with `npm run dist` on
a Windows PC to see the message. The app is packed as plain files (`asar: false` in `app/electron-builder.yml`):
the HyperFrames CLI is run from `node_modules` by Electron's own Node and starts workers and browsers that need
real paths. Signing (to quiet SmartScreen) needs a certificate the owner would have to buy; not done.

## Electron updates (every eight weeks)

1. Bump `electron` in `app/package.json`, `npm install`, then `node node_modules/electron/install.js` if the
   binary is missing.
2. The CLI needs Node 22 or newer inside Electron. Check with:
   `ELECTRON_RUN_AS_NODE=1` set, run `node_modules/electron/dist/electron.exe -e "console.log(process.versions.node)"`.
3. Run the full test set. Read Electron's breaking changes for anything about `webContents`, sandboxing or
   permissions, since `SECURITY.md` depends on those.

## Every month

- `npm audit` in `app/`. Zero known vulnerabilities is the bar.
- Skim upstream's `packages/cli/src/utils/desktopApp.ts`. When it gains a Windows download link, the official
  Windows app has shipped. Tell the owner: that changes what this project is for.

## Before a release

- [ ] `npm run check`, `npm test`, `npm run smoke` pass
- [ ] All three agent tests pass, on the current version of each agent
- [ ] `npm audit` is clean
- [ ] `PROGRESS.md`, `CHECKLIST.md` and `docs/HANDOFF.md` are current
- [ ] Version bumped in `app/package.json`
- [ ] Installer built and tried on a machine that has never had the app (M5)
