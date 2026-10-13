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
