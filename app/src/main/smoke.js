import { app, dialog } from "electron";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { whereAll } from "./agents/launcher.js";
import { cliVersion, runCli } from "./cli.js";
import { createProject, listProjects } from "./projects.js";
import { playbackProbe } from "./playbackProbe.js";
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
    const asked = "document.querySelector('.access-confirm')?.hidden === false";
    if (!(await until(() => inPage(asked), { timeoutMs: 5000 })))
      throw new Error("Allowing anything on this computer was not asked about first.");
    await inPage("document.querySelector('.access-confirm .notice-actions button').click()");
  }
  if (!(await until(() => inPage(`document.body.dataset.access === ${inJs(level)}`), { timeoutMs: 5000 })))
    throw new Error(`The access level never became "${level}".`);
}

/** The access menu, in every run: it costs nothing. Leaves the project on the level it started on. */
async function accessStep({ result, inPage, shot }) {
  await inPage("document.querySelector('.chat-settings')?.setAttribute('open', '')");
  if (!(await until(() => inPage("Boolean(document.body.dataset.access)"), { timeoutMs: 10_000 })))
    throw new Error("The access menu never appeared.");
  const start = await inPage("document.body.dataset.access");
  result.access = { start, levels: await inPage("[...document.querySelector('.access-pick').options].map((o) => o.text)") };

  await chooseAccess(inPage, "tools");
  await shot("access-tools");

  // "Anything on this computer" must ask first, and "Cancel" must leave the level alone.
  await inPage(
    "(() => { const pick = document.querySelector('.access-pick'); pick.value = 'full'; pick.dispatchEvent(new Event('change')); })()",
  );
  await wait(300);
  result.access.fullAsksFirst = await inPage("document.body.dataset.access === 'tools' && document.querySelector('.access-pick').value === 'tools'");
  await shot("access-full-asks");
  await inPage("document.querySelector('.access-confirm .notice-actions button:last-child').click()");
  await wait(200);
  result.access.cancelKeeps = await inPage("document.body.dataset.access === 'tools' && document.querySelector('.access-confirm').hidden");
  if (!result.access.fullAsksFirst || !result.access.cancelKeeps)
    throw new Error("Allowing anything on this computer was applied without the person confirming it.");

  await chooseAccess(inPage, start);
}

/** Help is local: completing or replaying it must not create a video or send an assistant request. */
async function helpStep({ win, result, inPage, shot }) {
  if (!(await until(() => inPage("Boolean(document.querySelector('.help-dialog[open]'))"),
    { timeoutMs: 5000 }))) throw new Error("The first-time walkthrough did not appear.");
  for (let step = 1; step <= 3; step++) {
    if (await inPage("document.querySelector('.help-content').textContent.includes('false')"))
      throw new Error("The walkthrough contains stray text instead of just its explanation.");
    if (!(await inPage(`document.querySelector('.help-progress').textContent === 'Step ${step} of 3'`)))
      throw new Error("The walkthrough skipped or repeated a step.");
    if (step === 1) await shot("welcome");
    if (step === 2) {
      await inPage("document.querySelector('.help-back').click()");
      if (!(await inPage("document.querySelector('.help-progress').textContent === 'Step 1 of 3'")))
        throw new Error("Back did not return to the previous walkthrough step.");
      await inPage("document.querySelector('.help-next').click()");
    }
    await inPage("document.querySelector('.help-next').click()");
  }
  if (await inPage("Boolean(document.querySelector('.help-dialog[open]'))"))
    throw new Error("Finishing the walkthrough did not return to the app.");
  await inPage("document.querySelector('.help-button').click()");
  if (!(await inPage("document.querySelector('.help-title').textContent === 'What is what'")))
    throw new Error("Help did not open the plain guide.");
  await shot("help-home");
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  if (!(await until(() => inPage("!document.querySelector('.help-dialog').open"), { timeoutMs: 3000 })))
    throw new Error("Escape did not close Help.");
  await inPage("document.querySelector('.help-button').click()");
  await inPage("document.querySelector('.help-replay').click(); document.querySelector('.help-close').click()");
  // The same app page is reloaded to check the preference actually survives, in the smoke profile only.
  await inPage("location.reload()");
  if (!(await until(() => inPage("document.body.dataset.view === 'home' && Boolean(document.querySelector('.help-button'))"),
    { timeoutMs: 15_000 }))) throw new Error("Home did not return after reloading the help preference.");
  await wait(300);
  if (await inPage("Boolean(document.querySelector('.help-dialog[open]'))"))
    throw new Error("The walkthrough kept reappearing after it was dismissed.");
  result.help = { walkthrough: true, back: true, replay: true, remembered: true };
}

