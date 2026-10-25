# Findings: what HyperFrames is, and what is missing on Windows

Researched 2026-10-12 against `heygen-com/hyperframes` at `fbbc4e88` (CLI v0.8.149). Re-check anything here
before relying on it: upstream ships several releases a week.

## The short version

- **HyperFrames** (the framework, CLI, renderer and the browser editor) is open source, Apache-2.0, and
  **already works on Windows**. Verified on this machine: `hyperframes doctor` passes Node, FFmpeg, FFprobe and
  Chrome, and `hyperframes preview` serves a working Studio in the browser.
- **The HyperFrames Studio desktop app** (Home screen, chat with an agent, "Framey", one-click export, updates) is
  **closed source**. It lives in HeyGen's private `hyperframes-internal` repo. Its downloads are macOS and Linux
  only; hyperframes.dev/studio lists Windows and Windows ARM as "Coming soon".
- So there is nothing to port. This project **builds an unofficial Windows desktop app on top of the open-source
  pieces**, recreating what the closed app adds.

## Evidence

| Claim | Where it comes from |
| --- | --- |
| Desktop app source is private | `upstream/packages/cli/src/utils/desktopApp.ts` cites `hyperframes-internal#2601`; `appHistory.ts` cites `hyperframes-internal appHistory.mjs`; no Electron or Tauri code anywhere in the public tree |
| No Windows build yet | Same file: `/** This machine's build of the app; null where there is none yet (Windows). */`; hyperframes.dev/studio shows "Coming soon" |
| The official app is Electron | It expects `%LOCALAPPDATA%\Programs\HyperFrames\HyperFrames.exe` on Windows (electron-builder's per-user NSIS path) and an AppImage plus `launcher.json` on Linux |
| An official Windows build is planned | That Windows path is already coded; the maker said "Windows is coming soon" on Product Hunt (launch 2026-10-06) |
| Browser Studio works on Windows | Ran it here: preview, timeline, inspector and Export all load with no console errors |

## What the official desktop app does (from `upstream/docs/studio-app/*.mdx`)

1. **Home**: a "Make something" prompt box, the project list, a "Get inspired" library, a first-video card.
2. **Projects** kept in `~/.hyperframes-studio`; each one is a plain HyperFrames project folder.
3. **Agent chat**: drives Claude Code or Codex installed on the computer. Shows what the agent is doing
   ("Reading files", "Editing files"). Queue or steer while it works. Undo per agent run.
4. **Point at the picture**: Select, Draw and Comment tools; up to 10 "pending video edits" sent as one request.
5. **Timeline by hand**: split, delete, quick edit (speed, volume, fade), close gap.
6. **Export**: 1080p / project size / 4K; MP4, WebM, MOV; 24, 30, 60 fps; saved to Downloads.
7. **Agent setup**: detects Ready / Not signed in / Not installed / Installed but won't start; installs Claude Code.
8. **Updates**: self-updating.
9. **HeyGen sign-in**: required before sending a request. We do not replicate this; see ARCHITECTURE.md.

## Open-source pieces we build on

| Piece | What it gives us |
| --- | --- |
| `hyperframes` (npm CLI) | `init`, `preview` (serves Studio + API), `render`, `check`, `lint`, `doctor`, `preview --selection --json`, `preview --context --json` |
| `@hyperframes/studio` | The whole editor UI. Also exports its parts (`EditorShell`, `Timeline`, `RenderQueue`, `AskAgentModal`, `buildPickerAgentPrompt`) so a host app can mount them. This is how the official app embeds it |
| `@hyperframes/studio-server` | `createStudioApi`: the file, history and render routes behind Studio |
| Project conventions | `.hyperframes/` inside a project holds app and CLI records (hand-off, chat history). `HYPERFRAMES_DESKTOP_PROJECT` in the environment tells the CLI it runs inside a desktop app |

`hyperframes preview <dir> --foreground --no-open --json --port N` prints one JSON line when ready:
`{"schemaVersion":1,"operation":"start","ok":true,"result":{"state":"started","port":N,"serverUrl":...,"studioUrl":...}}`.
The server sends no `X-Frame-Options` or `frame-ancestors`, so Studio can be framed.

## Windows state of upstream

Upstream takes Windows seriously in the CLI and engine: 168 `win32` / `process.platform` branches across 72
source files, a `windows-render.yml` CI workflow, `windowsCrash.ts`, junctions instead of symlinks. Expect the
remaining Windows bugs to be at the edges (paths with spaces or non-ASCII characters, OneDrive folders, process
cleanup), not in the core. Log each one in PROGRESS.md under "Upstream".

## This machine (2026-10-12)

Windows 11 Home, Node 24.11.1, npm 11.6.2, FFmpeg 8.1.1 (winget), Git + Git LFS, Docker.
`claude` at `~/.local/bin/claude`, `codex` 0.145.0 as a global npm package. No bun, no Rust, no `gh`.

## Sources

- https://www.hyperframes.dev/studio
- https://hyperframes.heygen.com/studio-app/index
- https://github.com/heygen-com/hyperframes
- https://www.producthunt.com/p/heygen/hyperframes-studio-desktop

## Agents, voice and images (added 2026-10-12)

Measured on this machine unless a source is given.

### Agents the chat can drive

| Agent | State here | How it runs headless | Notes |
| --- | --- | --- | --- |
| Claude Code 2.1.280 | Works, signed in | `claude -p --output-format stream-json` | Streams text as it is written |
| Codex 0.162.1 (ChatGPT) | Works, signed in | `codex exec --json -` | Replies arrive whole. Slower: about 2.5 minutes for a one-line edit, because it reads the HyperFrames skills first |
| Gemini CLI 0.42.0 | **Dead for personal accounts** | n/a | Real error: "This client is no longer supported for Gemini Code Assist for individuals ... migrate to the Antigravity suite" |
| Antigravity CLI (`agy`) 1.3.3 | Works, signed in through the Antigravity IDE's account | `agy -p "<text>" --output-format stream-json` | Google's replacement for the Gemini CLI. Slow to start: over a minute before the first word. Offers Gemini, Claude and open-weight models (`agy models`) |

**Two things had to be fixed on this machine first** (both recorded in `docs/MAINTENANCE.md`): Codex 0.145.0 was
too old for the model in its own settings and was updated to 0.162.1; and a Google Cloud telemetry add-on
installed by the Antigravity IDE blocked every `agy` tool call on Windows and was switched off with the owner's
agreement.

**Codex's sandbox and npm.** Inside Codex's `workspace-write` sandbox, `npx hyperframes check` failed because
npm could not write its cache. Adding the npm cache, `~/.cache`, `~/.hyperframes` and
`~/.local/state/hyperframes` as writable roots fixed it (the check then passed).

### Voice, images, music

All of it reaches the app through the agent: the person asks in the chat, the agent uses the HyperFrames
`media-use` skill and CLI. Nothing here needs code in the app itself.

| Want | What does it | Cost | State here |
| --- | --- | --- | --- |
| Voiceover | `hyperframes tts`, the Kokoro model running on this PC. 54 voices; English, Spanish, French, Hindi, Italian, Portuguese, Japanese, Chinese | Free | **Works.** 3 s of speech in 8 s. Proven through the chat: a voiceover was generated and placed on the timeline |
| Better voices, stock images, music, sound effects | HeyGen's catalog through the `heygen` CLI, signed in with OAuth | Free allowance | **Not possible on Windows yet.** HeyGen's page says "Windows support is coming soon, WSL is recommended in the meantime" |
| Generated images | Codex's built-in image tool (`image_generation`, on by default) | The ChatGPT plan | **Works with Codex as the chat's agent.** It made a 1.8 MB picture, saved it under `assets/` and set it as the background. HyperFrames' own route to the same tool (`media-use`) did not start from inside a Codex session and is untried from the other agents |
| Captions from speech | `hyperframes transcribe`, the Parakeet speech model running on this PC | Free | **Works.** A 4 s clip became word-timed captions (SRT) in 8 s. Not yet tried through the chat |
| Transitions and motion graphics | HyperFrames' own skills, its `shader-transitions` package and its registry of about 400 ready-made blocks | Free | The skills are installed for all three agents. Not yet tried through the chat |
| Local music | MusicGen | Free | Not installed |

No API keys are set on this machine (checked for Gemini, OpenAI, ElevenLabs, HeyGen), and none are needed for
what works today: every agent signs in with the person's own account.

### Does the app need a database?

No. It is a desktop app for one person. A project is a folder, a chat is a JSON file inside it, settings are one
JSON file. A hosted database (Supabase and the like) would only earn its place for accounts, syncing projects
between devices, sharing with other people, or driving the app from a phone.

### Sources

- https://antigravity.google/docs/cli/headless/
- https://antigravity.google/docs/getting-started?tab=cli
- https://geminicli.com/docs/cli/headless.md

## Other open-source projects looked at (2026-10-12)

The owner asked what else could help with "advanced editing just by saying what I want". Short answer:
HyperFrames already carries most of it (motion, transitions, voice, captions), so nothing below is needed to
start. Each was read from its own page or a search summary, not run.

| Project | What it is | Licence | Use for this app |
| --- | --- | --- | --- |
| [OpenMontage](https://github.com/calesthio/OpenMontage) | A large set of agent instructions and Python tools that turn a coding agent into a video studio. Uses HyperFrames as one of its renderers. Free footage from Archive.org, NASA and Wikimedia; Piper for voice. Supports Windows | AGPL-3.0 | Could be installed **beside** this app for the agents to use. Do not copy its files into this repository: AGPL would then cover this project too |
| [OpenHiggsfield](https://github.com/thehiggsfieldai/OpenHiggsfield) | A community project, **not** from Higgsfield. A studio for AI-generated video clips using your own paid API keys (Wan, Seedance) | MIT | Not for editing. Only relevant later, if generated video clips are wanted, and those cost money per clip |
| Higgsfield itself | A closed, paid platform. No open-source release from the company was found | Proprietary | None |
| Kinocut | An MCP server that gives an agent about 200 FFmpeg editing tools (cutting real footage) | Not checked | Possible later for cutting filmed footage. Unverified |
| Pexels, Pixabay | Free stock photos and video | Free API key needed | A future image and footage source; the owner would create the free keys |
| Wikimedia Commons, NASA, Archive.org | Free media with no key | Varies per file | A future no-key source; each file's licence must be checked |
| MusicGen | Music made on this PC. HyperFrames already supports it as its local fallback | MIT (code) | Not installed. Needs Python packages of a few gigabytes |

Sources: the repositories linked above, https://developers.heygen.com/cli, and search summaries.

## What the official app does, in full (2026-10-12)

The feature-by-feature list is `docs/PARITY.md`. The points that change how this app should be built:

- **The editor is the open part.** Canvas, timeline, keyframes, audio effects, colour grading, captions,
  templates and export are all in the open-source Studio, and so already inside this app.
- **The closed part is the conversation around it:** Home, the chat, pointing at the picture (select, draw,
  comment), pending edits, the example library, the installer and updates.
- **The editor already speaks to agents.** It registers twelve tools for an agent to read the scene, change one
  element and take a picture of any frame (`upstream/docs/guides/webmcp.mdx`), and it has "Ask agent" and
  "Copy to Agent" on a selection.
- **Upstream ships ready workflows from one input**: a website, a block of text, a pull request, a talking-head
  clip, a music track, or just a brief. A video from only an idea is a supported path, not a stretch.
- **Gemini can watch video.** Measured here: through `agy`, it opened a test clip with its own file viewer and
  reported the on-screen words and the second they appeared, correctly.

Sources: `upstream/docs`, https://www.hyperframes.dev/studio,
https://runtimewire.com/article/heygen-hyperframes-studio-agent-video-editor,
https://techpilot.ai/tools/hyperframes-studio/

## Why the preview felt "stuck" on the owner's vlog (measured 2026-10-13)

Measured in the real app on the real vlog (19 clips, 1080p, H.264 at 16 Mbps, 4 min 29 s), with the browser's
own per-picture callback, on the watching screen and in the editor. How to run it: `CONTRIBUTING.md`.

- **Inside a clip, playback is smooth.** 29 to 30 pictures a second, the clock keeps real time (0.997 to
  1.000), and under 1% of pictures are dropped (15 of 1,323 and 4 of 884 on the watching screen; 11 of 1,321
  and 6 of 882 in the editor). The two screens measure the same.
- **The picture freezes for about a third of a second before most joins.** The cause is in the clips, not the
  player: 15 of the 19 clips have 15.0 seconds of sound and only 14.77 to 14.83 seconds of picture, and each is
  set to play for the full 15. The last frame holds for 0.2 seconds, steps back one frame as the player pulls
  the clip into step, and the next clip's first moving picture arrives 0.05 to 0.1 seconds later.
- **Lighter copies would not fix it.** The next clip's first picture is already drawn before its turn and it is
  moving within two or three frames. HyperFrames' `media.autoProxy` is not for this either: it re-encodes
  only video a browser cannot play (HEVC, ProRes, AV1), not large H.264.
- **What was done:** the footage study records each clip's picture length (`pictureSeconds`) with a plain note
  when it is shorter than the file, and the editing guide tells every assistant never to play a clip past it.
- **Two measuring runs were spoiled by real mouse clicks** landing in the test window (twelve were counted;
  the playhead was dragged). The measuring run now keeps the mouse out of its window.

## Why jumping and dragging felt laggy, and the lighter copies (measured 2026-10-14)

The owner still felt lag after M16-05, "opening the editor and all", and asked for editing as smooth as
DaVinci Resolve. Playing inside a clip was already smooth; moving around was not measured. The playback
measurement now also times eight jumps to a moment (from the jump to that moment's picture on screen), a drag
of the playhead (thirty small jumps in one second, as a hand moves it), opening the editor, and memory.

Measured on a practice project shaped like the owner's vlog (`app/scripts/test-vlog.mjs`: 19 clips, 1080p
H.264 at 16 Mbps, a keyframe every second, 4 min 32 s), in the cloud on a 4-core Linux machine without a
graphics card, so every picture is decoded by the processor. Absolute numbers on a Windows PC with a graphics
card will be lower; the before-and-after difference is the point.

| | Full 1080p files | 720p copies |
| --- | --- | --- |
| Jump to a moment, watching screen (middle of 8 / slowest) | 282 / 481 ms | 44 / 68 ms |
| Jump to a moment, editor | 389 / 548 ms | 70 / 133 ms |
| Pictures seen while dragging the playhead for one second | 1 to 2 | 32 to 33 |
| Last picture after the hand stops | 300 to 350 ms | 20 to 30 ms |
| App memory with the editor open (page processes) | 1,268 MB | 719 MB |
| Processor, page processes, editor | 27% | 14% |

- **Why:** a jump has to decode every picture from the last keyframe to the moment asked for: up to 29
  full-size pictures. A drag asks for a new moment every 33 ms, each jump cancels the one before, and none
  finishes until the hand stops. The copies have a keyframe every half second, no B-frames and a quarter of the
  pixels.
- **The copies' cost:** 83 MB for 553 MB of footage (15%), made in 80 seconds on this machine (about 3.5 times
  faster than the footage plays). Playing while they were being made dropped 5 to 6 pictures in 604, the same
  as without, because FFmpeg runs below normal priority.
- **Opening the editor** took about one second to its first picture in every run here, the first time and
  again. What was not measured here is a project's very first open on the owner's PC: HyperFrames then copies
  every video over 1 MB into its undo history (`~/.cache/hyperframes/history`; 636 MB after these runs, a second
  copy of all the footage), decodes every clip's whole sound for the waveforms, and decodes 32 pictures per clip
  for the filmstrips. The copies make the filmstrips lighter (they read the same address); the history copy is
  upstream's and has no switch (`PROGRESS.md`, Upstream).
- **Research behind the recipe:** Resolve, Premiere, Final Cut and CapCut all edit from proxies (half or
  quarter size, intra or short-GOP) and render from the originals. A Premiere user measured H.264 proxies with a
  keyframe on every frame scrubbing as well as ProRes Proxy at a tenth of the size; `-tune fastdecode` drops
  CABAC and the deblocking filter. Sources: workflow.frame.io/guide/resolve-proxies,
  community.adobe.com (questions-729, "Are H.264 proxy files really that bad anymore"), support.apple.com/kb/PH12702.

## Node 24.11 cannot delete a path with an accented letter (found 2026-10-14, on the owner's PC)

On Windows, Node 24.11.1's `fs.rmSync` silently does nothing when the path holds a letter such as "é" (the C++
rewrite of `rmSync` in Node 23). No error is raised, so a temporary file or folder is just left behind.
`fs.unlinkSync` and `fs.promises.rm` work. Electron 44's own Node (24.21.0) is fixed, so the app is not affected,
but `npm test` ran on the owner's Node 24.11.1 and four tests failed. `npm test` now runs on Electron's Node
(`app/scripts/test.mjs`), the same one the app ships with.

## The lighter copies on the owner's PC (measured 2026-10-14, M16-08)

The owner's laptop: AMD Ryzen 7 4800H (8 cores), AMD Radeon built-in graphics and an NVIDIA RTX 3050. The real
City Centre vlog (4 min 13 s, 19 phone clips). The app made the 19 copies in about two minutes the first time
the project opened (198 MB). The playback measurement, with the copies made and the project opened before:

| | Watching screen | Editor |
| --- | --- | --- |
| Jump to a moment (middle of 8 / slowest) | 54 / 79 ms | 133 / 366 ms |
| Pictures seen while dragging the playhead for one second | 31 | 30 |
| Last picture after the hand stops | 19 ms | 32 ms |
| Pictures dropped while playing (45 s + 30 s) | 9 + 4 of about 2,200 | 13 + 4 |
| Opening (the video / the editor) | 2.6 s | 1.3 s |

- The 2.6 s with nothing playing at 0:10 is the "Happy with Shisha" name card, not a stall.
- **More keyframes do not help.** A Sonnet helper built three copies of the project (hard links, nothing copied)
  with copies keyed every 0.5 s (today's), every 0.2 s (+14% size) and on every picture (+51%), and measured
  each four times: once warm, the three were the same within the scatter between repeats (editor jumps, middle
  of 24: 311, 304 and 292 ms). Decoding is no longer what a jump waits for, so `copyArgs` stays as it is. The
  editor's extra time is Studio's own work around a seek.
- **The editor's first open of a project is slow for a minute or two:** jumps of 1 to 5 s while Studio makes
  its filmstrips, thumbnails and sound pictures for the first time (and the footage study listens to every clip
  in a new project). Run 1 of each copy showed it; runs 2 to 4 did not. Those three runs were also slower than
  the real project's (about 300 against 133 ms) because the study was still transcribing the copied projects.
- The first measurement run stopped once because the video's frame reloaded itself in the middle of a stretch;
  no project file had changed. Not seen again in 13 runs.

## HyperFrames 0.8.149 to 0.8.169 on the owner's PC (measured 2026-10-18, at night)

Twenty releases (notes: github.com/heygen-com/hyperframes/releases). The ones that matter here: the preview's
work follows what plays rather than the film's clip count (0.8.167), fewer flashes of the wrong frame at cuts
(0.8.160), scrubbing back no longer hides scenes or captions (0.8.165, 0.8.168), VFR phone footage no longer
freezes in renders (0.8.156), no black strip at the right of 1080-wide videos (0.8.155), Windows fixes for a first
render and a busy `check`. Nothing the app relies on moved: the watcher and history still skip `.cache`, the
preview route and its ready line are the same, snapshots still name each picture by its time (`at-1.5s`).

Both versions measured on the real vlog the same night, one after the other (the PC had only 2 GB free, so both
are slower than on 14 October; compare the columns, not with that table):

| | 0.8.149 | 0.8.169 |
| --- | --- | --- |
| Jump, watching (middle / slowest) | 148 / 198 ms | 117 / 199 ms |
| Jump, editor | 278 / 1054 ms | 211 / 432 ms |
| Editor stalls over 50 ms, two stretches | 13 and 29 | 6 and 8 |
| Pictures dropped, editor, 45 s + 30 s | 21 + 8 | 16 + 6 |

The self-test needed two fixes that the new Studio brought out, both in the test, not the app: Studio can show a
small live thumbnail of the video beside the player, with the same address, so the editor checks now take the
largest preview (or the one that plays); and its Play is greyed out for a moment while a first open loads, so the
arrow-key check waits until Play can be pressed. Gemini could not be tried: see the add-on in CHECKLIST.md.

## HyperFrames 0.8.169 to 0.8.193 (measured 2026-10-25, at night, on the owner's PC)

Twenty-four releases in a week (notes summarised by a helper from npm and the GitHub releases). The ones that
matter here: Windows file renames retry through antivirus and indexer locks instead of failing a render, and
WebGPU starts (0.8.193); `init` writes folders with non-ASCII names (0.8.174) and renders work in folders with a
percent sign (0.8.188); the history lock works on USB and exFAT drives (0.8.189) and two claims on one project no
longer crash on Windows (0.8.183); accented and non-Latin text shows correctly in `check`, `snapshot` and Studio
(0.8.183); 29.97 fps phone clips and long phone videos export smoothly (0.8.173, 0.8.181); non-English
`transcribe` works (0.8.177); sound effects from Openverse with no account (0.8.170, `media-use resolve --type
sfx`); motion blur with a Studio panel (0.8.185 to 0.8.191); a seek bar in Studio's preview (0.8.190); Studio's
history no longer copies big media (0.8.192). Nothing the app relies on moved: the self-test, the Studio face
test and the lighter copies (`pictureShortSides` [720]) pass unchanged.

The practice vlog (`scripts/test-vlog.mjs`, 19 clips, 4.5 min), measured on both versions within the hour:

| | 0.8.169 | 0.8.193 |
| --- | --- | --- |
| Jump, watching (middle / slowest) | 37 / 76 ms | 37 / 69 ms |
| Jump, editor | 49 / 99 ms | 49 / 70 ms |
| Pictures dropped, watching, 45 s + 30 s | 9 + 9 | 8 + 3 |
| Pictures dropped, editor, 45 s + 30 s | 7 + 4 | 6 + 4 |
| Editor stalls over 50 ms | 1 | 0 |
| Opening the editor | 1.0 s | 0.8 s |

Undo copies (UP-02): the practice vlog's 536 MB of clips take 1 MB in `~/.cache/hyperframes/history`
(fingerprints of each clip, no copies), first opened on 0.8.169 and used again on 0.8.193. One real ChatGPT edit
went through the chat on 0.8.193 (83 s, the app's check found nothing). Claude Code was signed out on this PC
that night, so no Claude request was tried.

## Gemini with a home of its own (measured 2026-10-25, agy 1.4.7, on the owner's PC)

The owner: "on antigravity its so fast but why on my app its so slow". `agy mcp list` and `agy plugin list` showed
what loads on every message: helpers started with `npx -y firebase-tools@latest mcp` and `npx -y
@modelcontextprotocol/server-github`, an n8n helper on a remote server, Supabase over the internet, and six
plugins, all set up for the owner's other work. One-word replies, agy kept running as Kushmanji does:

| Setting | First reply | Next replies |
| --- | --- | --- |
| As Kushmanji ran it (`--sandbox`, agy's default model) | 45.6 s | 24.1, 23.2 s |
| `--model gemini-3.8-flash-low` | 39.7 s | 22.6, 31.4 s |
| `--effort low` | 45.8 s | 23.2, 23.3 s |
| without `--sandbox` | 45.6 s | 24.3, 24.5 s |
| all three faster settings together | 44.2 s | 22.1, 22.4 s |
| **USERPROFILE and HOME on an empty folder** | **11.7 s** | **5.0, 3.5 s** |

Sign-in still worked: agy keeps it under AppData. `ANTIGRAVITY_GEMINI_DIR` and `ANTIGRAVITY_CONFIG_REL_DIR` did not
change the helper list. The same small edit ("change the title", a fresh copy each time, start included): 52.7 and
60.8 s with the owner's home, 24.7 and 22.9 s with the clean one. Through Kushmanji's chat after the change: 15.5 s
and then 4.1 s for one-word replies (29.5 and 24.9 s on 2026-10-24); the self-test's edit, with the house note and
its checks, 80 s. So Kushmanji now gives agy its own home (`agents/geminiHome.js`): links to the HyperFrames skills
and to `.cache` (HyperFrames' browser, Whisper model, undo history), nothing else.

## Why Gemini was slow in Kushmanji (measured 2026-10-24, agy 1.4.7)

The owner noticed Gemini answering slowly in Kushmanji and fast in the Antigravity app: "which model am I using"
took 45 s, "what can you do on this blank screen" 67 s.

- **The model is fast.** A tiny request ("reply with one word") straight to agy, from an empty folder: 13 s before
  agy is ready, 24 s in its "user input" step, 3 s for the answer itself. Thinking level is a small part: Flash
  High against Low differed by about 5 s.
- **Most of the start is the person's own Antigravity set-up.** agy starts every MCP server and plugin configured
  for Antigravity on each launch (on this PC: four Google Cloud "Data Cloud" proxies, Firebase and GitHub via
  `npx`, n8n, Supabase, a science viewer; seven plugins, 49 skills). Tried one at a time, for this run only and
  without changing the person's settings: an `npx` that fails at once changed nothing; keeping only the four Data
  Cloud proxies (`mcp_proxy_bundle.js ... -antigravityide`, from the Antigravity IDE extension) from starting cut
  the "user input" step from about 20 s to about 10 s on every message. The rest of that step is agy's own; no
  switch was found for it (`--disable-slash-commands` changed nothing; `mcp_enabled` is a server-side setting).
- **Starting agy once per video halves it.** `--input-format stream-json` keeps one agy and its conversation open.
  Through the bridge, two one-word messages: 42.1 and 41.6 s before; 46.7 and 23.9 s kept running; 28.1 and 23.2
  s kept running and started 20 s before the first message. Through the app's real chat (`HFWIN_SMOKE_JUST_ASK`,
  a video without clips): 52.9 and 41.7 s before; 29.5 and 24.9 s after, with the 20 s a person takes to type
  (`HFWIN_SMOKE_THINK_SECONDS=20`); 48.6 and 23.4 s when sending at once.
- **What is left is the person's to decide:** switching off Google Cloud Data Cloud in Antigravity, if they do
  not use it, should save about 10 s more on every Gemini message.
