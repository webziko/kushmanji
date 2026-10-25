# Checklist

The short version, for the owner: what works, what is waiting on you, what comes next.
The full task list is `PROGRESS.md`. Every feature of the official app, one by one, is in `docs/PARITY.md`.
Whoever finishes a work session updates this page.

_Updated 2026-10-25. The app is now called **Kushmanji**._

## How to open it

The **Kushmanji** shortcut on your Desktop opens the app on its Home screen. (The second one, "Kushmanji - City
Centre vlog", went to the Recycle Bin with the vlog on 24 October.)

## Waiting on you

- [ ] **Sign Claude Code in again** (it signed itself out on this PC on the night of 24 October, so Kushmanji
      cannot use Claude). Easiest: close Kushmanji and open it again, open any video, choose Claude in the chat,
      and press the new **Open PowerShell for me** button; sign in in the browser window that opens, then press
      "Check again". (Or open PowerShell yourself and type `claude auth login`.) Then tell me, and Claude's
      trailer gets made.
- [ ] **Watch the trailer test** in `reviews\READY\Kushmanji trailer test` and read `COMPARISON.md` there:
      Gemini's two (with its pictures) and ChatGPT's (fully drawn, the screen changing shape for "Any size").
- [ ] **Listen to the five motion videos** in `reviews\READY\Kushmanji motion videos`: is the new quiet music
      right, too quiet or too loud? Nobody on the AI side can hear it.
- [ ] **Optional, about 10 s faster per Gemini message:** the "Google Cloud Data Agent Kit" add-on in the
      Antigravity app gives Gemini three helpers that start on every message, and only the app can switch them
      off. If you do not use Google Cloud data tools: open Antigravity, press Ctrl+Shift+X (Extensions), find
      "Google Cloud Data Agent Kit", press Disable. Measured: two Gemini replies 28 and 24 s now, 19 and 14 s without.
- [x] **Done by Claude on 24 October, as you asked** (each one is in the table at the bottom, with how to undo it):
      Kushmanji closed and opened again with the faster Gemini; Gemini's Google telemetry add-on switched off, so
      **Gemini can change files again** (a real edit through the chat worked); the old GitHub key that sat in
      plain text, with almost every permission on your account, **revoked on GitHub** and removed from the file;
      ChatGPT's Codex updated to 0.164.0 (a real edit through the chat worked).

- [ ] **Empty the Recycle Bin once more** (right-click it on the Desktop → Empty Recycle Bin). On 24 October,
      as you asked, the City Centre vlog, its three shorts, their projects and old test folders went into it,
      and you emptied it (C: went from 31 GB free to 73 GB). Then the rest followed: HyperFrames' undo copies
      (4 GB) and four old folders in `reviews`, 4.75 GB in all. Emptying the bin again gives that space back.
      The undo copies grow again a little each time a video is first opened in "Edit by hand"; Home's foot says
      how much room they take

- [ ] **ChatGPT is set to a model your account no longer has** ("gpt-6-astra" in Codex's own settings, after the
      plan changed). The app picks one your account does have (GPT-6-Luna) by itself, so nothing to do.
- [ ] **Read a few screens in Kannada** (Home, top right: Language → ಕನ್ನಡ) and tell me what sounds wrong. Hindi
      too if you know someone who reads it. Back to English the same way.
- [ ] **Are the Kannada words right?** The app now writes down Kannada speech by itself (with Whisper). Your
      clip 01 came out as "ಎಲ್ಲಾರಗಿ ನಮ್ಮಸ್ಕಾರಾ ನಾನು ನಿನಗೆ ವಿಷಾಯ ಹಿರ್ವಿಕು ... ಫುಲ್ ಬೋರ್". Nobody here can check Kannada.
- [ ] **Does moving around feel smooth now?** Close Kushmanji and open it again (it now uses HyperFrames
      0.8.193, smoother again in the editor), open a video and drag the playhead.
- [x] **A logo and colours for Kushmanji.** You picked A, "Friendly": the app is now coral and cream with the
      smiling play-button icon. "unofficial" at the top opens "About Kushmanji"
- [ ] **Which access level should a new person start on?** Today: "Only this video". My advice: "Also cut my clips".
- [ ] **Music made on this PC?** Your channel's own notes say no (its licence does not allow earning from
      it), so your videos use YouTube Audio Library tracks. Still open for other people who use Kushmanji.

