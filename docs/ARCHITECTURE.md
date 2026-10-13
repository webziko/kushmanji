# Architecture

How the Windows app is put together, and why. Read FINDINGS.md first for what is open source and what is not.

## Goal

An unofficial Windows desktop app that gives the experience of the HyperFrames Studio app: open the app, describe
a video, an agent on the computer builds it, edit it, export it. It is built only from open-source HyperFrames
packages plus our own code.

Not goals: copying HeyGen's closed code or branding, HeyGen account sign-in, a macOS or Linux build (the official
app covers those).

## Shape

```
┌──────────────────────── Electron main process (app/src/main) ───────────────────────┐
│  main.js      window, IPC, single instance, shutdown                                 │
│  projects.js  list / create / open-a-folder                                          │
│  preview.js   starts and stops the preview server ──spawn──▶ hyperframes CLI         │
│  agents/      starts the agent for a chat turn    ──spawn──▶ claude / codex          │
└───────────────▲─────────────────────────────────────────────────────────────────────┘
                │ IPC through preload.cjs (named calls only)
┌───────────────┴──────── Renderer: the shell page (app/src/renderer) ─────────────────┐
│  Home (project list)                                                                 │
│  Project view:  [ chat panel ]  [ <iframe> Studio at http://127.0.0.1:48620 ]        │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Studio itself is unchanged upstream code, served by `hyperframes preview`. The shell frames it and adds what the
closed app adds around it.

## Decisions

| Decision | Why |
| --- | --- |
| **Electron**, not Tauri | The official app is Electron. Node is needed anyway to run the CLI. No Rust toolchain on this machine. Bundled Chromium means Studio renders the same on every Windows version |
| **Frame Studio in an `<iframe>`** instead of importing `@hyperframes/studio` components | Works today with zero coupling to Studio internals, and upgrades by bumping one version number. The server sends no frame-blocking headers. Cost: the chat cannot yet draw on the picture (see "Later") |
| **CLI from our own `node_modules`, run by Electron's Node** (`ELECTRON_RUN_AS_NODE=1`) | No global install, no `npx` network fetch, no separate Node needed. Verified: Electron 44 carries Node 24 and `hyperframes doctor` passes under it |
| **CLI version pinned exactly** in `app/package.json` | Upstream releases several times a week. An upgrade is a deliberate change that must pass `npm run smoke` |
| **One fixed port, 48620, on 127.0.0.1** | Browser storage is per origin. A changing port would reset Studio's theme, layout and export settings on every launch. `127.0.0.1` because Windows can resolve `localhost` to `::1`, where nothing listens. Loopback only, so no firewall prompt |
| **One open project at a time** | Matches the official app and keeps one server, one port, one agent run |
| **Projects in `~/.hyperframes-studio`** | The folder the official docs name. Projects made here will be found by the official Windows build when it ships. "Open a folder" handles projects kept anywhere else |
| **Kill the process tree with `taskkill /T /F`** | Windows cannot signal a process group. A plain kill leaves the server's Chrome and FFmpeg running and the port bound |
| **Renderer is plain DOM, no build step** | Two screens. No bundler means nothing to break between two AIs. Revisit if we import Studio's React components |
| **Its own name and app id**; a plain play mark, not HeyGen's logo; "unofficial" in the header | It must not pass for HeyGen's product, and must not collide with the official Windows build at `%LOCALAPPDATA%\Programs\HyperFrames` |
| **No HeyGen sign-in, no telemetry of our own** | The agent runs on the person's own Claude or ChatGPT plan. The CLI keeps its own anonymous telemetry setting, which we do not change |

## Security model

The full picture, with what is still open, is in `SECURITY.md`. The mechanics:

- Renderer: `sandbox: true`, `contextIsolation: true`, no Node. It talks to the main process only through the
  named calls in `preload.cjs`.
- CSP on the shell page: only its own scripts and styles; only `http://127.0.0.1:*` may be framed.
- The shell page cannot be navigated away from. Links to the web open in the default browser.
- Every IPC call is answered only when it comes from the app's own page in the top frame (`fromAppPage`).
- Every IPC call that takes a folder checks it is an absolute path to a real project (`requireProject`).
- Browser permissions are refused app-wide, except the clipboard, full screen and the font list for Studio's
  local server (`lockDownSession`).
- Studio's iframe is another origin. It cannot reach the shell page or the preload API.
- The agent can edit files and run commands. What it may do is the access level the person picks under the chat
  box (see "Access levels" below).

## IPC contract

Calls return `{ ok: true, value }` or `{ ok: false, error }`; `preload.cjs` unwraps that into a normal promise.
Add a channel in three places: `main.js` (`handle`), `preload.cjs` (the exposed object, and `EVENTS` for events),
and the caller in `renderer/`.

