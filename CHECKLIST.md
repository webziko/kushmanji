# Checklist

The short version, for the owner: what works, what is waiting on you, what comes next.
The full task list is `PROGRESS.md`. Every feature of the official app, one by one, is in `docs/PARITY.md`.
Whoever finishes a work session updates this page.

_Updated 2026-10-13. The app is now called **Kushmanji**._

## How to open it

Two shortcuts are on your Desktop:

- **Kushmanji** opens the app on its Home screen.
- **Kushmanji - City Centre vlog** opens it straight on your video. The vlog is also on the Home screen now.

## Waiting on you

- [ ] **Watch the third version of the vlog** and tell me what still feels wrong. One example is enough each time.
- [ ] **A logo and colours for Kushmanji.** I will show you a few to choose from; nothing to do until then.
- [ ] **Which access level should a new person start on?** Today: "Project only". My advice: "Editing tools".
- [ ] **Music made on this PC?** It needs a few gigabytes of extra software. Yes or no.

Answered on 2026-10-13: the name (**Kushmanji**), the GitHub home (`github.com/webziko/kushmanji`, public), the
licence (Apache-2.0), saving the work (committed and pushed), the noise tool (yes), the subtitles ("its good"),
and the order ("however you recommend").

## What comes first now

You asked for an app that is its own thing and easy enough for a child, and for it to spend less of your
usage. So the order changed. The review you asked for is `docs/UX.md`.

1. [ ] **A simple screen, shown first**: your video, big, with ordinary player buttons (play, back and forward
       ten seconds, a bar to drag), and the chat. The full editor is one button away
2. [ ] **Big plain buttons**: fix the sound, add subtitles, make it shorter, change the look, save the video
3. [ ] **"What is what"**: a guide in one sentence per part, and plain names instead of Inspector, Lint and the rest
4. [ ] **Kushmanji's own logo, icon and colours**, and HyperFrames credited in an About box instead of the header
5. [ ] **Your team**: tick which assistants you have (one, two or three); the app uses only those
6. [ ] **The right size of model for each job**, so small changes cost little
7. [~] **An editing guide every assistant follows** (the first version is in; it grows from what you send back)

Then the list further down, starting with one-click export.

## Works today

- [x] The app opens on Windows, with a Home screen and your projects
- [x] The real HyperFrames Studio editor inside the app, with sound
- [x] Chat: describe a change, the agent edits the video, the preview updates
- [x] Three agents in one menu: Claude Code, Codex (ChatGPT), Antigravity (Gemini), and a model menu for each
- [x] **Click, then tell**: click anything in the picture or on the timeline and the chat says "Pointing at ...";
      what you type next is about that thing
- [x] **How we work** menu: build it for me, review the story first (the agent shows a plan and waits for
      "Build it"), or co-direct
- [x] **Access** menu: project only, editing tools (the agent may cut and convert footage inside the project),
      or full access (asks first)
- [x] The app studies your clips by itself: still frames with the time on them, and the words where it knows
      the language
- [x] Start from a footage folder and add more clips safely; the originals are copied, never moved
- [x] Review clips inside the app: timestamped pictures, saved words and notes about uncertain speech
- [x] Shared memory: each agent knows what the others did, and every step is logged in the project
- [x] Voiceovers, free, made on this PC (54 voices, including Hindi)
- [x] Generated images: pick Codex in the chat and ask (it uses your ChatGPT plan)
- [x] **Codex repairs itself** when its safety sandbox will not start (it broke after a Codex update while the
      Codex desktop app was open). See `PROGRESS.md`, M12-01, for what is proven
- [x] Security rules, written down in `SECURITY.md`
- [x] Automatic tests: 84 unit tests plus a self-test that opens the real app, clicks the picture and checks
      the menus

## Your City Centre vlog