Answered on 2026-10-13: the name (**Kushmanji**), the GitHub home (`github.com/webziko/kushmanji`, public), the
licence (Apache-2.0), saving the work (committed and pushed), the noise tool (yes), the subtitles ("its good"),
and the order ("however you recommend").

## What comes first now

You asked for an app that is its own thing and easy enough for a child, and for it to spend less of your
usage. So the order changed. The review you asked for is `docs/UX.md`.

1. [x] **A simple screen, shown first**: your video, big, with ordinary player buttons (play, back and forward
       ten seconds, a bar to drag, sound and full screen), and the chat. "Edit by hand" opens the full editor;
       "Watch video" returns. Restart Kushmanji to load the new screen
2. [x] **Big plain buttons**: sound, subtitles, shorter cuts, music, look, title, voiceover and saving.
       Each explains what is possible, then prepares a message for you to check and send. Saving opens the
       full editor; one-click saving is still coming
3. [x] **"What is what"**: Help on every screen, a three-step welcome guide, and plain explanations of
       Inspector, Lint and the editor's other words. The welcome guide appears once; Help → Show me around
       lets you see it again
4. [ ] **Kushmanji's own logo, icon and colours**, and HyperFrames credited in an About box instead of the header
5. [ ] **Your team**: tick which assistants you have (one, two or three); the app uses only those
6. [ ] **The right size of model for each job**, so small changes cost little
7. [~] **An editing guide every assistant follows** (the first version is in; it grows from what you send back)

Then the list further down, starting with one-click export.

## New on the night of 24 to 25 October (you were asleep)

- [x] **The trailer test, through Kushmanji's own chat.** Gemini made its pictures with its own picture tool
      and built two trailers around them (wide and upright, 10 s). You said it was not real motion design, so
      the next ones are fully drawn: ChatGPT made one (14 s, wide, the upright one following), where "Any size"
      changes the video's own screen. Claude's waits for you to sign it in. All in
      `reviews\READY\Kushmanji trailer test` with a comparison.
- [x] **Your seventeen links, researched in full** (two helpers read every one, plus Openverse). What matters is
      kept in `docs\RESEARCH.md`, and the lessons went into a **motion-design guide** that every video now
      carries and every assistant reads before titles, animation or trailers.
- [x] **HyperFrames updated to 0.8.193** (from 0.8.169): safer on Windows (antivirus file locks, folders with
      any letters, USB drives), Kannada shows right in checks, motion blur, a seek bar in the editor's preview,
      and its undo copies no longer fill your disk. Smoothness measured before and after: the same or a little
      better.
- [x] **Every error message in Kannada and Hindi**, and the titles of the folder windows too.
- [x] **The assistants name the menus the way you see them**: in Kannada they say the Kannada name, with the
      English in brackets.
- [x] **"Connect an assistant" on Home**: on a computer where none of your assistants is ready (a stranger's new
      PC), Home now says so in one sentence and shows each one's state with "Open PowerShell for me".
- [x] **Settings**, on every screen (top right): the language, your assistants (tick the ones you have, see if
      each is ready, sign in or install with one press, "Test it now"), space on this computer, the problem
      report, and About.
- [x] **Rename a video, or move it to the Recycle Bin**: the "⋯" on each video card on Home. The Recycle Bin
      asks first, and the video can be restored from there.
- [x] **Draw on the picture**: on the watching screen, "Draw on the picture" pauses the video; draw on it in
      coral, add a note ("make this bigger"), then "Send to the chat". The assistant is told to look at your
      drawing first.
