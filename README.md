# Kushmanji

An **unofficial** AI video editor for Windows, built on [HyperFrames](https://github.com/heygen-com/hyperframes).
Describe the video you want, or click something in the picture and say what to change. An AI agent on your own
computer does the editing, and you watch the result in a large player beside the chat. "Edit by hand" opens
the full HyperFrames Studio editor.

It works with three agents, each on your own account: **Claude Code**, **Codex** (ChatGPT) and **Antigravity**
(Gemini).

HeyGen's own HyperFrames Studio desktop app is closed source and has no Windows build yet ("Coming soon" on
[hyperframes.dev/studio](https://www.hyperframes.dev/studio)). Kushmanji builds a Windows app from the parts of
HyperFrames that are open source. It is not made by or affiliated with HeyGen.

**Status: early.** It runs from source and has no installer yet. `CHECKLIST.md` says honestly what works, what
is proven and what is not.

## What it does

- Opens videos in a large player with play/pause, ten-second skips, scrubbing, sound and full screen.
- Puts a chat beside the video. You type what you want; an assistant edits it; the picture updates.
- Shows "At 0:42" beside your message and tells the assistant which video moment you mean.
- Offers big editing buttons that explain the action and prepare a message for you to check and send.
- **Help** explains each screen in plain words, with a short welcome walkthrough and an editor-word glossary.
- **Edit by hand** opens the real Studio editor. **Watch video** returns to the player and keeps your chat.
- **Click, then tell, in the editor.** Click anything in the picture or on the timeline and the chat knows which thing you mean.
- **Plan first, if you want.** Choose "Review the story first" and the agent shows its plan and waits for your yes.
- **You decide how much an agent may do**: only the project's files, also cutting footage with FFmpeg inside the
  project, or everything.
- **Studies your footage first**: still frames with the time printed on them, and the words that are spoken,
  written into the project so every agent reads the same thing.
- Keeps a shared record of every change in the project, so one agent can pick up where another stopped.
- Makes voiceovers on your own PC, free, through the chat. Supplied subtitle words can be placed on screen;
  automatic subtitles through the app are still pending.

## Run it

You need Windows 10 or 11, [Node.js](https://nodejs.org) 22 or newer, and FFmpeg. For the chat you need at least
one agent installed and signed in; the app shows the command for each one that is missing.

```
cd app
npm install
npm start
```

If `npm start` reports that Electron is missing, run `node node_modules/electron/install.js` once.

## Find your way around

| If you want to know | Read |
| --- | --- |
| What works and what is waiting on the owner | `CHECKLIST.md` |
| Every task, done and open | `PROGRESS.md` |
| Every feature of the official app, and where this one stands | `docs/PARITY.md` |
| How the app should look and speak, and why | `docs/UX.md` |
| How to work on the code | `CONTRIBUTING.md` |
| How the app is built, and why | `docs/ARCHITECTURE.md` |
| What it is trusted with and how that is limited | `SECURITY.md` |
| What to do when an agent or HyperFrames updates | `docs/MAINTENANCE.md` |
| What HyperFrames is, and what is open source | `docs/FINDINGS.md` |
| What the last work session left behind | `docs/HANDOFF.md` |
| The rules for the AI agents that build this | `AGENTS.md` |

The app itself is in `app/`. Inside the code some names still start with `hfwin` (the app's first name was
"HyperFrames Studio Win"); they are internal and were left alone on purpose.

## Licence

Apache-2.0, the same as HyperFrames. See `LICENSE`. HyperFrames and HeyGen are trademarks of their owner; this
project uses the name only to say what it is built on.
