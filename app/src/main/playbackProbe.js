// `HFWIN_SMOKE_PLAYBACK` with `HFWIN_SMOKE_REAL_PROJECT`: play a real project the way a person does and count
// what they would see as "stuck": frames the browser dropped, how long the picture holds at each cut, pauses
// inside a clip, and whether the clock kept time. Written for the owner's report that the preview is "stuck
// stuck" (2026-10-13); kept because only a real window with real footage can tell. It changes no project file.
//
//   HFWIN_SMOKE_PLAYBACK=watch,edit   which screens to measure (default: both)
//   HFWIN_SMOKE_PLAYBACK_AT=0:45,120:30   "start:seconds" stretches to play (default: these two)
import fs from "node:fs";
import path from "node:path";

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

async function until(check, { timeoutMs, everyMs = 250 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await wait(everyMs);
  }
  return false;
}

// Runs in the composition's frame. Every picture a <video> really puts on screen is logged by the browser's
// own per-frame callback, so a hold is measured, not guessed from the clock.
function recordInFrame() {
  const t0 = performance.now();
  const videos = [...document.querySelectorAll("video")];
  const rec = (window.__hfwinProbe = { frames: {}, gaps: [], samples: [], before: {}, stop: false });
  for (const video of videos) {
    const quality = video.getVideoPlaybackQuality();
    rec.before[video.id] = [quality.totalVideoFrames, quality.droppedVideoFrames];
    const list = (rec.frames[video.id] = []);
    const tick = (now, meta) => {
      list.push([Math.round(now - t0), Math.round(meta.mediaTime * 1000)]);
      if (!rec.stop) video.requestVideoFrameCallback(tick);
    };
    video.requestVideoFrameCallback(tick);
  }
  let last = t0;
  const loop = (now) => {
    if (now - last > 50) rec.gaps.push([Math.round(now - t0), Math.round(now - last)]);
    last = now;
    const on = videos.filter((video) => !video.paused)
      .map((video) => [video.id, Math.round(video.currentTime * 1000), video.readyState, video.seeking ? 1 : 0]);
    rec.samples.push([Math.round(now - t0), Math.round(window.__player.getTime() * 1000), on]);
    if (!rec.stop) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return videos.map((video) => ({
    id: video.id, start: Number(video.dataset.start), duration: Number(video.dataset.duration),
    mediaStart: Number(video.dataset.mediaStart) || 0, src: video.getAttribute("src"), preload: video.preload,
  }));
}

function collectInFrame() {
  const rec = window.__hfwinProbe;
  rec.stop = true;
  const quality = {};
  for (const video of document.querySelectorAll("video")) {
    const now = video.getVideoPlaybackQuality();
    const [total, dropped] = rec.before[video.id] ?? [0, 0];
    if (now.totalVideoFrames > total)
      quality[video.id] = { shown: now.totalVideoFrames - total, dropped: now.droppedVideoFrames - dropped };
  }
  return { frames: rec.frames, gaps: rec.gaps, samples: rec.samples, quality, visible: document.visibilityState };
}

// Runs in a frame: from now on, every task that blocks the frame for over 50 ms is logged. A blocked page is
// what a person feels as a control that "lags": a click, a drag or a key waits until the task ends.
function watchLongTasksInFrame() {
  if (window.__hfwinLong) return true;
  const log = (window.__hfwinLong = []);
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) log.push([Math.round(entry.startTime), Math.round(entry.duration)]);
    }).observe({ type: "longtask", buffered: true });
  } catch { return false; }
  return true;
}

// Runs in a frame: the long tasks logged since the last call, as a count, the total time blocked and the worst.
function takeLongTasksInFrame() {
  const log = window.__hfwinLong ?? [];
  const taken = log.splice(0, log.length);
  return { count: taken.length, blockedMs: taken.reduce((sum, [, ms]) => sum + ms, 0), worstMs: Math.max(0, ...taken.map(([, ms]) => ms)) };
}

