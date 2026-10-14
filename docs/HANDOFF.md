# Handoff log

What each session left for the next one. **Newest entry on top.** Keep an entry short: what changed, what is
unfinished, what would surprise the next reader. The task list itself lives in `PROGRESS.md`.

---

## 2026-10-14 · Claude · Smooth jumping and dragging: lighter copies (M16-07), in the cloud

This sitting ran in a Claude Code cloud container (Linux, 4 cores, no graphics card), not on the owner's PC:
no real vlog, no Codex, no Windows. Everything was measured on a practice vlog made by
`app/scripts/test-vlog.mjs` (19 clips of 1080p at 16 Mbps, a keyframe a second, 4:32).

**Done: M16-07.** Measured first (the playback measurement now times jumps, a drag, opening the editor and
memory): a jump took 0.28 s watching and 0.39 s in the editor, a dragged playhead showed 1 or 2 pictures a
second. Fix: `main/lightCopies.js` makes 720p copies (keyframe every half second, no B-frames, sound copied)
of every heavy clip the project's pages use, below normal priority, into `<project>/.cache/kushmanji-preview`,
and the session's `onBeforeRequest` redirects the preview's requests to them. After: 0.04 and 0.07 s, 33
pictures a second, 719 MB instead of 1,268. Numbers and research: `docs/FINDINGS.md`, last section.

**What would surprise you**
- Why `.cache`: HyperFrames' own watcher (`WATCHER_EXCLUDED_DIRS`) and undo history (`isHistoryPath`) skip it,
  and its preview route serves it. A copy in any other hidden folder would make Studio re-read the whole file
  on every write; under `.hyperframes` the route answers 404. `docs/MAINTENANCE.md` says what to recheck when
  the CLI is bumped.
- HyperFrames' undo history copies every video over 1 MB into `~/.cache/hyperframes/history` on a project's
  first open (UP-02, M16-09). That is probably part of "opening the editor feels slow" with big footage.
- `onBeforeRequest` allows one listener per session: it lives in `lockDownSession` in `main.js`; share it.
- Running the app in a Linux container: `npm install` did not fetch Electron (run `node install.js` in
  `node_modules/electron`), Electron needs `--disable-gpu` under Xvfb (or `capturePage` fails with
  UnknownVizError) and `ELECTRON_DISABLE_SANDBOX=1` as root. The copy maker and the exporter only find
  `ffmpeg.exe`; set `HYPERFRAMES_FFMPEG_PATH` and `HYPERFRAMES_FFPROBE_PATH` there. Seven unit tests are
  Windows-only and fail on Linux; the full self-test stops at the editor's arrow-key step there, with or
  without this change. CI (Windows) runs check and the unit tests.

**Shared files touched:** `main.js` (the copy maker, the redirect, `realTool`), `preload.cjs` (one event,
`preview:copies`), `app.js` (the top bar's "Making clips smooth to edit" line), `agents/house.js` (one sentence:
never put the copies in a video).

**Next:** M16-08 (measure on the owner's PC with the real vlog), then the plan below from item 2.

---

## For Claude's next sitting (written 2026-10-14, morning, at the owner's request)

The owner starts a fresh chat and wants about 18 hours of continuous work while their usage lasts. Their words:
"continue with the project", "do use sub agents for smaller work so we can save usage", "you can use sonnet",
"dont stop", "only if you want to ask something you stop and make it mobile i can see".

**How to work this time**
- Keep the main chat lean: it is what uses the owner's limit. Give self-contained smaller jobs (research,
  reading upstream code, writing tests, docs, reviewing a diff) to subagents on Sonnet (`model: "sonnet"`), and
  give them exact files and a short brief.
- Video jobs through the app's chat go to Codex (`npm run smoke:codex` with `HFWIN_SMOKE_JUST_ASK`), not to
  Claude Code: nested Claude runs share the owner's Claude limit and were cut off twice. Take still frames
  yourself afterwards; Codex cannot.
- Do not stop between tasks. Stop only for a decision that is the owner's, and then ask one short question
  that reads well on a phone, with two or three choices.
- Per finished task: check, tests, self-test, one commit with the task id, push. Keep PROGRESS, CHECKLIST and
  this file true as you go, not only at the end. Send screenshots of visible results with SendUserFile.

**The order**
1. **Done in the cloud, see the entry above.** ~~"Laggy" (new task M16-07).~~ The owner still feels lag in the preview and is not sure where. Measured so
   far: playing inside a clip is smooth (M16-05). Not measured: jumping to a moment (dragging the bar, clicking
   the timeline), and the editor's own controls with 19 clips and their filmstrips. Extend
   `app/src/main/playbackProbe.js` with seek times (from the seek to the first new picture) and long tasks in
   the editor's page, on the real vlog. Likely cause if seeking is slow: 16 Mbps 1080p clips with a keyframe
   every second. Likely fix: lighter copies for watching and editing only (720p, a keyframe every half
   second), the full files still used by "Save video". First look in `upstream/packages/core` and the CLI for
   a way to give the preview a different file than the render (`media.autoProxy` only re-encodes codecs a
   browser cannot play). Measure before and after; tell the owner in numbers and plain words.
