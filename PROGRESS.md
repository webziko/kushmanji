# Progress

The full list of what is done, who is doing what, and what is next. Both AI agents update it.
The owner's short version is `CHECKLIST.md`.

**Marks:** `[ ]` open · `[~]` claimed, in progress (name in brackets) · `[x]` done (name, date) · `[!]` blocked
**Claim a task before you start it.** Rules: `AGENTS.md`.

## Where things stand

_Updated 2026-10-14, morning, by Claude; existing tasks keep their original ownership._

**The app is called Kushmanji** (owner, 2026-10-13), is public at `github.com/webziko/kushmanji` under
Apache-2.0, and has its first commits. The owner wants every feature of the official app, one by one: the order
is at the end of `docs/PARITY.md`, and milestones M11 to M13 below were added for it.

**New on 2026-10-13:** an "Access" menu (project only, editing tools, full access) with a check that keeps
FFmpeg inside the project; the app studies footage by itself; a "How we work" menu where the agent plans first
and waits for "Build it"; and pointing: click something in the picture, then say what to change. The owner's
real vlog was re-edited through the app's own chat (`reviews/city-centre-vlog`). Its third version (4:04, back
in step, soft cross-fades, no freeze before joins) was made late that evening and waits for the owner to watch.

**Works today on Windows, checked by the app's own tests:**

- The app opens to a Home screen with the project list.
- A project opens in a large video player with chat beside it; "Edit by hand" opens the full Studio editor.
- Play/pause, ten-second skips and arrows, scrubbing, sound, full screen and portrait sizing work in the player.
- Chat beside the video: type a change, the agent edits it, and the picture updates. Settings are expandable.
- The chat shows "At 0:42" and sends the current video moment; sent messages keep that time.
- Large editing buttons explain the action, then prepare a request. Saving opens the full editor.
- Help explains the current screen, with a short first-time walkthrough and a glossary of editor words.
- Three agents, picked from a menu in the chat: **Claude Code**, **Codex** (ChatGPT) and **Antigravity** (Gemini).
  A second menu picks the model.
- Shared memory: each agent is told what the others did since its last turn, and every turn is logged in the
  project.
- Voiceovers through the chat, with the free voice engine on this PC.
- Generated images through the chat, when the agent is Codex (it uses the ChatGPT plan).
- Closing the app leaves nothing running in the background.

**Measured on the owner's vlog (2026-10-13):** playback is smooth inside a clip on both screens (30 pictures a
second, under 1% dropped, the clock keeps time). The "stuck" feeling is a freeze of about a third of a second
before most joins, because the clips' pictures are 0.2 seconds shorter than their sound. See M16-05.

**Proven at the command line only, not yet through the chat:** captions from speech.