- [x] **Sign in or install an assistant with one press.** When Claude, ChatGPT or Gemini is missing or signed
      out, the chat's card now has "Open PowerShell for me": a window opens already running that assistant's own
      installer or sign-in, and you only follow its steps. No typing.
- [x] **A signed-out assistant is said plainly** ("Claude is signed out ... claude auth login"), and its sign-in
      card no longer hides the message box in a small window (it also printed a stray "false"; gone).
- [x] **ChatGPT still works on your plan's lower models** (GPT-6-Luna): proven twice through the chat.
- [x] **Everything we found missing is written down** as tasks in `PROGRESS.md` (Openverse free pictures and
      sounds, safer cuts, Gemini's pictures landing in the video by themselves, API keys for other services,
      one-press sign-in, "Add my files", making the upright version, and more).

## New on 24 October

- [x] **Gemini answers in about half the time.** Each message used to start Gemini afresh, and with it every
      helper you set up in Antigravity. Now Kushmanji keeps one Gemini running for the open video and starts it
      as soon as the video opens. Measured through the chat, two one-word replies: 53 and 42 seconds before, 30
      and 25 seconds now. Your Antigravity settings were not changed.

- [x] **The self-test no longer fails while you use the PC.** Its window had been minimized: Windows does not
      draw a minimized window, so the video in it hardly moved. Now it puts itself back without taking your
      keyboard, and its title bar says "Kushmanji self-test (closes by itself in about a minute)". It passed
      with a window over it, with VLC playing full screen in front, and with the processor fully busy.
- [x] **"Getting the editor ready".** The first time a video opens in "Edit by hand", a bar above the editor
      says HyperFrames is preparing the sound of every clip and that moving around can be slow until the note
      goes away. It goes by itself; the next time you open the same video it does not appear. In Kannada and
      Hindi too. Please tell me if it stays up for long on your own videos.
- [x] **Kannada and Hindi everywhere.** The sentences that still came in English now change too: what the
      assistant may do and how it works with you, what it is doing in the chat ("Looking at your files"),
      why it stopped, "Test it now" results, the notes on your clips, Home's "Before you start" lines, and the
      speech tool's, saving's and shorts' messages. Please read a few in Kannada and tell me what sounds wrong.
      Still English: a few rarer error messages, and the titles of Windows' own folder windows.
- [x] **The five motion videos, round two**, saved again over the old ones in
      `reviews\READY\Kushmanji motion videos` (changed by ChatGPT through the app's chat, checked by Claude
      picture by picture): level 1 now ends on clean cream (only the logo and words fade); level 5's timeline
      fills most of the width and its tagline is almost twice as big; and all five have quiet music, a soft
      chord pad Claude made on this PC from plain tones (nothing downloaded, so no licence question), fading in
      and out. **Please listen**: nobody here can hear it. If it is too quiet, too loud or not to your taste, say so.
- [x] **FFmpeg with one press.** On a PC without FFmpeg, Home's "Before you start" now has a "Get it now (about
      115 MB)" button instead of a line to paste into PowerShell. The app fetches FFmpeg's official Windows build,
      checks it is exactly the expected file, and keeps it in its own folder. Your PC has FFmpeg already, so you
      will not see it. Pressed for real with your yes, in a test run with FFmpeg hidden: 24 seconds, then the whole
      self-test passed using the downloaded FFmpeg (saving, studying clips, smooth copies).
- [x] **Fixed for strangers' PCs**: a video folder buried very deep (over 200 characters of path) now gets a
      plain sentence asking to move it, instead of a long error; the app works with no Node installed; a taken
      port and a crash were tried and are fine.

## New on the night of 17 to 18 October (you were asleep)

- [x] **The app in Kannada and Hindi.** Home has a Language menu at the top right: English, ಕನ್ನಡ, हिन्दी.
      Every button and explanation on the screens changes; a few sentences that come from deeper in the app
      are still English (next task). Please read a few screens in Kannada and tell me what sounds wrong.
