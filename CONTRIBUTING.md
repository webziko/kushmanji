# Contributing

For a person (or an AI) picking this project up. Ten minutes here saves an afternoon.

## Get it running

You need Windows 10 or 11, Node.js 22 or newer, and FFmpeg on PATH.

```
cd app
npm install
npm start
```

If Electron is reported missing, run `node node_modules/electron/install.js` once.

## Before you call a change done

```
cd app
npm run check     # every file parses           (seconds)
npm test          # unit tests                  (seconds)
npm run smoke     # the real app, end to end    (about a minute, opens a window)
npm run smoke:study   # the same, plus footage with real speech in it (slower; needs the voice model)
```

Look at the screenshots in `app/.smoke/`, not only the PASS line. If you changed how an agent is driven, also
run that agent's test. These spend real usage on the owner's plan, so only then:

```
npm run smoke:agent         # Claude Code
npm run smoke:codex         # Codex
npm run smoke:antigravity   # Antigravity (Gemini)
```

## Where things live

```
app/src/main/            the main process (Node): the only code with file and process access
  main.js                window, security rules, the list of calls the page may make
  projects.js            list, create, open a project
  mediaImport.js         safe footage copies and bounded folder scanning
  preview.js             start and stop the HyperFrames preview server
  cli.js                 run the HyperFrames CLI with Electron's own Node
  proc.js                end a process tree; collect a child's output
  state.js  jsonFile.js  settings and safe file writes
  selection.js           what is selected in the editor, for the chat's "Pointing at"
  smoke.js               the self-test's steps
  study.js  studyPlan.js the footage study: transcripts and frame sheets written into the project
  studyRead.js           bounded read-only review of indexed study files
  agents/
    index.js             runs chat turns, keeps each project's conversation
    launcher.js          start any agent tool without a shell
    journal.js           the project's shared memory across agents
    house.js             the note every agent is given
    versions.js          "is the installed agent newer than we tested?"
    access.js            the three access levels and which one a project is on
    working.js           the three ways of working, and the plan that waits for a yes
    craft.js             the editing guide written into every project
    mediaTools.js        puts the FFmpeg check on an agent's PATH
    tools/               the check itself: rules.js (what is allowed), guard.mjs, and bin/ (the stand-ins)
    claude.js  codex.js  antigravity.js     one bridge per agent
app/src/preload/         preload.cjs: the only bridge between page and main process
app/src/renderer/        the page: Home, the project view, the chat (plain DOM, no build step)
app/scripts/             check.mjs, smoke.mjs
app/test/                unit tests (Node's built-in test runner)
docs/                    ARCHITECTURE, FINDINGS, MAINTENANCE, HANDOFF
```

Read `docs/ARCHITECTURE.md` before changing how the parts talk to each other, and `SECURITY.md` before touching
`main.js`, `preload.cjs` or anything in `agents/`.

## Common jobs

**Add a call from the page to the main process.** Three places: `handle("thing:verb", ...)` in `main.js`, the
exposed object in `preload.cjs`, and the caller in `renderer/`. Validate every argument in `main.js`; the page is
not trusted to send sensible values.

**Add an agent.** One file in `app/src/main/agents/` exporting `about`, `status()`, `models()` and `run()`, and
one line in `BRIDGES` in `agents/index.js`. Copy `claude.js`. The contract is in `docs/ARCHITECTURE.md`. Add an
`npm run smoke:<agent>` script and run it.

**An agent updated and something broke.** See `docs/MAINTENANCE.md`.

## Rules that keep this maintainable

- **Windows first.** Read "Windows rules" in `AGENTS.md`. Every one of them is a bug that already happened.
- **No build step.** Plain JavaScript modules. If a change seems to need a bundler, raise it first.
- **Dependencies are a cost.** There are two at runtime. Adding a third needs a reason written in the commit.
- **Comments say why.** Write for someone who was not there when you decided.
- **Messages the owner sees are plain sentences.** No error codes, no stack traces, no jargon.
- **A pure function gets a unit test.** Anything that needs the window is covered by the smoke test instead.
- **Never weaken a security rule to make something work.** Add a narrow, named call instead.

## Tracking work

`PROGRESS.md` is the full task list. `CHECKLIST.md` is the owner's short view of it. `docs/HANDOFF.md` is the
running log between work sessions. Update all three when you finish; the routine is in `AGENTS.md`.