**New on 2026-10-14:** "Save video" makes the file in the Downloads folder in one press, with a count; in "Edit
by hand" the arrow keys skip ten seconds while the video plays instead of pausing it; the owner's vlog has its
fourth version (the channel's name, an ending card, a little music) and three upright shorts (M17).

**New on the morning of 2026-10-14:** jumping and dragging in the video are smooth: the app plays 720p copies of
big clips while watching and editing (M16-07), measured in the cloud on a practice vlog; not yet on the owner's PC.

**Not there yet:** an installer (today it starts with `npm start`), drawing on the picture, updates.

**Next up:** M14-05 (plain wording, with M14-11), then branding, Home improvements and M15 (spend less).
Nothing is claimed right now. Today's commits are on this PC only; the owner has not asked for a push.
The installer and the owner's open decisions remain in `CHECKLIST.md`.

**Cancelled by the owner:** browser features, social-account management and automatic social posting.
Do not build them.

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
- [x] M2-09 While the agent works: queue the next message, or steer (stop and restart with it) (Claude,
      2026-10-14). While a reply is being written the person can type on: "Send when done" (also Enter) keeps
      the message and sends it as soon as the turn ends; "Stop and send now" stops the turn first. A note shows
      what waits, with Cancel. After a failed turn the waiting message goes back in the box instead. Tried in
      the real app with a slowed stand-in assistant: both orders came out right
- [x] M2-10 Undo for each agent run (Claude, 2026-10-14). Each turn is a history "window" on the open
      project's preview server (the CLI's `history` commands are refused while Studio runs: "This project is
      open in another app"), so everything the assistant writes is one entry in HyperFrames' own history. A
      reply that changed files has "Undo this change", then "Bring it back" (`agents/turnHistory.js`). Tried in
      the real app with a stand-in assistant: the file went back, the note said so. A turn silent for over ten
      minutes ends its window early (the server's limit); later writes stay in history but outside its undo
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
- [x] M3-02 Route Studio's own "Describe a change to the agent" button into the chat (Claude, 2026-10-14). Studio's
      "Ask agent" buttons (element, timeline stretch, mistakes, console errors, catalog) only copy a prompt to the
      clipboard; the app wraps the clipboard in Studio's page and hands those copies, recognised by how they
      begin, to the chat's message box, where the person presses Send (`main/askAgent.js`). Other copies still
      reach the clipboard. Tried in the real app
- [ ] M3-03 `@` in the message box to mention files, media and moments
- [ ] M3-04 Pending edits: collect up to 10 picks and send them as one request
- [ ] M3-05 Draw and comment on the frame (needs Studio's components mounted directly; see ARCHITECTURE "Later")

## M4 · Export

- [ ] M4-01 Prove Studio's own Export on Windows: MP4, WebM, MOV at 1080p and 4K
- [x] M4-02 "Save video" (Claude, 2026-10-14): one press makes the file in the Downloads folder as "project name
      date time.mp4", with "Show the file" afterwards. `main/exporter.js`, `renderer/saveVideo.js`; the "Save the
      video" editing button does the same. Tried in the self-test on a one-second video. Still open: "Open
      video" beside "Show the file", and a choice of size or quality (it uses HyperFrames' own defaults)
- [x] M4-03 No saving while an assistant works, no message to a video that is being saved, one save at a time,
      and the count on the taskbar button (Claude, 2026-10-14)

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
- [ ] M9-12 Reproduce a rare self-test delay opening the saved clip picture. One M14 run exceeded its
      ten-second image deadline; later runs passed without changing the study reader. Failure diagnostics
      now record the image's loading state and bounds. Do not guess at a fix before reproducing it

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
- [~] M10-03 Check its own work, once. After an edit the agent looks at rendered frames and fixes what is wrong:
      one check and at most one round of fixes per request, then it reports, including anything still wrong.
      Never an open-ended loop. The app's half is done (Claude, 2026-10-14): after every reply that changed the
      video, HyperFrames' `lint` runs (about two seconds, no allowance) and the reply says "The app checked your
      video: no mistakes found" or "found 3 mistakes", with "Ask to fix them" and the details behind "Show
      them" (`agents/turnCheck.js`). Open: the assistant looking at still frames itself (Codex cannot, M17-07)
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
- [x] M10-16 English subtitles on the vlog (Claude, 2026-10-13; the owner looked and said "its good"). 44 lines are on the video as one scene
      (`compositions/subtitles.html`), built by Claude Code through the app's chat from `subtitles.json`; lint
      has no errors, five still frames looked at. The words come from two machines listening to Kannada
      (Gemini through `agy`, and Whisper large-v3); nobody here can verify them. **Open until the owner has
      checked the lines** in `SUBTITLES.md`; 14 were heard by one machine only. Gemini's listening is the
      better of the two, but its sign-in expired after 25 minutes in one long run: keep batches to five clips
- [~] M10-17 (Claude; the owner said yes to the download on 2026-10-13) Clean a voice out of real background noise.
      Done by hand so far: DeepFilterNet 0.5.6 (one 27 MB program, MIT or Apache-2.0, in `tools/voice-clean`,
      git-ignored) cleaned the vlog's 13 talking clips into `assets/voice-clean`. Measured between her words:
      mall clips about 13 dB quieter (FFmpeg alone: about 1 dB); the loud street clip barely changed. Still to
      do: the app fetches the program itself with the person's yes, and "Editing tools" may run it as
      `clean-voice` behind the same check as FFmpeg. Earlier attempt, for the record: Tried on the vlog through the app's chat at "Editing
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
- [x] M12-03 "Test this agent" when the installed version is newer than the one this app was tried with: one
      small real turn in a scratch folder (change a file, run a command), the result said in plain words and
      remembered for that version, so it is asked once (Claude, 2026-10-14). "Test it now" beside the note about
      a newer version; it asks first, runs at "Only this video" on the smaller model, and says e.g. "Claude works
      with Kushmanji: it changed a file and ran a program." A version that passed is not asked about again
      (`agents/checkup.js`). Tried in the real app with a stand-in Claude posing as 2.2.0
- [x] M12-04 When the chosen agent is down, one tap carries on with another. Shared memory already carries the story
      (Claude, 2026-10-14): any failed reply, not only a usage limit, offers "Carry on with ..." for the person's
      other assistants (with M17-06 and M15-01)
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

## M14 · Kushmanji's own face: simple, in plain words

The owner, 2026-10-13: "it should be very very easy to understand and easy to do", "even small kid could
understand", "inspector mean what I really don't know", "we somehow copied the hyperframes ... lets come out of
this hyperframes fully ... from names, logo and many things", "review the ui ux fully". The engine stays
HyperFrames, credited where the licence asks. Everything a person sees becomes Kushmanji's own. **This milestone
now comes first**: it changes what every later feature looks like. The review itself is `docs/UX.md`.

- [x] M14-01 A simple screen, shown first (ChatGPT, 2026-10-13): the video, big, with the controls of an ordinary player (play, back
      and forward ten seconds, a bar to drag, sound, full screen), and the chat. No panels, no jargon. The full
      editor is one button away ("Edit by hand") for people who want it. The owner's own case: pressing the
      arrow key to go forward pauses the video, because in the editor an arrow means "one frame"
      Built in `renderer/player.js`, with a fixed, validated playback IPC in `main/player.js`. The chat stays
      mounted across room changes; its assistant/clip settings are expandable and its access sentence remains
      visible. Source/media changes refresh the simple player; hidden notes and exports do not. Checked with
      95 unit tests and real-app smoke: both arrows preserve playback, actual tone audio plays/mutes/restores,
      hidden playback stops, full screen, portrait sizing, smallest window, source refresh, access confirmation,
      clip review and editor pointing. Smoke screenshots inspected. The vlog's timeline was not changed.
- [x] M14-02 The chat says where you are (ChatGPT, 2026-10-13): "At 0:42" appears beside the box. At Send the
      main process reads the active whole video's current time, before any footage-study wait; the chosen
      assistant receives it and saved messages and the shared journal retain it. Studio keeps "Pointing at".
      Home's initial request and "Build it" do not inherit a time. Verified with unit tests, real-app smoke,
      one real Codex turn at 0:42, and reopening its saved chat without another assistant request
- [x] M14-03 Big plain editing buttons (ChatGPT, 2026-10-13): sound balance, supplied subtitle words/times,
      shorter cuts, imported music, colours/fonts, titles, voiceover and saving. Each explains its limits
      first. Requests are added to the existing draft and wait for Send; saving opens Studio. Automatic
      subtitles, stock/generated music, noise-tool setup and one-click saving remain pending. Buttons stay
      available after messages and are disabled during a turn. Checked in the real app, including the
      960 × 600 minimum window, draft preservation, Cancel, room switching and access confirmation
- [x] M14-04 "What is what" (ChatGPT, 2026-10-13): Help on Home, the watching screen, the editor and full-screen
      playback. A three-step walkthrough appears once, remembers completion/dismissal and can be replayed.
      The guide opens the current screen's explanations first, one sentence per part. A collapsible glossary
      above Studio pairs its words with plain names, including Inspector = Change it and Lint = Check for
      mistakes. The upstream tabs remain intact. Verified with check (50 files), 99 tests and real-app smoke:
      Back, replay, persistence after reload, Escape, minimum window, full screen, draft preservation and no
      playback shortcuts through an open dialog. Screenshots inspected; no paid assistant turn
- [x] M14-00 Claude's review of M14-01 to M14-04 before committing them (Claude, 2026-10-13). Check, tests and
      the self-test pass; both new calls (`player:command`, `preview:changed`) hold to `SECURITY.md`: fixed
      actions, numbers only, the moment read by the main process. Tried on the real vlog: opens in 2 to 5
      seconds, plays as smoothly as the editor. Committed as one commit, because the four tasks share files.
      Found and fixed: the self-test's full-screen check waited three seconds and failed one run in two here.
      Found and left for their owner: M14-09 to M14-11
- [ ] M14-09 The chat changes sides: right of the video while watching, left of it in "Edit by hand"
      (`[data-screen="edit"] .chat { order: -1 }`). Pick one side. Claude's case is in the handoff
- [ ] M14-10 While an assistant works, the watching screen loads the whole video again on every file it saves
      (`preview:changed`, then `reload()` in `renderer/player.js`). Not yet watched during a long real turn on
      a long video: check that it does not flash "Loading your video" over and over, and wait for a quiet
      stretch or the end of the turn if it does
- [x] M14-11 (Claude, 2026-10-14; done with M14-05) Words still in the app's own voice that M14-05 must catch: the line under the chat box ("The agent
      can change this project's files and run HyperFrames"), "Start over", the header's "built on HyperFrames"
- [x] M14-05 Every word the app itself shows, reread for a twelve-year-old (Claude, 2026-10-14, written by a
      Sonnet helper and reviewed): "My videos", "Add clips", "Start from my clips"; the assistants as "Claude
      (Claude Code)", "ChatGPT (Codex)", "Gemini (Antigravity)"; "What may the assistant do: Only this video /
      Also cut my clips / Anything on this computer"; "Ask me first: Just do it / Show me the plan first /
      Decide with me"; the model menu is "How careful"; the clips bar and review box, editing buttons, Help
      (with the editor's arrow keys) and the main process's errors rewritten. The list is `docs/UX.md`, "The
      words". Left for M14-06: "built on HyperFrames" in the header. Not yet looked at on the owner's PC
- [x] M14-06 Kushmanji's own logo and icon (with M5-02), its own colours, and an About box that credits
      HyperFrames and says plainly it is not HeyGen's. The header stops saying "built on HyperFrames" (Claude,
      2026-10-14). The owner picked direction A, "Friendly", from `docs/brand/choices.png`: coral on cream
      with cocoa text, a smiling play-button icon, a rounded wordmark. Colours in `styles.css` `:root`, errors
      in crimson so they never look like the brand. The header shows the wordmark and an "unofficial" tag that
      opens "About Kushmanji" (the credit to HyperFrames, not HeyGen's, the versions). The window has the icon;
      `app/build/icon.ico` (16 to 256 px) is ready for the installer (M5-02)
- [x] M14-07 (Claude, 2026-10-14; page by a Sonnet helper, reviewed) The Home screen as a place to start, not a list: "Make a video from my clips", "Make a video from
      an idea", "Carry on with ..." with a picture of each video. Built: a "Carry on" card with the
      last video's picture, "From my clips" and "From an idea" cards, then "My videos" as pictures. The picture
      is taken from the player as the person leaves a video (`covers.js`; nearly black frames are skipped)
- [ ] M14-08 Try it on someone who has never seen it, and fix what they stumble on

## M15 · Spend less: smaller models, and a team you choose

The owner, 2026-10-13: usage runs out during editing; "maybe you guiding different smaller models", "use
antigravity also", "the user also should have the option to work with 1 app model or 2 ... some might not have
subscriptions". Goes with M13 (the team) and M10-05 (the right agent for each job).

- [x] M15-01 "Your team": tick which assistants you have (one, two or three). The app only ever uses those, and
      says what each is used for. Someone with one subscription gets a complete app (Claude, 2026-10-14):
      "Your assistants: tick the ones you have" at the top of the chat's settings, one line each on what it is
      good for; the assistant menu and "Carry on with" offer only those, one always stays ticked, and the main
      process refuses an assistant that is not ticked. Kept in the app's settings (`team`), not per project
- [x] M15-02 (Claude, 2026-10-14) The right size of model for the job, chosen by the app: a small fast one for "make this red", a
      large one for planning a whole video. The person can still pick by hand. Built (2026-10-14): "Auto (saves
      usage)" in the model menu, and the choice when none was made; a short request about one thing goes to
      Sonnet, a Codex "mini" or a Gemini "flash" model, found by name in the assistant's own list, anything
      about the whole video, shorts, subtitles or a plan to the default (`agents/sizing.js`). Seen choosing
      Sonnet in the real app with a stand-in Claude; not yet tried with a real assistant
- [ ] M15-03 Heavy looking and listening goes to the assistant that does it cheapest (today Gemini: it listened
      to 20 clips), and comes back as a short note the others read, instead of each one studying the footage
- [~] M15-04 Keep every request small: send the study's summary, not the whole study; start a fresh
      conversation when a job is done, carrying a short summary forward. Half done (Claude, 2026-10-14): after
      six requests in one conversation the assistant starts a fresh one, with a recap of the latest six turns
      from the shared record (`recapNote` in `journal.js`); the steps line says "A fresh conversation, to save
      your allowance". Open: the study's summary; measuring what it saves (M15-05)
- [ ] M15-05 Show what a request cost and how much of the plan is left, before the limit is a surprise (with M2-13)
- [x] M15-06 A smaller model through the chat's model menu (Claude, 2026-10-13). Sonnet was picked in the menu
      and did the whole vlog repair (M16-02) in one request of about 17 minutes, without reaching the limit.
      What it cost was not recorded: the app does not show it yet (M15-05)

## M16 · Editing that looks edited

The owner, 2026-10-13: "we did cut so fast", "nice transitions ... very smooth cut", "much more motion graphics",
"maybe more research you could do about video technics", "many free github opensource project also".

- [~] M16-01 An editing guide every assistant is given before it cuts (Claude): pacing, when to cut, smooth
      joins of picture and sound, no repeated takes, how long a title stays, where subtitles sit, how loud music
      is under a voice. First version: `app/src/main/agents/craft.js`. To grow from research and from what the
      owner sends back
- [x] M16-02 The vlog, third version (Claude, 2026-10-13; waiting for the owner to watch it). Made through the
      app's chat by Claude Code on Sonnet at "Editing tools", in about 17 minutes: labels, sounds and subtitles
      back on their clips; every clip ends inside its own picture; 16 soft cross-fades of 0.4 seconds with the
      sound fading across, plain cuts inside one scene; a slow push-in on her talking shots; the two heart
      wipes retired. New length 4:03.9. Lint: no errors, 18 expected warnings (16 are the cross-fades'
      overlapping sound). Claude then looked at eleven still frames and changed two things by hand: only the
      incoming picture fades now (fading both showed the dark background mid-join), and `subtitles.json` got
      the new times the assistant had put only in the scene. Measured after: no pause inside any clip, at most
      one frame held at a clip's end. Her last words in the kurta clip lose under a quarter second. The state
      before is in `.hyperframes/versions/2026-10-13-before-third-version`; the request is `NEXT_REQUEST.txt`
- [x] M16-05 Why the preview felt "stuck", measured and answered (Claude, 2026-10-13). A measuring run in the
      self-test (`playbackProbe.js`; how to run it: `CONTRIBUTING.md`) plays a real project and counts dropped
      pictures, the hold at each join and whether the clock keeps time. Result on the vlog: `docs/FINDINGS.md`.
      The cause was the clips, not the player: 15 of 19 play 0.2 seconds past their picture. The footage study
      now records `pictureSeconds` and `soundSeconds` for every video, with a plain note when the picture is
      short (old studies get it added without being redone), and the editing guide forbids playing a clip past
      its picture. Lighter copies for watching were not built: the measurement says they would not help
- [ ] M16-06 What is left at a join, measured on the repaired vlog: the one plain cut held the picture for 83
      thousandths of a second (two or three frames), a clip coming in under a cross-fade moves after 67 to 150,
      and 7 or 8 pictures in every thousand are dropped, most of them just after a join. No step back, no
      pause. Probably not visible. Open only so that someone watches a plain cut with the owner before closing
      it; if it does show, it is upstream's media sync (`packages/core/src/runtime/media.ts`) and goes under
      "Upstream" with these numbers
- [x] M16-07 "Still laggy": lighter copies for watching and editing (Claude, 2026-10-14). Measured first: a
      jump to a moment took 0.28 s (watching) and 0.39 s (editor), and a dragged playhead showed 1 or 2
      pictures a second. A few seconds after a project opens, the app now makes a 720p copy of every heavy clip
      (keyframe every half second, no B-frames) in `.cache/kushmanji-preview`, below normal priority, and
      redirects the preview's requests to it; "Save video" still renders the full files (`lightCopies.js`).
      After: jumps 0.04 and 0.07 s, a drag shows 33 pictures a second, the editor uses 719 MB instead of 1,268.
      The measurement now also times jumps, a drag, opening the editor and memory, and
      `scripts/test-vlog.mjs` makes a practice project. Measured in the cloud on a practice vlog, not yet on
      the owner's PC: see M16-08. Numbers: `docs/FINDINGS.md`, last section
- [ ] M16-08 Measure the lighter copies on the owner's PC with the real vlog (`CONTRIBUTING.md`, playback
      measurement, `HFWIN_SMOKE_PLAYBACK_AT=none` for jumps only) and ask the owner whether moving around now
      feels smooth. If it is still not smooth enough there: a keyframe on every picture (`-g 1`, files about
      four times bigger) or 540p
- [x] M16-09 (Claude, 2026-10-14; done as below) HyperFrames keeps a second full copy of every video in its undo history
      (`%USERPROFILE%\.cache\hyperframes\history`, see UP-02). Show the owner how much room it takes, and offer
      to clear the history of projects that are gone (upstream has `pruneGoneProjectHistories`). Done: Home's foot says "Undo copies of your videos take 666 MB on this computer", and when
      some belong to deleted videos, "174 MB of that is for videos you have deleted. Free up 174 MB", which runs
      upstream's own `hyperframes clean` after asking (`main/storage.js`)
- [ ] M16-03 Research: what open-source projects and guides teach about editing and motion design that an
      assistant can use (licences checked; nothing AGPL copied in). Write what is worth keeping into the guide
- [ ] M16-04 A small library of ready moves an assistant can drop in: soft cross-fade, push-in on a face,
      speed ramp, title styles, lower thirds, end card. From HyperFrames' own catalog first

## M17 · Shorts and reels from a finished video

The owner, 2026-10-14: "i need shorts also reels and for youtube also shorts, maybe 2-3 ... to increase followers
and subscribers", "a good intro ... happywithshisha", "background music if needed + outro", "this export
everything i want ai to do". The channel's own notes are in `C:\Creators\happywithshisha` (read only from here).

- [x] M17-01 Three upright shorts cut from the City Centre vlog (Claude, 2026-10-14; waiting for the owner to
      watch). Each is its own project in `reviews/shisha-shorts`, made through the app's chat by Codex at
      "Editing tools": "Boring day? Mall time!" (27 s), "So pretty!" (19 s), "Day out: done!" (21 s). Full
      screen, cropped around her face, the vlog's look, an ending card with the channel's name. Claude checked
      still frames of each and frames of each finished file; short 2 went back once (see M17-07) and two top
      titles were restyled by hand to be readable. Nobody has listened to them
- [x] M17-02 The vlog's fourth version (Claude, 2026-10-14; waiting for the owner to watch): her first two
      lines with nothing over them, a "Happy with Shisha" name card of 2.6 s in the pause after them, a 7 s
      ending card with room for YouTube's own buttons, and music on those two cards only (a YouTube Audio
      Library track the owner already downloaded for the channel). 4:13.5. Built through the chat by Claude
      Code on Sonnet, which was stopped by the usage limit before its own check (M17-06); Claude then checked
      the still frames, moved the chime onto the name card and brought the storyboard up to date. The finished
      file was checked too: no frozen stretch outside the two cards
- [x] M17-08 "Save video" brings the sound to the usual loudness itself (Claude, 2026-10-14). A saved video came
      out at the project's own loudness: about -19 LUFS for all four of the owner's videos, where YouTube and
      Instagram play at about -14. After the video is made, FFmpeg measures it and raises or lowers the sound
      (at most +9 or -6 dB, with a limiter), copying the picture; a video with no sound, or a computer with no
      FFmpeg, keeps the file as made. `main/loudness.js`. Tried on one of the owner's shorts from outside the
      app (-18.9 to -14.2); inside the app the self-test's video has no sound, so that path is the one tried
- [ ] M17-09 One kit for a channel's shorts: the three ending cards and the top titles came out a little
      different each time, because each short was a separate request. Goes with M17-04 and M10-04
- [x] M17-03 Arrow keys in "Edit by hand" (Claude, 2026-10-14): while the video plays they skip ten seconds and
      it keeps playing, as on the watching screen; while it is paused, with a modifier, in the chat box, or on
      a control that uses arrows, the editor keeps its key. `main/editorKeys.js`. Tried in the self-test with
      real key presses. The owner hit this twice: "its not going forward its pausing". Not yet said anywhere
      in Help (with M14-05)
- [ ] M17-04 "Make shorts from this video" as something the app does: pick the moments, make an upright project
      in the video's own look, keep her face in frame. Today it is done by hand with three requests
- [x] M17-05 "Save the video" done by the app, not by the person: done as M4-02 (Claude, 2026-10-14). An
      assistant is the wrong tool for it: a four-minute video takes most of an hour to make here, far longer
      than an assistant's command may run
- [x] M17-06 (Claude, 2026-10-14) When an assistant is stopped by its usage limit in the middle of a job, the work is left half
      done and unchecked, and the chat only shows the limit message. Seen twice on 2026-10-14 (the vlog's
      fourth version stopped before its own check; a short never started). Say plainly what was and was not
      finished, and offer to carry on with another assistant (with M12-04). Main process done (2026-10-14):
      `agents/limits.js` recognises the three assistants' limit messages, and the saved turn carries
      `limited`, `resets` and the files changed; the shared record says the work is unchecked. The chat says
      "Claude ran out of its allowance before it finished. It had already changed: index.html. Nobody has
      checked those changes yet. Claude says it can work again: 3pm", with "Carry on with ChatGPT" and "Carry
      on with Gemini": each switches the chat and prepares a message asking that assistant to check the half
      done work and finish it (the person presses Send). Tried in the real app with a stand-in Claude that
      prints the limit message; not yet with a real limit
- [ ] M17-07 Codex cannot look at what it made: at "Editing tools" its own still-frame check is refused
      ("browser access was denied"), so it works from the footage study's pictures and says so. It built a
      good short that way, with two faults a look would have caught (lips not matching the words, a strip
      across the top). Find a way for Codex to take still frames inside its sandbox (with M2-21)

## Upstream

Windows bugs found in heygen-com/hyperframes itself. Each becomes a pull request there, not a patch here.

- [ ] UP-01 `hyperframes transcribe --engine whisper` cannot set itself up on Windows. It only builds
      whisper.cpp from source (needs git, cmake and a C compiler), and even after a build it looks for
      `build/bin/whisper-cli` with no `.exe`, which Windows never produces. Found by reading
      `packages/cli/src/whisper/manager.ts` (`findBuiltBinary`, `ensureWhisper`); not reproduced, because this
      PC has no cmake. Seen for real: `transcribe -l hi --json` answers `whisper_unavailable`. A fix upstream:
      download whisper.cpp's own Windows release, and look for the `.exe`

- [ ] UP-02 Studio's undo history copies every video over 1 MB into `~/.cache/hyperframes/history` on a
      project's first open (`adoptMediaInBackground`, `packages/cli` history code; a full copy on NTFS, which
      has no reflink), then hashes it. 553 MB of footage became 636 MB of history in the measuring runs of
      M16-07. Not Windows-only, but it hurts most there and with big footage. Reproduce: open a project with a
      few large videos in Studio, then look at that folder. A fix upstream: reference media by hash in place,
      or an option to keep media out of history

Template: `- [ ] UP-03 What breaks · how to reproduce · upstream file · issue or PR link`

## Questions for the owner

These live in `CHECKLIST.md` now, under "Waiting on you", so there is one place to look.
