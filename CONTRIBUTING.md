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
npm run dist      # the Windows installer, into app/dist (GitHub also builds it for every push: "Installer")
```

Look at the screenshots in `app/.smoke/`, not only the PASS line. If you changed how an agent is driven, also
run that agent's test. These spend real usage on the owner's plan, so only then:

```
npm run smoke:agent         # Claude Code
npm run smoke:codex         # Codex
npm run smoke:antigravity   # Antigravity (Gemini)
```

To measure how smoothly a real project plays (dropped pictures, how long the picture holds at each join,
whether the clock keeps time), how long a jump to a moment and a dragged playhead take to show their picture,
how long the editor takes to open, and the app's memory, on the watching screen and in the editor. It changes nothing in the project,
spends no usage, and keeps the mouse out of its window while it runs. Set both, then `npm run smoke`:

```
HFWIN_SMOKE_PLAYBACK=1                       # or "watch" or "edit" for one screen
HFWIN_SMOKE_REAL_PROJECT=<the project folder>
HFWIN_SMOKE_PLAYBACK_AT=40:20                # optional: "start:seconds" stretches to play; "none" for jumps only
```

No footage of your own to measure with? `node scripts/test-vlog.mjs <folder>` makes a practice project shaped
like a phone vlog (19 clips of 1080p at 16 Mbps, about four and a half minutes; needs FFmpeg, takes a few
minutes). `pictureShortSides` in the result says whether the lighter copies were played (`[720]`) or the
originals (`[1080]`).

The numbers land in `app/.smoke/result.json` under `playback`; how to read them is at the top of
`app/src/main/playbackProbe.js`.

To send one real request to a real project through the chat, without the self-test's own steps (this spends
usage; it is how the owner's vlog and shorts are edited from here):

```
HFWIN_SMOKE_JUST_ASK=1
HFWIN_SMOKE_REAL_PROJECT=<the project folder>
HFWIN_SMOKE_REQUEST_FILE=<a text file holding the request>
HFWIN_SMOKE_ACCESS=tools            # optional: project, tools or full
HFWIN_SMOKE_MODEL=sonnet            # optional: a model from the chat's menu
HFWIN_SMOKE_TURN_MINUTES=45         # a long edit needs longer than the seven-minute default
HFWIN_SMOKE_NAME=vlog               # optional: keep this run's files in app/.smoke-vlog
HFWIN_SMOKE_EXPECT=<a text>         # what index.html will contain after the edit; without it the run looks for
                                    # the self-test's own title and reports "the project file did not change"
```

then `npm run smoke:agent` (or `smoke:codex`, `smoke:antigravity`). With `HFWIN_SMOKE_NAME` set, several runs
can go at once. The full-screen check passes only while the self-test's window is in front; with another
window in front the run says "full screen was NOT checked" instead of failing.

Other switches for `npm run smoke`, each for one question:

```
HFWIN_SMOKE_FIRST_OPEN=1 + HFWIN_SMOKE_REAL_PROJECT=<folder>   # time "Getting the editor ready" (M16-10)
HFWIN_SMOKE_PROJECTS_ROOT=<folder>     # keep the run's projects there (deep paths, other drives: M6-01, M6-03)
HFWIN_SMOKE_GET_FFMPEG=1               # with FFmpeg off PATH: press Home's "Get it now" for real (115 MB, into
                                       # the run's own folder), then the whole run on the app's own FFmpeg (M5-03)
