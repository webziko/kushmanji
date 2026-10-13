# Handoff log

What each session left for the next one. **Newest entry on top.** Keep an entry short: what changed, what is
unfinished, what would surprise the next reader. The task list itself lives in `PROGRESS.md`.

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
