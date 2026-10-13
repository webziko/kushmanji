# The full checklist: the official HyperFrames Studio app and Kushmanji

Every feature HeyGen's HyperFrames Studio has, one by one, and where Kushmanji stands on each. Then what
Kushmanji adds that the official app does not document. The owner asked for all of it, one by one
(2026-10-13); the order they will be built in is at the end.

Sources: HyperFrames' own documentation (`upstream/docs/studio-app`, `upstream/docs/studio`,
`upstream/docs/guides`), HeyGen's download page, press coverage, and two feature lists the owner gathered with
ChatGPT on 2026-10-13. What is "seen" was seen in the real app on Windows, in a screenshot or in the list of
controls the running editor reports.

**Marks**

- `[x]` works here, seen working
- `[e]` in the editor and seen on screen here, not yet tried in use
- `[~]` in the editor (same code), not yet seen or tried here
- `[ ]` missing: has to be built
- `n/a` deliberately not copied

The task that closes each gap is in brackets (see `PROGRESS.md`).

## The one thing to understand first

The official app is two things. **The editor** (picture, timeline, keyframes, sound, colour, export) is open
source, and it is the same code that runs inside Kushmanji. **The app around the editor** (Home, the chat,
pointing and drawing, the example library, the installer and updates) is closed source, and has to be written
again here.

So most of what looks like a long list of missing features is already inside: it is marked `[e]` or `[~]`
and needs trying on Windows, not building. The real building work is the second half.

## Part 1 · The editor (already inside)

Closing all of Part 1 is one task: M11, try each of these on Windows and write down what breaks.

### Workspace

- [e] Panels side by side: Compositions, Assets, Code, Catalog · Preview · Design, Layers, Renders, Variables · Timeline
- [e] Panel menu, maximise a panel, close a group, a Window menu for the layout
- [~] The layout is remembered between sessions
- [e] Light and dark theme inside the editor (the frame around it does not follow yet [M1-09])

### Picture (canvas)

- [x] Click an element to select it; handles to move and resize
- [e] Design panel: fill, colour, text colour, stroke, text content, font, size, weight, spacing, layout, motion
- [e] Layers panel
- [e] Ruler, safe margins, snap, grid and grid options
- [~] Snap guides between elements, fit to children, uniform resize with Shift
- [~] Crop, replace media, arrange front and back
- [~] Right-click menu: hide, bring to front, replace, delete

### Timeline

- [x] Clips on tracks with thumbnails and sound waves; nested scenes shown as clips
- [e] Select tool, linked selection, snapping, ripple edit
- [e] Split at the playhead; undo and redo
- [e] Hide a track, mute a track, zoom, fit to width, labels-only view
- [e] Add a beat at the playhead
- [~] Razor tool, multi-select, group and ungroup, copy, cut and paste
- [~] Quick edits on a clip: speed, volume, fade; close a gap
- [~] In and out points, work-area markers, jump to a frame
- [~] Open a nested scene and come back

### Playback

- [x] Play and pause with sound (measured on a real 4-minute project, across cuts)
- [e] Mute, playback speed, loop, full screen
- [~] J/K/L shuttle, frame step with the arrow keys, ten frames with Shift
- [e] A list of shortcuts and tools

### Animation

- [e] Add a keyframe at the playhead; record edits as keyframes automatically
- [e] Record a gesture
- [~] Easing curves, motion paths, moving a whole path

### Sound

- [e] Audio meters
- [~] Gain, volume, fade and speed shown on clips; wave strip with peaks
- [~] Audio groups, loudness, lowering music under a voice
- [~] A chain of effects for the whole video (EQ, compressor, limiter and more)
- [~] Even out levels between clips

### Media, colour and effects

- [e] Assets panel
- [e] Catalog of ready-made blocks and effects (about 400)
- [e] Variables
- [~] Colour grading with scopes and LUTs
- [~] Media effects: ASCII, halftone, tape, CRT, painted
- [~] Captions: adjust words on the picture
- [~] Slideshows with reveals, notes and a presenter mode

### Checking and export

- [e] Lint button; the project's check runs from the chat
- [e] Export button and a Renders list
- [~] Export choices: MP4, WebM, MOV; 1080p to 4K; 24, 30, 60 fps; a queue; GPU export [M4-01]
- [x] A full 3-minute MP4 rendered and decoded on this PC (from the command line)

## Part 2 · The app around the editor (to build)

### Working with an agent

