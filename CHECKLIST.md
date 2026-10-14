# Checklist

The short version, for the owner: what works, what is waiting on you, what comes next.
The full task list is `PROGRESS.md`. Every feature of the official app, one by one, is in `docs/PARITY.md`.
Whoever finishes a work session updates this page.

_Updated 2026-10-14, morning. The app is now called **Kushmanji**._

## How to open it

Two shortcuts are on your Desktop:

- **Kushmanji** opens the app on its Home screen.
- **Kushmanji - City Centre vlog** opens it straight on your video. The vlog is also on the Home screen now.

## Waiting on you

- [ ] **Watch the four finished videos** in `C:\hyperframewindows\reviews\READY`: the vlog (4 min 13 s) and
      three upright shorts. A note in that folder says what to listen for and gives title ideas. Nothing was
      posted anywhere.
- [ ] **Listen to the music** on the vlog's name card and ending card, and under the shorts. A computer
      checked the pictures; nobody has listened.
- [ ] **Close Kushmanji and open it again** to get "Save video", the new arrow keys and smooth moving around.
      Then open your vlog, wait until the top bar says "Clips are smooth to edit" (a minute or two, once per
      project), and drag the playhead: tell me if it now follows your hand.
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

- [x] **Save video.** A button at the top of every video (and the "Save the video" editing button) makes the
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
- [x] **All four are saved as video files** in `C:\hyperframewindows\reviews\READY`, with a note of title ideas
- **Earlier versions are saved** inside the project, in `.hyperframes/versions`: ChatGPT's first draft, and the
  second version before the noise pass
- **Open it:** the Desktop shortcut, or `C:\hyperframewindows\reviews\city-centre-vlog`
- **Watch the first draft:** `C:\hyperframewindows\reviews\city-centre-vlog\renders\city-centre-draft.mp4`

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
| One Google Cloud usage-reporting add-on switched off, because it was broken on Windows and blocked Gemini | `%USERPROFILE%\.gemini\config\plugins\googlecloudtools.datacloud_telemetry\hooks.json` | Change `"enabled": false` back to `true` |
| HyperFrames' source code downloaded for reference (1.5 GB) | `C:\hyperframewindows\upstream` | Delete that folder |
| Remote Control switched on for the Claude session | This session only | Toolbar switch |

The vlog work added files only inside this folder (`reviews/`, which is never uploaded to GitHub). Original
footage stayed untouched.

Everything up to the night of 14 October is committed and pushed to GitHub. That night installed no software
and changed no other program's settings. One licensed music file was copied (not moved) from your channel folder
into the vlog and the shorts. Your Claude usage limit was reached once during the night; the three shorts were
then made with ChatGPT's Codex instead. The cancelled browser and social-posting work stays cancelled.