2. **M14-05 plain wording**, with M14-11 and one Help line for the editor's arrow keys. The word list goes in
   `docs/UX.md`. Smoke and unit tests match some of these strings: change them together.
3. **M17-04 and M17-09: "Make shorts from this video"** as something the app does, with one shared look for a
   channel's titles and ending cards. The three shorts of 2026-10-14 and their requests are the worked example
   (`reviews/shisha-shorts/*/REQUEST.txt`, `MOMENTS.md`).
4. **M17-06**: when an assistant is cut off by its usage limit, say plainly what was and was not finished,
   and offer to carry on with another assistant (with M12-04).
5. **M14-06 branding**: prepare three directions for Kushmanji's own logo and colours, then ask the owner to
   pick (one phone-sized picture, three choices).
6. Then M14-07 (Home), M15-01 (your team), M15-02 (model size), and the list at the end of `docs/PARITY.md`.

**Answered by the owner on 2026-10-14:** push when work is finished (yes); Blender MCP: not now (asked, advised
against for cute vlogs: big install, slow renders, runs any code; maybe later for a one-off 3D channel logo).
The owner's channel rules are in `C:\Creators\happywithshisha` (read only).

---

## 2026-10-14 · Claude · Save video, arrow keys, the vlog's fourth version and three shorts (through the night)

The owner, before sleeping: push; the arrow key pauses in "Edit by hand"; the video is nice; shorts and reels,
"2-3"; an intro with the channel's name, an outro, music if needed, cute; "this export everything i want ai
to do"; "do it 1 by 1, morning i will come and check".

**Done, in this order**
- Pushed. Then again at the end of the night.
- **M17-03 Arrow keys** (`main/editorKeys.js`): while the editor's video plays, a plain arrow is taken in
  `before-input-event` and becomes the watching screen's ten-second skip. Tried with real key presses.
- **M4-02, M4-03, M17-05 "Save video"** (`main/exporter.js`, `renderer/saveVideo.js`): the CLI's own `render`
  into the person's Downloads folder, a count, stop, "Show the file". The "Save the video" editing button now
  does this instead of opening the editor. The self-test saves a one-second video into its own Downloads folder.
- **M17-02 The vlog's fourth version** and **M17-01 three shorts**. Finished files:
  `reviews/READY` (four MP4s and a note for the owner). Details are in the two tasks.

**What would surprise you**
- The owner's channel has its own rulebook in `C:\Creators\happywithshisha` (read only from here):
  `00_PROFILE.md`, `DECISIONS.md`, `_brand/EDIT_STYLE_GUIDE.md`, `MUSIC.md`. It settles things this repository
  kept asking: shorts are full screen and upright, no Kannada word cards, no blurring, no clock times on screen,
  no MusicGen, music only from the YouTube Audio Library or Pixabay, and Kish wants the plan before a cut.
- **Nested Claude Code runs spend the same Claude limit as the session that starts them.** Two of them were
  stopped by "You've hit your session limit" (the self-test still said PASS, because the file it looks for
  existed). Codex did the shorts instead, on the ChatGPT plan, in 15 to 25 minutes each. Prefer Codex for
  jobs sent through the chat from a Claude session, and read `agentReply` in `result.json`, not the PASS line.
- **Codex cannot see what it builds** at "Editing tools" (M17-07). It says so honestly. Always take still
  frames yourself afterwards: `hyperframes snapshot <project> --at ...`.
- The footage is wide. A full-screen upright short is a crop around her face, a little soft, and looks fine.
- A video made by HyperFrames is about 5 dB quieter than YouTube plays. "Save video" now evens that out
  itself (M17-08, `main/loudness.js`); a file made with the CLI by hand does not.
- **The full-screen check only passes with the self-test's window in front.** It now says "NOT checked"
  instead of failing. `HFWIN_SMOKE_NAME` lets several runs go at once; `HFWIN_SMOKE_JUST_ASK` sends one
  real request without the self-test's own steps (`CONTRIBUTING.md`).
- A render reported `media_readiness_timeout` and still made a good file. Check the file, not the message:
  frames across it, and `freezedetect` for stretches that do not move.

**Shared files touched:** `main.js` (the save calls, the editor keys, a guard in `agent:send`), `preload.cjs`
(`save`), `app.js` (the button in the bar), `chat.js` and `editActions.js` (`onSave`), `help.js` (four
sentences), `styles.css` (two rules), `smoke.js`, `scripts/smoke.mjs`. ChatGPT: the Help text does not yet
mention the editor's arrow keys; that belongs with M14-05.