// Runs in the composition's frame. A jump to a moment, the way a click on the timeline makes one: the time from
// the jump to the first picture of that moment on screen, for every clip showing there. Then a drag of the
// playhead: thirty small jumps in a row, as fast as a hand moves it, counting how many different pictures the
// person saw on the way and how long the last one took to arrive after the hand stopped.
async function seekAndDragInFrame(targets, drag) {
  const videos = [...document.querySelectorAll("video")];
  const showing = (at) => videos.filter((video) => {
    const start = Number(video.dataset.start);
    return at >= start && at < start + Number(video.dataset.duration);
  });
  const want = (video, at) => at - Number(video.dataset.start) + (Number(video.dataset.mediaStart) || 0);
  const pictureAt = (video, at, since, timeoutMs = 8000) => new Promise((done) => {
    let over = false;
    const timer = setTimeout(() => { over = true; done(null); }, timeoutMs);
    const tick = (now, meta) => {
      if (over) return;
      if (Math.abs(meta.mediaTime - want(video, at)) < 0.1) { clearTimeout(timer); done(Math.round(now - since)); }
      else video.requestVideoFrameCallback(tick);
    };
    video.requestVideoFrameCallback(tick);
  });
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));
  const jumps = [];
  for (const at of targets) {
    await pause(600);
    const since = performance.now();
    const waits = showing(at).map((video) => pictureAt(video, at, since));
    await window.__player.seek(at);
    const answered = Math.round(performance.now() - since);
    const pictures = await Promise.all(waits);
    jumps.push({ at, answeredMs: answered, pictureMs: pictures.some((ms) => ms === null) ? null : Math.max(0, ...pictures) });
  }

  await pause(600);
  const seen = new Set();
  let stop = false;
  for (const video of videos) {
    const tick = (_now, meta) => {
      seen.add(`${video.id}:${Math.round(meta.mediaTime * 30)}`);
      if (!stop) video.requestVideoFrameCallback(tick);
    };
    video.requestVideoFrameCallback(tick);
  }
  const { from, to, steps, everyMs } = drag;
  const began = performance.now();
  for (let i = 0; i < steps; i++) {
    window.__player.seek(from + ((to - from) * i) / steps);
    await pause(everyMs);
  }
  const handStopped = performance.now();
  const last = showing(to).map((video) => pictureAt(video, to, handStopped));
  window.__player.seek(to);
  const settled = await Promise.all(last);
  stop = true;
  return {
    jumps,
    drag: {
      ...drag, seconds: Math.round((handStopped - began) / 100) / 10, picturesSeen: seen.size,
      lastPictureMs: settled.some((ms) => ms === null) ? null : Math.max(0, ...settled),
    },
  };
}

/** The middle of the jump times, the slowest, and how many never showed their picture. Exported for the test. */
export function jumpSummary(jumps) {
  const times = jumps.map((jump) => jump.pictureMs).filter((ms) => ms !== null).sort((a, b) => a - b);
  return {
    jumps: jumps.length,
    middleMs: times.length ? times[Math.floor((times.length - 1) / 2)] : null,
    slowestMs: times.length ? times.at(-1) : null,
    neverShown: jumps.length - times.length,
  };
}

/** Moments spread over the whole video, none on a whole second, so no jump lands on a keyframe by luck. */
export function jumpTargets(duration, count = 8) {
  const spread = [0.13, 0.71, 0.37, 0.88, 0.22, 0.56, 0.95, 0.04, 0.45, 0.66];
  return spread.slice(0, count).map((part) => Math.floor(duration * part) + 0.37)
    .filter((at) => at < duration - 0.5);
}

