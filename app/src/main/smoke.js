import { app, dialog } from "electron";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { whereAll } from "./agents/launcher.js";
import { cliVersion, runCli } from "./cli.js";
import { createProject, listProjects } from "./projects.js";
import { isCompositionPreview } from "./preview.js";

// The end-to-end check behind `npm run smoke`: the real app opens Home, makes a project if there is none, opens
// it in Studio, and saves a picture of each screen plus result.json. Nobody has to click anything, so either AI
// can prove the app still starts after a change.

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

async function until(check, { timeoutMs, everyMs = 250 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await wait(everyMs);
  }
  return false;
}

const AGENT_TITLE = "Made on Windows";

const inJs = (value) => JSON.stringify(value);

/** One chat turn typed the way a person would: pick the agent, send the request, wait for it to finish. */
async function chatTurn({ result, inPage, engine, request }) {
  const offered = `[...(document.querySelector('.agent-pick')?.options ?? [])].some((o) => o.value === ${inJs(engine)})`;
  if (!(await until(() => inPage(offered), { timeoutMs: 20_000 })))
    throw new Error(`The chat does not offer the agent "${engine}".`);
  await inPage(
    `(() => { const pick = document.querySelector('.agent-pick'); pick.value = ${inJs(engine)}; pick.dispatchEvent(new Event('change')); })()`,
  );
  const sendReady = "document.querySelector('.composer button[type=submit]')?.disabled === false";
  if (!(await until(() => inPage(sendReady), { timeoutMs: 90_000 }))) {
    result.agentNotice = await inPage("document.querySelector('.chat-notice')?.innerText ?? ''");
    throw new Error(`The agent "${engine}" never became ready. ${result.agentNotice}`);
  }
  await inPage(
    `(() => { const box = document.querySelector('.composer textarea'); box.value = ${inJs(request)}; box.form.requestSubmit(); })()`,
  );
  if (!(await until(() => inPage("document.body.dataset.agent === 'running'"), { timeoutMs: 10_000 })))
    throw new Error("The agent run never started.");
  // Seven minutes covers a small change. A real re-edit of a long video takes far longer: HFWIN_SMOKE_TURN_MINUTES.
  const turnMs = (Number(process.env.HFWIN_SMOKE_TURN_MINUTES) || 7) * 60_000;
  if (!(await until(() => inPage("document.body.dataset.agent === 'idle'"), { timeoutMs: turnMs, everyMs: 500 })))
    throw new Error("The agent run never finished.");
  return inPage("[...document.querySelectorAll('.msg.agent')].pop()?.innerText ?? ''");
}

/** Pick a level in the access menu the way a person would. "full" also needs its confirmation pressed. */
async function chooseAccess(inPage, level) {
  await inPage(
    `(() => { const pick = document.querySelector('.access-pick'); pick.value = ${inJs(level)}; pick.dispatchEvent(new Event('change')); })()`,
  );
  if (level === "full") {
    const asked = "[...document.querySelectorAll('.notice-actions button')].some((b) => b.offsetParent)";
    if (!(await until(() => inPage(asked), { timeoutMs: 5000 }))) throw new Error("Full access was not asked about first.");
    await inPage("document.querySelector('.notice-actions button').click()");
  }
  if (!(await until(() => inPage(`document.body.dataset.access === ${inJs(level)}`), { timeoutMs: 5000 })))
    throw new Error(`The access level never became "${level}".`);
}