- [x] **HyperFrames updated to 0.8.169** (from 0.8.149). Measured on your vlog against the old version the same
      night: jumps in "Edit by hand" 0.21 s instead of 0.28 s, the slowest 0.43 s instead of 1.05 s, and far
      fewer stutters. It also fixes a thin black strip on the right of upright videos and frozen phone footage.
- [x] **ChatGPT works again with a smaller plan**: when Codex's own default model is not on your account any
      more, the app asks for one that is.
- [x] **Fixed for strangers' PCs**: the self-test failed at night because the screen was asleep; it now says so
      plainly, and two test checks that picked the wrong picture are fixed.
- [x] **Five motion videos about Kushmanji** (you asked for levels 1 to 5), made through the app's own chat by
      ChatGPT (GPT-6-Luna) in about 50 minutes, checked frame by frame by Claude, saved in
      `reviews\READY\Kushmanji motion videos`: a logo reveal (6 s, wide), three features as bouncy cards (8 s,
      square), a product demo with typing and subtitles (10 s, wide), "Hello · ನಮಸ್ಕಾರ · नमस्ते" in glowing
      letters (8 s, upright), and a 3D timeline that collapses into the logo (10 s, wide). No music yet. What a
      computer could not judge: the motion itself, and whether the level 1 ending (a fade to grey-brown) looks right.
- [x] **A problem report.** Help now has "Show the problem report": a small log file you can send when something
      goes wrong. It holds no messages, words or files, and your Windows user folder is replaced by "~".

## New in the evening of 14 October, on your PC

- [x] **Smoothness measured on your real vlog.** Jumping to a moment: 0.05 s watching, 0.13 s in the editor;
      dragging the playhead shows about 30 pictures a second. Making the copies "lighter" still was tried and
      made no difference, so nothing more to gain there. The first minute or two in the editor of a new video
      is still slow while HyperFrames prepares its timeline (written down as M16-10).
- [x] **Speech in any language.** Choose the spoken language under "Assistant and clip settings"; for Kannada,
      Hindi, Tamil and others the app offers "Get it" (the free Whisper speech tool), then writes down what is
      said in every clip. It takes about a minute and a half per clip. "Add subtitles" now uses those words.
- [x] **The tests run on the app's own Node**, because the Node on your PC has a bug with letters like "é".

## New in the afternoon of 14 October: a fuller look, and a review of everything

- [x] **A more finished look on every screen.** Softer cards that lift under the mouse, a coral Play button with
      its icon, your messages on the right of the chat in a warm colour, and a blurred background behind every
      box that asks you something. Nothing moved: the buttons are where they were
- [x] **A full review of the app's insides**, with 93 new tests (313 in all). It found and fixed: "Test it now"
      would have failed almost every time on Windows; "Undo this change" stopped working once a chat passed
      200 messages; a reply that put "rate limits" in a title was taken for a used-up allowance; using a saved
      look twice lost the video's own look; a locked folder could leave "Making clips smooth" stuck for good
- [x] **A video named in Kannada (or any language) keeps its name**, and the window opens where you left it
- [ ] **Still to try on your PC:** the new look, and "Test it now" for each assistant

## Why the preview felt "stuck", and what was done

Claude measured your vlog playing in the real app, picture by picture.

- Inside a clip it is smooth: 30 pictures a second, and the clock keeps time. Same on the new simple screen
  and in the editor.
- The "stuck" moments are just before a clip change. The picture stops for about a third of a second while
  the sound carries on. The cause: most of your 15 second clips have 15 seconds of sound and only 14.8 seconds
  of picture, and each was set to play the full 15.
- Fixed in the app for every future video: Kushmanji now measures how long each clip's picture really lasts
  and tells every assistant never to play a clip past it.
- Fixed in your vlog: see "Your City Centre vlog" below.

## New on the morning of 14 October: moving around the video is smooth