| Call | Does |
| --- | --- |
| `app.info()` | App, CLI and Electron versions; the projects folder |
| `projects.list()` | `[{ dir, name, modifiedAt, external }]`, newest first |
| `projects.create(name)` | `hyperframes init` in the projects folder |
| `projects.fromFootage()` | Native folder picker; scan up to 200 media files, create a project, copy into assets, return project and imported files |
| `projects.addMedia(dir)` | Native media picker; safe copies into an existing project's assets and start its study |
| `projects.pickFolder()` | Folder dialog; must contain `index.html` |
| `projects.open(dir)` | Starts the preview server; returns `{ port, serverUrl, studioUrl, projectName }` |
| `projects.ready(dir)` | Boolean: the current project's root or selected-scene preview reports `__renderReady === true` |
| `projects.close()` | Stops the server |
| `projects.reveal(dir)` / `projects.forget(dir)` | File Explorer / drop from the list (files untouched) |
| `study.status(dir)` | `{ running, done, total, current, step, language, languages, clips: [{ file, kind, seconds, words, language, languageSure, notes }] }` |
| `study.clip({ dir, file })` | Read one indexed saved study: up to four sheet data URLs, text, dimensions, notes and optional visual review |
| `study.run(dir)` | Study every clip again from the start |
| `study.setLanguage({ dir, language })` | The language spoken in the footage (a two- or three-letter code), or `null` for "Automatic". Studies the words again |
| event `study:event` | `{ dir, status }`: the study started, moved on or ended |
| `agent.status()` | `[{ id, name, install, signIn, tested, state, version?, detail?, untested, models, model }]`, one per bridge. Starts each tool, so it takes seconds |
| `agent.history(dir)` | `{ messages, engine, running, agents: [{ id, name }], access, accessLevels: [{ id, name, about }] }` from the project's `.hyperframes/studio-win-chat.json` and the app's settings. Instant |
| `selection.get(dir)` | What is selected in Studio now, for the chat's "Pointing at" line: `{ key, name, kind, when }` or `null`. Read from Studio's own server |
| `agent.send({ dir, text, pointing })` | Starts one chat turn. `pointing: true` asks the main process to read Studio's selection and tell the agent which element the request is about. Refused while another turn is running |
| `agent.chooseMode({ dir, mode })` | How involved the person wants to be in this project: `build`, `review` or `codirect`. Kept with the project's chat |
| `agent.chooseAccess({ dir, level })` | How much the agents may do in this project, from the next message. Only `project`, `tools` or `full` is accepted. Kept in the app's settings, not in the project |
| `agent.choose({ dir, engine })` | Switch this project's chat to another agent, from the next message |
| `agent.chooseModel({ engine, model })` | The model an agent uses, everywhere; `null` is the agent's own default. Only an id from that agent's `models()` is accepted |
| `agent.stop()` / `agent.reset(dir)` | Stop the run / forget the conversation (project files untouched) |
| event `app:open-project` | `{ dir }`: open this project (command line, second launch, smoke test) |
| event `preview:exit` | `{ dir, code }`: the server died by itself |
| event `agent:event` | `{ dir, event }`: one event from the running turn (see the contract below) |

## Agent bridge contract

Each agent is one module in `app/src/main/agents/` with the same three exports, so the chat never knows which
agent it is talking to. `claude.js` is the reference; `codex.js` and `antigravity.js` follow it. (Four exports
now: `models()` was added with the model menu.)
`agents/index.js` holds the list (`BRIDGES`), runs one turn at a time, and saves each project's conversation,
with a separate session id per agent so switching agents does not lose either one's thread.

```js
about                          // { name, install: [commands], signIn: [commands], tested: "version" }
models()                       // → [{ id, name }], read from the agent itself where it has a list; [] is fine
status()                       // → { state: "ready" | "not-installed" | "not-signed-in" | "broken", version?, detail? }
run({ dir, text, sessionId, model, access, onEvent })   // → { stop({ sync }) }
```

`onEvent` receives, in order: `{ type: "session", id }`, any number of `{ type: "text", text }` and
`{ type: "activity", label, detail }`, then exactly one `{ type: "done", ok, stopped?, error? }`. `done` must
arrive on every path: a failed spawn, a crash, a stop. `sessionId` is the id from an earlier `session` event,
passed back so the agent continues the same conversation; `access` is `"project"`, `"tools"` or `"full"`.

`agents/launcher.js` is shared by every bridge: `resolveTool` finds the tool and works out how to start it
without a shell (an .exe directly; an npm `.cmd` shim by running the script it wraps with Node), `startTool`
spawns it, `readJsonLines` splits its output, and `agentEnv` drops a parent agent session's variables.
`agents/house.js` holds the note every agent is given about who it is talking to.

Claude Code specifics, measured here: `claude -p --output-format stream-json --verbose
--include-partial-messages`, `--resume <id>` to continue, `claude auth status` prints JSON with `loggedIn`.

