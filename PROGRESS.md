# Progress

The full list of what is done, who is doing what, and what is next. Both AI agents update it.
The owner's short version is `CHECKLIST.md`.

**Marks:** `[ ]` open · `[~]` claimed, in progress (name in brackets) · `[x]` done (name, date) · `[!]` blocked
**Claim a task before you start it.** Rules: `AGENTS.md`.

## Where things stand

_Updated 2026-10-13 by Claude (after ChatGPT the same day); existing tasks keep their original ownership._

**The app is called Kushmanji** (owner, 2026-10-13), is public at `github.com/webziko/kushmanji` under
Apache-2.0, and has its first commits. The owner wants every feature of the official app, one by one: the order
is at the end of `docs/PARITY.md`, and milestones M11 to M13 below were added for it.

**New on 2026-10-13:** an "Access" menu (project only, editing tools, full access) with a check that keeps
FFmpeg inside the project; the app studies footage by itself; a "How we work" menu where the agent plans first
and waits for "Build it"; and pointing: click something in the picture, then say what to change. The owner's
real vlog was re-edited through the app's own chat (`reviews/city-centre-vlog`, second version, 4:29).

**Works today on Windows, checked by the app's own tests:**

- The app opens to a Home screen with the project list.
- A project opens with the real HyperFrames Studio editor inside the app window.
- Chat beside the editor: type a change, the agent edits the video, the preview updates.
- Three agents, picked from a menu in the chat: **Claude Code**, **Codex** (ChatGPT) and **Antigravity** (Gemini).
  A second menu picks the model.
- Shared memory: each agent is told what the others did since its last turn, and every turn is logged in the
  project.
- Voiceovers through the chat, with the free voice engine on this PC.
- Generated images through the chat, when the agent is Codex (it uses the ChatGPT plan).
- Closing the app leaves nothing running in the background.

**Proven at the command line only, not yet through the chat:** captions from speech.

**Not there yet:** an installer (today it starts with `npm start`), drawing on the picture,
one-click export to Downloads, updates.

**Next up:** the advanced plan in M10, starting with M10-01 (study the footage) and M10-02 (plan first); M5-01
the installer; and the owner's decisions in `CHECKLIST.md`.

**Who it is for:** many people making any kind of video, not only the owner's own channel (owner, 2026-10-12).

## M0 · Research and setup

- [x] M0-01 Find out what is open source and what is not (Claude, 2026-10-12) → `docs/FINDINGS.md`
- [x] M0-02 Confirm the open-source CLI and browser Studio run on Windows (Claude, 2026-10-12)
- [x] M0-03 Workspace, shared rules, this list (Claude, 2026-10-12)
- [x] M0-04 Reference clone of upstream in `upstream/` (Claude, 2026-10-12)

## M1 · The app window

- [x] M1-01 Electron app with a locked-down page: sandbox, context isolation, CSP (Claude, 2026-10-12)
- [x] M1-02 Run the HyperFrames CLI with Electron's own Node, no separate Node install (Claude, 2026-10-12)
- [x] M1-03 Projects: list, create, open a folder, remove from the list (Claude, 2026-10-12)
- [x] M1-04 Studio server: start, wait until ready, stop, clean up the whole process tree (Claude, 2026-10-12)
- [x] M1-05 Home and project screens (Claude, 2026-10-12)
- [x] M1-06 One running copy; a folder on the command line opens that project (Claude, 2026-10-12)
- [x] M1-07 Self-test with screenshots: `npm run smoke` (Claude, 2026-10-12)
- [ ] M1-08 Real thumbnails on the Home cards (now a letter on a dark tile)
- [ ] M1-09 Follow Studio's light and dark toggle in the frame around it
- [ ] M1-10 Rename a project; delete one to the Recycle Bin
- [ ] M1-11 Project names in any language (a name with no Latin letters becomes "untitled" today)
- [ ] M1-12 Remember the window's size and place, and reopen the last project
- [ ] M1-13 Drag the divider to resize the chat; hide and show the chat

## M2 · Chat with an agent