- [x] **Plain words everywhere.** "My videos", "Add clips", "What may the assistant do: Only this video / Also
      cut my clips / Anything on this computer", "Ask me first: Just do it / Show me the plan first / Decide
      with me". Help now explains the arrow keys in "Edit by hand"
- [x] **When an assistant runs out of its allowance mid-job**, the chat now says so plainly, lists the files it
      had already changed, says when it can work again, and offers "Carry on with ChatGPT" or "Carry on with
      Gemini", which prepares the message for you
- [x] **A new Home screen**: "Carry on" with a picture of the video you last worked on, then "From my clips" and
      "From an idea", and your videos as pictures (each picture is taken when you leave that video)
- [x] **"Undo this change"** under every reply that changed your video, and "Bring it back" after
- [x] **The app checks your video after every change** an assistant makes (free, two seconds) and says if it
      found mistakes, with "Ask to fix them"
- [x] **"Test it now"** when an assistant has updated past the version Kushmanji was tried with: one tiny job,
      and a plain answer such as "Claude works with Kushmanji"
- [x] **An installer** is now built by GitHub for every change (not tried on your PC yet). To get it: open
      `github.com/webziko/kushmanji/actions`, choose the newest "Installer" run, and download "Kushmanji-Setup"
      at the bottom. It installs for you only, needs no administrator, and adds Start Menu and Desktop
      shortcuts. Windows will warn "unknown publisher" because it is not signed yet: "More info", then "Run anyway"
- [x] **Saved looks**: in the chat's settings, "Save this look" keeps a video's colours, fonts, titles and ending
      card under a name (for example "Happy with Shisha"); "Use" gives another video the same look. Next time you
      make shorts, they can all match
- [x] **Assistants can now look at the video they made**: a "look at the video" tool returns still pictures at
      the moments they ask for, and they are told to check before saying "done". Proven with Claude; ChatGPT
      (Codex) should now be able to look too, which it could not before. To be tried on your PC
- [x] **A second opinion**: "Ask ChatGPT to check it" under a change, then "Ask Claude to fix these". One round,
      never a loop
- [x] **Type `@` in the message box** to name a clip or "this moment"; **drop clips on the chat** to add them
- [x] **"Make it" asks three quick questions** (how long, which shape, what feel) before it starts
- [x] **Type while the assistant works**: "Send when done" or "Stop and send now"
- [x] **The editor's own "Ask agent" buttons** now put their request in the chat box instead of copying it
- [x] **"Your assistants: tick the ones you have."** In the chat's settings. Someone with only ChatGPT never
      sees Claude or Gemini offered
- [x] **Each reply says how much of the allowance it used**: "a little", "some" or "a lot"
- [x] **Long chats start afresh** after six requests, with a short recap, so each request stays small
- [x] **"Auto (saves your allowance)"** in the model menu: small changes go to a cheaper model, big jobs to the
      best one. A model you pick yourself is always used