/** Ordinary playback, then the same project in the workshop, without an AI request. */
/**
 * "Save video" on a throwaway one-second project: the count moves, a real file lands in the self-test's own
 * Downloads folder, and a message cannot be sent meanwhile. Run last, on its own project.
 */
async function saveStep({ result, inPage, shot, outDir }) {
  const project = await createProject("save test");
  const index = path.join(project.dir, "index.html");
  fs.writeFileSync(index, fs.readFileSync(index, "utf8").replace(/data-duration="[^"]*"/g, 'data-duration="1"'));
  await inPage("[...document.querySelectorAll('button')].find((b) => b.textContent === '← My videos').click()");
  if (!(await until(() => inPage("document.body.dataset.view === 'home'"), { timeoutMs: 10_000 })))
    throw new Error("Could not return Home before the save check.");
  const nativeDialog = dialog.showOpenDialog;
  try {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project.dir] });
    await inPage("[...document.querySelectorAll('button')].find((b) => b.textContent === 'Open a folder').click()");
    if (!(await until(() => inPage("document.body.dataset.studio === 'loaded'"), { timeoutMs: 120_000 })))
      throw new Error("The project for the save check did not open.");
  } finally { dialog.showOpenDialog = nativeDialog; }
  await inPage("[...document.querySelectorAll('.edit-action')].find((b) => b.textContent === 'Save the video').click(); document.querySelector('.edit-action-use').click()");
  if (!(await until(() => inPage("document.body.dataset.save === 'saving'"), { timeoutMs: 10_000 })))
    throw new Error("Save video did not start: " + (await inPage("document.querySelector('.save-status').textContent")));
  await shot("saving");
  if (!(await until(() => inPage("document.body.dataset.save !== 'saving'"), { timeoutMs: 300_000, everyMs: 500 })))
    throw new Error("Saving the video never finished.");
  const said = await inPage("document.querySelector('.save-status').textContent");
  if ((await inPage("document.body.dataset.save")) !== "saved") throw new Error("The video was not saved: " + said);
  const folder = path.join(outDir, "downloads");
  const files = fs.readdirSync(folder).filter((name) => name.endsWith(".mp4"));
  if (files.length !== 1 || fs.statSync(path.join(folder, files[0])).size < 1000)
    throw new Error("Saving reported success, but no video file is in the Downloads folder.");
  if (!said.includes(files[0])) throw new Error("The page did not name the saved file.");
  if (await inPage("document.querySelector('.save-show').hidden")) throw new Error("There is no way to show the saved file.");
  await shot("saved");
  result.saved = { file: files[0], bytes: fs.statSync(path.join(folder, files[0])).size, seconds: durationOf(path.join(folder, files[0])) };
}

/**
 * In "Edit by hand", while the video plays, a real arrow key skips ten seconds and the video keeps playing.
 * Paused, or with the keyboard in the chat box, the key is left alone. Keys are sent the way Windows sends them.
 */