- [x] M2-01 Agent bridge contract and the Claude Code bridge (Claude, 2026-10-12)
- [x] M2-02 Chat panel: messages, live steps, streaming reply, Stop, New chat, saved per project (Claude, 2026-10-12)
- [x] M2-03 Codex bridge: `app/src/main/agents/codex.js` (Claude, 2026-10-12, at the owner's request).
      Proven with `npm run smoke:codex`: Codex edited the video and its project check passed
- [ ] M2-04 Agent state with a fix for each: ready, not installed, not signed in, will not start.
      Built for all three agents, and npm installs (`.cmd` shims) now start through `agents/launcher.js`.
      Still untested: the "not installed" and "not signed in" cards (both agents here are signed in)
- [x] M2-05 Pick the agent in the chat header; each agent keeps its own conversation (Claude, 2026-10-12)
- [~] M2-06 "Agent access" setting: project edits only (today's fixed behaviour) or full access (Claude, with
      M10-08). The menu is built and "Full access" asks first, per project. Still open: "Full access" has not
      been run with a real agent, and the owner has to say which level a new user starts on.
      "Project edits" is proven for both agents: each ran the project check from inside it
- [~] M2-07 Home prompt box: describe a video, the app makes the project and asks the agent (Claude).
      Built. The "Make it" button's path has not been run end to end yet
- [ ] M2-08 Install and refresh HyperFrames skills for the agent (project creation skips them for speed)
- [ ] M2-09 While the agent works: queue the next message, or steer (stop and restart with it)
- [ ] M2-10 Undo for each agent run
- [x] M2-11 Write chat turns where `hyperframes catch-up` reads them: `.hyperframes/app-history.jsonl`, in
      upstream's own format (Claude, 2026-10-12)
- [ ] M2-12 Plain messages for: usage limit reached, signed out mid-run, no internet
- [ ] M2-13 Show what a run cost or how much of the plan's limit is used (the agent reports both)
- [x] M2-14 Antigravity bridge for Gemini models: `agents/antigravity.js` (Claude, 2026-10-12). `agy` installed,
      already signed in through the Antigravity IDE. Proven with `npm run smoke:antigravity`
- [x] M2-15 Codex refused the model in its own settings: fixed by updating Codex 0.145.0 to 0.162.1, with the
      owner's go-ahead (Claude, 2026-10-12)
- [x] M2-16 Model menu in the chat, per agent. Lists come from the agents themselves (Claude, 2026-10-12).
      Seen on screen; choosing a non-default model and sending has not been tried with a real agent yet
- [ ] M2-17 Codex takes minutes on a small edit because it reads every HyperFrames skill first. Find out why.
      Antigravity is slow too: over a minute before its first word
- [x] M2-18 Shared memory across agents: a journal of every turn, and a handover summary for an agent that was
      not the last to work (Claude, 2026-10-12). Unit-tested; see the handoff note for the live test
- [x] M2-19 Notice when an installed agent is newer than the version this app was tested with
      (Claude, 2026-10-12). Routine: `docs/MAINTENANCE.md`
- [ ] M2-21 In the image test, Codex's project check reported that the title card's online animation script
      "couldn't load", and Codex removed the script. Find out whether Codex's sandbox blocks the check's browser
      from the internet; if so, Codex will keep "fixing" things that are not broken
- [x] M2-22 (Claude, 2026-10-13; worked around by M12-01, cause not removed) Codex could not run any command on this PC since it was updated to 0.162.1: its sandbox setup fails on
      a file the Codex desktop app holds open ("setup refresh had errors"; log in `~/.codex/.sandbox`). File edits
      still work, so earlier Codex tests passed without checking anything. The chat now says so plainly instead
      of reporting success. Blocked on the owner: close the Codex desktop app, then re-run `npm run smoke:codex`
      to confirm that is the cause. If it is, decide what the app should do about it for other people
- [ ] M2-20 Antigravity's "project" access is weak: headless `agy` can only approve everything or nothing. Look
      for a scoped permission setting that does not live in the owner's global Antigravity settings

## M3 · Point at the picture

- [x] M3-01 Send Studio's current selection with a message (Claude, 2026-10-13). Click something in the picture
      or on the timeline and the chat says "Pointing at ..."; the next message is about it. Read from Studio's
      own server, nothing injected. Proven in the real app: a click on the owner's vlog named the right clip,
      and on a test project "Make this bright red and twice as big" changed exactly the clicked title
- [ ] M3-02 Route Studio's own "Describe a change to the agent" button into the chat
- [ ] M3-03 `@` in the message box to mention files, media and moments
- [ ] M3-04 Pending edits: collect up to 10 picks and send them as one request
- [ ] M3-05 Draw and comment on the frame (needs Studio's components mounted directly; see ARCHITECTURE "Later")

## M4 · Export

- [ ] M4-01 Prove Studio's own Export on Windows: MP4, WebM, MOV at 1080p and 4K
- [ ] M4-02 Save to Downloads as "Project name date time", then "Open video" and "Show in folder"
- [ ] M4-03 No export while the agent is working; show progress on the taskbar button

## M5 · Installer and updates

- [ ] M5-01 Installer (.exe, per user, no admin rights) with electron-builder (suggested: ChatGPT)
- [ ] M5-02 App icon; Start Menu and Desktop shortcuts
- [ ] M5-03 Machines without FFmpeg or Chrome: fetch them on first run
- [ ] M5-04 First-run health check built on `hyperframes doctor`
- [ ] M5-05 Updates for the app, and a routine for moving to a newer HyperFrames version
- [ ] M5-06 Work with no system Node installed (the CLI calls `npx` for a few things)
- [ ] M5-07 Windows on ARM build

## M6 · Windows hardening

- [ ] M6-01 Spaces and non-English characters in user names and project paths
- [ ] M6-02 Projects inside OneDrive or a redirected Documents folder
- [ ] M6-03 Paths longer than 260 characters
- [ ] M6-04 Clean up a leftover Studio server after the app crashed
- [ ] M6-05 The port is already taken by something else
- [ ] M6-06 High-DPI and more than one monitor
- [ ] M6-07 SmartScreen and antivirus behaviour with an unsigned installer

## M7 · Catching up with the official app

- [ ] M7-01 "Get inspired" example library
- [ ] M7-02 Guided first video (hook, proof, turn, call to action)
- [ ] M7-03 Settings screen
- [ ] M7-04 Keyboard shortcuts that work the same in the frame and inside Studio

## M8 · Voice, images and music

All of these work by asking the agent in the chat; the agent uses HyperFrames' own media tools. The work here
is making sure each one runs on Windows from inside the app, and making it easy to find. Facts: `docs/FINDINGS.md`.

- [x] M8-01 Voiceover with the free built-in voice: asked in the chat, generated and placed on the timeline
      (Claude, 2026-10-12)
- [x] M8-02 Generated images through Codex's own image tool, on the ChatGPT plan (Claude, 2026-10-12). Asked in
      the chat with Codex as the agent: it made a sunrise picture, saved it in the project and set it as the
      background
- [ ] M8-11 Generated images when the chat's agent is Claude Code or Gemini. HyperFrames' own route
      (`media-use` handing the job to Codex) did not start when tried from inside a Codex session, and has not
      been tried from the other two. Until proven, the house note tells them to suggest switching to Codex
- [!] M8-03 Better voices, stock images, music and sound effects through HeyGen's free allowance. Blocked:
      HeyGen's command-line tool does not support Windows yet ("coming soon"). Re-check monthly
- [~] M8-04 Captions from speech (Claude). Works at the command line: the Parakeet speech model is already on
      this PC and made word-timed captions from a 4 s clip in 8 s. Still to prove through the chat, then add a
      starter button
- [ ] M8-05 Pick the voice and language (Hindi is available) without typing a voice id
- [x] M8-06 Starter buttons in an empty chat: "Add a voiceover", "Add a title", "Change the look"
      (Claude, 2026-10-12). Add one per feature here once that feature is proven
- [ ] M8-07 Images from a Gemini API key, if the owner wants a second image source
- [ ] M8-08 Transitions and motion graphics: prove one real request through the chat (the skills are installed
      for all three agents), then add starter buttons
- [ ] M8-09 Music made on this PC with MusicGen: a few gigabytes of Python packages, needs the owner's yes
- [ ] M8-10 Free stock footage and images without HeyGen: Wikimedia, NASA, Archive.org (no key), Pexels and
      Pixabay (free keys the owner would create)

## M9 · Ready for other people (organisation, security, upkeep)

- [x] M9-01 Security hardening and its write-up: calls answered only from the app's own page, browser
      permissions refused, `<webview>` blocked, request length capped (Claude, 2026-10-12) → `SECURITY.md`
- [x] M9-02 Unit tests with Node's built-in runner: `npm test`, 15 tests (Claude, 2026-10-12)
- [x] M9-03 CI on GitHub: `.github/workflows/ci.yml` runs check, tests and `npm audit` on Windows
      (Claude, 2026-10-13). The first run, on the first push to `github.com/webziko/kushmanji`, passed every step
- [x] M9-04 Guides for people: `CONTRIBUTING.md`, `docs/MAINTENANCE.md`, `CHECKLIST.md` (Claude, 2026-10-12)
- [ ] M9-05 Lint and type-check (`// @ts-check` with JSDoc types, checked by `tsc --noEmit`)
- [ ] M9-06 Unit tests for the parts that still have none: project names, the preview's ready line, each
      bridge's event handling against recorded real output
- [ ] M9-07 A log file the owner can send when something goes wrong, with nothing private in it
- [~] M9-08 Licence file and third-party notices. The owner chose Apache-2.0 and `LICENSE` is in the repository
      (2026-10-13). Still to write: the notices for HyperFrames and Electron
- [ ] M9-09 Version numbers and a changelog. Committing has started (2026-10-13); from here on one task per commit
- [ ] M9-10 Outside security review before any wider release
- [ ] M9-11 Run the self-test in CI too (needs FFmpeg and Chrome on the runner)

## M10 · Advanced editing, for any kind of video

The owner's direction (2026-10-12): this is for many people making any kind of video, not one channel. Say what
you want and get a properly edited result. Feature-by-feature comparison with the official app: `docs/PARITY.md`.

- [x] M10-13 Real-footage workflow (ChatGPT, 2026-10-13): Home's Start from footage safely copies media;
      Add footage and Review clips show saved sheets/transcripts with uncertainty notes. Preview readiness
      waits for actual media, including a saved selected scene. Verified with 74 tests and the real-app smoke.
      Reviewed all 20 vlog clips and one photo. The recoverable 3m13s horizontal motion draft is in
      `reviews/city-centre-vlog`, with eight animated labels, two wipes, quiet SFX and balanced audio.
      Its MP4 rendered and fully decoded; lint has zero errors/warnings. Eight preview/export frames checked.
      The long-project CLI check timed out after five minutes; it is not a passing check. Kannada word accuracy
      still needs human review. This project's prepared local Whisper study does not finish M10-11.

- [x] M10-01 Study the footage first (Claude, 2026-10-12). When a project opens or a clip is added, the app
      writes `.hyperframes/study/` inside the project: per clip a transcript with times, sheets of still frames
      with the time printed on each, and one `index.json`. A chat message waits for it. Proven in the real app
      (`npm run smoke:study`) and through the chat: Claude Code gave the exact second a word is spoken, from the
      study. English and the other 24 Parakeet languages work. **Not proven: any other language** (Hindi,
      Telugu, Japanese...). They need Whisper, which HyperFrames cannot get on Windows by itself (UP-01); the
      app says so in plain words instead of writing a wrong transcript. See M10-11 and M10-12
- [ ] M10-11 Whisper on Windows, so the study covers every language: with the person's yes, fetch the official
      whisper.cpp Windows build into the app's own folder and point HyperFrames at it
      (`HYPERFRAMES_WHISPER_PATH`). Then prove Hindi and one more non-European language end to end
- [ ] M10-12 Work out the spoken language instead of assuming it: with Whisper present, detect on the first
      half minute, then use Parakeet where it speaks that language. Today "Automatic" assumes English or
      another European language and says so
- [x] M10-02 Plan before cutting (Claude, 2026-10-13). A "How we work" menu under the chat box with upstream's
      three ways: "Build it for me", "Review the story first", "Co-direct it". In the last two the agent writes
      the plan into the project's plan files, shows it, and waits; the chat shows "Build it" and "Change the
      plan". The wait is an instruction, and the app checks afterwards and says so if anything but the plan was
      changed. Proven in the real app with Claude Code: a plan, the video untouched, then built after "Build
      it". Not yet run: "Co-direct it", and either mode with Codex or Gemini
- [ ] M10-03 Check its own work, once. After an edit the agent looks at rendered frames and fixes what is wrong:
      one check and at most one round of fixes per request, then it reports, including anything still wrong.
      Never an open-ended loop
- [ ] M10-04 A style kit per project, not per channel: colours, fonts, title and caption styles. Start from a
      preset, from a website, or from a description. Reusable across projects as a named kit
- [ ] M10-05 The right agent for each job, chosen by the app: images to Codex; watching clips to Gemini (proven
      on a 6-second test clip: it read on-screen words and when they appeared. On 2026-10-13 it also listened
      to the owner's 20 real clips, 15 seconds each, and wrote down Kannada-English speech with times, better
      than Whisper did; run by hand with `agy`, about two minutes a clip, and one 25-minute run lost its
      sign-in part way. Nothing here is chosen by the app yet).
      The agents do not talk to each other directly. The app passes one job to another agent and writes the
      result into the shared journal and plan
- [~] M10-06 Point instead of describing (Claude). Done: click something, the chat says "Pointing at ...", the
      next message is about it (M3-01). Still open: Studio's own "Ask agent about this element" box only copies
      to the clipboard (M3-02); drawing and comments on the frame; and giving agents Studio's built-in tools
      (read the scene, change one element, take a picture of a frame) through a bridge from the main process
- [ ] M10-15 What "Editing tools" should let Claude Code do. In the real vlog re-edit it was refused twice and
      worked around both: downloading a rounder font, and running a script of its own to write eight similar
      files. Decide whether that level should also allow fetching fonts into the project and running the
      HyperFrames skills' own scripts (`node <skill>/scripts/...`); several upstream workflows need the latter
- [~] M10-16 English subtitles on the vlog (Claude). 44 lines are on the video as one scene
      (`compositions/subtitles.html`), built by Claude Code through the app's chat from `subtitles.json`; lint
      has no errors, five still frames looked at. The words come from two machines listening to Kannada
      (Gemini through `agy`, and Whisper large-v3); nobody here can verify them. **Open until the owner has
      checked the lines** in `SUBTITLES.md`; 14 were heard by one machine only. Gemini's listening is the
      better of the two, but its sign-in expired after 25 minutes in one long run: keep batches to five clips
- [ ] M10-17 Clean a voice out of real background noise. Tried on the vlog through the app's chat at "Editing
      tools" (2026-10-13): Claude Code made cleaned copies of 14 talking clips with FFmpeg (rumble cut, noise
      reduction, loudness back to -18 LUFS; lengths and loudness measured) and turned six no-talking clips to
      40%. Honest result: the background dropped about 1 dB, because the noise is shop music, crowds and
      traffic, which FFmpeg's filters cannot tell from a voice. Next: a voice-isolation model on this PC
      (DeepFilterNet is the light one; Demucs separates music better and is heavier). Needs the owner's yes to
      install, then a way for "Editing tools" to run it inside the project
- [ ] M10-14 "No sound in the preview", reported by the owner on their vlog. Not reproduced: a test copy of the
      app plays the same project with sound from the start, from the middle and across cuts
      (`HFWIN_SMOKE_SOUND=1` with `HFWIN_SMOKE_REAL_PROJECT`), and Windows shows the app unmuted. Likely cause
      found in the video, not the app: the first draft had six clips at `data-volume="0.28"`, starting at 0:41,
      right where the owner's screenshot was taken. The second version has every clip at 1. Waiting on the
      owner to play it again
- [ ] M10-07 A video from only an idea. Prove Home's "Make it" end to end with upstream's ready workflows:
      explainer from text, product video from a website, short motion graphic, music video
- [x] M10-08 An "editing tools" access level between "project only" and "full": cut, convert and grade footage
      with FFmpeg inside the project, nothing else (Claude, 2026-10-12). A menu under the chat box; the level is
      kept per project in the app's settings. Proven through the real chat with Claude Code and with Gemini (a
      clip cut at "Editing tools"; refused at "Project only"; a file outside the project refused), and since
      M12-01 with Codex too (a clip cut; the outside file refused). Limits: `SECURITY.md`
