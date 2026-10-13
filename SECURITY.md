# Security

What this app is trusted with, what could go wrong, what stops it, and what is still open.

## What the app can touch

It runs on the owner's Windows account with that account's rights. It reads and writes project folders, starts
the HyperFrames preview server, and starts AI agents (Claude Code, Codex, Antigravity) that edit files and run
commands. It holds **no passwords, keys or tokens**: each agent keeps its own sign-in, and the app only asks an
agent "are you signed in, yes or no".

## What could go wrong, and what stops it

| Risk | What stops it | Where |
| --- | --- | --- |
| A web page shown inside the app reaches the file system or starts an agent | The page runs sandboxed with no Node access. It can only make the named calls in `preload.cjs`, and every call is refused unless it comes from the app's own page file in the top frame | `main.js` (`fromAppPage`, `handle`), `preload.cjs` |
| A video composition loads hostile web content | Compositions run inside Studio's frame, a different origin with no bridge to the app. Camera, microphone, location, notifications and screen capture are refused for everyone; the clipboard, full screen and the font list are allowed only for Studio's local server | `main.js` (`lockDownSession`) |
| The app's page is replaced by another page | Navigation away is blocked, `<webview>` is blocked, links to the web open in the default browser, and the page's content policy allows only its own scripts | `main.js` (`createWindow`), `index.html` (CSP) |
| Text the person types is run as a command | Agents are started with an argument list and no shell, and the message goes in on stdin. Nothing typed is ever part of a command line a shell reads | `agents/launcher.js` |
| A model name or agent name from the page is used to smuggle in an option | Only an agent id the app knows, and only a model id that agent itself lists, are accepted | `agents/index.js` (`choose`, `chooseModel`) |
| A call names a folder outside any project | Every call that takes a folder requires an absolute path to a real project | `main.js` (`requireProject`) |
| Import overwrites original footage or writes through an assets junction outside the project | Validate media selections, copy exclusively with duplicate suffixes, and verify the actual assets path stays inside the canonical project | `mediaImport.js` |
| A supplied study record points at a private file | Require an indexed clip; enforce lexical and real-path containment in the canonical study directory, restrict picture extensions, cap index/text at 2 MB and each of at most four sheets at 6 MB | `studyRead.js` |
| Preview readiness becomes an unrestricted script bridge | Only the current local project's root or selected-scene preview is queried, with a fixed boolean expression; no caller-provided code | `main.js`, `preview.js` |
| Playback controls become an unrestricted script bridge | Only named actions and finite numeric values are accepted, and only the active project's direct root preview is targeted. The fixed browser function has no Node or preload access | `main.js`, `player.js`, `preload.cjs` |
| Saving a video writes somewhere it should not, or shows a file it should not | The page gives only a project folder. The main process chooses the place (the person's Downloads folder) and the name (the project's folder name with everything Windows refuses removed, and the time), never overwrites, and starts the HyperFrames command with an argument list. "Show the file" takes no path: it shows only the file this app last finished | `exporter.js`, `main.js` (`save:*`) |
| A key pressed in the editor becomes a way to run something | Only a plain left or right arrow is taken, only while the editor's own video is playing, and all it can do is the fixed ten-second skip. The two questions asked of the editor's page (is it playing, is the keyboard somewhere that uses arrows) are fixed expressions that return yes or no | `editorKeys.js`, `player.js` |
| A chat moment names another project or injects instructions | The page supplies only a boolean flag. The main process reads the current project's direct root player and constructs the timestamp and fixed note itself; missing or loading players are refused | `main.js` (`agent:send`), `player.js` (`readPlaybackMoment`) |
| An agent does more than edit the video | Three access levels, chosen in the expandable chat settings and described below the chat box: "Project only" (edit the project, run HyperFrames), "Editing tools" (the same plus FFmpeg on files inside the project) and "Full access". Each agent's own sandbox or permission system enforces the level | `agents/access.js`, `ACCESS` in each `agents/*.js` |
| FFmpeg is used to read a private file, send something over the network, or record the screen or camera | Below "Full access", the `ffmpeg` and `ffprobe` an agent finds are the app's own check. At "Project only" it refuses. At "Editing tools" it runs the real program only when every file the command names is inside the project, and refuses network addresses and capture devices. A list of clips to join is opened and checked too | `agents/mediaTools.js`, `agents/tools/` |
| What the person points at in the editor is used to smuggle instructions to an agent | The selection is read by the main process from Studio's local server, never taken from the page, and only when the person sends a message with the "Pointing at" line showing. Every field is cut to a short length before it reaches the agent. It is text from the project's own files, which the agent can read anyway | `selection.js`, `main.js` (`agent:send`) |
| A project folder someone sends you gives itself more access | The level is kept in the app's own settings, per project, never in the project folder. "Full access" asks first, applies to that one project only, and is never the starting level of another | `agents/access.js`, `renderer/chat.js` |
| Another program on the network reaches the preview server | The HyperFrames CLI binds it to `127.0.0.1` only, and the app only ever frames that address | `preview.js`, `index.html` (CSP) |
| Processes left running after the app closes | The whole process tree is ended on quit | `proc.js` (`killTree`) |
| A broken write corrupts settings or a chat | Files are written to a temporary name and renamed into place | `jsonFile.js` |
| The self-test changes the owner's settings or projects | It uses its own settings folder and its own projects folder | `main.js`, `scripts/smoke.mjs` |
| A dependency with a known hole | One runtime dependency (the HyperFrames CLI), pinned exactly, plus Electron. `npm audit` is in the CI workflow. Last run by hand: 0 known vulnerabilities (2026-10-12) | `app/package.json`, `.github/workflows/ci.yml` |