- [x] Chat beside the editor, showing what the agent is doing
- [x] Claude Code and Codex. **Kushmanji adds Antigravity (Gemini)**
- [x] Click something, then tell: the chat says what you are pointing at [M3-01]
- [x] The agent plans first and waits for your yes, in three ways of working [M10-02]
- [ ] The editor's own "Ask agent about this element" button goes to the chat [M3-02]
- [ ] Draw on the frame to point at something [M3-05]
- [ ] A comment pinned to a spot and a moment [M3-05]
- [ ] Draw across the timeline to talk about a stretch of the video [M3-05]
- [ ] Collect up to 10 picks and send them as one request [M3-04]
- [ ] `@` in the message for files, media and moments; drag media into the chat [M3-03]
- [ ] Send the next message while the agent works: queue it, or steer [M2-09]
- [ ] Undo button on each agent run [M2-10]
- [ ] The agent's work shown as a track on the timeline [M11-20]
- [ ] Agents use the editor's own tools: look at a frame, select, change one element, add a keyframe [M10-06]
- [x] You choose how much an agent may do (the official app: full access or automatic limits) [M10-08]
- n/a Framey, the mascot that points at the next step. It is HeyGen's character. Plain hints instead

### Making a video

- [x] Project list on Home; open any folder
- [x] Start from a folder of footage; add footage later; the originals are never touched [M10-13]
- [~] Describe a video on Home and get a project. Built, the button's path not run end to end [M2-07, M10-07]
- [ ] "Get inspired" library of example moments [M7-01]
- [ ] Guided first video: hook, proof, turn, call to action [M7-02]
- [~] Ready workflows from one input: product video from a website, explainer from text, captions on a
      talking-head clip, overlays on an interview, short motion graphic, music video [M10-07]

### Media

- [x] Voiceover made on this PC, free
- [x] Generated images (through Codex, on the ChatGPT plan)
- [x] Footage studied before cutting: frames with times, and the words in English and European languages [M10-01]
- [ ] The same in every language [M10-11, M10-12]
- [~] Captions from speech through the chat (works at the command line) [M8-04]
- [~] Background noise cleaned through the chat. A first pass with FFmpeg ran on a real vlog and removed only
      rumble and a little hiss, about 1 dB. Music, crowds and traffic behind a voice need a voice-isolation
      model, which is not installed [M10-17]
- [~] Background removal through the chat [M8]
- [ ] HeyGen's library of music, images and sound effects. Their tool does not run on Windows [M8-03]
- [ ] Music and stock footage from another source [M8-09, M8-10]
- n/a HeyGen avatar presenters. A paid HeyGen service

### The app itself

- [ ] One-click export to Downloads, then "Open video" and "Show in folder" [M4-02]
- [ ] Installer, Start Menu entry and an icon [M5-01, M5-02]
- [ ] Updates by itself [M5-05]
- [ ] First run for someone who has never used a terminal: agents found and fixed with one click [M10-09, M2-04]
- [ ] Remember the window, reopen the last project, rename and delete projects, real thumbnails [M1-08 to M1-13]
- [ ] The same keyboard shortcuts in the frame and inside the editor [M7-04]
- [ ] A settings screen [M7-03]
- n/a HeyGen account sign-in. Each agent uses the person's own account
- n/a `hyperframes open` handing a terminal conversation to the desktop app. The official app claims that
      command; Kushmanji opens a folder given on its own command line instead

## Part 3 · What Kushmanji adds

- [x] A third agent (Gemini), and a choice of model for each agent
- [x] Shared memory: each agent is told what the others did
- [x] Three access levels with a check that keeps FFmpeg inside the project
- [x] Gemini can watch and listen to a clip: it wrote down Kannada-English speech with times on 20 real clips
- [ ] **Three agents as a team on one video** [M13]: a task board inside the project (who does what, what is
      waiting on whom), a section for each agent's suggestions and doubts, independent jobs side by side
      (subtitles, pictures) but one agent at a time changing the video, and one review with one round of fixes
- [ ] The right agent for each job, chosen by the app [M10-05]
- [ ] **Agents that keep working when they update** [M12]: a real check-up for each agent, known problems
      repaired automatically, a one-tap "test this agent" after an update, and switching to another agent when
      one is down
- [ ] The agent checks its own work once and reports [M10-03]
- [ ] A style kit for each project [M10-04]
- [ ] Image ideas offered as a short list to accept or reject [M10-10]

## The order: one by one

Each line is finished, tried in the real app, and shown to the owner before the next begins.

1. One-click export to Downloads [M4]
2. Undo for each agent run [M2-10]
3. The editor's "Ask agent" button goes to the chat [M3-02]
4. Agents that keep working when they update [M12]
5. Send while the agent works: queue or steer [M2-09]
6. Three agents as a team [M13, M10-05]
7. Try every editor feature in Part 1 on Windows, sound first [M11]
8. Draw, comment and several picks in one request [M3-04, M3-05]
9. `@` mentions and dragging media into the chat [M3-03]
10. The agent checks its own work once [M10-03]
11. A style kit per project [M10-04]
12. Every language in the footage study [M10-11, M10-12]
13. A video from only an idea, and the guided first video [M10-07, M7-02]
14. The example library [M7-01]
15. Agents use the editor's own tools [M10-06]
16. First run, installer, icon and updates [M10-09, M5]
17. The rest of the app's own comforts [M1-08 to M1-13, M7-03, M7-04, M11-20]