- [ ] M10-09 First-time experience for someone who has never used a terminal: which agents are installed,
      one-click fixes, the HyperFrames skills installed for each agent, a first video in minutes
- [ ] M10-10 Image ideas as a short list to accept or reject before any picture is added. Real frames from the
      footage first; generated pictures only where there is no footage

## M11 · Everything the editor already has, tried on Windows

The owner wants every feature of the official app, one by one (2026-10-13). Most of the list they gathered is
already inside, because the editor is the same code: `docs/PARITY.md`, Part 1. This milestone is trying each
one in the real app on Windows and writing down what breaks. No building unless something is broken.

- [ ] M11-01 Sound: meters, gain, fades, groups, lowering music under a voice, the effect chain, evening out levels
- [ ] M11-02 Playback and shortcuts: J/K/L, frame steps, in and out points, loop, mute, full screen, the shortcut list
- [ ] M11-03 Timeline editing: split, razor, ripple, multi-select, group, copy and paste, quick edits, close a gap
- [ ] M11-04 Picture: Design and Layers panels, snap guides, crop, replace media, the right-click menu
- [ ] M11-05 Animation: keyframes, automatic keyframes, easing curves, motion paths, recording a gesture
- [ ] M11-06 Assets, the catalog of blocks, variables, opening a nested scene and coming back
- [ ] M11-07 Colour grading and the media effects
- [ ] M11-08 Slideshows and presenter mode
- [ ] M11-09 The layout and the theme are remembered; the frame around the editor follows the theme (with M1-09)
- [ ] M11-20 The agent's work shown as a track on the timeline (this one is building, not trying)

