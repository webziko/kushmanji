# Kushmanji: rules for AI agents

The app is called **Kushmanji** (owner, 2026-10-13). Until then it was "HyperFrames Studio Win", which is why
internal names (`hfwin`, `HFWIN_...`, `studio-win-chat.json`) and this folder keep the old prefix. Do not
rename those: nothing a person sees depends on them, and projects on disk do.

Several AI agents build this repository: **Claude** (Claude Code), **ChatGPT** (Codex), and possibly **Gemini**
(Antigravity). This file is the shared rulebook. Each reads it at the start of every session. `CLAUDE.md` only
imports this file, so there is one copy. People working on the code start with `CONTRIBUTING.md`.

Do not confuse the two roles an agent has here. Building this app is governed by this file. Being driven *by*
the app, as the agent in its chat, is governed by `app/src/main/agents/house.js`.

The owner works from a Windows 11 machine, often from a phone, and is not expected to read code. Tell them what
changed in plain words.

**Who the app is for:** many people making any kind of video, most of whom have never used a terminal. Nothing
may depend on the owner's own machine, folders, channel or language. Build for a stranger's fresh Windows PC.

## What this project is

An unofficial Windows desktop app for [HyperFrames](https://github.com/heygen-com/hyperframes). The official
HyperFrames Studio desktop app is closed source and has no Windows build. We build our own on top of the
open-source Studio and CLI. Details: `docs/FINDINGS.md` (the facts) and `docs/ARCHITECTURE.md` (the design).

## Start of every session

1. Read `PROGRESS.md`: what is done, what is claimed, what is next.
2. Read the newest entry in `docs/HANDOFF.md`: what the last session left for you.
3. Run `git status` and `git log --oneline -10`. Files you did not change may be the other agent's work in
   progress. Never revert, reformat or "tidy" them.
4. Pick a task and **claim it in `PROGRESS.md` before you write code** (see below).

## End of every session

1. `cd app && npm run check && npm test && npm run smoke` must pass. Look at the screenshots in `app/.smoke/`.
2. Update `PROGRESS.md`: tick what is done, release what you did not finish, add tasks you discovered.
3. Update `CHECKLIST.md`, the owner's short view: what now works, what is waiting on them, and anything you
   changed on their computer outside this folder.
4. Add an entry at the top of `docs/HANDOFF.md`.
5. If you changed how the parts fit, a security rule, or an upkeep routine, update `docs/ARCHITECTURE.md`,
   `SECURITY.md` or `docs/MAINTENANCE.md` in the same session. A document that is wrong is worse than none.
6. Tell the owner, in plain words, what works now that did not before.

## Sharing the work

- **One task, one owner.** A task is claimed by changing `[ ]` to `[~]` and adding your name:
  `- [~] M2-03 Codex bridge (ChatGPT)`. Finished: `- [x] M2-03 Codex bridge (ChatGPT, 2026-10-14)`.
- Do not work on a task the other agent has claimed. If it looks stuck, say so in `docs/HANDOFF.md` and let the
  owner decide.
- Stay inside your task's files. If a task needs a change to a shared file (`main.js`, `preload.cjs`, `app.js`,
  `styles.css`, `package.json`), keep the change small and mention it in the handoff.
- Default split, so the two agents rarely touch the same file. The owner can change it:
  - **Claude**: the main process (`app/src/main/`), the agent bridges, Windows process and path handling.
  - **ChatGPT**: the installer (M5), agent status and settings screens, and test coverage (M9-06).
  - Each agent is the authority on its own bridge: Codex on `agents/codex.js`, Gemini on `agents/antigravity.js`.
    If the bridge describes your own behaviour wrongly, fix it and say so in the handoff.
- Disagree with a decision in `docs/ARCHITECTURE.md`? Write the case in `docs/HANDOFF.md`. Do not silently
  rewrite the other agent's design.
- **Commits**: only when the owner asks. Use conventional commits (`feat:`, `fix:`, `docs:`) and one task per
  commit, with the task id in the message: `feat(agents): Codex bridge (M2-03)`.

## Layout

