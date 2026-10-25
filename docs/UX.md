# Making Kushmanji easy: the review and the plan

The owner, 2026-10-13: "it should be very very easy to understand and easy to do", "even small kid could
understand", "inspector mean what I really don't know", "some guiding something should be there, what is what,
how to do", "we somehow copied the hyperframes ... lets come out of this hyperframes fully".

This page is the review they asked for, the words to use, and the plan. The tasks are M14 in `PROGRESS.md`.
Read it before changing any screen.

**Built on 2026-10-13 (M14-01, ChatGPT):** videos now open in the simple room described below. The large player
and chat work, "Edit by hand" opens the workshop, and assistant/clip settings are tucked into one expandable
control. Play, skips, scrubbing, sound, full screen, portrait sizing, live refresh and room switching were
checked in the real app.

**Built on 2026-10-13 (M14-02 and M14-03, ChatGPT):** "At 0:42" appears beside the message box and the actual
position at Send goes with the request. Sent messages keep their timestamp. The editor retains "Pointing at".
Large editing buttons stay available after a conversation starts, behind a collapsible "Editing buttons"
section. A button first explains the action, then prepares a message without replacing existing words or
spending assistant usage. The person presses Send to ask for the change.

The buttons offer sound balance, supplied subtitle words/times, shorter cuts, imported music, colours/fonts,
titles and the existing voiceover. They explain that automatic subtitles, stock/generated music and setting up
a noise-cleaning tool are pending. "Save the video" opens the full editor, explaining that one-click saving
and the Windows export checks are still pending.

**Built on 2026-10-13 (M14-04, ChatGPT):** Help is available on Home, the watching screen, the editor and in
full-screen playback. The guide opens explanations of the current screen first, with one sentence per part.
A three-step welcome guide appears once and can be replayed through "Show me around"; finishing, skipping or
closing it remembers that choice. Studio has a collapsible glossary above it, with the editor's word beside
its plain meaning. The original tabs stay intact. Help preserves the chat draft, fits the minimum window,
closes with Escape and prevents playback shortcuts reaching the picture underneath.

**Built on 2026-10-14 (M14-05 and M14-11, Claude):** every word the app shows itself was reread against "The
words" below, in the pages, the chat, the menus and the messages from the main process. The line under the chat
box, "Start over" and the install and sign-in cards now speak the same way. Words that go only to an assistant
(its notes, the guide it reads) were left alone, except where they quote a menu name the person will see.

**Built on 2026-10-14 (M14-07, Claude):** Home is now a place to start (see "Home" below). The video's last
picture is kept when the person leaves the watching screen, and "Carry on" opens the video changed last.
Branding (M14-06) remains planned.

## What a new person meets today

**Home.** A box that says "What do you want to make?", four buttons, a list. It is the best screen in the app,
and it still says "Open a folder that has an index.html", shows a version number nobody asked for, and gives no
hint which of the four ways to start is the one for them.

**A video, once opened.** About seventy controls on one screen. On the left: three menus about the AI before a
word is typed (which agent, which model, how much access), then "How we work", then red warnings with file
paths in them. On the right: HyperFrames' editor, with tabs called Compositions, Assets, Code, Catalog,
Inspector, Layers, Renders, Variables, Lint and Capture. The video itself takes about a third of the screen.

What goes wrong, in the order a person hits it:

1. **Nothing says what to do first.** The screen is a workshop. The person came to watch their video and change
   one thing.
2. **Watching is the hardest thing to do.** The video is small. The right-arrow key, which skips forward in
   every player a person has used, moves one frame and stops the video here, because that is what it means to
   an editor. The owner hit exactly this.
3. **The words belong to programmers and to another product.** Inspector, composition, lint, render, agent,
   access level, model. None of them says what it is for.
4. **Red text that is not the person's problem.** "assets/prepared/04.mp4: Machine transcript: unverified".
   True, and useless to them in that form.
5. **Settings come before the work.** Four menus sit between the person and the message box.
6. **It looks like HyperFrames.** Their logo is at the top of the editor, their names are on every tab. The app
   has its own name now and should have its own face.
7. **A change by hand can quietly break the video.** The owner removed one clip in the editor, and every label
   and subtitle after it stayed where it was, fifteen seconds out of step. Nothing told them.