## The honest limits

- **An agent is powerful by design.** In "project" access it can still change or delete anything inside the
  project folder. Keep projects you care about in git or backed up.
- **"Full access" removes the guard rails.** It lets the agent run any command and install anything. It is not
  the default and should stay a deliberate choice.
- **The three agents enforce access differently.** Claude Code uses an allow-list of commands. Codex uses its
  own sandbox with a few extra writable folders (npm's cache and HyperFrames' own folders). Antigravity approves
  every tool request and adds its terminal sandbox; it has no finer control when run headless. Antigravity's
  "project" mode is therefore the weakest of the three.
- **The FFmpeg check is a guard, not a sandbox.** It reads the command and refuses what it can see leaves the
  project. How hard it is to get around depends on the agent:
  - *Claude Code:* its allow-list permits only the names `ffmpeg` and `ffprobe`, and only in its Bash tool, and
    those names are the check. Calling the real program by its full path is refused by the allow-list. This is
    the strong case.
  - *Codex:* its sandbox already keeps every program's *writes* inside the project. The check adds the limits
    on reading, the network and capture devices, but Codex may run any program, so it could call the real
    FFmpeg by its full path and read a file elsewhere.
  - *Antigravity:* only the check and agy's own terminal sandbox stand in the way.
  - *For all three:* the check does not open media files. A playlist file (`.m3u8`) inside the project that
    names files elsewhere is not followed. And from PowerShell the check is reached through a `.cmd` file, where
    cmd.exe reads the arguments a second time (`a&b.mp4` runs `b.mp4`). That is why Claude Code is allowed
    FFmpeg only through Bash.
- **Codex has two sandboxes, and the app may use the second.** When Codex's default Windows sandbox will not
  start, the app starts the turn again with Codex's other built-in one (`windows.sandbox="unelevated"`, a
  restricted token). Both are Codex's own and both keep writes inside the project and the few folders listed in
  `codex.js`; the app has not measured how the two differ beyond that. Never used at "Full access", which has
  no sandbox to fall back from.
- **"Project only" means no FFmpeg, for every agent.** A clip can still be trimmed inside the video, which needs
  no new file.
- **The app trusts the agents' own programs.** It runs whatever `claude`, `codex` or `agy` is installed. If one of
  those is replaced by something hostile, the app would start it.
- **Chat requests leave the computer.** They go to Anthropic, OpenAI or Google, whichever agent is chosen, under
  that company's terms. The app adds no telemetry of its own. The HyperFrames CLI has its own anonymous usage
  reporting, which the app leaves at the person's setting.

## Not done yet

- [ ] Code signing for the installer (M5). Unsigned, Windows SmartScreen will warn.
- [ ] Electron fuses at packaging time: turn off `runAsNode` in the shipped binary's public surface, enable asar
      integrity (M5). Note the app itself relies on `ELECTRON_RUN_AS_NODE` to run the CLI, so this needs care.
- [ ] Updates with signature checks (M5-05).
- [x] The chosen access level shown in plain words, always on screen under the chat box (M2-06, M10-08).
- [ ] A stand-in for FFmpeg that is a real program instead of a `.cmd` file, so PowerShell cannot re-read its
      arguments and a script that starts `ffmpeg` directly meets the check too.
- [ ] An outside security review before any wider release.

## Reporting a problem

Until the project has a public home, tell the owner directly. Do not put details of a security problem in a
public issue.