/** The access menu, in every run: it costs nothing. Leaves the project on the level it started on. */
async function accessStep({ result, inPage, shot }) {
  if (!(await until(() => inPage("Boolean(document.body.dataset.access)"), { timeoutMs: 10_000 })))
    throw new Error("The access menu never appeared.");
  const start = await inPage("document.body.dataset.access");
  result.access = { start, levels: await inPage("[...document.querySelector('.access-pick').options].map((o) => o.text)") };

  await chooseAccess(inPage, "tools");
  await shot("access-tools");

  // Full access must ask first, and "Cancel" must leave the level alone.
  await inPage(
    "(() => { const pick = document.querySelector('.access-pick'); pick.value = 'full'; pick.dispatchEvent(new Event('change')); })()",
  );
  await wait(300);
  result.access.fullAsksFirst = await inPage("document.body.dataset.access === 'tools' && document.querySelector('.access-pick').value === 'tools'");
  await shot("access-full-asks");
  await inPage("[...document.querySelectorAll('.notice-actions button')].pop().click()");
  await wait(200);
  result.access.cancelKeeps = await inPage("document.body.dataset.access === 'tools'");
  if (!result.access.fullAsksFirst || !result.access.cancelKeeps)
    throw new Error("Full access was applied without the person confirming it.");

  await chooseAccess(inPage, start);
}

/** A few seconds of moving picture with a tone, made with the real FFmpeg: footage for an agent to cut. */
function makeTestClip(dir, seconds) {
  const ffmpeg = whereAll("ffmpeg").find((file) => /.exe$/i.test(file));
  if (!ffmpeg) throw new Error("FFmpeg is not installed, so the test clip could not be made.");
  const file = path.join(dir, "assets", "test-clip.mp4");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const made = spawnSync(
    ffmpeg,
    [
      "-y", "-v", "error",
      "-f", "lavfi", "-i", `testsrc2=size=640x360:rate=30:duration=${seconds}`,
      "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file,
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  if (made.status !== 0) throw new Error(`The test clip could not be made. ${made.stderr}`);
  // A second copy beside the projects folder, outside every project: something for a refusal test to ask for.
  fs.copyFileSync(file, path.join(process.env.HFWIN_SMOKE, "outside-clip.mp4"));
  return file;
}

const SPOKEN =
  "Welcome to the bakery tour. First we mix the flour and the water. Then the dough rests for two hours. " +
  "Finally the bread goes into the oven, and the whole street smells wonderful.";
const SPOKEN_HINDI = "नमस्ते, आज हम घर पर रोटी बनाना सीखेंगे। सबसे पहले आटा गूंथ लें। फिर उसे दस मिनट के लिए ढक कर रख दें।";

/**
 * `npm run smoke:study` only, because the voice model is a download: footage with real speech in it. A video of
 * someone "talking" in English, and a sound file in Hindi, both made with HyperFrames' own voice on this computer.
 */
async function makeSpokenClips(dir) {
  const assets = path.join(dir, "assets");
  fs.mkdirSync(assets, { recursive: true });
  const say = async (text, file, voice) => {
    const made = await runCli(["tts", text, "--output", file, "--json", ...(voice ? ["--voice", voice] : [])], {
      cwd: dir,
      timeoutMs: 300_000,
    });
    if (made.code !== 0 || !fs.existsSync(file)) throw new Error(`The test voice could not be made. ${made.stderr.slice(-300)}`);
  };
  const english = path.join(assets, "voice-en.wav");
  await say(SPOKEN, english);
  await say(SPOKEN_HINDI, path.join(assets, "hindi-voice.wav"), "hf_alpha");
  const ffmpeg = whereAll("ffmpeg").find((file) => /\.exe$/i.test(file));
  const talk = path.join(assets, "bakery talk.mp4");
  const muxed = spawnSync(
    ffmpeg,
    [
      "-y", "-v", "error",
      "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=60",
      "-i", english,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", talk,
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  if (muxed.status !== 0) throw new Error(`The talking test clip could not be made. ${muxed.stderr}`);
  // Only the video and the Hindi sound stay: the English sound alone would be the same words twice.
  fs.rmSync(english, { force: true });
}

const readIndex = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, ".hyperframes", "study", "index.json"), "utf8"));
  } catch {
    return null;
  }
};

/**
 * The footage study, in every run where FFmpeg is installed: the test clip must come out with its length, a
 * sheet of frames and a line in the index. With real speech in the project (`smoke:study`), the words too.
 */