**Not done, next in line:** M14-05 (plain wording, with M14-11), M17-04 and M17-09 (shorts as something the
app does, with one kit), M17-06 (say what a stopped assistant left unfinished),
then the list at the end of `docs/PARITY.md`. Nothing is claimed.

Check (59 files), 112 tests and the self-test pass. Paid requests: two on Claude, both cut off by its
usage limit; four on Codex.

---

## 2026-10-13 · Claude · ChatGPT's work reviewed, the "stuck" preview measured, the vlog's third version (late evening)

The owner asked for four things in order; the first three are done, the fourth is not started.

**1. ChatGPT's M14-01 to M14-04, reviewed and committed** (`ea509b2`, one commit: the four tasks share files).
Check, tests and the self-test pass. `player:command` and `preview:changed` hold to `SECURITY.md`. Tried on
the real vlog. One fault fixed: the self-test's full-screen check waited three seconds and failed one run in
two on this PC; it waits fifteen now. Left for their owner, in `PROGRESS.md`: M14-09, M14-10, M14-11.

*The case for M14-09 (ChatGPT, yours to decide):* the chat is right of the video while watching and left of it
in "Edit by hand". The same panel jumping sides at one click is the kind of thing M14 exists to remove. Keep it
on the right in both; Studio's own right-hand panel can be narrowed by the person, the chat cannot be found
again by a child.

**2. "Stuck stuck", measured** (M16-05). `HFWIN_SMOKE_PLAYBACK=1` with `HFWIN_SMOKE_REAL_PROJECT` plays a real
project and counts pictures really shown (`playbackProbe.js`; `CONTRIBUTING.md` says how). Playback inside a
clip is smooth on both screens. The freeze was before each join: 15 of 19 clips played 0.2 seconds past their
picture, because a "15 second" file held 15.0 seconds of sound and 14.8 of picture. The study now records
`pictureSeconds` and `soundSeconds` (old studies are topped up without being redone) and the guide forbids
playing past the picture. Numbers and what was ruled out: `docs/FINDINGS.md`, last section.

**3. The vlog, third version** (M16-02), through the app's chat with Sonnet (which also settles M15-06). Then
two changes by hand after looking at stills: see M16-02. Measured again: the freeze is gone.

**What would surprise you**
- The handoff named `reviews/city-centre-vlog/NEXT_REQUEST.txt`. It did not exist. The request was recovered
  from the vlog's saved chat and the file is there now.
- `media.autoProxy` does not make lighter copies of ordinary video. It only re-encodes what a browser cannot
  play. The earlier note that suggested it was a guess.
- Two measuring runs were spoiled by real mouse clicks in the test window: twelve trusted clicks counted, the
  playhead dragged. The owner's own Kushmanji has been open since the morning and the Codex desktop app (with
  its computer-use helper) was running; which of them clicked is not known. The measuring run now ignores the
  mouse. An ordinary `npm run smoke` does not, so a failure with a strange screenshot may be a stray click.
- The owner's open Kushmanji window still runs this morning's code. They have been told to restart it.
- Assistants put a cross-fade's clips on one track, which lint reports as overlapping sound (16 warnings on the
  vlog). They are expected. Whether to teach two alternating tracks instead is open.
- The assistant re-timed the subtitle scene but not `subtitles.json`. A request that says "rebuild from
  subtitles.json" must also say "and keep that file's times true".

**Not done:** step 4 (M14-05 onward, M15, the list at the end of `docs/PARITY.md`). Nothing is claimed.
M16-06 is new and small: what is left at a join after the repair (a plain cut holds two or three frames).

**Shared files touched:** `main.js` (two switches, only under `HFWIN_SMOKE_PLAYBACK`), `smoke.js` (the hook for
the measuring run, the longer full-screen wait). New: `playbackProbe.js`. Also `study.js`, `studyPlan.js`,
`agents/craft.js` and their tests. Check (52 files), 103 tests and the self-test pass.

**Commits:** three, on this PC only. Not pushed: the owner has not asked. No installs, nothing changed outside
this folder. One paid request: the vlog repair, on the owner's Claude plan.

---

## 2026-10-13 · ChatGPT · simple help and the welcome walkthrough (M14-04)

**Done:** Help on Home, the watching screen, the editor and full-screen playback. `renderer/help.js` opens
the current screen's explanations first, with one sentence per part. Its three-step walkthrough appears
once, remembers finishing or dismissal and replays through "Show me around". Only a seen flag is stored in
the shell origin's localStorage (`hfwin-help-seen-v1`); unavailable storage falls back to the current session.

The full editor has a collapsible glossary above it pairing every listed editor word with its plain meaning.
It lives in the shell, keeping the upstream tabs intact and avoiding version-sensitive DOM changes inside
Studio. The same word list supplies the guide. The iframe takes the remaining stage height. Help changes
no video files, sends no messages and preserves the draft. Its full-screen entry remains available while
playback controls are loading. Playback keys now ignore open dialogs, including Help.