## The idea: two rooms

**The simple room, shown first.** The video, big, with the controls of an ordinary player. Beside it the chat,
with a few large buttons for what people ask for most. Nothing else. This is where a person watches, says what
to change, and saves the result.

**The workshop, one button away ("Edit by hand").** The full editor, for the people who want it, with a plain
name beside each of its words and a "What is what" guide.

The engine underneath stays HyperFrames: it is good, it is open source, and rebuilding it would take years.
What changes is everything a person sees first. HyperFrames is credited in an About box and in the licence
notices, which is what its licence asks, and the workshop says whose editor it is.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← My videos     City Centre vlog              [ Edit by hand ] [ Save ]  │
├───────────────────────────────────────────────┬──────────────────────────┤
│                                               │  What would you like     │
│                                               │  to change?              │
│                  the video                    │                          │
│                                               │  [ Fix the sound ]       │
│                                               │  [ Add subtitles ]       │
│                                               │  [ Make it shorter ]     │
│   ⏪10   ▶   10⏩   ━━━━━●━━━━━━  0:42 / 4:13   │  [ Change the look ]     │
│                                    🔊   ⛶     │  ┌────────────────────┐  │
│                                               │  │ At 0:42 · type here│  │
│  [clip][clip][clip][clip][clip][clip][clip]   │  └────────────────────┘  │
└───────────────────────────────────────────────┴──────────────────────────┘
```

## Rules for every screen

1. One main thing per screen. Everything else is smaller or behind "More".
2. Say what will happen before it happens, and what happened after, in a sentence.
3. Never show a file path, a file name with an ending, or a word from the list below without its plain twin.
4. Red is for "you must do something". A note the person can ignore is grey.
5. Every setting has a safe choice already made. Nobody has to choose before they can start.
6. Anything can be undone, and the app says so.
7. When something the app knows will break the video (a clip removed with labels still pointing at it), it says
   so and offers to fix it.

## Home

Top to bottom: "What do you want to make?", then **one** main thing. With at least one video that is the large
"Carry on" card for the video changed last (its picture, its name, "Changed 2 hours ago", a green button), and the
two start cards below it are quiet. With no video the two start cards are the main thing and their buttons are green:
"From my clips" (button "Choose clips") and "From an idea" (a box and "Make it"). Under them a quiet row: "Or",
"Blank video", "Open a folder". Then "My videos": every video as a card with its picture (or its first letter on a
soft surface) and when it last changed.

- **The picture** is taken from the app's own window as the person leaves the watching screen (the "My videos"
  button, or opening another video), so it shows the video as they last saw it. It is kept inside the video's hidden
  `.cache` folder and nothing is rendered for it. If the capture is slow, fails or is nearly black, Home simply
  shows the letter instead; going Home never waits more than about a second and a half for it.
- **Time** is said in plain words ("just now", "5 minutes ago", "yesterday", "3 days ago", then weeks, months, years)
  by `since()` in `app.js`, from when the video's `index.html` last changed.
- **Hold-back:** the page is invisible for the moment it takes to list the videos, so the Carry on card does not
  push the start cards down after the person has seen them.
- A video with no picture yet must look as good as one with a picture; the self-test has no pictures at all.

## Settings

A **Settings** button sits in the header of every screen, beside Language (Home only) and Help. It opens one dialog
with five sections, in this order, and each is a control the app already had, shown in one place:

1. **Language.** The same menu as Home's header, and it reloads the page through the same function. On a video's
   screen the menu is shown but cannot be used, with a sentence saying to go back to My videos first: choosing a
   language draws every screen again, which is safe only when nothing is open and nothing is being made.
2. **Your assistants.** One row for each of Claude, ChatGPT and Gemini: "I have this one" (the chat's tick, and
   one always stays ticked), its state in the chat's own words ("Ready · version 2.1.119", "is not on this
   computer yet", "needs you to sign in first", "will not start"), "Open PowerShell for me" and the lines to type
   when it is not on this computer or not signed in, and "Test it now" when it is ready (it asks first, as in the
   chat). One "Check again" under the list. Asking each assistant takes seconds, and the dialog says so while it waits.
3. **Space on this computer.** Home's undo-copies line with "Free up", and where new videos are kept (the path only:
   there is no folder button, because the call that shows a folder takes a video's folder).
4. **When something goes wrong.** "Show the problem report", the same button as in Help.
5. **About.** The versions on one line and a button that opens the About box.

What the chat disables while an assistant works, the dialog disables too (the ticks, "Test it now", "Free up"), with a
sentence at the top saying why. The code that both places use is in `assistants.js` (names, states, the install and
sign-in card, the ticks, the test), `space.js` (the undo-copies line), `report.js` and `about.js`. A change to the
chat's wording of any of these shows in Settings as well.

## The words

Use the plain word everywhere the app speaks. In the workshop, where HyperFrames' own word is on screen, show
the plain one beside it.

**Since 2026-10-14 this list is used everywhere in the app** (M14-05). A new screen, message or button takes its
words from here, and a new word pair is added to the table in the same change. The menu ids and the names
inside the files (`project`, `tools`, `full`, `build`, `hfwin`) stay as they are: only what a person reads changed.
In the assistant menu the plain name comes first and the maker's own name follows in brackets ("ChatGPT
(Codex)"); an install card names both. "How careful" is the label on the model menu, but its choices are still
each assistant's own names (plus "Auto" and "Default"); Quick, Balanced and Best are not built yet.

| Today | Say instead |
| --- | --- |
| agent | assistant |
| Claude Code, Codex, Antigravity | Claude, ChatGPT, Gemini (the product's own name in small print) |
| model | how careful: Quick, Balanced, Best |
| Access: project only / editing tools / full | What may the assistant do: only this video / also cut my clips / anything on this computer |
| How we work: build / review / co-direct | Ask me first: just do it / show me the plan first / decide with me |
| project | video |
| composition, sub-composition | scene |
| Inspector, Design | Change it (the thing you clicked) |
| Layers | What is on top of what |
| Assets | My files |
| Catalog | Ready-made pieces |
| Variables | Things you can swap (a name, a colour) |
| Lint, check | Check for mistakes |
| render, export | Save the video |
| Renders | Saved videos |
| preview | the video |
| footage study | The app has watched your clips |
| transcript | What is said |
| timeline | timeline (kept: people know it), with "your clips in order" the first time |
| New chat | Start over (your video is not changed) |
| footage ("Add footage", "Start from footage") | clips ("Add clips", the "From my clips" card with its "Choose clips" button) |
| Home (the way back, the first screen) | My videos |
| Allowed tools, access level | What may the assistant do |
| Project only / Editing tools / Full access | Only this video / Also cut my clips / Anything on this computer |
| Build it for me / Review the story first / Co-direct it | Just do it / Show me the plan first / Decide with me |
| Blank project | Blank video |
| Studio (when it means the editor) | the editor |
| not installed, not signed in | not on this computer yet, sign in first |
| command | program ("Running a program") |
| Reading files, Editing files | Looking at your files, Changing your files |
| originals | your own files |
| stock music | finding music for you |
| Studying your footage, Study again | The app is watching your clips, Watch again |
| sandbox | safety box |
| Dismiss | Close |

## What each part is, in one sentence

The "What is what" guide says these, and nothing longer.

- **The video.** What your film looks like right now. Press play.
- **The chat.** Tell the assistant what to change, in your own words.
- **Clicking.** Click anything in the video first, and the assistant knows which thing you mean.
- **The timeline.** Your clips in order, left to right. Longer bar, longer clip.
- **Change it** (Inspector). Colour, size and words of the thing you clicked.
- **My files** (Assets). The clips, pictures and sounds in this video.
- **Ready-made pieces** (Catalog). Titles, effects and scenes someone already made.
- **Check for mistakes** (Lint). Looks for things that would break the video.
- **Save the video** (Export). Makes the file you can upload.

## The order of work

M14-01 the simple room · M14-02 "At 0:42" with a message · M14-03 the big buttons · M14-04 "What is what" and
the plain names in the workshop · M14-05 every word reread · M14-06 logo, icon, About · M14-07 Home as a place
to start · M14-08 try it on someone new.

Not decided yet, for the owner: the logo and colours (a few to choose from will be shown), and whether the
workshop is offered at all on first run or only after the first video is saved.