- [x] Every supplied video and the photo reviewed; the original files are untouched
- [x] **Second version (made through Kushmanji's own chat):** 4 min 29 s, all 20 clips, nearly everything with
      her in it kept. Cute intro "A Happy Day Out", heart-sticker labels, "Thanks for watching" on her wave
- [x] **English subtitles:** 44 lines in cream pills at the bottom. A draft until you have checked the words
- [x] **Noise:** her voice is cleaned on the 13 talking clips with a voice-cleaning program (DeepFilterNet).
      Measured indoors: the background between her words dropped about 13 dB. On the loud street the gain is
      small. The six clips with no talking play at 40%
- [~] **Third version:** one opening take, soft cross-fades, labels and subtitles back in step. See `PROGRESS.md`, M16-02
- [ ] Not exported to a video file yet. Watch it in the app first
- **Earlier versions are saved** inside the project, in `.hyperframes/versions`: ChatGPT's first draft, and the
  second version before the noise pass
- **Open it:** the Desktop shortcut, or `C:\hyperframewindows\reviews\city-centre-vlog`
- **Watch the first draft:** `C:\hyperframewindows\reviews\city-centre-vlog\renders\city-centre-draft.mp4`

## Everything, one by one

You asked for every feature of the official app, one at a time. Most of the list you gathered is already
inside Kushmanji, because the editor is the same one (panels, keyframes, sound tools, snapping, shortcuts,
catalog, variables, export choices): those need trying on Windows, not building. What has to be built is the
app around the editor. The full list with a mark on every line is `docs/PARITY.md`. The order:

1. [ ] One-click export to Downloads
2. [ ] Undo for each agent step
3. [ ] The editor's "Ask agent" button goes to the chat
4. [~] Agents that keep working when they update (Codex's repair is in; the check-up and "test this agent" are next)
5. [ ] Send while the agent works: queue or steer
6. [ ] Three agents as a team: a shared task board, one agent changing the video at a time, one review
7. [ ] Try every editor feature on Windows, sound first
8. [ ] Draw and comment on the picture; several picks in one request
9. [ ] `@` mentions and dragging media into the chat
10. [ ] The agent checks its own work once
11. [ ] A style kit per project
12. [ ] Every language in the footage study
13. [ ] A video from only an idea, and the guided first video
14. [ ] The example library
15. [ ] Agents use the editor's own tools (look at a frame, select, change one thing)
16. [ ] First run, installer, icon and updates
17. [ ] The app's own comforts (remember the window, rename and delete projects, thumbnails, settings)

## Not possible right now

- **HeyGen's better voices, stock images and music.** Their tool does not run on Windows yet ("coming soon").
- **Framey and HeyGen sign-in.** They are HeyGen's own; Kushmanji will not copy them.
- **Taking the official app apart** (the REA tool you linked). Not needed and a legal risk: the editor is open
  source and the features are documented. Nothing was installed.

## What was changed on your computer

So nothing is a surprise later. All of it was done with your go-ahead.

| What | Where | How to undo |
| --- | --- | --- |
| Two shortcuts: "Kushmanji" and "Kushmanji - City Centre vlog" | Your Desktop | Delete them |
| A voice-cleaning program, DeepFilterNet 0.5.6 (27 MB, from its official GitHub release) | `C:\hyperframewindows\tools\voice-clean` | Delete that folder |
| The app's settings folder under its new name | `%APPDATA%\Kushmanji` | Delete that folder (the old `HyperFrames Studio Win` one can go too) |
| Codex updated from 0.145.0 to 0.162.1 | Global npm package | `npm install -g @openai/codex@0.145.0` |
| Google's `agy` tool installed | `%LOCALAPPDATA%\agy\bin`, added to your PATH | Delete that folder |
| One Google Cloud usage-reporting add-on switched off, because it was broken on Windows and blocked Gemini | `%USERPROFILE%\.gemini\config\plugins\googlecloudtools.datacloud_telemetry\hooks.json` | Change `"enabled": false` back to `true` |
| HyperFrames' source code downloaded for reference (1.5 GB) | `C:\hyperframewindows\upstream` | Delete that folder |
| Remote Control switched on for the Claude session | This session only | Toolbar switch |

The vlog work added files only inside this folder (`reviews/`, which is never uploaded to GitHub). Original
footage stayed untouched.
