// The check in front of FFmpeg at the "Also cut my clips" level: what it lets through and what it refuses.
// The second half runs the real thing, through the same files an agent's shell would find.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { whereAll } from "../src/main/agents/launcher.js";
import { mediaToolsEnv, SHIM_DIR } from "../src/main/agents/mediaTools.js";
import { checkCommand } from "../src/main/agents/tools/rules.js";

let project;
let elsewhere;

before(() => {
  // A space and an accent in the path, as on a real person's computer.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin guard é "));
  project = path.join(root, "my video");
  elsewhere = path.join(root, "private");
  fs.mkdirSync(path.join(project, "assets"), { recursive: true });
  fs.mkdirSync(elsewhere);
  fs.writeFileSync(path.join(elsewhere, "secret.mp4"), "not for the agent");
});
after(() => fs.rmSync(path.dirname(project), { recursive: true, force: true }));

const check = (tool, args, cwd = project) => checkCommand(tool, args, { project, cwd });
const allowed = (tool, ...args) => assert.deepEqual(check(tool, args), { ok: true }, args.join(" "));
const refused = (tool, args, why) => {
  const verdict = check(tool, args);
  assert.equal(verdict.ok, false, `should be refused: ${args.join(" ")}`);
  if (why) assert.match(verdict.reason, why);
};