Codex specifics, measured here: `codex exec --json --skip-git-repo-check -` reads the message from stdin;
`codex exec resume <thread_id> ... -` continues. `resume` has no `--sandbox` or `--cd`, so the sandbox is set
with `-c sandbox_mode=...` and the folder with the process's working directory. Events are `thread.started`,
`item.started` / `item.completed` (`agent_message`, `command_execution`, `file_change`, `error`),
`turn.completed` and `turn.failed`. `codex login status` prints "Logged in using ChatGPT" or "Not logged in".

Antigravity specifics, measured here (agy 1.3.3): `agy -p <text> --output-format stream-json`; `--conversation
<id>` continues; `agy models` lists `id<TAB>name`. Every event nests its payload under a key named after the
event. Tool steps carry `tool_name` (`view_file`, `replace_file_content`, `run_command`) and
`tool_info.parameters`. There is no command that reports sign-in.

## Access levels

The person picks one of three levels in the menu under the chat box (`agents/access.js`):

| Level | The agent may | How each bridge enforces it |
| --- | --- | --- |
| `project` "Project only" | Edit the project's files, run HyperFrames commands | Claude Code: an allow-list of commands. Codex: its sandbox. Antigravity: approve-all plus its terminal sandbox |
| `tools` "Editing tools" | The same, plus `ffmpeg` and `ffprobe` on files inside the project | Claude Code: the allow-list gains those two names, in Bash only. Codex and Antigravity: the same switches as `project` |
| `full` "Full access" | Anything | Each agent's own "skip every check" switch |

The level is stored in the app's settings (`state.json`, `access: { byProject, usual }`), never in the project:
a folder someone else made must not be able to give itself access. A new project starts on the level last
chosen, except `full`, which is only ever on for the project it was chosen in and asks before it is applied.
`AgentRunner.send` reads the level itself; the page cannot pass one in.

**The FFmpeg check.** Below `full`, `mediaToolsEnv` (`agents/mediaTools.js`) puts `agents/tools/bin` first on
the agent's PATH. Its `ffmpeg` and `ffprobe` (a shell script for Git Bash, a `.cmd` for PowerShell and cmd) run
`agents/tools/guard.mjs` with Node, or with Electron's own Node when none is installed. The guard refuses at
`project`; at `tools` it asks `agents/tools/rules.js` whether every file the command names is inside the
project, then runs the real program with the same arguments or prints the reason and exits with 77. The reason
is a sentence written for the agent to act on.

Why a stand-in under the real name, and not a command of our own: the agents and the HyperFrames skills already
write `ffmpeg ...`, so nothing has to be taught. HyperFrames' own commands are pointed straight at the real
programs (`HYPERFRAMES_FFMPEG_PATH`), because a render writes to cache folders outside the project.

The agent is told its level in words (`accessNote`) at the start of each conversation and again whenever the
person changes it, so it can say "choose Editing tools" instead of failing oddly.

## Pointing

The person clicks something in Studio's picture or timeline, and the chat says "Pointing at the video clip
“City Centre”, 0:26 to 0:41". Their next message is about that element.

Studio already publishes its selection to its own local server (`PUT /api/projects/:id/selection`, upstream's
`studio-server/src/routes/selection.ts`). `selection.js` reads it back with a plain GET: nothing is injected into
Studio's frame, and the frame gains no way to call the app. The chat looks every second and a half
(`selection.get`). When a message is sent with the line showing, the main process reads the selection again
itself and puts a short note in front of the request (`pointingNote`): which element, its id, its file, where it
sits on the timeline, its words. The person can dismiss the line with ✕ to send a message that is not about it.

Not built yet: Studio's own "Ask agent about this element" box still only copies a prompt to the clipboard, and
drawing or commenting on the frame needs Studio's parts mounted directly (see "Later").

## Ways of working

Upstream's three, named as upstream names them (`agents/working.js`): "Build it for me", "Review the story
first", "Co-direct it". The choice is kept with the project's chat. In the last two the agent is told to write
its plan into the project's plan files, tell the person the plan in a few lines, and end its message with a
line that says only `PLAN READY`. The app removes that line and shows two buttons instead: "Build it" (which
sends "Yes. Build the plan you just showed me.") and "Change the plan".

The wait is an instruction, not a lock: the agent keeps its access, so a one-word change needs no ceremony.
What the app adds is the check afterwards. It lists the files the planning turn changed, and if any is not a
plan file (a Markdown file at the top of the project) the chat says so under the plan, in red.

## The study

Before anyone cuts, the app studies the project's footage (`study.js`, decisions in `studyPlan.js`). For
every video and sound file it writes, inside the project at `.hyperframes/study/`:

- `<clip>/sheet-N.jpg`: still frames laid out four across, each with its time printed on it. About one every
  two seconds, at most 96 for one clip, so an hour of footage still fits in four pictures.