async function studyStep({ result, inPage, shot, dir, outDir }) {
  const settled = () => inPage("document.body.dataset.study === 'done'");
  if (!(await until(settled, { timeoutMs: 600_000, everyMs: 500 }))) throw new Error("The footage study never finished.");
  const index = readIndex(dir);
  const clip = index?.clips.find((found) => found.file === "assets/test-clip.mp4");
  const sheet = clip?.sheets?.[0];
  result.study = {
    clips: index?.clips.map((found) => ({
      file: found.file,
      seconds: found.seconds,
      sheets: found.sheets.length,
      words: found.transcript?.wordCount ?? null,
      language: found.transcript?.language ?? null,
      notes: found.notes,
    })),
  };
  if (!clip || !(clip.seconds > 5) || !sheet || !fs.existsSync(path.join(dir, sheet.file)))
    throw new Error("The test clip was not studied: no length or no sheet of frames.");
  // Beside the screenshots, so a person can look at what an agent is given to look at.
  fs.copyFileSync(path.join(dir, sheet.file), path.join(outDir, "study-sheet.jpg"));
  await shot("study");
  await inPage("[...document.querySelectorAll('.study button')].find((b) => b.textContent === 'Review clips').click()");
  if (!(await until(() => inPage("(() => { const img = document.querySelector('.footage-review[open] img'); return img?.complete && img.naturalWidth > 0; })()"),
    { timeoutMs: 10_000 }))) throw new Error("The saved frame sheet could not be reviewed in the app.");
  result.studyReview = true;
  await shot("study-review");
  await inPage("document.querySelector('.footage-review-head button').click()");
  if (process.env.HFWIN_SMOKE_STUDY !== "speech") return;

  const talk = index.clips.find((found) => found.file === "assets/bakery talk.mp4");
  const heard = talk?.transcript ? fs.readFileSync(path.join(dir, talk.transcript.text), "utf8") : "";
  result.study.heard = heard;
  fs.copyFileSync(path.join(dir, talk.sheets[0].file), path.join(outDir, "study-sheet-talk.jpg"));
  if (!/bakery/i.test(heard) || !/oven/i.test(heard)) throw new Error("The spoken test clip was not transcribed correctly.");

  // Now tell the app the footage is in Hindi, as a person would, and see what it makes of the Hindi clip.
  await inPage(
    "(() => { const pick = document.querySelector('.study select'); pick.value = 'hi'; pick.dispatchEvent(new Event('change')); })()",
  );
  await until(() => inPage("document.body.dataset.study === 'running'"), { timeoutMs: 10_000, everyMs: 100 });
  if (!(await until(settled, { timeoutMs: 600_000, everyMs: 500 }))) throw new Error("The study in Hindi never finished.");
  const hindi = readIndex(dir)?.clips.find((found) => found.file === "assets/hindi-voice.wav");
  result.study.hindi = { language: readIndex(dir)?.language, words: hindi?.transcript?.wordCount ?? null, notes: hindi?.notes };
  if (hindi?.transcript) result.study.hindi.heard = fs.readFileSync(path.join(dir, hindi.transcript.text), "utf8");
  await shot("study-hindi");
  // Either a transcript in Hindi, or a plain reason there is none. Never a silent blank, never Latin nonsense.
  if (!hindi?.transcript && !hindi?.notes?.some((note) => /Whisper/.test(note)))
    throw new Error("The Hindi clip has neither a transcript nor a reason for having none.");

  // Back to "Automatic", so an agent asked about the English clip afterwards finds its words again.
  await inPage(
    "(() => { const pick = document.querySelector('.study select'); pick.value = 'auto'; pick.dispatchEvent(new Event('change')); })()",
  );
  await until(() => inPage("document.body.dataset.study === 'running'"), { timeoutMs: 10_000, everyMs: 100 });
  if (!(await until(settled, { timeoutMs: 600_000, everyMs: 500 }))) throw new Error("The study never finished after going back to Automatic.");
}

/** A media file's length in seconds, or null. */
function durationOf(file) {
  const ffprobe = whereAll("ffprobe").find((found) => /.exe$/i.test(found));
  if (!ffprobe) return null;
  const probed = spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
    windowsHide: true,
    encoding: "utf8",
  });
  return probed.status === 0 ? Number(probed.stdout.trim()) : null;
}