test("ordinary editing inside the project goes through", () => {
  allowed("ffmpeg", "-y", "-ss", "00:00:12", "-to", "00:00:20", "-i", "assets/in.mp4", "-c", "copy", "assets/cut.mp4");
  allowed("ffmpeg", "-i", "assets/in.mp4", "-vf", "crop=ih*9/16:ih,scale=1080:1920", "-c:a", "copy", "assets/tall.mp4");
  allowed("ffmpeg", "-i", "assets/in.mp4", "-vf", "eq=contrast=1.1:saturation=1.3,fps=30000/1001", "assets/graded.mp4");
  allowed("ffmpeg", "-hide_banner", "-i", "assets/in.mp4", "-map", "0:v:0", "-map", "-0:a", "-an", "assets/silent.mp4");
  allowed("ffmpeg", "-i", "assets/in.mp4", "-vf", "fps=1", "-q:v", "2", "assets/frames/f_%04d.jpg");
  allowed("ffmpeg", "-i", "assets/in.mp4", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-f", "null", "-");
  allowed("ffmpeg", "-i", "assets/in.mp4", "-f", "null", "nul");
  allowed("ffmpeg", "-i", "assets/in.mov", "-sseof", "-3", "-strict", "-2", "assets/tail.mp4");
  allowed("ffmpeg", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-t", "2", "assets/test.mp4");
  allowed("ffmpeg", "-i", "a.mp4", "-i", "b.png", "-filter_complex", "[0:v][1:v]overlay=W-w-20:20[v]", "-map", "[v]", "out.mp4");
  allowed("ffmpeg", "-i", "assets/in.mp4", "-vf", "subtitles=assets/words.srt:force_style='FontSize=24'", "assets/subbed.mp4");
  allowed("ffmpeg", "-i", "assets/in.mp4", "-vf", "lut3d=file=looks/warm.cube", "assets/warm.mp4");
  allowed("ffmpeg", "-version");
  allowed("ffmpeg", "-h", "encoder=libx264");
});

test("an absolute path is fine when it is inside the project", () => {
  allowed("ffmpeg", "-i", path.join(project, "assets", "in.mp4"), path.join(project, "assets", "out.mp4"));
  allowed("ffmpeg", "-i", path.join(project, "ASSETS", "in.mp4").toUpperCase(), "out.mp4");
  const inFilter = path.join(project, "assets", "words.srt").replaceAll("\\", "/").replace(":", "\\:");
  allowed("ffmpeg", "-i", "assets/in.mp4", "-vf", `subtitles='${inFilter}'`, "assets/subbed.mp4");
});

test("ffprobe may read project files", () => {
  allowed("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", "assets/in.mp4");
  allowed("ffprobe", "-hide_banner", "-select_streams", "v:0", "-show_streams", "-print_format", "json", "-i", "assets/in.mp4");
});

test("reading a file outside the project is refused", () => {
  refused("ffmpeg", ["-i", path.join(elsewhere, "secret.mp4"), "assets/copy.mp4"], /outside this project/);
  refused("ffmpeg", ["-i", "../private/secret.mp4", "assets/copy.mp4"], /outside this project/);
  refused("ffmpeg", ["-i", "\\Users\\someone\\clip.mp4", "out.mp4"], /outside this project/);
  refused("ffmpeg", ["-i", "\\\\server\\share\\clip.mp4", "out.mp4"], /outside this project/);
  refused("ffprobe", [path.join(elsewhere, "secret.mp4")], /outside this project/);
  refused("ffprobe", ["-i", "C:/Windows/win.ini"], /outside this project/);
});

test("writing a file outside the project is refused", () => {
  refused("ffmpeg", ["-i", "assets/in.mp4", path.join(elsewhere, "out.mp4")], /outside this project/);
  refused("ffmpeg", ["-i", "assets/in.mp4", "-y", "..\\out.mp4"], /outside this project/);
  refused("ffmpeg", ["-i", "assets/in.mp4", "-passlogfile", "C:/Users/log", "out.mp4"], /outside this project/);
  refused("ffmpeg", ["-i", "assets/in.mp4", "-progress", "C:/Users/progress.txt", "out.mp4"], /outside this project/);
});

test("a path that leaves the project from a subfolder is still caught, and one that stays is not", () => {
  const assets = path.join(project, "assets");
  assert.equal(checkCommand("ffmpeg", ["-i", "../other/in.mp4", "out.mp4"], { project, cwd: assets }).ok, true);
  assert.equal(checkCommand("ffmpeg", ["-i", "../../private/secret.mp4", "out.mp4"], { project, cwd: assets }).ok, false);
});

test("it has to be run from inside the project", () => {
  const verdict = checkCommand("ffmpeg", ["-i", "secret.mp4", "copy.mp4"], { project, cwd: elsewhere });
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /inside the project folder/);
});

test("the network is refused, as a source or a destination", () => {
  refused("ffmpeg", ["-i", "https://example.com/clip.mp4", "assets/clip.mp4"], /network address/);
  refused("ffmpeg", ["-i", "assets/in.mp4", "-f", "mpegts", "tcp://203.0.113.9:9000"], /network address/);
  refused("ffmpeg", ["-i", "assets/in.mp4", "-f", "flv", "rtmp://live.example.com/app/key"], /network address/);
  refused("ffmpeg", ["-i", "assets/in.mp4", "-progress", "http://203.0.113.9/p", "out.mp4"], /network address/);
  refused("ffmpeg", ["-f", "lavfi", "-i", "movie=http\\://example.com/a.mp4", "out.mp4"], /network address/);
  refused("ffprobe", ["https://example.com/clip.mp4"], /network address/);
});

test("the camera, the microphone and the screen are refused", () => {
  refused("ffmpeg", ["-f", "gdigrab", "-i", "desktop", "assets/screen.mp4"], /camera, a microphone or the screen/);
  refused("ffmpeg", ["-f", "dshow", "-i", "video=Integrated Camera", "assets/me.mp4"], /camera, a microphone or the screen/);
  refused("ffmpeg", ["-f", "lavfi", "-i", "ddagrab=output_idx=0", "assets/screen.mp4"], /camera, a microphone or the screen/);
  refused("ffmpeg", ["-filter_complex", "ddagrab=0,hwdownload,format=bgra", "assets/screen.mp4"], /camera, a microphone or the screen/);
});

test("FFmpeg's special sources are refused where a file is expected", () => {
  refused("ffmpeg", ["-i", `concat:${path.join(elsewhere, "a.ts")}|b.ts`, "out.mp4"]);
  refused("ffmpeg", ["-i", "crypto:assets/in.enc", "out.mp4"], /instead of a plain file/);
  refused("ffmpeg", ["-i", `file:${path.join(elsewhere, "secret.mp4")}`, "out.mp4"], /outside this project/);
  allowed("ffmpeg", "-i", "file:assets/in.mp4", "out.mp4");
  allowed("ffmpeg", "-i", "assets/in.mp4", "-f", "mp4", "pipe:1");
});

test("a filter cannot name a file outside the project", () => {
  const out = path.join(elsewhere, "words.srt").replaceAll("\\", "/");
  refused("ffmpeg", ["-i", "assets/in.mp4", "-vf", `subtitles=${out.replace(":", "\\:")}`, "o.mp4"], /outside this project/);
  refused("ffmpeg", ["-i", "assets/in.mp4", "-vf", `subtitles='${out.replace(":", "\\\\:")}'`, "o.mp4"], /outside this project/);
  refused("ffmpeg", ["-i", "assets/in.mp4", "-vf", "movie=../private/logo.png[l];[in][l]overlay", "o.mp4"], /"\.\."/);
  refused("ffmpeg", ["-i", "assets/in.mp4", "-vf", "subtitles=/Users/someone/words.srt", "o.mp4"], /outside this project/);
  refused("ffmpeg", ["-i", "a.mp4", "-vf", "vidstabdetect=result=C\\:/Users/someone/t.trf", "-f", "null", "-"], /outside this project/);
});

test("a file name with a stray quote in it is refused, not guessed at", () => {
  refused("ffmpeg", ["-i", `"${path.join(elsewhere, "secret.mp4")}`, "out.mp4"], /Check the quotes/);
  refused("ffmpeg", ["-i", "assets/in.mp4", '"assets\\made'], /Check the quotes/);
});

test("options that would hide a path from the check are refused", () => {
  refused("ffmpeg", ["-protocol_whitelist", "file,http,tcp", "-i", "assets/list.m3u8", "out.mp4"]);
  refused("ffmpeg", ["-i", "a.mp4", "-filter_complex_script", "graph.txt", "out.mp4"], /command line/);
  refused("ffmpeg", ["-i", "a.mp4", "-/filter_complex", "graph.txt", "out.mp4"], /command line/);
});

test("an option the check has never heard of does not let a path through", () => {
  refused("ffmpeg", ["-i", "assets/in.mp4", "-brand_new_flag", path.join(elsewhere, "out.mp4")], /outside this project/);
  refused("ffmpeg", ["-brand_new_option", "https://example.com/x", "-i", "assets/in.mp4", "out.mp4"], /network address/);
  allowed("ffmpeg", "-i", "assets/in.mp4", "-brand_new_flag", "-brand_new_option", "7", "assets/out.mp4");
});

test("a list of clips to join is read, and every clip in it must be in the project", () => {
  const list = path.join(project, "assets", "list.txt");
  fs.writeFileSync(list, "# my cut\nfile 'one.mp4'\nfile 'take two/it'\\''s here.mp4'\nduration 2\n");
  allowed("ffmpeg", "-f", "concat", "-safe", "0", "-i", "assets/list.txt", "-c", "copy", "assets/joined.mp4");

  fs.writeFileSync(list, `file 'one.mp4'\nfile '${path.join(elsewhere, "secret.mp4").replaceAll("\\", "/")}'\n`);
  refused("ffmpeg", ["-f", "concat", "-safe", "0", "-i", "assets/list.txt", "-c", "copy", "out.mp4"], /In the list.*outside this project/);

  fs.writeFileSync(list, "file '../../private/secret.mp4'\n");
  refused("ffmpeg", ["-f", "concat", "-safe", "0", "-i", "assets/list.txt", "out.mp4"], /outside this project/);
  // FFmpeg recognises a list by its first line too, with no "-f concat" on the command.
  fs.writeFileSync(list, "ffconcat version 1.0\nfile '../../private/secret.mp4'\n");
  refused("ffmpeg", ["-safe", "0", "-i", "assets/list.txt", "out.mp4"], /outside this project/);

  fs.writeFileSync(list, "file 'https://example.com/a.mp4'\n");
  refused("ffmpeg", ["-f", "concat", "-safe", "0", "-i", "assets/list.txt", "out.mp4"], /network address/);
  refused("ffmpeg", ["-f", "concat", "-safe", "0", "-i", "assets/missing.txt", "out.mp4"], /could not be read/);
  refused("ffmpeg", ["-f", "concat", "-safe", "0", "-i", "-", "out.mp4"], /has to be a file/);
});

test("a link inside the project that leads outside counts as outside", (t) => {
  const link = path.join(project, "shortcut");
  try {
    fs.symlinkSync(elsewhere, link, "junction");
  } catch {
    return t.skip("this account cannot make a junction");
  }
  refused("ffmpeg", ["-i", "shortcut/secret.mp4", "assets/copy.mp4"], /outside this project/);
  refused("ffmpeg", ["-i", "assets/in.mp4", "shortcut/new.mp4"], /outside this project/);
});

// ------------------------------------------------------------------ the real thing

const realFfmpeg = whereAll("ffmpeg").find((file) => /\.exe$/i.test(file));
const bash = ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files (x86)\\Git\\bin\\bash.exe"].find((file) =>
  fs.existsSync(file),
);
const needsFfmpeg = { skip: realFfmpeg ? false : "FFmpeg is not installed here" };