- `<clip>/transcript.json`: every word with its start and end, in HyperFrames' own format, made by
  `hyperframes transcribe`. `<clip>/transcript.txt`: the same as readable lines, `[0:06.7 - 0:10.8] Finally…`.
- `index.json`: one entry per clip (length, size, frame rate, the sheets with the second of each frame, the
  transcript, and `notes` in plain words for anything that could not be studied), plus an `about` line that
  tells an agent how to read it.

It lives in the project so that every agent, and any tool outside this app, reads the same thing. The house
note points agents at `index.json`. A clip is studied again only when its size or date changes, or when the
person changes the spoken language; a removed clip's study is removed.

When it runs: when the project opens, when a media file appears or changes in the folder (a watcher, with a
two-second quiet period for copies in progress), and before every chat turn (`AgentRunner`'s `prepare`), which
waits for it and shows "Studying your footage" as the step. Stop ends the wait, not the study.

Words: Parakeet for English and 24 other European languages, Whisper for the rest (`chooseEngine`). With the
language left on "Automatic" and only Parakeet present, the transcript is marked `languageSure: false`,
because Parakeet writes confident nonsense for a language it does not speak. A language no installed engine
speaks gets a note, never a wrong transcript.

## Footage intake and review

`mediaImport.js` validates the entire selection before copying. It never moves source files or rewrites the
composition; duplicate asset names receive a suffix. Native dialogs choose the source; importing is refused
while an agent is running. Folder scans skip links, hidden directories and tool output folders, with caps of
200 media files and 20,000 entries. An assets junction leading outside the canonical project is refused.

`studyRead.js` opens only records named in `.hyperframes/study/index.json`. Both lexical and real paths must
stay within the canonical project's study directory. It returns bounded local sheet data URLs and plain text;
the renderer does not receive a generic filesystem reader. The review dialog can draft a question about the
selected clip; drafting and importing do not spend agent usage or automatically send a message.

The renderer polls `projects.ready` before removing its loading state or sending Home's initial creation
request. The main process reads only a boolean from the matching preview frame, which may be the root preview
or a saved selected sub-composition. It returns no executable bridge to the composition.

## Shared memory across agents

Three agents can take turns on one project, and each has only its own conversation. Two things carry the
story from one to the next (`agents/journal.js`, `agents/house.js`):

1. **The journal.** Every finished turn, whoever ran it and however it ended, is appended to the project's
   `.hyperframes/app-history.jsonl`: `{ at, engine, asked, did, files }`. This is upstream's own format (the
   official app writes it and `hyperframes catch-up` reads it), so the record outlives this app.
2. **The handover.** When a message goes to an agent that was not the last to work, the app puts a short
   summary in front of it: what the others were asked, what they reported, which files they changed, capped
   at the last eight turns. The agent that worked last gets nothing extra.

The plan itself is not in either. It lives in the project's files (`BRIEF.md`, `STORYBOARD.md`, `DESIGN.md`,
`frame.md`, which the HyperFrames skills already write), and the house note tells every agent to read them
before a large change and keep them current.

The chat the person sees (`.hyperframes/studio-win-chat.json`) is a separate file with more in it (steps,
errors, stopped runs). "New chat" clears that and each agent's conversation; it never clears the journal.

## Agents that update themselves

See `docs/MAINTENANCE.md`. In short: unknown events are ignored, model lists come from the agents, and each
bridge's `about.tested` lets the chat say when the installed agent is newer than the one this app was run
against (`agents/versions.js`).

Rules every bridge follows on Windows:

- The user's message goes in on **stdin**, never as a command-line argument. Quoting user text through `cmd.exe`
  is how injection bugs happen.
- npm-installed CLIs are `.cmd` shims. Node refuses to spawn those without a shell, so resolve the real script or
  use `shell: true` with fixed arguments only.
- `cwd` is the project folder. Stop with `killTree`.

## Verifying a change

```
cd app
npm run check     # every source file parses (seconds, no window)
npm run smoke     # the real app: Home → create project → Studio; screenshots in app/.smoke/
```

`npm run smoke` uses a throwaway projects folder, so it never touches real projects. Look at the screenshots, not
only the PASS line.

## Later

- **Deeper embedding.** `@hyperframes/studio` exports `EditorShell`, `Timeline`, `AskAgentModal`,
  `usePreviewCompositionRect` and friends for a host app. Mounting those in our own page is how the official app
  gets drawing and comments on the picture. It needs React 19 and a bundler, so it is a deliberate later step.
- **Packaging.** With asar on, the CLI's native parts (esbuild, sharp, the Chrome download) must be unpacked.
  So must `src/main/agents/tools/`: a shell has to be able to run the files in it. `mediaTools.js` already
  looks for them under `app.asar.unpacked`.