/** Turn the raw log into the few numbers a person can read. Exported for the unit test. */
export function summarise({ clips, frames, gaps, samples, quality, visible }, { from, seconds }) {
  const playing = samples.filter(([, time]) => time > from * 1000 + 50);
  // A clip's first picture is drawn when the page loads, long before its turn. Only pictures drawn while the
  // clip was really playing count, so each clip is measured from the moment it started.
  const turn = (id) => {
    const on = playing.filter(([, , list]) => list.some((item) => item[0] === id));
    return on.length ? { began: on[0][0], ended: on.at(-1)[0] } : null;
  };
  const shown = clips.map((clip) => ({ ...clip, turn: turn(clip.id) })).filter((clip) => clip.turn)
    .map((clip) => ({
      ...clip,
      ready: (frames[clip.id] ?? []).some(([ms]) => ms < clip.turn.began),
      log: (frames[clip.id] ?? []).filter(([ms]) => ms >= clip.turn.began && ms <= clip.turn.ended + 20),
    }))
    .filter((clip) => clip.log.length > 1)
    .sort((a, b) => a.turn.began - b.turn.began);
  const perClip = shown.map(({ id, log, turn: { began, ended }, ready }) => {
    const span = (log.at(-1)[0] - log[0][0]) / 1000;
    const pauses = [];
    let backwards = 0;
    for (let i = 1; i < log.length; i++) {
      const held = log[i][0] - log[i - 1][0];
      if (held > 100) pauses.push({ atMedia: log[i - 1][1] / 1000, heldMs: held });
      if (log[i][1] < log[i - 1][1]) backwards++;
    }
    return {
      id, pictures: log.length, perSecond: span > 0 ? Math.round(((log.length - 1) / span) * 10) / 10 : 0,
      dropped: quality[id]?.dropped ?? 0, firstPictureReadyBeforeItsTurn: ready,
      // From the clip's turn starting to its first moving picture, and from its last new picture to its turn ending.
      slowStartMs: log[0][0] - began, frozenEndMs: Math.max(0, ended - log.at(-1)[0]), steppedBack: backwards, pauses,
    };
  });
  // What a person sees at a join: from the last new picture of one clip to the first moving picture of the next.
  const cuts = [];
  for (let i = 1; i < shown.length; i++) {
    cuts.push({
      from: shown[i - 1].id, to: shown[i].id, at: shown[i].start,
      heldMs: shown[i].log[0][0] - shown[i - 1].log.at(-1)[0],
    });
  }
  // The clock: did the playhead keep real time, did it jump, and for how long did nothing at all play?
  const wall = playing.length > 1 ? (playing.at(-1)[0] - playing[0][0]) / 1000 : 0;
  const moved = playing.length > 1 ? (playing.at(-1)[1] - playing[0][1]) / 1000 : 0;
  let emptyMs = 0;
  let seeks = 0;
  const jumps = [];
  for (let i = 1; i < playing.length; i++) {
    const step = playing[i][1] - playing[i - 1][1];
    if (step < -100 || step > 1000) jumps.push({ afterSeconds: playing[i][0] / 1000, from: playing[i - 1][1] / 1000, to: playing[i][1] / 1000 });
    if (!playing[i][2].length) emptyMs += playing[i][0] - playing[i - 1][0];
    // A seek in the middle of a clip is the player pulling the picture back into step: it shows as a hitch.
    for (const [id, , , seeking] of playing[i][2]) {
      const before = playing[i - 1][2].find((item) => item[0] === id);
      if (seeking && before && !before[3]) seeks++;
    }
  }
  const long = gaps.filter(([, held]) => held > 100);
  return {
    from, seconds, visible,
    clockSpeed: wall > 0 ? Math.round((moved / wall) * 1000) / 1000 : 0,
    playheadJumps: jumps,
    nothingPlayingMs: Math.round(emptyMs),
    resyncSeeks: seeks,
    pageHitches: { over50ms: gaps.length, over100ms: long.length, worstMs: Math.max(0, ...gaps.map(([, held]) => held)) },
    dropped: perClip.reduce((sum, clip) => sum + clip.dropped, 0),
    pictures: perClip.reduce((sum, clip) => sum + clip.pictures, 0),
    cuts, perClip,
  };
}

/** Memory and processor use of the whole app at this moment, by kind of process, for before-and-after. */
async function appLoad() {
  // Imported here so the unit test, which runs in plain Node, can load this file.
  const { app } = await import("electron");
  const load = {};
  for (const { type, memory, cpu } of app.getAppMetrics()) {
    const kind = (load[type] ??= { processes: 0, memoryMb: 0, cpuPercent: 0 });
    kind.processes++;
    kind.memoryMb += Math.round(memory.workingSetSize / 1024);
    kind.cpuPercent += Math.round(cpu.percentCPUUsage);
  }
  return load;
}