async function editorArrowStep({ win, result, inPage }) {
  const page = win.webContents;
  const frames = () => page.mainFrame.framesInSubtree;
  const studioUrl = await inPage("document.querySelector('iframe[title=\"HyperFrames Studio\"]').src");
  const studio = frames().find((frame) => frame.parent === page.mainFrame &&
    frame.url.split("?")[0] === studioUrl.split("?")[0]);
  const picture = frames().find((frame) => frame.parent === studio && /\/preview(\?|\/|$)/.test(frame.url));
  if (!studio || !picture) throw new Error("The editor's picture was not found for the arrow-key check.");
  const press = (label) => studio.executeJavaScript(
    `(() => { const b = [...document.querySelectorAll('button')].find((b) => ${label}.test(b.getAttribute('aria-label') || b.title || ''));
      if (!b) return false; b.click(); b.blur(); return true; })()`, true);
  const now = () => picture.executeJavaScript("({ time: window.__player.getTime(), playing: window.__player.isPlaying() })");
  const key = async (keyCode) => {
    page.sendInputEvent({ type: "keyDown", keyCode });
    page.sendInputEvent({ type: "keyUp", keyCode });
    await wait(700);
    return now();
  };
  const inEditor = "document.querySelector('iframe[title=\"HyperFrames Studio\"]').focus()";
  win.focus();
  page.focus();
  await inPage(inEditor);
  await picture.executeJavaScript("window.__player.seek(20)", true);
  await wait(300);
  if (!(await press("/^play/i"))) throw new Error("The editor's Play button was not found.");
  if (!(await until(async () => (await now()).playing, { timeoutMs: 5000 })))
    throw new Error("The editor did not start playing for the arrow-key check.");
  await inPage(inEditor);
  await wait(600);
  const start = await now();
  const forward = await key("Right");
  if (!forward.playing || forward.time - start.time < 9 || forward.time - start.time > 13)
    throw new Error(`The right arrow in the editor did not skip ten seconds and keep playing (${start.time.toFixed(2)} to ${forward.time.toFixed(2)}, playing ${forward.playing}).`);
  const back = await key("Left");
  if (!back.playing || forward.time - back.time < 7 || forward.time - back.time > 11)
    throw new Error(`The left arrow in the editor did not skip back ten seconds and keep playing (${forward.time.toFixed(2)} to ${back.time.toFixed(2)}).`);
  // With the keyboard in the chat box the arrow moves the text cursor, not the video.
  await inPage("document.querySelector('.composer textarea').focus()");
  await wait(400);
  const typing = await now();
  const typed = await key("Right");
  if (typed.time - typing.time > 3) throw new Error("An arrow typed in the chat box moved the video in the editor.");
  // Paused, the editor keeps its own key: one frame, not ten seconds.
  await inPage(inEditor);
  await press("/^pause/i");
  if (!(await until(async () => !(await now()).playing, { timeoutMs: 5000 })))
    throw new Error("The editor did not pause for the arrow-key check.");
  await inPage(inEditor);
  await wait(600);
  const paused = await now();
  const stepped = await key("Right");
  if (stepped.playing || Math.abs(stepped.time - paused.time) > 1)
    throw new Error("Paused, the right arrow in the editor did more than the editor's own one-frame step.");
  result.editorArrows = {
    skipsWhilePlaying: true, keepsPlaying: true, chatBoxKeepsItsArrows: true,
    pausedStepSeconds: Math.round((stepped.time - paused.time) * 1000) / 1000,
  };
}

