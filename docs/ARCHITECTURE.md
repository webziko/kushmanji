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
│  Project view:  [ large video player ]  [ chat panel ]                              │
│  Edit by hand: [ chat panel ]  [ <iframe> Studio at http://127.0.0.1:48620 ]          │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Studio itself is unchanged upstream code, served by `hyperframes preview`. The shell frames it and adds what the
closed app adds around it.

Projects open on Kushmanji's own watching screen first (M14-01). `renderer/player.js` frames the root
composition at the same server's `/api/projects/:id/preview`, scales its declared dimensions to fit, and adds
play/pause, ten-second skips, scrubbing, master sound and full screen. The full Studio iframe loads only after
"Edit by hand". Changing rooms removes the inactive frame's source and keeps the same chat instance; returning
to the player keeps its position and stays paused. Studio's saved scene remains an editor choice, while the
watching screen always shows the whole video.

`main/player.js` accepts only fixed playback actions and finite numeric values through `player:command`, and
targets only the active project's direct root preview frame. The sandboxed composition gains no preload API.
Editor readiness checks a preview under the matching Studio frame, allowing the playhead and tab query that
Studio adds to its URL; an outgoing simple preview cannot satisfy that check.

In "Edit by hand" the arrow keys are the editor's, where one press means one frame and stops the video. While
the video is playing, `main/editorKeys.js` takes a plain left or right arrow before the editor's page sees it
(`before-input-event`) and sends the same fixed ten-second skip the watching screen uses, so the video keeps
playing. It leaves the key alone when the video is paused, when a modifier is held, when the key repeats, when
the keyboard is in the chat box, and when the editor's focus is on anything that uses arrows itself (a text
box, a slider, a menu, an open dialog). Whether a key is ours has to be answered at once, so what the editor
is doing is asked four times a second while an editor is on screen. Nothing is added to the editor's page.

**Lighter copies for watching and editing** (M16-07, `main/lightCopies.js`). Phone footage (1080p, about 16
Mbps, a keyframe every second) made every jump to a moment decode up to a second of full-size pictures. A few
seconds after a project opens, the main process makes a 720p copy of each heavy video the project's pages use
(short side over 720, over 5 Mbps, or a codec other than H.264, VP8 or VP9): a keyframe every half second, no
B-frames, the sound copied, timestamps kept. One FFmpeg at a time, below normal priority, into
`<project>/.cache/kushmanji-preview/`, named after the original's path, size and modified time, so a changed
original never uses an old copy. HyperFrames' file watcher and undo history both skip `.cache`, and its preview
server still serves it. The session's `onBeforeRequest` answers a GET to the open project's
`/api/projects/:id/preview/<video>` with a redirect to its copy when the copy exists; Studio, its filmstrips and
the watching screen never know. A clip already loaded keeps its original until the runtime loads it again (it
unloads clips a few seconds away from the playhead), so the copies take over without a reload. "Save video"
renders with the CLI in its own browser and always reads the full files. The top bar says "Making clips smooth
to edit (5 of 19)" while it works. Without FFmpeg nothing is made and the originals play. Measured: a jump went
from 0.28 to 0.04 seconds, and a dragged playhead from 1 or 2 pictures a second to 33 (`docs/FINDINGS.md`).

The preview manager watches source and media with a short quiet period, ignores hidden journals, saved
versions, dependencies and exports, and emits `preview:changed`. The player reloads at its last position and
playback state. On folders Windows cannot watch it also refreshes after an assistant's turn ends. Timers,
watchers and player listeners are closed with the project. Assistant and clip settings live in an expandable
control; the sentence describing the current allowed tools stays visible below the chat box.

On the watching screen the player supplies its time to the chat's "At 0:42" line (M14-02). Sending carries
only a boolean `moment` flag across IPC. The main process reads the active root player again at Send,
before the footage study starts, and attaches a bounded numeric snapshot and a short context note to the
chosen assistant's request. The snapshot is saved beside the user message and included in the journal's
request, so reopening the chat or changing assistants preserves its meaning. Studio continues to use its
own selection instead. Home's initial request and "Build it" do not inherit a watching position.

`renderer/editActions.js` supplies the persistent, collapsible editing buttons (M14-03). Each opens a native
dialog explaining its limits, then appends a suggested request to the existing draft. It never starts an
assistant turn; the person still presses Send. Saving opens Studio and describes the pending Windows export
checks. Automatic subtitles, stock/generated music and automatic noise-tool setup are not advertised as
working. Dialogs are removed with the project; buttons are disabled during an assistant turn.