/**
 * `npm run smoke:agent` and its siblings only, because they spend the person's agent usage: send a real request
 * and check the project file really changed.
 *
 * Set by hand to try one thing:
 *   HFWIN_SMOKE_REQUEST / HFWIN_SMOKE_EXPECT   another request, and the text index.html must then contain
 *   HFWIN_SMOKE_ACCESS                         the access level to choose first: project, tools or full
 *   HFWIN_SMOKE_EXPECT_FILE                    a file, by its path in the project, that must exist afterwards.
 *                                              Its length in seconds lands in result.madeSeconds
 *   HFWIN_SMOKE_EXPECT_NO_FILE                 a file that must not exist afterwards: the test of a refusal
 *   HFWIN_SMOKE_THEN_AGENT                     a second agent, asked afterwards what the first one did. Its
 *                                              reply lands in result.followReply: the test of shared memory
 */
async function agentStep({ result, inPage, shot, dir }) {
  const engine = process.env.HFWIN_SMOKE_AGENT;
  result.agent = engine;
  let request =
    process.env.HFWIN_SMOKE_REQUEST ||
    `Change the visible title text in this video to "${AGENT_TITLE}". Change nothing else.`;
  const wantFile = process.env.HFWIN_SMOKE_EXPECT_FILE;
  const wantNoFile = process.env.HFWIN_SMOKE_EXPECT_NO_FILE;
  // With a file to look for, the title is not what is being tested.
  const expected = process.env.HFWIN_SMOKE_EXPECT || (wantFile || wantNoFile ? null : AGENT_TITLE);

  if (process.env.HFWIN_SMOKE_ACCESS) await chooseAccess(inPage, process.env.HFWIN_SMOKE_ACCESS);
  result.agentAccess = await inPage("document.body.dataset.access");
  // HFWIN_SMOKE_UNPOINT: the request is about the whole video, so the selection left by the pointing step is
  // dismissed the way a person would, with the ✕.
  if (process.env.HFWIN_SMOKE_UNPOINT) await inPage("document.querySelector('.pointing button')?.click()");
  // HFWIN_SMOKE_MODEL: pick this model in the chat's model menu first (for example "sonnet"), the way a person
  // would to spend less on a job. The menu only fills once the agent has been checked, so wait for the option.
  const wantModel = process.env.HFWIN_SMOKE_MODEL;
  if (wantModel) {
    const offered = `[...document.querySelectorAll('.chat-head .agent-pick')[1].options].some((o) => o.value === ${inJs(wantModel)})`;
    if (!(await until(() => inPage(offered), { timeoutMs: 90_000 }))) throw new Error(`The model "${wantModel}" is not offered.`);
    await inPage(
      `(() => { const pick = document.querySelectorAll('.chat-head .agent-pick')[1]; pick.value = ${inJs(wantModel)}; pick.dispatchEvent(new Event('change')); })()`,
    );
    await wait(500);
    result.agentModel = wantModel;
  }
  // HFWIN_SMOKE_REQUEST_FILE: a long request, read from a file instead of the environment.
  if (process.env.HFWIN_SMOKE_REQUEST_FILE) request = fs.readFileSync(process.env.HFWIN_SMOKE_REQUEST_FILE, "utf8").trim();

  // HFWIN_SMOKE_MODE=review (or codirect): the agent must show a plan and wait. The video must be untouched
  // until "Build it" is pressed, and changed after.
  const planFirst = process.env.HFWIN_SMOKE_MODE;
  if (planFirst) {
    await inPage(
      `(() => { const pick = document.querySelector('.mode-pick'); pick.value = ${inJs(planFirst)}; pick.dispatchEvent(new Event('change')); })()`,
    );
    if (!(await until(() => inPage(`document.body.dataset.mode === ${inJs(planFirst)}`), { timeoutMs: 5000 })))
      throw new Error(`The way of working never became "${planFirst}".`);
    const video = () => fs.readFileSync(path.join(dir, "index.html"), "utf8");
    const before = video();
    const plan = await chatTurn({ result, inPage, engine, request });
    await shot("plan-waiting");
    result.plan = {
      reply: plan,
      asksFirst: await inPage("Boolean(document.querySelector('.plan-actions'))"),
      videoUntouched: video() === before,
      storyboard: fs.existsSync(path.join(dir, "STORYBOARD.md")),
      markHidden: !/PLAN READY/i.test(plan),
    };
    if (!result.plan.asksFirst || !result.plan.videoUntouched) throw new Error("The agent did not stop at the plan.");
    await inPage("document.querySelector('.plan-actions button').click()");
    if (!(await until(() => inPage("document.body.dataset.agent === 'running'"), { timeoutMs: 10_000 })))
      throw new Error("Pressing Build it did not start the agent.");
    if (!(await until(() => inPage("document.body.dataset.agent === 'idle'"), { timeoutMs: 900_000, everyMs: 500 })))
      throw new Error("Building the plan never finished.");
    result.agentReply = await inPage("[...document.querySelectorAll('.msg.agent')].pop()?.innerText ?? ''");
    result.plan.builtAfterYes = video() !== before;
    await wait(4000);
    await shot("chat-done");
    if (!result.plan.builtAfterYes) throw new Error("After the yes, the video did not change.");
    return;
  }

  result.agentReply = await chatTurn({ result, inPage, engine, request });
  // Studio reloads the preview when the file changes.
  await wait(4000);
  await shot("chat-done");
  if (expected) {
    result.agentEdited = fs.readFileSync(path.join(dir, "index.html"), "utf8").includes(expected);
    if (!result.agentEdited) throw new Error("The agent finished, but the project file did not change.");
  }
  if (wantFile) {
    const made = path.join(dir, wantFile);
    result.madeFile = fs.existsSync(made);
    if (!result.madeFile) throw new Error(`The agent finished, but did not make ${wantFile}.`);
    result.madeSeconds = durationOf(made);
  }
  if (wantNoFile) {
    result.refusedFile = !fs.existsSync(path.join(dir, wantNoFile));
    if (!result.refusedFile) throw new Error(`${wantNoFile} was made, and it should have been refused.`);
  }

  const second = process.env.HFWIN_SMOKE_THEN_AGENT;
  if (!second) return;
  result.followAgent = second;
  result.followReply = await chatTurn({
    result,
    inPage,
    engine: second,
    request:
      "Do not change anything. In one short sentence: which agent last changed this video before you, and what did it change?",
  });
  await shot("chat-handover");
}

