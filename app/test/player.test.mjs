import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";

const player = await import("../src/main/player.js").catch((error) => {
  if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
  return {};
});

function videoFrame({ time = 12, duration = 30, playing = false } = {}) {
  assert.equal(typeof player.runPlayerCommand, "function", "the bounded playback bridge is available");
  const sound = [];
  const state = { time, duration, playing };
  const context = vm.createContext({
    window: {
      __renderReady: true,
      __player: {
        play: () => { state.playing = true; },
        pause: () => { state.playing = false; },
        seek: (at) => { state.time = at; state.playing = false; },
        getTime: () => state.time,
        getDuration: () => state.duration,
        isPlaying: () => state.playing,
      },
      location: { origin: "http://127.0.0.1:48620" },
      postMessage: (message) => sound.push(JSON.parse(JSON.stringify(message))),
    },
    document: { querySelector: () => ({ getAttribute: (key) => ({ "data-width": "1080", "data-height": "1920" })[key] }) },
  });
  return { frame: { executeJavaScript: (script) => vm.runInContext(script, context) }, state, sound };
}

test("skipping preserves playback and stops at the beginning", async () => {
  const { frame, state } = videoFrame({ time: 4, playing: true });
  await player.runPlayerCommand(frame, { action: "skip", value: -10 });
  assert.equal(state.time, 0);
  assert.equal(state.playing, true);
  await player.runPlayerCommand(frame, { action: "skip", value: 10 });
  assert.equal(state.time, 10);
  assert.equal(state.playing, true);
});

test("scrubbing a paused video stays paused and cannot seek beyond its end", async () => {
  const { frame, state } = videoFrame();
  await player.runPlayerCommand(frame, { action: "seek", value: 4.5 });
  assert.equal(state.time, 4.5);
  assert.equal(state.playing, false);
  await player.runPlayerCommand(frame, { action: "seek", value: 100 });
  assert.equal(state.time, 30);
});

test("play, pause and portrait dimensions come back as player state", async () => {
  const { frame } = videoFrame();
  let got = await player.runPlayerCommand(frame, { action: "play" });
  assert.equal(got.playing, true);
  assert.equal(got.width, 1080);
  assert.equal(got.height, 1920);
  got = await player.runPlayerCommand(frame, { action: "pause" });
  assert.equal(got.playing, false);
  assert.equal(got.ready, true);
});

test("volume uses the engine's master control and is bounded to zero through one", async () => {
  const { frame, sound } = videoFrame();
  await player.runPlayerCommand(frame, { action: "volume", value: 0.4 });
  await player.runPlayerCommand(frame, { action: "volume", value: 2 });
  assert.deepEqual(sound, [
    { source: "hf-parent", type: "control", action: "set-volume", volume: 0.4 },
    { source: "hf-parent", type: "control", action: "set-volume", volume: 1 },
  ]);
});

test("playback refuses arbitrary code and non-finite or non-numeric arguments", async () => {
  const { frame, state } = videoFrame();
  for (const command of [
    { action: "constructor" }, { action: "window.alert('bad')" },
    { action: "seek", value: "4; window.alert('bad')" },
    { action: "skip", value: Infinity }, { action: "volume", value: NaN },
    { action: "seek", value: {} },
  ]) await assert.rejects(() => player.runPlayerCommand(frame, command));
  assert.equal(state.time, 12);
  assert.equal(state.playing, false);
});

test("only the active project's direct root preview receives player commands", () => {
  assert.equal(typeof player.rootPlayerFrame, "function", "root preview targeting is available");
  const parent = {};
  const current = { serverUrl: "http://127.0.0.1:48620", projectName: "vlog é" };
  const root = { parent, url: "http://127.0.0.1:48620/api/projects/vlog%20%C3%A9/preview?t=1" };
  const scene = { parent, url: "http://127.0.0.1:48620/api/projects/vlog%20%C3%A9/preview/comp/intro.html" };
  const stranger = { parent, url: "http://127.0.0.1:48621/api/projects/vlog%20%C3%A9/preview" };
  const nested = { parent: {}, url: root.url };
  const main = { framesInSubtree: [scene, stranger, nested, root] };
  root.parent = main;
  scene.parent = stranger.parent = main;
  assert.equal(player.rootPlayerFrame(main, current), root);
  main.framesInSubtree = [scene, stranger, nested];
  assert.equal(player.rootPlayerFrame(main, current), undefined);
});

test("a chat moment is a fresh snapshot of the whole video, including fractions of a second", async () => {
  assert.equal(typeof player.readPlaybackMoment, "function", "chat can capture the current video moment");
  const { frame, state } = videoFrame({ time: 42.375, duration: 75, playing: true });
  const moment = await player.readPlaybackMoment(frame);
  assert.equal(moment.seconds, 42.375);
  assert.equal(moment.when, "0:42");
  assert.match(moment.note, /42\.375 seconds/);
  assert.match(moment.note, /not a selected element/);
  assert.match(moment.note, /whole video/);
  state.time = 65;
  assert.equal(moment.seconds, 42.375, "later playback does not change a sent moment");
  assert.equal((await player.readPlaybackMoment(frame)).when, "1:05");
  assert.equal(state.playing, true, "reading a moment does not pause the video");
});

test("the beginning is a usable moment; a missing or loading player is not", async () => {
  assert.equal(typeof player.readPlaybackMoment, "function", "chat can capture the current video moment");
  const { frame } = videoFrame({ time: 0 });
  assert.equal((await player.readPlaybackMoment(frame)).when, "0:00");
  await assert.rejects(() => player.readPlaybackMoment(null), /loading/);
  await assert.rejects(() => player.readPlaybackMoment({ executeJavaScript: async () => ({ ready: false }) }),
    /loading/);
});