export async function playbackProbe({ win, outDir, result, shot }) {
  const page = win.webContents;
  const inPage = (expression) => page.executeJavaScript(expression, true);
  const dir = process.env.HFWIN_SMOKE_REAL_PROJECT;
  const screens = (process.env.HFWIN_SMOKE_PLAYBACK === "1" ? "watch,edit" : process.env.HFWIN_SMOKE_PLAYBACK).split(",");
  const stretches = process.env.HFWIN_SMOKE_PLAYBACK_AT === "none" ? [] :
    (process.env.HFWIN_SMOKE_PLAYBACK_AT || "0:45,120:30").split(",")
      .map((item) => item.split(":").map(Number)).map(([from, seconds]) => ({ from, seconds }));
  const frames = () => page.mainFrame.framesInSubtree;
  const composition = () => frames().find((frame) => /\/preview(\?|$)/.test(frame.url));
  const command = (action, value) =>
    inPage(`window.hfwin.player.command(${JSON.stringify({ dir, action, value })})`);
  const watchLong = (frame) => frame?.executeJavaScript(`(${watchLongTasksInFrame.toString()})()`, true).catch(() => false);
  const takeLong = (frame) => frame?.executeJavaScript(`(${takeLongTasksInFrame.toString()})()`, true).catch(() => null);
  const seconds = (since) => Math.round((Date.now() - since) / 100) / 10;
  result.playback = { project: dir };

  win.show();
  win.focus();
  // The first runs were spoiled by real clicks landing in this window (twelve were counted in one run, and the
  // playhead was dragged). For the length of the measurement the window lets the mouse through to whatever is
  // behind it; the test presses its buttons from inside the page.
  win.setIgnoreMouseEvents(true);
  await watchLong(page.mainFrame);
  const opened = Date.now();
  page.send("app:open-project", { dir });
  if (!(await until(() => inPage("document.body.dataset.studio === 'loaded'"), { timeoutMs: 180_000 })))
    throw new Error("The project did not open.");
  result.playback.openSeconds = seconds(opened);
  await inPage("window.__loads = 0; document.querySelector('.player iframe').addEventListener('load', () => window.__loads++)");

  // Jumps and a drag on whichever screen is showing, with the stalls they caused in each frame and the app's load.
  const jumpAndDrag = async (screen, studio) => {
    const frame = composition();
    await watchLong(frame);
    await takeLong(frame);
    await takeLong(studio);
    await takeLong(page.mainFrame);
    const duration = await frame.executeJavaScript("window.__player.getDuration()", true);
    const at = Math.min(duration * 0.3, 60);
    const raw = await frame.executeJavaScript(`(${seekAndDragInFrame.toString()})(${JSON.stringify(jumpTargets(duration))},
      ${JSON.stringify({ from: at, to: at + 12.3, steps: 30, everyMs: 33 })})`, true);
    fs.writeFileSync(path.join(outDir, `jumps-${screen}.json`), JSON.stringify(raw));
    // Which pictures were really played: 720 high means the lighter copies (lightCopies.js), 1080 the originals.
    const heights = await frame.executeJavaScript(`[...document.querySelectorAll("video")]
      .filter((video) => video.videoHeight).map((video) => Math.min(video.videoWidth, video.videoHeight))`, true);
    return {
      ...jumpSummary(raw.jumps), drag: raw.drag, list: raw.jumps, pictureShortSides: [...new Set(heights)],
      stalls: { video: await takeLong(frame), editor: await takeLong(studio), app: await takeLong(page.mainFrame) },
      load: await appLoad(),
    };
  };

  const measure = async (screen, play, pause, seek) => {
    const runs = [];
    for (const stretch of stretches) {
      await pause();
      await wait(400);
      await seek(stretch.from);
      await wait(2000);
      const frame = composition();
      const clips = await frame.executeJavaScript(`(${recordInFrame.toString()})()`, true);
      const started = await play();
      await wait(stretch.seconds * 500);
      await shot(`playback-${screen}-${stretch.from}`);
      await wait(stretch.seconds * 500);
      const raw = await frame.executeJavaScript(`(${collectInFrame.toString()})()`, true);
      await pause();
      fs.writeFileSync(path.join(outDir, `playback-${screen}-${stretch.from}.json`), JSON.stringify({ clips, ...raw }));
      runs.push({ playPressed: started !== false, ...summarise({ clips, ...raw }, stretch) });
    }
    return runs;
  };

  if (screens.includes("watch")) {
    await wait(3000);
    result.playback.watchLoad = await appLoad();
    result.playback.watch = await measure("watch",
      () => inPage("document.querySelector('.player-play').textContent === 'Play' && document.querySelector('.player-play').click()"),
      () => command("pause"), (at) => command("seek", at));
    result.playback.reloadsWhilePlaying = await inPage("window.__loads");
    await command("pause");
    result.playback.watchJumps = await jumpAndDrag("watch", null);
  }

  if (screens.includes("edit")) {
    const switched = Date.now();
    await inPage("document.querySelector('.editor-toggle').click()");
    if (!(await until(() => inPage("document.body.dataset.screen === 'edit' && document.body.dataset.studio === 'loaded'"),
      { timeoutMs: 90_000 }))) throw new Error("The project did not switch to its editor.");
    result.playback.editorOpenSeconds = seconds(switched);
    result.playback.editorOpenStalls = await takeLong(page.mainFrame);
    await wait(8000);
    await shot("playback-editor-open");
    result.playback.editLoad = await appLoad();
    const studioUrl = await inPage("document.querySelector('iframe[title=\"HyperFrames Studio\"]').src");
    const studio = frames().find((frame) => frame.parent === page.mainFrame &&
      frame.url.split("?")[0] === studioUrl.split("?")[0]);
    await watchLong(studio);
    // Studio's box for errors in the video blurs the whole editor behind it, and a blur over playing video costs
    // as much as the video. A person would close it first; so does the measurement, and says it was there.
    result.playback.editorErrorBox = await studio.executeJavaScript(`(() => {
      const title = [...document.querySelectorAll("*")].find((element) => !element.childElementCount &&
        /errors? in preview/i.test(element.textContent));
      let box = title;
      while (box && !box.querySelector("button")) box = box.parentElement;
      const close = box && [...box.querySelectorAll("button")].find((button) => !button.textContent.trim());
      if (!close) return null;
      const said = box.parentElement?.innerText.slice(0, 300) ?? "";
      close.click();
      return said;
    })()`, true);
    // The buttons a person presses in the editor, with a real gesture.
    const press = (label) => studio.executeJavaScript(
      `(() => { const b = [...document.querySelectorAll('button')].find((b) => ${label}.test(b.getAttribute('aria-label') || b.title || ''));
        if (!b) return false; b.click(); return true; })()`, true);
    // A hand on the mouse during the run would move the playhead and spoil the numbers, so real input is counted.
    await studio.executeJavaScript(`window.__hfwinInput = {};
      for (const type of ["pointerdown", "pointermove", "keydown", "wheel"])
        addEventListener(type, (event) => { if (event.isTrusted) window.__hfwinInput[type] = (window.__hfwinInput[type] ?? 0) + 1; }, true);`);
    result.playback.edit = await measure("edit", () => press("/^play/i"), () => press("/^pause/i"),
      (at) => composition().executeJavaScript(`window.__player.seek(${Number(at)})`, true));
    await press("/^pause/i");
    result.playback.editJumps = await jumpAndDrag("edit", studio);
    result.playback.editInputSeen = await studio.executeJavaScript("window.__hfwinInput");

    // Back to watching, and into the editor a second time: each switch loads that screen again.
    let back = Date.now();
    await inPage("document.querySelector('.editor-toggle').click()");
    if (await until(() => inPage("document.body.dataset.screen === 'watch' && document.body.dataset.studio === 'loaded'"),
      { timeoutMs: 90_000 })) result.playback.backToWatchSeconds = seconds(back);
    await wait(2000);
    back = Date.now();
    await inPage("document.querySelector('.editor-toggle').click()");
    if (await until(() => inPage("document.body.dataset.screen === 'edit' && document.body.dataset.studio === 'loaded'"),
      { timeoutMs: 90_000 })) result.playback.editorAgainSeconds = seconds(back);
  }
  fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
}