/**
 * Pointing: click in the middle of Studio's picture, as a person would, and the chat must say what was clicked.
 * The click goes through the window, not through Studio's code, so this proves the whole path: Studio selects,
 * tells its server, the app reads it back, the chat shows it.
 */
async function pointingStep({ win, result, inPage, shot }) {
  const page = win.webContents;
  const studio = page.mainFrame.framesInSubtree.find((frame) => frame.parent === page.mainFrame);
  const outer = await inPage("(() => { const r = document.querySelector('iframe').getBoundingClientRect(); return { x: r.x, y: r.y }; })()");
  // The picture is a frame inside Studio's player element, which keeps it in a shadow root.
  const inner = await studio.executeJavaScript(
    `(() => {
      const find = (root) => {
        for (const el of root.querySelectorAll("*")) {
          if (el.tagName === "IFRAME") return el;
          const deeper = el.shadowRoot && find(el.shadowRoot);
          if (deeper) return deeper;
        }
        return null;
      };
      const r = find(document)?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    })()`,
  );
  if (!inner) throw new Error("Studio shows no picture to click on.");
  const at = { x: Math.round(outer.x + inner.x), y: Math.round(outer.y + inner.y) };
  // Electron's sendInputEvent goes to the window's own page and never reaches a frame from another origin,
  // so the click is made inside Studio's frame: the same pointer and mouse events a real click produces there.
  await studio.executeJavaScript(
    `(async () => {
      const x = ${inner.x}, y = ${inner.y};
      const target = document.elementFromPoint(x, y);
      const fire = (Kind, type, extra = {}) =>
        target.dispatchEvent(new Kind(type, { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, ...extra }));
      fire(PointerEvent, "pointermove", { pointerId: 1, pointerType: "mouse", isPrimary: true });
      fire(MouseEvent, "mousemove");
      await new Promise((done) => setTimeout(done, 300));
      fire(PointerEvent, "pointerdown", { pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 1 });
      fire(MouseEvent, "mousedown", { buttons: 1, detail: 1 });
      await new Promise((done) => setTimeout(done, 60));
      fire(PointerEvent, "pointerup", { pointerId: 1, pointerType: "mouse", isPrimary: true });
      fire(MouseEvent, "mouseup", { detail: 1 });
      fire(MouseEvent, "click", { detail: 1 });
    })()`,
    true,
  );
  const shown = () => inPage("document.body.dataset.pointing ?? ''");
  if (!(await until(shown, { timeoutMs: 15_000 }))) {
    result.pointing = {
      at,
      under: await studio.executeJavaScript(
        `(() => { const el = document.elementFromPoint(${inner.x}, ${inner.y}); return el ? el.tagName + "." + String(el.className).slice(0, 80) : null; })()`,
      ),
      focused: win.isFocused(),
    };
    throw new Error("Clicking the picture did not tell the chat what was clicked.");
  }
  result.pointing = { chip: await inPage("document.querySelector('.pointing span').textContent") };
  await shot("pointing");
}