```
README.md         what this is and how to run it
CHECKLIST.md      the owner's short view: works / waiting on them / next
PROGRESS.md       every task, with who has it
AGENTS.md         this file          CLAUDE.md   imports this file
CONTRIBUTING.md   how to work on the code, with the file map
SECURITY.md       what the app is trusted with and what limits it
docs/             ARCHITECTURE.md  FINDINGS.md  PARITY.md  MAINTENANCE.md  HANDOFF.md
.github/          CI workflow
app/              the Electron app
  src/main/         main process: window, security rules, projects, preview server
  src/main/agents/  one bridge per agent, the launcher, the shared journal
  src/preload/      preload.cjs, the only bridge to the page
  src/renderer/     the page: Home, the project view, the chat (plain DOM, no build step)
  scripts/          check.mjs, smoke.mjs
  test/             unit tests
upstream/         read-only clone of heygen-com/hyperframes, for reference (git-ignored, 1.5 GB)
```

## Commands

Run from `app/`. They work the same in PowerShell, cmd and Git Bash.

```
npm install        # once, and after package.json changes
npm start          # open the app
npm run check      # every source file parses
npm test           # unit tests
npm run smoke      # end-to-end self-test with screenshots; uses its own projects and settings folders

# One real chat request each. They spend the owner's usage on that agent: run only after changing agent code.
npm run smoke:agent         # Claude Code
npm run smoke:codex         # Codex
npm run smoke:antigravity   # Antigravity (Gemini)
```

## Windows rules

This app exists because of Windows, so these are not optional. Each one is a bug someone already hit.

- **Paths.** Build them with `node:path`. Never join with `/` or `\` by hand. Compare paths case-insensitively.
  Expect spaces and non-ASCII characters in every path (`C:\Users\José Müller\...`).
- **Spawning.** Pass arguments as an array, never one command string. `.cmd` and `.bat` shims (everything npm
  installs globally) cannot be spawned without a shell: resolve the real script, or use `shell: true` with fixed
  arguments only. User text goes through **stdin**, never the command line.
- **Stopping.** Use `killTree` from `app/src/main/proc.js`. `child.kill()` leaves grandchildren running and the
  port bound.
- **`localhost`.** Use `127.0.0.1`. Windows may resolve `localhost` to `::1`.
- **npm scripts** must run in cmd.exe: no `VAR=x command`, no `&&`-chained bash, no `rm -rf`, no single quotes.
  Put logic in a `.mjs` script instead.
- **File writes** can fail with `EBUSY` or `EPERM` while an antivirus or indexer holds the file. Write to a temp
  file and rename, with a fallback (see `state.js`).
- **Line endings** are LF (`.gitattributes`). Do not commit CRLF.
- **Electron's main process is an ES module.** Do not `await app.whenReady()` at the top level: it deadlocks.
  Use `app.whenReady().then(...)`.
- Always pass `windowsHide: true` when spawning, or a console window flashes on screen.

## Hard limits

- `upstream/` is reference only. Do not edit it. A Windows bug in upstream goes in `PROGRESS.md` under
  "Upstream", with a reproduction, to become a pull request to heygen-com/hyperframes.
- Do not use HeyGen's logo or present this app as official. It says "unofficial" in its header for a reason.
- Do not call HeyGen's sign-in or account services. Do not add telemetry.
- Do not weaken the renderer's sandbox, context isolation or CSP to make something work. Add a named IPC call.
- Do not bump the `hyperframes` version in `app/package.json` as a side effect. It is its own task, and it must
  pass `npm run smoke`.
- Never delete a user's project files. "Remove from list" forgets a folder; it does not touch it.
- Do not change anything on the owner's computer outside this folder (another program's settings, a global
  install, PATH) without asking them first. When they agree, record what changed and how to undo it in the
  table at the bottom of `CHECKLIST.md`.
- Do not copy files from AGPL or GPL projects into this repository (OpenMontage is AGPL). It would bind the whole
  project to that licence. Using such a tool beside the app is fine.

## Code style

Plain JavaScript (ES modules), two-space indent, double quotes, semicolons, lines up to about 110 characters.
Comments say why, not what, and are written for the other agent, who was not there when you decided. Errors shown
to the owner are plain sentences without jargon.