## M12 · Agents that keep working when they update

Three agents update on their own, sometimes daily, and an update can break one without warning: Codex 0.162.1
stopped running commands (M2-22). The owner asked for a bigger answer than fixing each break by hand.

- [x] M12-01 Codex repairs itself (Claude, 2026-10-13): when its default sandbox will not start, the turn is
      started again with Codex's other built-in sandbox, and that one is used until the app is closed. Proven
      through the chat with the Codex desktop app open: the steps showed "Starting Codex again, another way",
      then Codex cut a clip with FFmpeg and relayed the check's refusal of a file outside the project
- [ ] M12-02 A check-up for each agent that proves the three things a turn needs: it starts, it is signed in,
      and it can run a command. Free where the agent allows it (`codex sandbox` runs a command with no AI
      usage); otherwise one tiny real turn, which the person agrees to
- [ ] M12-03 "Test this agent" when the installed version is newer than the one this app was tried with: one
      small real turn in a scratch folder (change a file, run a command), the result said in plain words and
      remembered for that version, so it is asked once
- [ ] M12-04 When the chosen agent is down, one tap carries on with another. Shared memory already carries the story
- [ ] M12-05 Known problems in one place per agent: what the agent prints, what the app does about it (try
      another way, or say it plainly), and the version it was seen on. Tested against recorded real output