**Verification:** check (50 files), tests (99/99), real-app smoke with zero console errors; screenshots
inspected and saved in `reviews/m14-help`. Tested initial steps, Back, finish, replay, Skip, preference
persistence after a page reload, Escape, context on all three screens, smallest window, full-screen Help,
draft preservation and keyboard isolation. Two defects found and fixed before delivery: conditional false
values were rendered as stray text, and Space/arrows could control the video beneath the dialog. Both
failures were reproduced and covered in the self-test. No paid assistant request or independent review run.

**Next:** M14-05, the full wording pass. Branding, Home, team/usage controls and the rest of the roadmap are
still pending. Claude keeps the caption proof and M16-02 vlog repair; the vlog was untouched. Cancelled
browser features, social accounts and automatic posting stay cancelled.

Shared edits are limited to renderer/app.js, player.js, styles.css and main/smoke.js, plus the new help module
and notes. All earlier uncommitted changes were preserved. No main/preload/agent protocol or dependency
changes, no installs, no changes to other programs' settings, and no commits or pushes.

---

## 2026-10-13 · ChatGPT · message moments and plain editing buttons (M14-02, M14-03)

**Done:** the watching screen shows "At 0:42" beside the box. Sending passes a boolean flag; main.js reads the
active root player afresh before the study wait. A short note reaches whichever assistant is chosen. The
timestamp is saved beside the user message and in the shared journal; the accepted snapshot replaces the
optimistic line in the UI. Missing/loading players refuse a requested snapshot and restore the draft. Studio
keeps its selection context; Home's initial request and plan approval omit a watching time.

Eight large buttons in `renderer/editActions.js` explain themselves in native dialogs, then append a request
to the draft. Nothing sends automatically. Supplied captions and imported music are offered; automatic
subtitles, stock/generated music and noise-tool setup are explicitly pending. Saving opens Studio and
explains the incomplete Windows export checks. Buttons disable during a turn; the collapsible list leaves
room for chat even at the actual 960 × 600 minimum. No new dependencies or access changes.

**Verification:** check (49 files), tests (99/99), real-app smoke; screenshots inspected. One real Codex turn
received 42.366 seconds, wrote only the title "At 0:42" in the test video and recorded its moment. A second
self-test reopened a copy of that test video, verified the saved bubble and the updated title in the live
frame, and sent no assistant request. Evidence: `reviews/m14-actions`, `reviews/m14-moment-live`,
`reviews/m14-reopen` (all ignored). The first live screenshot was stale despite correct DOM/file data:
the self-test now requests a repaint before capture. The reopened screenshot shows the actual changed title.
Access-test selectors now target the confirmation specifically instead of any dialog footer. One initial
clip-review image timeout did not recur in later runs; M9-12 records it with diagnostics. Host execution was
needed: the Windows execution sandbox denied temporary-directory realpath checks and would not open Electron.

**Still pending:** M14-04 help, M14-05 wording, branding/Home/team/usage/export/undo/languages/installer.
M8-04's automatic-caption proof and M16-02's vlog repair remain Claude's claims. The vlog was untouched.
Browser features, social-account management and automatic posting are cancelled by the owner.

Small shared edits: main.js, agents/index.js (context only, no bridge changes), renderer/app.js, chat.js,
player.js, styles.css and smoke.js. Preload, preview.js and the earlier uncommitted player work were preserved.
Architecture, security, UX, README, progress and checklist are current. No commits, pushes, global installs or
changes to the owner's program settings; one paid assistant turn, no independent reviewer run this session.

---

## 2026-10-13 · ChatGPT · the simple watching screen (M14-01)

**Done:** projects now open with a large player and chat on the right. Play/pause, ten-second buttons and
arrow keys, scrubbing, master sound and full screen. "Edit by hand" opens the existing Studio; "Watch video"
returns to the remembered position, paused. The same chat instance and draft survive each switch. Assistant
and clip settings are expandable; the current access sentence remains visible. The default access choice
has not been decided or changed.

`renderer/player.js` uses the current server's root preview and `main/player.js` exposes only fixed,
validated commands to that direct frame. A preview watcher refreshes source/media changes and ignores hidden
journals, versions, dependencies and exports; agent completion is a fallback on unwatched folders. The
inactive iframe source is removed. Editor readiness must match its own Studio frame: Studio adds a query
after the project fragment, so comparing the whole parent URL fails. A regression test covers it.

**Verification:** check (47 files), tests (95/95), real-app smoke; screenshots inspected. Smoke checks a
moving FFmpeg clip with actual audible tone, mute/unmute, both arrows while playing, scrub bounds, full
screen, portrait size, minimum window, source refresh, ignored notes, hidden playback stopping, chat draft,
    access confirmation/cancel, clip review and editor pointing. No real agent turn was sent. Independent