- [x] **Jumping and dragging no longer lag.** Measured first, on a practice video like your vlog: a jump to a
      moment took about a third of a second, and dragging the playhead showed only one or two pictures a
      second. Now Kushmanji makes a lighter copy of each big clip in the background, the way DaVinci Resolve
      makes "proxies", and plays that copy while you watch and edit. A jump now takes 0.04 to 0.07 seconds, a
      drag shows 33 pictures a second, and the editor uses about half the memory. "Save video" still uses
      your full-quality files. The copies sit in a hidden `.cache` folder inside each project (about a sixth
      of the footage's size) and are remade by themselves when a clip changes
- [ ] **Not yet measured on your PC.** These numbers come from a cloud computer without a graphics card.
      Yours should be at least as fast; the next session on your PC measures the real vlog
- [ ] **Something HyperFrames does that you should know:** the first time a project opens in the editor,
      HyperFrames keeps a second copy of all its videos for its undo history, in
      `C:\Users\<you>\.cache\hyperframes\history`. That is extra disk space and a slow first open with big
      footage. It is HyperFrames' own design; I have written it down to report to them, and a later task will
      show you how much room it takes and offer to clear it for projects you deleted

## New in the night of 14 October

- [x] **Save video.** A button at the top of every video (and the "Save video" editing button) makes the
      video file and puts it in your Downloads folder. It shows a count, also on the taskbar button, and
      "Show the file" when it is done. It also sets the sound to the loudness YouTube and Instagram expect.
      No editor needed, no assistant used
- [x] **Arrow keys in "Edit by hand".** While the video plays, left and right skip ten seconds and it keeps
      playing. While it is paused they still move one frame, as editors do
- [x] **Pushed to GitHub**, as you asked

## Works today

- [x] The app opens on Windows, with a Home screen and your projects
- [x] A large video player and chat, shown first. Arrow keys skip ten seconds without pausing; settings are
      tucked into "Assistant and clip settings". Both landscape and portrait videos fit the player
- [x] The real HyperFrames Studio editor inside the app, with sound
- [x] Chat: describe a change, the agent edits the video, the preview updates
- [x] **At 0:42** beside your message: the assistant knows which moment you mean. Sent messages keep their time
- [x] Editing buttons stay available during a conversation. They explain the action and preserve your draft
- [x] **Help** explains the screen you are on, including full screen. The editor has a small word guide above it
- [x] Three agents in one menu: Claude Code, Codex (ChatGPT), Antigravity (Gemini), and a model menu for each
- [x] **Click, then tell, in Edit by hand**: click anything in the picture or timeline and the chat says "Pointing at ...";
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
- [x] Automatic tests: 103 unit tests plus the real-app self-test, including Help, the walkthrough, editing
      buttons and message time
- [x] ChatGPT's new screens were checked by Claude (tests, the security rules, and your real vlog) before
      being saved. Three small things were written down for later; nothing had to be undone
- [x] A measuring run that plays a real video and counts dropped pictures and holds at each clip change

## Your City Centre vlog

- [x] Every supplied video and the photo reviewed; the original files are untouched
- [x] **Second version (made through Kushmanji's own chat):** 4 min 29 s, all 20 clips, nearly everything with
      her in it kept. Cute intro "A Happy Day Out", heart-sticker labels, "Thanks for watching" on her wave
- [x] **English subtitles:** 44 lines in cream pills at the bottom. A draft until you have checked the words
- [x] **Noise:** her voice is cleaned on the 13 talking clips with a voice-cleaning program (DeepFilterNet).
      Measured indoors: the background between her words dropped about 13 dB. On the loud street the gain is
      small. The six clips with no talking play at 40%
- [x] **Third version (made 2026-10-13, late evening, through Kushmanji's own chat):** 4 min 4 s. One opening
      take; labels, sounds and subtitles back on their clips; soft cross-fades between places; a slow push-in
      when she talks; no more frozen picture before a clip change. The two heart wipes are gone, because the
      cross-fades do that job. One thing to listen for: the very end of "...kurta sets" lost a sliver of sound
- [x] It was made with the smaller, cheaper Claude model (Sonnet) in one request of about 17 minutes
- [x] **Fourth version (2026-10-14):** your first two lines play clean, then a "Happy with Shisha" name card,
      and an ending card with "Subscribe for more happy days". A little music on those two cards only. 4 min 13 s
- [x] **Three shorts** for YouTube Shorts and Instagram Reels, upright and full screen: "Boring day? Mall
      time!" (27 s), "So pretty!" (19 s), "Day out: done!" (21 s)
- [x] **All four were saved as video files** in `C:\hyperframewindows\reviews\READY`, with a note of title ideas.
      You posted them yourself
- **Moved to the Recycle Bin on 24 October, as you asked, to free space:** the vlog and the three shorts in
  `READY`, the project `reviews\city-centre-vlog` (with its earlier versions and her clips), the three shorts'
  projects and the Desktop shortcut. Until the bin is emptied, any of them can be put back: open the Recycle
  Bin, right-click → Restore. Your original footage in `C:\Creators\happywithshisha` was not touched

## Everything, one by one

You asked for every feature of the official app, one at a time. Most of the list you gathered is already
inside Kushmanji, because the editor is the same one (panels, keyframes, sound tools, snapping, shortcuts,
catalog, variables, export choices): those need trying on Windows, not building. What has to be built is the
app around the editor. The full list with a mark on every line is `docs/PARITY.md`. The order:

1. [x] One-click export to Downloads ("Save video")
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
- **Automatic subtitles.** The button explains the limit. You can supply the subtitle words and times.
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
| One Google Cloud usage-reporting add-on switched off, because it was broken on Windows and blocked Gemini. It came back on by itself on 13 October (probably an Antigravity update): see "Waiting on you" | `%USERPROFILE%\.gemini\config\plugins\googlecloudtools.datacloud_telemetry\hooks.json` | Change `"enabled": false` back to `true` |
| HyperFrames' source code downloaded for reference (1.5 GB) | `C:\hyperframewindows\upstream` | Delete that folder |
| Remote Control switched on for the Claude session | This session only | Toolbar switch |
| Whisper's speech model, large-v3 (3.1 GB, from huggingface.co, checked), 14 October | `%USERPROFILE%\.cache\hyperframes\whisper\models` | Delete `ggml-large-v3.bin` |
| The Whisper program (9 MB, whisper.cpp's own Windows build), fetched by the app's "Get it" | `%APPDATA%\Kushmanji\tools\whisper` | Delete that folder |
| The two Kushmanji Desktop shortcuts now show the Kushmanji icon, 14 October | Your Desktop (OneDrive) | Shortcut → Properties → Change Icon |
| The "Kushmanji - City Centre vlog" shortcut moved to the Recycle Bin with the vlog, 24 October, as you asked | Your Desktop (OneDrive) | Recycle Bin → Restore (before it is emptied) |
| Gemini's "googlecloudtools.datacloud_telemetry" add-on switched off (it stopped every Gemini edit on Windows), 24 October, as you asked | Gemini's plugins | In PowerShell: `agy plugin enable googlecloudtools.datacloud_telemetry` |
| Four Google Cloud helpers switched off in Gemini's command line: context, data-agent-kit, notebooks, visualization (three of them still come from the Antigravity add-on), 24 October | Gemini's helper list (`.gemini\config\mcp_config.json`) | `agy mcp enable context`, and the same for the other three |
| The GitHub key (classic, `ghp_…`) that sat in plain text in `.gemini\settings.json` with almost every permission on webziko, **revoked on GitHub** with GitHub's own revoke service, and its old "github" helper entry removed from that file, 24 October, as you asked | GitHub; `.gemini\settings.json` | A revoked key cannot come back. If the old Gemini command line needs GitHub again, make a new key on github.com with only what it needs |
| ChatGPT's Codex updated from 0.162.1 to 0.164.0, 24 October, as you asked | Global npm package | `npm install -g @openai/codex@0.162.1` |
| Kushmanji closed and opened again from the Desktop shortcut, 24 October | Your running app | Nothing to undo |
| The four trailer test videos added to the top of your Home list ("My videos"), 25 October, as you asked | Kushmanji's settings file (`%APPDATA%\Kushmanji\state.json`; the old one kept as `state.json.before-trailers`) | On each card: "⋯" → "Remove from list" (the folders are not touched) |

The vlog work added files only inside this folder (`reviews/`, which is never uploaded to GitHub). Original
footage stayed untouched.

Everything up to the night of 14 October is committed and pushed to GitHub. That night installed no software
and changed no other program's settings. One licensed music file was copied (not moved) from your channel folder
into the vlog and the shorts. Your Claude usage limit was reached once during the night; the three shorts were
then made with ChatGPT's Codex instead. The cancelled browser and social-posting work stays cancelled.