/** Run `ffmpeg ...` the way an agent's shell would: by name, with the app's environment for that access level. */
function viaShell(shell, command, access = "tools") {
  const env = mediaToolsEnv({ ...process.env }, { dir: project, access });
  const options = { cwd: project, env, encoding: "utf8", windowsHide: true, timeout: 60_000 };
  // `shell: true` is cmd.exe, handed the line exactly as written. Fixed test commands only.
  if (shell === "cmd") return spawnSync(command, { ...options, shell: true });
  return shell === "bash"
    ? spawnSync(bash, ["-c", command], options)
    : spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], options);
}

test("through cmd: a clip is made and cut inside the project", needsFfmpeg, () => {
  const made = viaShell("cmd", 'ffmpeg -y -v error -f lavfi -i testsrc2=size=320x180:rate=30 -t 3 "assets\\made in cmd.mp4"');
  assert.equal(made.status, 0, made.stderr);
  const cut = viaShell("cmd", 'ffmpeg -y -v error -ss 1 -t 1 -i "assets\\made in cmd.mp4" -c copy assets\\cut.mp4');
  assert.equal(cut.status, 0, cut.stderr);
  assert.ok(fs.statSync(path.join(project, "assets", "cut.mp4")).size > 0);
  const probed = viaShell("cmd", "ffprobe -v error -show_entries format=duration -of csv=p=0 assets\\cut.mp4");
  assert.equal(probed.status, 0, probed.stderr);
  assert.ok(Math.abs(Number(probed.stdout.trim()) - 1) < 0.25, `about one second, got ${probed.stdout}`);
});