- [ ] M12-06 For whoever maintains the app: one command that runs all three agents' tests against what is
      installed and writes the result into `docs/MAINTENANCE.md`; and the fix card shows the command that goes
      back to the last version that worked

## M13 · Three agents as a team on one video

Today one agent works at a time and each is told what the others did. The owner wants them to work as a team
with a checklist they can follow (2026-10-13, from a proposal they worked out with ChatGPT).

- [ ] M13-01 A task board inside the project: the owner's direction and open decisions at the top, then each
      task with its owner, its state, what it waits on, and its result
- [ ] M13-02 A short section for each agent: suggestions, reasons, doubts ("this subtitle is uncertain at
      1:24"), results. Not three long conversations
- [ ] M13-03 Jobs that do not touch the video run side by side (Gemini drafts subtitles while Codex makes a
      picture). Only one agent at a time changes the video itself
- [ ] M13-04 One review by a different agent and one round of fixes, then the person watches. Never a loop
- [ ] M13-05 A panel in the app that shows the board, who is working, and what is waiting on the person
- [ ] M13-06 Each agent spends its own account's allowance. Show which agent did what, so the cost is no surprise

## Upstream

Windows bugs found in heygen-com/hyperframes itself. Each becomes a pull request there, not a patch here.

- [ ] UP-01 `hyperframes transcribe --engine whisper` cannot set itself up on Windows. It only builds
      whisper.cpp from source (needs git, cmake and a C compiler), and even after a build it looks for
      `build/bin/whisper-cli` with no `.exe`, which Windows never produces. Found by reading
      `packages/cli/src/whisper/manager.ts` (`findBuiltBinary`, `ensureWhisper`); not reproduced, because this
      PC has no cmake. Seen for real: `transcribe -l hi --json` answers `whisper_unavailable`. A fix upstream:
      download whisper.cpp's own Windows release, and look for the `.exe`

Template: `- [ ] UP-02 What breaks · how to reproduce · upstream file · issue or PR link`

## Questions for the owner

These live in `CHECKLIST.md` now, under "Waiting on you", so there is one place to look.