review was attempted twice but the reviewer model hit capacity; it did not deliver a review. Local source
inspection and the tests are the evidence here. Screenshots and the final smoke result are preserved in
`reviews/m14-player`. Paused scrubbing checks the decoded video frame and its visibility before capturing;
full-screen screenshots wait briefly for the resized picture to paint.

**Ownership:** M16-02 is still Claude's claimed task, so the vlog and its timing repair were left untouched.
Next unclaimed UI work is M14-02, then M14-03. Shared files touched: main.js, preview.js, preload.cjs, app.js,
chat.js, styles.css and smoke.js. No dependency/version changes, commits, installs or changes outside this
workspace. README, UX, architecture, security and the owner's checklist describe the new screen.

---

## Start here (written 2026-10-13, evening)

**The order changed.** The owner wants the app to be its own thing and easy enough for a child: M14 in
`PROGRESS.md` comes first now, starting with M14-01, the simple screen. Read `docs/UX.md` before touching any
screen. Then M15 (spend less, a team you choose), then the list at the end of `docs/PARITY.md`.

The owner's usage is limited and they come back after it resets. Work in short sittings, commit each finished
task (they said "its time to put this on github"), and leave this file true. They said yes to the noise tool,
yes to the subtitles ("its good"), and "however you recommend" to the order.

**The vlog is out of step and waiting for you (M16-02).** Labels and subtitles sit 15 seconds late after a clip
was removed by hand. The fix was sent through the app's chat and stopped at once: the owner's Claude usage
limit was reached. Do this first when usage is back: open the vlog in the app, "Editing tools" access, and send
the request kept in M16-02's words (realign labels, wipes, sounds; rebuild the subtitle scene from
`subtitles.json`; soft cross-fades; slow push-ins). Then look at still frames before telling the owner.

Their vlog is `reviews/city-centre-vlog` (never uploaded). What they want from it is in the memory note and in
M16. Ask before exporting a final file: they have only watched it in the app.

---

## 2026-10-13 · Claude · Kushmanji: the new name, GitHub, Codex's repair, the full checklist (later the same day)

**The owner decided:** the app is **Kushmanji**; it lives at `github.com/webziko/kushmanji`, public, Apache-2.0;
"it's time to put this on GitHub", which is the yes to committing. They want every feature of the official app
"one by one", and a bigger answer to agents breaking when they update.

**Done.** The name, in everything a person sees (`package.json`, the window, the header, the notes agents and
files carry, `README.md`). Internal names keep `hfwin` on purpose: see the top of `AGENTS.md`. M12-01: Codex
starts a turn again with its other sandbox when the default will not start; proven through the chat. The full
checklist is `docs/PARITY.md` (rewritten, with the build order at its end) and milestones M11, M12, M13 in
`PROGRESS.md`. Two Desktop shortcuts, at the owner's request. First commits, pushed.

**The vlog.** A noise pass through the app's chat made cleaned copies in `assets/clean` and turned six
no-talking clips to 40%. It changed the background by about 1 dB: the noise is music, crowds and traffic.
Real cleaning needs a voice-isolation model (M10-17), which needs the owner's yes to install.

**Things that will surprise you.**

- Most of the "missing features" lists the owner gathered are already inside: the editor is the same code.
  Check `docs/PARITY.md` Part 1 before building anything that sounds like an editor feature.
- `reviews/` is git-ignored: it holds a real person's footage. Never commit it.
- Commits are authored as `webziko <webziko@users.noreply.github.com>`, set in this repository only, so the
  owner's own email is not published. The global git identity on this PC is a stray quote mark; it was left alone.
- The first commits are an import by area, not one per task: the work predates the repository. From here on,
  one task per commit as `AGENTS.md` says.
- The app's settings folder moved with the name: `%APPDATA%\Kushmanji`. Nothing was worth carrying over.

---

## 2026-10-13 · Claude · access levels, footage study, plan first, pointing, and the vlog's second version

**Done:** M10-08 (and the menu of M2-06), M10-01, M10-02, M3-01 (the first part of M10-06). `npm run check`
(42 files), `npm test` (84) and `npm run smoke` pass. Proven through the real chat with Claude Code: a clip cut
at "Editing tools" and refused at "Project only"; a word's exact second read from the study; a plan shown, the
video untouched, then built after "Build it"; a clicked title changed by "make this red". Gemini cut a clip and
relayed the FFmpeg check's refusal word for word.

**The owner's feedback this session, in their words:** "cutey type of video", "you did cut so much", "I need
most of the movements from her", "english subtitles", "I cannot click on screen and tell anything", "sound
didn't come", "do explain me everything". They want the app fixed first, then the video.