`renderer/help.js` holds the screen guide, three-step welcome walkthrough and shared editor-word glossary
(M14-04). One native dialog and Help button live for the shell page's lifetime and survive project/room changes;
full-screen playback has its own Help entry. The walkthrough stores only its seen flag in the shell origin's
localStorage (`hfwin-help-seen-v1`), with an in-memory fallback when storage is unavailable. Help makes no IPC
calls, starts no assistant and changes no project files. The glossary sits above the unchanged Studio iframe,
which gets the remaining stage height. Playback keyboard shortcuts ignore an open dialog's contents.

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
- The agent can edit files and run commands. What it may do is the access level the person picks in the chat's
  expandable settings. The current level is described below the chat
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
| `projects.ready(dir)` | Whether the active editor's root or selected-scene preview has finished loading |
| `player.command({ dir, action, value })` | Only `state`, `play`, `pause`, `seek`, `skip`, `volume`; finite numeric values for the last three. Returns `{ ready, time, duration, playing, width, height }` or `{ ready: false }` while loading |
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
| `agent.send({ dir, text, pointing, moment })` | Starts one chat turn. `moment: true` reads the active root player at Send and returns the captured `{ seconds, when }` for the message. Otherwise `pointing: true` reads Studio's selection. Refused while another turn is running |
| `agent.chooseMode({ dir, mode })` | How involved the person wants to be in this project: `build`, `review` or `codirect`. Kept with the project's chat |
| `agent.chooseAccess({ dir, level })` | How much the agents may do in this project, from the next message. Only `project`, `tools` or `full` is accepted. Kept in the app's settings, not in the project |
| `agent.choose({ dir, engine })` | Switch this project's chat to another agent, from the next message. Refused for an agent the person has not ticked |
| `agent.setTeam(engines)` | Which assistants the person has ("Your assistants", M15-01): known ids only, at least one. Kept in the app's settings; `status()` and `history()` mark each agent `inTeam` |
| `agent.chooseModel({ engine, model })` | The model an agent uses, everywhere; `null` is the agent's own default, `"auto"` (also the value when nothing was chosen) sizes each request (`agents/sizing.js`). Otherwise only an id from that agent's `models()` is accepted |
| event `preview:copies` | `{ dir, status: { state, done, total, failed } }`: the lighter copies for watching and editing (`lightCopies.js`) |
| `agent.stop()` / `agent.reset(dir)` | Stop the run / forget the conversation (project files untouched) |
| `save.start(dir)` | Make the project's video file with the CLI's own `render`, in the person's Downloads folder, named after the project and the time. Its sound is then brought to about -14 LUFS (`loudness.js`; the picture is copied). One at a time; refused while an assistant works. Returns the status below |
| `save.stop()` / `save.status(dir)` / `save.show()` | Stop saving (no half-made file is kept) / `{ state: idle, saving, busy, saved, stopped or failed, percent?, name?, megabytes?, message? }` / show the file this app last finished in File Explorer |
| event `save:event` | `{ dir, status }`: saving started, moved on or ended. The taskbar button shows the same count |
| event `app:open-project` | `{ dir }`: open this project (command line, second launch, smoke test) |
| event `preview:exit` | `{ dir, code }`: the server died by itself |
| event `preview:changed` | `{ dir }`: visible project source or media changed; refresh the simple player |
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

The person picks one of three levels in the expandable chat settings (`agents/access.js`):

| Level | The agent may | How each bridge enforces it |
| --- | --- | --- |
| `project` "Only this video" | Edit the project's files, run HyperFrames commands | Claude Code: an allow-list of commands. Codex: its sandbox. Antigravity: approve-all plus its terminal sandbox |
| `tools` "Also cut my clips" | The same, plus `ffmpeg` and `ffprobe` on files inside the project | Claude Code: the allow-list gains those two names, in Bash only. Codex and Antigravity: the same switches as `project` |
| `full` "Anything on this computer" | Anything | Each agent's own "skip every check" switch |

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
person changes it, so it can say "choose Also cut my clips" instead of failing oddly.

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

Upstream's three (`agents/working.js`), which upstream calls "Build it for me", "Review the story first" and
"Co-direct it", and which the person sees as "Just do it", "Show me the plan first" and "Decide with me" (the
menu labelled "Ask me first"; the ids `build`, `review`, `codirect` are what is stored). The choice is kept
with the project's chat. In the last two the agent is told to write its plan into the project's plan files,
tell the person the plan in a few lines, and end its message with a line that says only `PLAN READY`. The app
removes that line and shows two buttons instead: "Build it" (which sends "Yes. Build the plan you just showed
me.") and "Change the plan".

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
  tells an agent how to read it. A video also has `pictureSeconds` and `soundSeconds`, each stream's own
  length. They often differ by a fifth of a second, and a clip played past its picture freezes on its last
  frame before the join; the entry gets a note saying so. A study made before these existed has them added
  by one quick look per clip, without being studied again.

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
npm run smoke     # the real app: Home → create project → player → Studio; screenshots in app/.smoke/
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