test("through PowerShell: the same, and a numbered run of pictures keeps its % sign", needsFfmpeg, () => {
  const run = viaShell("powershell", 'ffmpeg -y -v error -i "assets/made in cmd.mp4" -vf fps=1 "assets/still_%02d.png"; exit $LASTEXITCODE');
  assert.equal(run.status, 0, run.stderr);
  assert.ok(fs.existsSync(path.join(project, "assets", "still_01.png")));
});

test("through Git Bash, where Claude Code runs it", { skip: !realFfmpeg || !bash ? "needs FFmpeg and Git Bash" : false }, () => {
  const run = viaShell("bash", "ffmpeg -y -v error -i 'assets/made in cmd.mp4' -vf 'scale=160:-2,eq=saturation=0' assets/grey.mp4");
  assert.equal(run.status, 0, run.stderr);
  assert.ok(fs.statSync(path.join(project, "assets", "grey.mp4")).size > 0);
  const out = path.join(elsewhere, "leak.mp4").replaceAll("\\", "/");
  const leak = viaShell("bash", `ffmpeg -y -v error -i 'assets/made in cmd.mp4' -c copy '${out}'`);
  assert.equal(leak.status, 77);
  assert.match(leak.stderr, /FFmpeg was not run\..*outside this project/s);
  assert.equal(fs.existsSync(path.join(elsewhere, "leak.mp4")), false);
});

test("a refused command runs nothing and says why", needsFfmpeg, () => {
  const secret = path.join(elsewhere, "secret.mp4");
  const run = viaShell("cmd", `ffmpeg -y -i "${secret}" assets\\stolen.mp4`);
  assert.equal(run.status, 77);
  assert.match(run.stderr, /FFmpeg was not run\..*outside this project/s);
  assert.equal(fs.existsSync(path.join(project, "assets", "stolen.mp4")), false);
});

test('at "Only this video" the same command is refused, with what to tell the person', needsFfmpeg, () => {
  const run = viaShell("cmd", "ffmpeg -version", "project");
  assert.equal(run.status, 77);
  assert.match(run.stderr, /"Only this video".*"Also cut my clips"/s);
});

test("at full access the real FFmpeg answers, with nothing in front", needsFfmpeg, () => {
  const env = mediaToolsEnv({ ...process.env }, { dir: project, access: "full" });
  assert.ok(!(env.Path ?? env.PATH).includes(SHIM_DIR));
});