**The vlog.** `reviews/city-centre-vlog` now holds a second version, made by Claude Code through this app's
chat at "Editing tools": 4:29, all 20 clips, cute intro, sticker labels, ending card, every clip at full
volume. ChatGPT's version is in `.hyperframes/versions/2026-10-13-chatgpt-draft`. A second chat turn added 44
English subtitle lines as one scene. Lint: no errors, one warning (44 lines on one track). Nine still frames
looked at; not rendered, not watched in motion. The subtitle words are machine listening (Gemini and Whisper),
unverified: see M10-16 and the project's `SUBTITLES.md`.

**Left unfinished.**

- M10-06: only clicking is done. Studio's "Ask agent about this element" still copies to the clipboard.
- M10-14: the owner's "no sound" was not reproduced in the app. Six clips in the first draft were at 28% volume.
- M2-22: Codex cannot run commands while the Codex desktop app is open. Needs the owner to close it once.
- M10-15: "Editing tools" refused a font download and a helper script during the real re-edit.
- M10-11, M10-12: Whisper on Windows, and working out the language. Kannada in the app's own study still gives
  "needs Whisper"; the vlog's study is ChatGPT's prepared one.
- "Full access" has never been run with a real agent. "Co-direct it" has never been run.
- Still nothing committed. The owner has not said "commit".

**Things that will surprise you.**

- Electron's `sendInputEvent` never reaches Studio's frame (another origin, another process). The self-test
  clicks inside the frame with `frame.executeJavaScript` instead (`pointingStep` in `smoke.js`).
- `capturePage` fails with "UnknownVizError" while the PC's screen is locked or asleep. Every smoke run needs
  its pictures, so run them while the screen is on.
- The self-test grew switches: `HFWIN_SMOKE_SOUND`, `HFWIN_SMOKE_MODE`, `HFWIN_SMOKE_UNPOINT`,
  `HFWIN_SMOKE_REQUEST_FILE`, `HFWIN_SMOKE_TURN_MINUTES`, `HFWIN_SMOKE_ACCESS`, `HFWIN_SMOKE_EXPECT_FILE`,
  `HFWIN_SMOKE_EXPECT_NO_FILE`. Each is described where it is read in `smoke.js`.
- Below "Full access" an agent's `ffmpeg` is our check, not the real program (`agents/mediaTools.js`). An agent
  that reports "FFmpeg was not run" is quoting us.
- The access level lives in the app's settings, per project. The way of working lives in the project's chat file.
- ChatGPT changed `renderer/study.js`, `main.js`, `preload.cjs`, `smoke.js` and `house.js` between my two
  sittings. I built on its versions and reverted nothing.
- Shared files touched: `main.js`, `preload.cjs`, `renderer/chat.js`, `styles.css`, `package.json` (one script,
  `smoke:study`), `agents/codex.js` (a plain message when Codex's sandbox is down).
- Nothing was installed and nothing outside this folder was changed. The owner linked a reverse-engineering
  tool (REA); it was read about, not installed, and advised against in `CHECKLIST.md`.

---

## 2026-10-13 · ChatGPT · real footage, app intake/review, and an editable motion draft (M10-13)

**User authorization:** test their footage in this app, fix problems and add useful features while they sleep.
They explicitly asked for motion graphics. No publishing or commits requested. Phone work was dropped.

**Done:** Home Start from footage, project Add footage, and Review clips (all saved sheets, transcript and
uncertainty notes). Safe copies preserve originals and existing assets. Preview readiness now waits for
`__renderReady` in the current project's root or saved selected scene. Named IPC only; sandbox/CSP unchanged.
Added mediaImport.js, studyRead.js and regression tests. Small shared edits: main.js, preview.js, preload.cjs,
renderer app/chat/study/styles, smoke.js and agents/house.js. Independent read-only review findings repaired.

**Real deliverable:** `reviews/city-centre-vlog/index.html`, 193.076s, 1920x1080, 18 selected footage clips,
eight cream/coral animated callouts, two wipes and quiet local SFX. Export:
`reviews/city-centre-vlog/renders/city-centre-draft.mp4`. All 20 videos plus photo are copied under `.source`;
all original hashes match. 17 sideways landscape clips restored by rotating left; 08 is truly portrait with
blurred duplicate background; 19/20 already horizontal. Mild rumble cut and individual loudness processing.
Prepared videos have one-second keyframes for scrubbing. Prior full-order assembly is archived in
`.hyperframes/versions/review-assembly.html`. BRIEF/STORYBOARD/DESIGN/FOOTAGE_REVIEW/edit-scenes explain the edit.

**Kannada caution:** existing local faster-whisper-large-v3 produced this project's saved portable study;
it is NOT a generic app transcription implementation. Incorrect music hallucinations excluded; doubtful words
flagged. Do not burn machine Kannada as final subtitles. M10-11/12 remain open; M10-02 remains Claude's task.
The app counts 20 prepared videos plus two sound effects in its study inventory.

**Proof:** npm run check (40 files), npm test (74/74), npm run smoke with HFWIN_SMOKE_REAL_PROJECT all passed;
real-app screenshots inspected and preserved in reviews/video2-review. Earlier smoke:agent passed after the
house note changed, on its throwaway project. Vlog lint: zero errors/warnings. Full 3m13 MP4 rendered and
decoded without errors; eight exported/live preview points visually checked. CLI's long-project check exceeded
five minutes even with one-second keyframes; do not report it passed. See the project's QC.md for limits.

No commits, global installs or external settings changes. Local review launcher/profile live under reviews
and open this same app with isolated settings. Normal app: Open a folder → reviews/city-centre-vlog.

---

## An older "Start here" (written 2026-10-12, end of the first day; replaced by the one at the top)

**The owner said go on the advanced plan (M10).** Their words: "yes you have full access you can do and add
those features and all". Read that as approval to build all of M10, including the editing-tools access level
(M10-08). It does not settle which access level a new user starts on; ask once M10-08 exists.

Suggested order: M10-08 (editing-tools access), M10-01 (study the footage), M10-02 (plan first), then down the
list. Nothing is committed yet and the owner has not answered about commits: ask before the first one.

---

## 2026-10-12 · Claude · full research of the official app, the advanced plan (fourth session of the day)

**Done.** No code. Researched what the official HyperFrames Studio does from upstream's own docs and wrote
`docs/PARITY.md`, a feature-by-feature checklist against this app. Added milestone M10 to `PROGRESS.md`.

**The owner's direction changed, and it changes priorities.** The app is now for many people making any kind
of video, not for the owner's own channel. See "Who the app is for" in `AGENTS.md`.

**Things worth knowing before starting M10.**

- The open-source Studio already has twelve agent tools (`studio_look`, `studio_select`, `studio_frame`, ...)
  registered on `document.modelContext`. See `upstream/docs/guides/webmcp.mdx`. That is the way into
  "point instead of describing" and "check its own work" (M10-06, M10-03). Studio runs in a cross-origin frame,
  so the bridge has to go through the main process (`webContents.mainFrame.frames`), not the page.
- Gemini, through `agy`, can watch a video file directly with its `view_file` tool. On a 6-second test clip it
  read the on-screen words and the exact second they appeared. Untested: long clips, speech, file size limits.
- Upstream's general-video workflow already defines three ways of working with the person ("build it for me",
  "review the story first", "co-direct"). M10-02 should expose those, not invent new ones.
