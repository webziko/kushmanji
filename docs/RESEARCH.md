# Research: what other projects teach Kushmanji

The owner sent seventeen links on 2026-10-24 and asked for them to be researched fully and kept, "so always we
can remember". Two helpers read every one (READMEs, file trees, guides, prompts, code) that night; this page keeps
what matters. Nothing below was copied: every rule is in Kushmanji's own words. Where a task came out of it, its
id is given; the tasks live in `PROGRESS.md`.

## What every good project does (the pattern)

1. **A picture is a function of time.** Draw "the frame at time t" and nothing else; no clock, no unseeded random.
   HyperFrames already enforces this, so Kushmanji has the hard part. What the projects add is craft on top.
2. **Plan before code**: a beat sheet with times, one approval, then build.
3. **A beat grid**: 120 beats a minute is the common choice; cuts and key actions land on it.
4. **The assistant checks its own pictures**: frames across the film, close strips around each big move.
5. **Banned lists beat adjectives**: name the effects that make a video look like a template.
6. **A look is a written contract**: one type family, one accent, two or three easing curves.
7. **Guides tuned on one model may fail on another.** Keep every rule short, numeric and testable on all three
   assistants.

What Kushmanji took tonight: all seven, as `.hyperframes/MOTION_GUIDE.md` (`app/src/main/agents/craft.js`,
M16-11), which every video carries and every assistant is told to read before motion design.

## The motion-design projects

| Project | What it is | Licence | What Kushmanji takes |
| --- | --- | --- | --- |
| lemomo-ai/lemo-opuscar | A director's workflow and 59 written looks for films made by Claude | MIT; demo films CC BY 4.0 | The look-as-contract format; plan, approve, build; ideas for a "Pick a look" gallery (M16-13) |
| JohnHeibel/ClaudeAnimationBase | A starter for Claude-made animation with a "write what the viewer reads, with times" method | MIT (its mascot resembles Anthropic's: never ship it) | Timing by reads; checking frames |
| Vincentwei1021/mg-styles-15 | Fifteen motion-graphics looks, a four-part prompt form and a seven-part judging rubric | MIT | Shape-morph recipe; the rubric for a second-assistant review (M13-07); prompt form for "Make it premium" |
| yihui-dev/awesome-opus5-5-videos | A list of videos made with Claude, with their prompts | MIT (the prompts belong to their authors) | Techniques only |
| athemeroy/awesome-claude-5-5-videos | A list and notes on Claude-made video | CC BY 4.0 | Techniques only; "label an illustration as an illustration" |
| mexicat/pdoom-video | A music video made in code | MIT (song excluded) | Beat-synced structure |
| JohnHeibel/PDoomVideo | Another code-made music video | none stated | Ideas only |
| joeseesun/opus-video-prompts | A collection of video prompts | none stated | Ideas only |
| Papermotion and four other linked MIT projects | Parallax worlds, light, walk cycles | MIT | Five-layer parallax with depth, walk-cycle rules, light recipes |

None is AGPL or GPL. Two have no licence at all: ideas only. The full report, with about 25 looks described and a
recipe for the monkey-to-human trailer, is in the session notes; the rules that matter are in the motion guide.

## The editing tools

| Project | What it is | Licence | Verdict |
| --- | --- | --- | --- |
| heygen-com/hyperframes | The engine under Kushmanji | Apache-2.0 | Updated 0.8.169 to 0.8.193 (M5-05); its `media-use` finds sound effects on Openverse with no account |
| nateherkai/herk-edit-kit | Cuts, captions and B-roll from a raw recording | MIT with extra clauses | Borrow the numbers: cut padding, breath length, B-roll used once |
| Melvynx/video-agent-skills | Skills that script, edit and publish shorts | MIT | Shorts scoring rubric (M17-10); its code-made music, to audition (M8-13) |
| browser-use/video-use | An agent that edits from the transcript without watching | MIT; needs Python and a paid ElevenLabs key | Borrow its cut rules (never inside a word, short fades at joins), not the tool |
| remotion-dev/skills | Skills for Remotion code | no licence file; Remotion is source-available | Copy nothing |
| Zulko/moviepy | Python video editing | MIT | Not needed: slower than FFmpeg, needs Python |
| m-bain/whisperX | Word-level timing | BSD-2; needs Python, PyTorch, CUDA; no Kannada aligner | Not bundled; whisper.cpp's own `--vad` and `--dtw` give most of it (M10-21) |
| WyattBlue/auto-editor | Cuts silences | Unlicense source, but the program has a paid limit and GPL encoders inside | Copy its idea (margins, preview of the cut), not the program (M10-20) |

## Openverse (api.openverse.org)

Free pictures and sounds under open licences, searched without a key: about 20 searches a minute and 200 a day
per computer, 20 results a page. No video. It does not check licences itself, and its terms ask for the line
"made with Openverse, not endorsed by it" and forbid bulk downloads. For video, the safe default is public
domain and CC BY only (`license=cc0,pdm,by`): Creative Commons treats music set to pictures as an adaptation, so
"no derivatives" music cannot be used and "share alike" music would bind the whole video.

The plan (M8-12): "Find free pictures and sounds" in the chat and a small panel; "Use this" downloads one file
into `assets/free-media/`, records it in a ledger, and keeps `CREDITS.md` at the project's root, with a "Copy
credits" button when a video using CC BY material is saved. Nothing to install, no account.

## Ranked: what to build from all of it

1. Motion guide for the assistants (done, M16-11) and the editing guide's new lines (M16-12).
2. Free pictures and sounds from Openverse, with credits kept (M8-12).
3. Safe cuts in the FFmpeg path: only between words, a little air, 20 to 30 ms sound fades, compress once (M10-19).
4. "Show the cut plan first": pauses and repeated takes found from the study's words, approved one by one
   (M10-20, M10-22).
5. Steadier transcripts: voice detection, no invented "Thank you." over silence (M10-21).
6. "Check my cuts" after saving: frames around each cut, loudness, the words heard again (M10-23).
7. A shorts rubric for "Make shorts" (M17-10); a "Pick a look" gallery (M16-13); a second-assistant review
   with a seven-part rubric (M13-07).
8. Later: code-made music (M8-13), "put the title behind me" with `remove-background` (M8-14), motion blur and
   speed-ramp buttons (M16-14).