async function playerStep({ win, result, inPage, shot, dir, hasAudio }) {
  if (!(await inPage("document.body.dataset.screen === 'watch' && Boolean(document.querySelector('.player'))")))
    throw new Error("A video did not open on the simple player screen.");
  const frames = () => win.webContents.mainFrame.framesInSubtree;
  const frame = frames().find((item) => item.parent === win.webContents.mainFrame && /\/preview(\?|$)/.test(item.url));
  if (!frame) throw new Error("The simple player has no video frame.");
  const state = () => frames().find((item) => item.parent === win.webContents.mainFrame && /\/preview(\?|$)/.test(item.url))
    .executeJavaScript("({ time: window.__player.getTime(), duration: window.__player.getDuration(), playing: window.__player.isPlaying() })");
  const seek = async (time) => {
    await inPage(`(() => { const bar = document.querySelector('.player-seek'); bar.value = ${time}; bar.dispatchEvent(new Event('input')); })()`);
    if (!(await until(async () => Math.abs((await state()).time - time) < 0.15, { timeoutMs: 5000 })))
      throw new Error("Dragging the playback bar did not move the video.");
  };
  if (!(await until(() => inPage("document.querySelector('.player-play')?.disabled === false"), { timeoutMs: 10_000 })))
    throw new Error("The video loaded but its playback controls stayed disabled.");
  const draft = await inPage("document.querySelector('.composer textarea').value");
  await inPage("document.querySelector('.help-button').click()");
  if (!(await inPage("document.querySelector('.help-content details[data-help=watch]').open")))
    throw new Error("Help did not explain the watching screen first.");
  const beforeHelp = await state();
  await inPage("document.querySelector('.help-title').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); document.querySelector('.help-title').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }))");
  await wait(300);
  const afterHelp = await state();
  if (Math.abs(afterHelp.time - beforeHelp.time) > 0.2 || afterHelp.playing !== beforeHelp.playing)
    throw new Error("Keyboard navigation in Help unexpectedly controlled the video underneath.");
  await shot("help-watch");
  await inPage("document.querySelector('.help-close').click()");
  if ((await inPage("document.querySelector('.composer textarea').value")) !== draft)
    throw new Error("Opening Help changed the message draft.");
  await seek(2.375);
  if (!(await until(() => inPage("document.querySelector('.chat-moment')?.textContent === 'At 0:02' && !document.querySelector('.chat-moment').hidden"),
    { timeoutMs: 5000 }))) throw new Error("The message box does not show the video's current moment.");
  if ((await inPage("document.querySelector('.composer textarea').value")) !== draft)
    throw new Error("Updating the current moment changed the chat draft.");
  result.chatMoment = { followsSeek: true };
  await shot("chat-moment");
  const labels = await inPage("[...document.querySelectorAll('.edit-action')].map((b) => b.textContent)");
  if (!["Fix the sound", "Add subtitles", "Make it shorter", "Add music", "Change the look",
    "Add a title", "Save the video"].every((label) => labels.includes(label)))
    throw new Error("The plain editing buttons are missing.");
  for (const label of labels) {
    await inPage(`[...document.querySelectorAll('.edit-action')].find((b) => b.textContent === ${inJs(label)}).click()`);
    if (!(await inPage("Boolean(document.querySelector('.edit-action-dialog[open]'))")))
      throw new Error(`The ${label} button did not explain what will happen.`);
    if ((await inPage("document.querySelector('.composer textarea').value")) !== draft ||
      (await inPage("document.body.dataset.agent")) !== "idle")
      throw new Error("An editing button sent a request or replaced the draft before the person chose to.");
    if (["Fix the sound", "Add subtitles", "Add music", "Save the video"].includes(label))
      await shot(`editing-${label.toLowerCase().replaceAll(" ", "-")}`);
    await inPage("document.querySelector('.edit-action-close').click()");
  }
  await inPage("[...document.querySelectorAll('.edit-action')].find((b) => b.textContent === 'Add a title').click(); document.querySelector('.edit-action-use').click()");
  const addedDraft = await inPage("document.querySelector('.composer textarea').value");
  if (!addedDraft.startsWith(draft) || !addedDraft.includes("Add a title that says:") ||
    (await inPage("document.body.dataset.agent")) !== "idle")
    throw new Error("The title button did not prepare a request while preserving the existing draft.");
  await inPage(`document.querySelector('.composer textarea').value = ${inJs(draft)}`);
  result.editingButtons = { explainFirst: true, draftOnly: true, preserveDraft: true };
  await shot("player");
  const originalSize = win.getSize();
  win.setSize(960, 600);
  await wait(400);
  const fits = await inPage("(() => { const box = document.querySelector('.player').getBoundingClientRect(); return [...document.querySelectorAll('.player-buttons button,.player-buttons input')].every((item) => { const r = item.getBoundingClientRect(); return r.left >= box.left && r.right <= box.right && r.bottom <= innerHeight; }); })()");
  if (!fits) throw new Error("The playback controls do not fit the app's smallest window.");
  if (!(await inPage("(() => { const box = document.querySelector('.composer').getBoundingClientRect(); return box.bottom <= innerHeight && document.querySelector('.chat-log').clientHeight >= 80 && [...document.querySelectorAll('.edit-action')].every((b) => b.getBoundingClientRect().height >= 44); })()")))
    throw new Error("The editing buttons or message box do not fit the app's smallest window.");
  await inPage("document.querySelector('.help-button').click()");
  if (!(await inPage("(() => { const box = document.querySelector('.help-dialog').getBoundingClientRect(); const close = document.querySelector('.help-close').getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && close.bottom <= innerHeight; })()")))
    throw new Error("Help or its Close button does not fit the smallest window.");
  await shot("help-small-window");
  await inPage("document.querySelector('.help-close').click()");
  await shot("player-small-window");
  win.setSize(...originalSize);
  await wait(300);
  await seek(1);
  await inPage("document.querySelector('.player-play').click()");
  if (!(await until(async () => { const got = await state(); return got.playing && got.time > 1.1; },
    { timeoutMs: 5000 }))) throw new Error("Play did not start a moving picture.");
  if (hasAudio && !(await until(() => win.webContents.isCurrentlyAudible(), { timeoutMs: 5000 })))
    throw new Error("The simple player moved the picture but did not play its sound.");
  await inPage("document.querySelector('.player-play').focus(); document.querySelector('.player-play').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }))");
  if (!(await until(async () => { const got = await state(); return got.playing && got.time < 1; },
    { timeoutMs: 3000 }))) throw new Error("The back arrow paused the video instead of skipping while playing.");
  if (hasAudio) {
    await inPage("document.querySelector('.player-mute').click()");
    if (!(await until(() => !win.webContents.isCurrentlyAudible(), { timeoutMs: 3000 })))
      throw new Error("Muting the simple player did not stop its sound.");
    await inPage("document.querySelector('.player-mute').click()");
    if (!(await until(() => win.webContents.isCurrentlyAudible(), { timeoutMs: 3000 })))
      throw new Error("Restoring sound in the simple player did not work.");
  }
  await inPage("document.querySelector('.player-play').focus(); document.querySelector('.player-play').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))");
  if (!(await until(async () => { const got = await state(); return got.playing && got.time >= 10; },
    { timeoutMs: 3000 }))) throw new Error("The forward arrow paused the video instead of skipping while playing.");
  await inPage("document.querySelector('.player-play').click()");
  if (!(await until(async () => !(await state()).playing, { timeoutMs: 3000 })))
    throw new Error("Pause did not stop the player.");
  const duration = (await state()).duration;
  await seek(Math.min(2, duration / 2));
  await inPage("document.querySelector('.player-forward').click()");
  const afterForward = await state();
  if (afterForward.time < Math.min(12, duration) - 0.2 || afterForward.playing)
    throw new Error("Forward ten seconds did not keep a paused video paused.");
  await inPage("document.querySelector('.player-back').click()");
  const afterBack = await state();
  if (Math.abs(afterBack.time - Math.max(0, afterForward.time - 10)) > 0.2)
    throw new Error("Back ten seconds did not stop at the beginning.");
  if (hasAudio) {
    const shown = async () => {
      const current = frames().find((item) => item.parent === win.webContents.mainFrame && /\/preview(\?|$)/.test(item.url));
      const got = await current.executeJavaScript(`(() => { const video = document.querySelector('video'); const css = getComputedStyle(video);
        return { time: video.currentTime, playerTime: window.__player.getTime(), seeking: video.seeking, ready: video.readyState,
          display: css.display, opacity: css.opacity, visibility: css.visibility }; })()`);
      result.pausedPicture = got;
      return got.display !== "none" && got.visibility !== "hidden" && Number(got.opacity) > 0 &&
        !got.seeking && got.ready >= 2 && Math.abs(got.time - got.playerTime) < 0.2;
    };
    if (!(await until(shown, { timeoutMs: 5000 })))
      throw new Error("Scrubbing back from past the clip's end did not restore its picture.");
    await wait(250);
    await shot("player-scrubbed");
  }
  await inPage("document.querySelector('.player-mute').click()");
  if (!(await inPage("document.querySelector('.player-mute').getAttribute('aria-pressed') === 'true'")))
    throw new Error("The sound control did not show that sound is muted.");
  await inPage("document.querySelector('.player-mute').click()");
  await inPage("document.querySelector('.player-fullscreen').click()");
  // Windows gives full screen only to the window in front. With another program (or a second self-test) in
  // front, the window grows to the screen's size and the page never hears that it is full screen: seen twice on
  // the owner's PC, with any length of wait. That is not a fault in the player, so it is noted, not failed.
  const wentFull = await until(() => inPage("document.fullscreenElement?.classList.contains('player')"), { timeoutMs: 8000 });
  if (!wentFull && win.isFocused()) throw new Error("Full screen did not open the player.");
  if (wentFull) {
    await wait(250);
    await shot("player-fullscreen");
    await inPage("document.querySelector('.player-help').click()");
    if (!(await inPage("document.querySelector('.help-dialog').open")))
      throw new Error("Help is not reachable in full-screen playback.");
    await shot("help-fullscreen");
    await inPage("document.querySelector('.help-close').click()");
    await inPage("document.exitFullscreen()");
  } else {
    result.fullscreenNotChecked = "Another window was in front, and Windows gives full screen only to the window in front.";
    win.setFullScreen(false);
    await wait(1500);
  }
  await inPage("document.querySelector('.composer textarea').focus(); document.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))");
  await wait(300);
  if (Math.abs((await state()).time - afterBack.time) > 0.2)
    throw new Error("Typing in chat unexpectedly moved the video.");

  // A real file edit must reach the simple screen too; only this throwaway project is changed.
  const index = path.join(dir, "index.html");
  const original = fs.readFileSync(index, "utf8");
  fs.writeFileSync(index, original.replace("</head>", "<meta name=\"player-smoke\" content=\"updated\"></head>"));
  const updated = () => {
    const current = frames().find((item) => item.parent === win.webContents.mainFrame && /\/preview(\?|$)/.test(item.url));
    return current?.executeJavaScript("window.__renderReady === true && Boolean(document.querySelector('meta[name=player-smoke]'))").catch(() => false);
  };
  if (!(await until(updated, { timeoutMs: 30_000 }))) throw new Error("The player did not refresh after a video edit.");
  const playerUrl = await inPage("document.querySelector('.player iframe').src");
  fs.writeFileSync(path.join(dir, ".hyperframes", "player-smoke.json"), "{}");
  await wait(1200);
  if ((await inPage("document.querySelector('.player iframe').src")) !== playerUrl)
    throw new Error("A saved chat note unnecessarily reloaded the video.");

  fs.writeFileSync(index, fs.readFileSync(index, "utf8")
    .replace('data-width="1920"', 'data-width="1080"').replace('data-height="1080"', 'data-height="1920"')
    .replaceAll("width: 1920px", "width: 1080px").replaceAll("height: 1080px", "height: 1920px"));
  const portrait = () => {
    const current = frames().find((item) => item.parent === win.webContents.mainFrame && /\/preview(\?|$)/.test(item.url));
    return current?.executeJavaScript("window.__renderReady === true && document.querySelector('[data-composition-id]')?.getAttribute('data-width') === '1080'").catch(() => false);
  };
  if (!(await until(portrait, { timeoutMs: 30_000 }))) throw new Error("The portrait video did not load.");
  if (!(await until(() => inPage("(() => { const r = document.querySelector('.player iframe').getBoundingClientRect(); return r.height > r.width; })()"),
    { timeoutMs: 5000 }))) throw new Error("The portrait picture did not fit the player.");
  await shot("player-portrait");
  result.player = { playback: true, arrowsKeepPlaying: true, seek: true, fullscreen: wentFull,
    sound: hasAudio ? true : "No FFmpeg for the audio fixture", editRefresh: true, portrait: true,
    ignoresJournal: true, smallWindow: true };
  await shot("player-updated");
  if (!(await until(() => inPage("document.body.dataset.studio === 'loaded'"), { timeoutMs: 10_000 })))
    throw new Error("The portrait player's controls did not finish loading.");
  await seek(1);
  await inPage("document.querySelector('.player-play').click()");
  if (!(await until(async () => (await state()).playing, { timeoutMs: 3000 })))
    throw new Error("The video could not play before switching to the editor.");
  await inPage("document.querySelector('.editor-toggle').click()");
  await wait(2000);
  result.editorFrames = frames().map((item) => ({ url: item.url, parent: item.parent?.url }));
  if (!(await until(() => inPage("document.body.dataset.screen === 'edit' && document.body.dataset.studio === 'loaded'"),
    { timeoutMs: 60_000 }))) throw new Error("Edit by hand did not open the full editor.");
  if ((await inPage("document.querySelector('.composer textarea').value")) !== draft)
    throw new Error("Switching to the editor lost the chat draft.");
  if (hasAudio && !(await until(() => !win.webContents.isCurrentlyAudible(), { timeoutMs: 3000 })))
    throw new Error("The hidden player kept making sound inside the editor.");
  if (!(await inPage("document.querySelector('.chat-moment').hidden")))
    throw new Error("The simple player's moment leaked into the editor.");
  await shot("editor");
  await editorArrowStep({ win, result, inPage });
  if (!(await inPage("document.querySelector('.editor-words')?.textContent.includes('Inspector') && document.querySelector('.editor-words').textContent.includes('Change it')")))
    throw new Error("The full editor has no plain explanation of its words.");
  await inPage("document.querySelector('.help-button').click()");
  if (!(await inPage("document.querySelector('.help-content details[data-help=edit]').open")))
    throw new Error("Help did not explain the full editor first.");
  await shot("help-editor");
  await inPage("document.querySelector('.help-close').click()");
  await inPage("document.querySelector('.editor-toggle').click()");
  if (!(await until(() => inPage("document.body.dataset.screen === 'watch' && document.body.dataset.studio === 'loaded'"),
    { timeoutMs: 60_000 }))) throw new Error("Watch video did not return to the simple player.");
  if ((await inPage("document.querySelector('.composer textarea').value")) !== draft)
    throw new Error("Returning to the player lost the chat draft.");
  if ((await state()).playing) throw new Error("Returning to the player unexpectedly started playback.");
  if (!(await until(() => inPage("!document.querySelector('.chat-moment').hidden"), { timeoutMs: 5000 })))
    throw new Error("Returning to the player did not restore its moment beside the message box.");
  result.chatMoment.switchViews = true;
  await inPage("document.querySelector('.editor-toggle').click()");
  if (!(await until(() => inPage("document.body.dataset.screen === 'edit' && document.body.dataset.studio === 'loaded'"),
    { timeoutMs: 60_000 }))) throw new Error("The full editor could not be reopened.");
  result.player.switchViews = true;
  result.player.hiddenPlaybackStops = true;
  result.editingButtons.opensEditor = true;
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
    { timeoutMs: 10_000 }))) {
    result.studyReviewState = await inPage("(() => { const img = document.querySelector('.footage-review[open] img'); const r = img?.getBoundingClientRect(); return { image: Boolean(img), complete: img?.complete, loading: img?.loading, naturalWidth: img?.naturalWidth, srcKind: img?.src.slice(0, 32), bounds: r && { x: r.x, y: r.y, width: r.width, height: r.height } }; })()");
    throw new Error("The saved frame sheet could not be reviewed in the app.");
  }
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
  // Optional context check: one tiny real turn from the watching screen instead of an editor selection.
  const at = process.env.HFWIN_SMOKE_AT;
  if (at !== undefined) {
    if (!Number.isFinite(Number(at)) || Number(at) < 0) throw new Error("Use a valid smoke playback time.");
    if (await inPage("document.body.dataset.screen === 'edit'"))
      await inPage("document.querySelector('.editor-toggle').click()");
    if (!(await until(() => inPage("document.body.dataset.studio === 'loaded'"), { timeoutMs: 60_000 })))
      throw new Error("The watching screen did not load for the chat moment check.");
    await inPage(`(() => { const bar = document.querySelector('.player-seek'); bar.value = ${Number(at)}; bar.dispatchEvent(new Event('input')); })()`);
    const seconds = Math.floor(Number(at));
    const when = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    if (!(await until(() => inPage(`document.querySelector('.chat-moment').textContent === ${inJs(`At ${when}`)}`),
      { timeoutMs: 5000 }))) throw new Error("The requested chat moment did not appear.");
    result.expectedMoment = when;
  }
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
  if (result.expectedMoment) {
    const saved = JSON.parse(fs.readFileSync(path.join(dir, ".hyperframes", "studio-win-chat.json"), "utf8"));
    result.sentMoment = saved.messages.filter((message) => message.role === "user").at(-1)?.moment;
    if (result.sentMoment?.when !== result.expectedMoment)
      throw new Error("The sent message lost its current video moment.");
    if (!(await inPage(`document.querySelector('.msg.user .msg-pointing')?.textContent === ${inJs(`At ${result.expectedMoment}`)}`)))
      throw new Error("The message on screen does not show the moment that was sent.");
  }
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
  const studioUrl = await inPage("document.querySelector('iframe[title=\"HyperFrames Studio\"]').src");
  const studio = page.mainFrame.framesInSubtree.find((frame) => frame.parent === page.mainFrame &&
    frame.url.split("?")[0] === studioUrl.split("?")[0]);
  if (!studio) throw new Error("The full editor has no browser frame.");
  const outer = await inPage("(() => { const r = document.querySelector('iframe[title=\"HyperFrames Studio\"]').getBoundingClientRect(); return { x: r.x, y: r.y }; })()");
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
  await inPage("document.querySelector('.editor-toggle').click()");
  if (!(await until(() => inPage("document.body.dataset.screen === 'edit' && document.body.dataset.studio === 'loaded'"),
    { timeoutMs: 60_000 }))) throw new Error("The project did not switch to its editor for the sound probe.");
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
  const studioUrl = await inPage("document.querySelector('iframe[title=\"HyperFrames Studio\"]').src");
  const studio = frames().find((frame) => frame.parent === page.mainFrame &&
    frame.url.split("?")[0] === studioUrl.split("?")[0]);
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
      // An occluded Windows window can otherwise give the last painted frame of a long assistant turn.
      page.invalidate();
      await wait(100);
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
    await helpStep({ win, result, inPage, shot });
    await wait(400);
    await shot("home");
    // HFWIN_SMOKE_JUST_ASK with HFWIN_SMOKE_REAL_PROJECT and an agent: one real job on a real project, without
    // the self-test's own steps. The request goes from the editor screen, so it carries no "At 0:00".
    if (process.env.HFWIN_SMOKE_JUST_ASK && process.env.HFWIN_SMOKE_REAL_PROJECT && process.env.HFWIN_SMOKE_AGENT) {
      const dir = process.env.HFWIN_SMOKE_REAL_PROJECT;
      page.send("app:open-project", { dir });
      if (!(await until(() => inPage("document.body.dataset.studio === 'loaded'"), { timeoutMs: 180_000 })))
        throw new Error("The project did not open.");
      await inPage("document.querySelector('.editor-toggle').click()");
      if (!(await until(() => inPage("document.body.dataset.screen === 'edit' && document.body.dataset.studio === 'loaded'"),
        { timeoutMs: 90_000 }))) throw new Error("The project did not switch to its editor.");
      await agentStep({ result, inPage, shot, dir });
      result.ok = true;
      fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
      return app.exit(0);
    }
    if (process.env.HFWIN_SMOKE_PLAYBACK && process.env.HFWIN_SMOKE_REAL_PROJECT) {
      await playbackProbe({ win, outDir, result, shot });
      result.ok = true;
      fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
      return app.exit(0);
    }
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
      await inPage("[...document.querySelectorAll('button')].find((b) => b.textContent === 'Choose clips').click()");
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
    const fixtureIndex = path.join(project.dir, "index.html");
    const starter = fs.readFileSync(fixtureIndex, "utf8").replaceAll('data-duration="10"', 'data-duration="70"');
    if (hasFfmpeg) {
      const video = '<video id="test-video" class="clip" data-start="0" data-duration="6" ' +
        'data-track-index="1" src="assets/test-clip.mp4" playsinline></video>';
      fs.writeFileSync(fixtureIndex, starter.replace("</style>",
        "#root { position: relative; } #test-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; } " +
        "#title { position: relative; z-index: 1; text-shadow: 0 2px 12px black; }</style>")
        .replace(/<h1\b/, `${video}<h1`));
    } else fs.writeFileSync(fixtureIndex, starter);

    const framed = await until(() => inPage("document.body.dataset.studio === 'loaded'"), {
      timeoutMs: 120_000,
    });
    if (!framed) {
      result.pageError = await inPage("document.body.dataset.error ?? ''");
      throw new Error(`Studio never loaded. ${result.pageError}`);
    }
    result.playerUrl = await inPage("document.querySelector('.player iframe')?.src ?? ''");
    // Studio paints its panels, then the composition's first frame.
    await wait(8000);
    await shot("project");
    result.importDraft = await inPage("document.querySelector('.composer textarea').value");
    if (!result.importDraft.includes("sideways")) throw new Error("No request to look at the new clips was prepared.");
    await playerStep({ win, result, inPage, shot, dir: project.dir, hasAudio: hasFfmpeg });
    result.studioUrl = await inPage("document.querySelector('iframe[title=\"HyperFrames Studio\"]').src");
    await accessStep({ result, inPage, shot });
    if (hasFfmpeg) await studyStep({ result, inPage, shot, dir: project.dir, outDir });
    let chatProject = project.dir;
    const realProject = process.env.HFWIN_SMOKE_REAL_PROJECT;
    if (realProject) {
      await inPage("[...document.querySelectorAll('button')].find((b) => b.textContent === '← My videos').click()");
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
      const savedChat = path.join(realProject, ".hyperframes", "studio-win-chat.json");
      if (fs.existsSync(savedChat)) {
        const saved = JSON.parse(fs.readFileSync(savedChat, "utf8"));
        const moment = saved.messages?.filter((message) => message.role === "user").at(-1)?.moment;
        if (moment) {
          const shown = await inPage("[...document.querySelectorAll('.msg.user .msg-pointing')].at(-1)?.textContent");
          if (shown !== `At ${moment.when}`) throw new Error("Reopening a video lost its saved message moment.");
          result.reloadedMoment = moment;
          result.reloadedTitle = await frame.executeJavaScript("document.querySelector('#title')?.textContent");
        }
      }
      await wait(1000);
      await shot("real-project");
      result.realProject = realProject;
      chatProject = realProject;
      await inPage("document.querySelector('.editor-toggle').click()");
      if (!(await until(() => inPage("document.body.dataset.screen === 'edit' && document.body.dataset.studio === 'loaded'"),
        { timeoutMs: 60_000 }))) throw new Error("The real project did not switch to its editor.");
    }
    await pointingStep({ win, result, inPage, shot });
    if (process.env.HFWIN_SMOKE_AGENT) await agentStep({ result, inPage, shot, dir: chatProject });
    await saveStep({ result, inPage, shot, outDir });
    result.ok = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    await shot("failure").catch(() => {});
  }

  fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
  app.exit(result.ok ? 0 : 1);
}