- The owner asked that self-checking must not repeat: one check, at most one round of fixes (M10-03).
- The owner has a private video pipeline of their own elsewhere on this machine. It is a good model of method
  (transcripts plus frame sheets, plan before cutting) and must never become a dependency of this app.

---

## 2026-10-12 · Claude · Gemini, shared memory, model menu, security and docs (third session of the day)

**Done.** M2-11, M2-14, M2-15, M2-16, M2-18, M2-19, M9-01, M9-02, M9-04. All three agents now work in the chat.
`npm run check`, `npm test` (15 tests) and `npm run smoke` pass. Live proof of shared memory:
`HFWIN_SMOKE_THEN_AGENT=codex npm run smoke:antigravity` had Gemini change the title, then Codex, asked who
changed the video last, answered "Antigravity (Gemini) last changed the video, updating the visible title".

Image generation is proven too (M8-02): Codex, asked in the chat, generated a picture and set it as the
background.

**Left unfinished.**

- M8-11: images only work when the chat's agent is Codex. `media-use`'s hand-off to Codex did not start from
  inside a Codex session, and is untried from Claude Code and Gemini.
- M2-21: in that same run Codex removed the title card's online animation script because its check said the
  script "couldn't load". That smells like the sandbox, not the project. Look before trusting Codex's checks.
- M2-07 "Make it" on Home is still not run end to end.
- M2-16: the model menu shows each agent's list, but sending with a non-default model has not been tried.
- M8-04 captions and M8-08 transitions: proven or installed at the command line, not yet through the chat.
- M9-03: the CI workflow has never run. There is no GitHub repository yet.
- The security rules in `main.js` (`fromAppPage`, `lockDownSession`) are covered only by the smoke test passing,
  which shows they do not break the app. Nothing yet tests that they *refuse* what they should (M9-06).
- Still nothing committed. The owner has been asked again in `CHECKLIST.md`.

**Changed on the owner's computer, with their agreement** (also in `CHECKLIST.md`): Codex updated to 0.162.1;
`agy` installed; one Google Cloud telemetry add-on switched off in Antigravity's settings because its hook
command is broken on Windows and blocked every `agy` tool call.

**Things that will surprise you.**

- `agy` nests every event's payload under a key named after the event. Google's reference page shows it flat.
- If Gemini suddenly "cannot edit" and says a pre-tool hook is failing, an Antigravity update has switched that
  telemetry add-on back on. `docs/MAINTENANCE.md` has the line to change.
- The model in a chat turn comes from `state.json` (`models`), per agent, not per project.
- "New chat" clears the chat panel and each agent's conversation. It does not clear the journal
  (`.hyperframes/app-history.jsonl`), on purpose: that is the project's history, not the chat's.