/**
 * `HFWIN_SMOKE_SOUND` with `HFWIN_SMOKE_REAL_PROJECT`: open that project, press Studio's own Play the way a
 * person does, and report whether the window is really making sound, with the state of every video and sound
 * element in every frame. Written to chase "no sound in the preview"; kept because only a real window can tell.
 */
async function soundProbe({ win, outDir, result, shot }) {
  const page = win.webContents;
  const inPage = (expression) => page.executeJavaScript(expression, true);
  const dir = process.env.HFWIN_SMOKE_REAL_PROJECT;
  page.send("app:open-project", { dir });
  if (!(await until(() => inPage("document.body.dataset.studio === 'loaded'"), { timeoutMs: 180_000 })))
    throw new Error("The project did not open in Studio.");
  await wait(10_000);
  if (process.env.HFWIN_SMOKE_SOUND === "point") {
    try {
      await pointingStep({ win, result, inPage, shot });
    } catch (error) {
      result.pointingError = error.message;
    }
    return;
  }
  const frames = () => page.mainFrame.framesInSubtree;
  const studio = frames().find((frame) => frame.parent === page.mainFrame);
  const media = async () =>
    Promise.all(
      frames().map(async (frame) => ({
        url: frame.url.slice(0, 120),
        ...(await frame
          .executeJavaScript(
            `({ active: navigator.userActivation?.hasBeenActive ?? null,
                contexts: (window.__hfAudioContexts ?? []).length,
                media: [...document.querySelectorAll('video,audio')].map((m) => ({ id: m.id, tag: m.tagName, paused: m.paused,
                  muted: m.muted, volume: m.volume, time: Math.round(m.currentTime * 10) / 10, ready: m.readyState,
                  error: m.error?.message ?? null })).filter((m) => !m.paused || m.time > 0).slice(0, 12) })`,
          )
          .catch((error) => ({ failed: error.message }))),
      })),
    );
  result.sound = { before: { audible: page.isCurrentlyAudible() } };
  result.sound.buttons = await studio.executeJavaScript(
    "[...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.title || '').filter(Boolean)",
  );
  // A real click with a real gesture, on the button a person presses.
  result.sound.clicked = await studio.executeJavaScript(
    `(() => { const b = [...document.querySelectorAll('button')].find((b) => /^play/i.test(b.getAttribute('aria-label') || b.title || ''));
      if (!b) return false; b.click(); return true; })()`,
    true,
  );
  const heard = [];
  for (let i = 0; i < 12; i++) {
    await wait(500);
    heard.push(page.isCurrentlyAudible());
  }
  result.sound.audibleWhilePlaying = heard;
  result.sound.frames = await media();
  await shot("sound-playing");

  // The same from the middle of the video, the way a person does it: stop, move the playhead, press Play.
  const press = (label) =>
    studio.executeJavaScript(
      `(() => { const b = [...document.querySelectorAll('button')].find((b) => ${label}.test(b.getAttribute('aria-label') || b.title || ''));
        if (!b) return false; b.click(); return true; })()`,
      true,
    );
  const preview = frames().find((frame) => /\/preview(\?|$)/.test(frame.url));
  result.sound.later = [];
  for (const at of [40, 75, 120, 160, 186]) {
    await press("/^pause/i");
    await wait(400);
    await preview.executeJavaScript(`window.__player.seek(${at})`, true);
    await wait(1500);
    await press("/^play/i");
    const audible = [];
    for (let i = 0; i < 8; i++) {
      await wait(500);
      audible.push(page.isCurrentlyAudible());
    }
    const playing = (await media()).flatMap((frame) => frame.media ?? []).filter((item) => !item.paused);
    result.sound.later.push({ at, audible: audible.filter(Boolean).length + " of 8", playing });
  }

  // Across a cut, four times a second: where the playhead is, which clip is really playing, and whether the
  // window is making sound. A cut where nothing plays is a hole in the sound and a frozen picture.
  result.sound.cuts = [];
  for (const at of [13.5, 39.7]) {
    await press("/^pause/i");
    await wait(400);
    await preview.executeJavaScript(`window.__player.seek(${at})`, true);
    await wait(1500);
    await press("/^play/i");
    const samples = [];
    for (let i = 0; i < 24; i++) {
      await wait(250);
      const state = await preview.executeJavaScript(
        `({ t: Math.round(window.__player.getTime() * 100) / 100,
            on: [...document.querySelectorAll('video,audio')].filter((m) => !m.paused).map((m) => m.id + '@' + m.currentTime.toFixed(2) + (m.readyState < 3 ? '(waiting)' : '')).join(' ') })`,
      );
      samples.push(`${state.t} ${page.isCurrentlyAudible() ? "sound" : "SILENT"} ${state.on || "nothing playing"}`);
    }
    result.sound.cuts.push({ at, samples });
  }
  await press("/^pause/i");
  fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
}