```

## Where things live

```
app/src/main/            the main process (Node): the only code with file and process access
  main.js                window, security rules, the list of calls the page may make
  projects.js            list, create, open a project
  folderName.js          a new video's folder name, in any script
  videoManage.js         a card's "Rename" (the name, and the folder of a video the app made) and "Move to the Recycle Bin"
  mediaImport.js         safe footage copies and bounded folder scanning
  preview.js             start and stop the HyperFrames preview server
  cli.js                 run the HyperFrames CLI with Electron's own Node
  proc.js                end a process tree; collect a child's output
  state.js  jsonFile.js  settings and safe file writes
  selection.js           what is selected in the editor, for the chat's "Pointing at"
  editorKeys.js          arrow keys in "Edit by hand": a ten-second skip while the video plays
  editorPrep.js          "Getting the editor ready" while Studio prepares a project's first open
  ffmpegTool.js          FFmpeg with one press on a PC that has none: pinned, checked, in the app's own folder
  updates.js             the release check in Settings, and the safe page link it can open
  say.js                 marks a sentence the main process writes for the person, so the page can translate it
  dialogTitle.js         the title of a native folder window: the page's own words (it knows the language), checked
  exporter.js            "Save video": the video file, made into the Downloads folder
  log.js                 the problem report: a daily log file with nothing private in it (`redact`)
  lightCopies.js         720p copies of big clips for smooth watching and editing, and the redirect to them
  covers.js              Home's picture of each video, captured from the player
  drawings.js            "Draw on the picture": the window's picture with the person's coral marks, kept in .hyperframes/notes
  storage.js             Home's "Undo copies take ..." and "Free up space" (upstream's `hyperframes clean`)
  health.js              Home's "Before you start": what this computer still needs (`hyperframes doctor`)
  kits.js                saved looks: a video's STYLE.md kept under a name and used again
  mentions.js            the "@" list in the message box, and clips dropped on the chat
  askAgent.js            the editor's own "Ask agent" buttons go to the chat box
  loudness.js            the saved video's sound, brought to the loudness YouTube and Instagram play at
  smoke.js               the self-test's steps
  playbackProbe.js       the self-test's playback measurement on a real project
  study.js  studyPlan.js the footage study: transcripts and frame sheets written into the project
  speechTool.js          Whisper for the languages Parakeet does not speak, fetched on the person's "Get it"
  shorts.js  shortsMaker.js  "Make shorts": the plan in SHORTS.md, one video per short, then built one by one
  studyRead.js           bounded read-only review of indexed study files
  agents/
    index.js             runs chat turns, keeps each project's conversation
    launcher.js          start any agent tool without a shell
    setup.js             "Open PowerShell for me": an assistant's own install or sign-in, in a visible window
    language.js          the person's language and the menu names as shown, for the assistant
    journal.js           the project's shared memory across agents
    house.js             the note every agent is given
    versions.js          "is the installed agent newer than we tested?"
    access.js            the three access levels and which one a project is on
    working.js           the three ways of working, and the plan that waits for a yes
    craft.js             the editing and motion guides written into every project
    limits.js            recognises an assistant stopped by its usage limit
    sizing.js            "Auto": a smaller model for a small change
    turnHistory.js       "Undo this change": each turn is one entry in HyperFrames' history
    turnCheck.js         the app's check for mistakes after each change
    automationCheck.js   the check that sound fades and automation will not stop "Save video"
    checkup.js           "Test it now" for an assistant newer than the app was tried with
    lookTool.js          how each assistant is given the "look at the video" tool
    mediaTools.js        puts the FFmpeg check on an agent's PATH
    tools/               the check itself: rules.js (what is allowed), guard.mjs, and bin/ (the stand-ins);
                         look.mjs, the "look at the video" tool server
    claude.js  codex.js  antigravity.js     one bridge per agent
app/src/preload/         preload.cjs: the only bridge between page and main process
app/src/renderer/        the page: Home, the project view, the chat (plain DOM, no build step)
app/scripts/             check.mjs, test.mjs, smoke.mjs, test-vlog.mjs (a practice project for measuring)
app/test/                unit tests (Node's built-in test runner, on Electron's own Node: see test.mjs)
docs/                    ARCHITECTURE, FINDINGS, MAINTENANCE, HANDOFF, RESEARCH (what other projects teach)
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