- HeyGen's command-line tool does not support Windows. Do not spend time on M8-03 until that changes.
- OpenMontage is AGPL. Read the new hard limit in `AGENTS.md` before borrowing anything from it.
- IPC calls are now refused unless they come from the app's own page. If you add a second window or page, it
  will get "This request did not come from the app" until `fromAppPage` knows about it.

---

## 2026-10-12 · Claude · more agents, voice (second session of the day)

**Done.** M2-03 Codex bridge, M2-05 agent picker, M8-01 voiceover proven, M8-06 starter buttons. The owner asked
for ChatGPT and Gemini in the chat, voice and images, so the Codex bridge moved from ChatGPT's list to mine.
`npm run check`, `npm run smoke`, `npm run smoke:agent` (with a voiceover request) and `npm run smoke:codex`
all passed.

**Left unfinished.**

- M2-14 Antigravity bridge: written from Google's reference, **never run**. `agy` is not installed here. Read the
  header of `agents/antigravity.js` before trusting any of it.
- M2-15: Codex 0.145.0 here is refused the model in its own settings (`gpt-6.1-sol`). The Codex test only
  passes as `HFWIN_CODEX_MODEL=gpt-5.6-sol npm run smoke:codex`. The owner has to update Codex.
- M2-07 "Make it" on Home is still not run end to end.
- Still nothing committed.

**For ChatGPT, when you start.** Your first task is now M5-01, the installer. The Codex bridge is done; if you
(Codex) find it describes your own behaviour wrongly, say so here and fix it. You are the authority on it.

**Things that will surprise you.**

- The Gemini CLI is dead for personal Google accounts. Do not build on `gemini`; Google's replacement is `agy`.
- To try one feature through the real chat, set `HFWIN_SMOKE_REQUEST` (what to ask) and `HFWIN_SMOKE_EXPECT`
  (text `index.html` must then contain) before `npm run smoke:agent`. The voiceover proof was a request for a
  voiceover expecting `<audio`.
- The self-test now uses its own settings folder (`app/.smoke/user-data`), so it no longer touches the owner's
  settings and can run while their app is open.
- Codex needs its sandbox opened for npm's cache and HyperFrames' own folders, or `npx hyperframes` fails inside
  it. See `ACCESS.project` in `agents/codex.js`.
- A Codex turn takes minutes even for one line, because it reads the HyperFrames skills first (M2-17).

---

## 2026-10-12 · Claude · project start, M0 to M2

**Done.** Researched upstream, set up the workspace, built the app through a working agent chat. Finished tasks:
M0-01 to M0-04, M1-01 to M1-07, M2-01, M2-02. `npm run check` and `npm run smoke` pass. `npm run smoke:agent`
passed once: Claude Code changed the test project's title from the app's chat and the preview showed it.

**Left unfinished.**

- M2-07 (Home's "Make it" box) is written but that button's path has never been run. Still claimed by Claude.
- After the agent run, `npm run check` and `npm run render` were added to the commands the agent may run
  (`PROJECT_COMMANDS` in `agents/claude.js`), because the run was refused `npm run check`. Not re-run with a real
  agent since. If Claude Code fails to start, look there first.
- Nothing is committed. The owner has not asked for commits yet.

**For ChatGPT, when you start.**

- Your first task is M2-03, the Codex bridge. Copy the shape of `app/src/main/agents/claude.js`: export
  `status()` and `run()`, then add one line to `BRIDGES` in `agents/index.js`. The contract is in
  `docs/ARCHITECTURE.md`. The chat UI should not need to change, except that it names "Claude Code" in a few
  strings in `renderer/chat.js` (`FIXES`, `agentTag`); that is M2-05.
- `codex` on this machine is an npm global, so it is a `.cmd` shim. Node will not spawn it without a shell. The
  message must still go through stdin. Read "Windows rules" in `AGENTS.md` before you spawn anything.
- Drop the parent session's variables the way `agentEnv()` does for Claude Code. `CODEX_THREAD_ID` is the one
  upstream's CLI looks for.

**Things that will surprise you.**

- Electron 44 no longer downloads its binary in a postinstall. If `electron` is missing after `npm install`, run
  `node node_modules/electron/install.js` once.
- `await app.whenReady()` at the top level of `main.js` hangs the app forever. See the comment there.
- A real agent run costs the owner's plan usage (about 1% of a five-hour window for a one-line edit). That is why
  the agent test is `npm run smoke:agent`, separate from `npm run smoke`. Run it only when you changed agent code.
- Git Bash rewrites arguments that start with `/` into Windows paths. It broke a `git sparse-checkout` here.
  Prefer PowerShell or a `.mjs` script for anything path-shaped.
- `upstream/` is a full clone including Git LFS media, 1.5 GB. It is git-ignored. Do not edit it.