export async function runSmoke({ win, outDir }) {
  fs.mkdirSync(outDir, { recursive: true });
  const result = {
    ok: false,
    cliVersion,
    electron: process.versions.electron,
    node: process.versions.node,
    steps: [],
    consoleErrors: [],
  };
  const page = win.webContents;
  page.on("console-message", (event) => {
    if (event.level === "error") result.consoleErrors.push(event.message);
  });
  const shot = async (name) => {
    try {
      const image = await page.capturePage();
      fs.writeFileSync(path.join(outDir, `${name}.png`), image.toPNG());
    } catch (error) {
      // Windows gives no picture of a window while the screen is locked or asleep ("UnknownVizError"). The
      // sound probe measures without one; every other run needs its pictures and fails here.
      if (!process.env.HFWIN_SMOKE_SOUND) throw error;
      result.noPictures = String(error?.message ?? error);
    }
    result.steps.push(name);
  };
  const inPage = (expression) => page.executeJavaScript(expression, true);

  try {
    if (!(await until(() => inPage("document.body.dataset.view === 'home'"), { timeoutMs: 15_000 })))
      throw new Error("Home never appeared.");
    await wait(400);
    await shot("home");
    if (process.env.HFWIN_SMOKE_SOUND && process.env.HFWIN_SMOKE_REAL_PROJECT) {
      await soundProbe({ win, outDir, result, shot });
      result.ok = true;
      fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
      return app.exit(0);
    }

    // Exercise the actual Home intake, including the dialog -> IPC -> safe copy path.
    const source = path.join(outDir, "source footage é");
    fs.mkdirSync(path.join(source, "assets"), { recursive: true });
    const hasFfmpeg = whereAll("ffmpeg").some((file) => /\.exe$/i.test(file));
    if (hasFfmpeg) makeTestClip(source, 6);
    else fs.writeFileSync(path.join(source, "assets", "picture.png"), Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64",
    ));
    if (process.env.HFWIN_SMOKE_STUDY === "speech") await makeSpokenClips(source);
    const sourceHashes = fs.readdirSync(path.join(source, "assets"), { withFileTypes: true })
      .filter((item) => item.isFile()).map((item) => [item.name, fs.readFileSync(path.join(source, "assets", item.name))]);
    const showDialog = dialog.showOpenDialog;
    try {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
      await inPage("[...document.querySelectorAll('button')].find((b) => b.textContent === 'Start from footage').click()");
      if (!(await until(() => inPage("document.body.dataset.view === 'project'"), { timeoutMs: 120_000 }))) {
        throw new Error("Starting a project from footage never opened the project.");
      }
    } finally {
      dialog.showOpenDialog = showDialog;
    }
    const project = listProjects()[0];
    result.project = project.dir;
    result.importedFootage = sourceHashes.every(([name, content]) =>
      fs.readFileSync(path.join(project.dir, "assets", name)).equals(content) &&
      fs.readFileSync(path.join(source, "assets", name)).equals(content),
    );
    if (!result.importedFootage) throw new Error("Footage was not copied safely.");

    const framed = await until(() => inPage("document.body.dataset.studio === 'loaded'"), {
      timeoutMs: 120_000,
    });
    if (!framed) {
      result.pageError = await inPage("document.body.dataset.error ?? ''");
      throw new Error(`Studio never loaded. ${result.pageError}`);
    }
    result.studioUrl = await inPage("document.querySelector('iframe')?.src ?? ''");
    // Studio paints its panels, then the composition's first frame.
    await wait(8000);
    await shot("project");
    result.importDraft = await inPage("document.querySelector('.composer textarea').value");
    if (!result.importDraft.includes("orientation")) throw new Error("No footage review request was prepared.");
    await accessStep({ result, inPage, shot });
    if (hasFfmpeg) await studyStep({ result, inPage, shot, dir: project.dir, outDir });
    let chatProject = project.dir;
    const realProject = process.env.HFWIN_SMOKE_REAL_PROJECT;
    if (realProject) {
      await inPage("[...document.querySelectorAll('button')].find((b) => b.textContent === '← Home').click()");
      if (!(await until(() => inPage("document.body.dataset.view === 'home'"), { timeoutMs: 10_000 }))) {
        throw new Error("Could not return Home before the real-footage test.");
      }
      const nativeDialog = dialog.showOpenDialog;
      try {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [realProject] });
        await inPage("[...document.querySelectorAll('button')].find((b) => b.textContent === 'Open a folder').click()");
        if (!(await until(() => inPage("document.body.dataset.studio === 'loaded'"), { timeoutMs: 120_000 }))) {
          throw new Error("The real footage project did not open in Studio.");
        }
      } finally { dialog.showOpenDialog = nativeDialog; }
      await wait(8000);
      const studioUrl = await inPage("document.querySelector('iframe').src");
      const frame = page.mainFrame.framesInSubtree.find((item) => isCompositionPreview(item.url, {
        serverUrl: new URL(studioUrl).origin, projectName: path.basename(realProject),
      }));
      if (!frame) throw new Error("The real project has no composition preview.");
      result.realPreview = await frame.executeJavaScript(
        "window.__player.seek(3.1); ({ ready: window.__renderReady === true, duration: window.__player.getDuration() })",
      );
      if (!result.realPreview.ready) throw new Error("The real project's media are not ready.");
      await wait(1000);
      await shot("real-project");
      result.realProject = realProject;
      chatProject = realProject;
    }
    await pointingStep({ win, result, inPage, shot });
    if (process.env.HFWIN_SMOKE_AGENT) await agentStep({ result, inPage, shot, dir: chatProject });
    result.ok = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    await shot("failure").catch(() => {});
  }

  fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
  app.exit(result.ok ? 0 : 1);
}
