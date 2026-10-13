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

The full wording pass, branding and new Home screen remain planned.

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

## The words

Use the plain word everywhere the app speaks. In the workshop, where HyperFrames' own word is on screen, show
the plain one beside it.

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
