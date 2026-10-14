// "Make shorts from this video" (shorts.js): reading the assistant's plan, refusing a bad one in plain words, and
// making one project per short from the source video without touching the source.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  makeShortProject, makeShorts, parseShortsPlan, readShortsPlan, SHORTS_FILE, shortFolderName,
} from "../src/main/shorts.js";

const block = (value) => `# Shorts\n\nNotes for the person.\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
const piece = (over = {}) => ({ clip: "assets/prepared/03.mp4", from: 8, to: 14, words: "Hello", ...over });
const short = (over = {}) => ({ title: "Boring day? Mall time!", pieces: [piece()], ...over });
const parse = (...shorts) => parseShortsPlan(block({ shorts }));

const MTIME = new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 678));

function folder(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hfwin shorts é "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function put(file, text = "x") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  fs.utimesSync(file, MTIME, MTIME);
}

/** A source video with two clips, a font, music, a script, a hidden folder, a look and a footage study. */
function source(t) {
  const root = folder(t);
  const dir = path.join(root, "City vlog");
  put(path.join(dir, "assets", "prepared", "03.mp4"), "used clip");
  put(path.join(dir, "assets", "prepared", "04.mp4"), "unused clip, longer");
  put(path.join(dir, "assets", "fonts", "Noto.ttf"), "font");
  put(path.join(dir, "assets", "music", "song.mp3"), "music bytes");
  put(path.join(dir, "assets", "vendor", "gsap.min.js"), "// gsap");
  put(path.join(dir, "assets", ".cache", "hidden.bin"), "hidden");
  put(path.join(dir, "STYLE.md"), "# Look\nRed and gold.");
  put(path.join(dir, "hyperframes.json"), "{\"registry\":\"x\"}");
  const study = path.join(dir, ".hyperframes", "study");
  put(path.join(study, "03-ab12cd34", "sheet-1.jpg"), "picture");
  put(path.join(study, "03-ab12cd34", "transcript.txt"), "words");
  put(path.join(study, "04-ef56ab78", "sheet-1.jpg"), "other picture");
  put(path.join(study, "song-99aa11bb", "notes.txt"), "a song");
  put(path.join(study, "index.json"), JSON.stringify({
    version: 1,
    about: "Made by the app.",
    clips: [
      { file: "assets/prepared/03.mp4", study: ".hyperframes/study/03-ab12cd34", seconds: 20 },
      { file: "assets/prepared/04.mp4", study: ".hyperframes/study/04-ef56ab78", seconds: 30 },
      { file: "assets/music/song.mp3", study: ".hyperframes/study/song-99aa11bb", seconds: 180 },
    ],
  }));
  return { root, dir };
}

/** Every file and folder below `dir` with its size and time, to prove that nothing in it was changed. */
function listing(dir) {
  const out = [];
  const walk = (folderPath, prefix) => {
    for (const name of fs.readdirSync(folderPath).sort()) {
      const full = path.join(folderPath, name);
      const stat = fs.lstatSync(full);
      out.push(`${prefix}${name}|${stat.isDirectory() ? "dir" : stat.size}|${stat.mtimeMs}`);
      if (stat.isDirectory()) walk(full, `${prefix}${name}/`);
    }
  };
  walk(dir, "");
  return out;
}

const goodPlan = () => ({ shorts: [short({ pieces: [piece({ to: 14 }), piece({ from: 20, to: 26.3 })] })] });

test("a good plan is read: title, pieces and the seconds added up", () => {
  const plan = parseShortsPlan(block({
    ignored: true,
    shorts: [
      { title: "  ಮಾಲ್ ದಿನ  ", extra: 1, pieces: [piece({ clip: "assets\\prepared\\03.mp4", from: 8, to: 14.004, junk: 1 }),
        piece({ from: 1.234, to: 5.678, words: undefined })] },
      short({ title: "Second" }),
    ],
  }));
  assert.equal(plan.shorts.length, 2);
  const [first] = plan.shorts;
  assert.equal(first.title, "ಮಾಲ್ ದಿನ");
  assert.deepEqual(first.pieces[0], { clip: "assets/prepared/03.mp4", from: 8, to: 14, words: "Hello" });
  assert.deepEqual(first.pieces[1], { clip: "assets/prepared/03.mp4", from: 1.23, to: 5.68, words: "" });
  // 6.00 and 4.45 seconds are 10.45, and a hundredth over the half rounds up.
  assert.equal(first.seconds, 10.5);
  assert.equal(plan.shorts[1].seconds, 6);
  assert.deepEqual(Object.keys(first).sort(), ["pieces", "seconds", "title"]);
});

test("only the first json block counts, and a block without the word json is accepted when it reads as a plan", () => {
  const first = JSON.stringify({ shorts: [short({ title: "First" })] });
  const second = JSON.stringify({ shorts: [short({ title: "Second" })] });
  assert.equal(parseShortsPlan(`a\n\`\`\`json\n${first}\n\`\`\`\nb\n\`\`\`json\n${second}\n\`\`\``).shorts[0].title, "First");
  assert.equal(parseShortsPlan(`\`\`\`\n${first}\n\`\`\`\n`).shorts[0].title, "First");
  assert.equal(parseShortsPlan(`\`\`\`JSON\r\n${first}\r\n\`\`\`\r\n`).shorts[0].title, "First");
  // A first json block with a mistake is a mistake, even when a later one is fine.
  assert.throws(() => parseShortsPlan(`\`\`\`json\n{oops\n\`\`\`\n\`\`\`json\n${second}\n\`\`\``), /not written correctly/);
});

test("a text with no plan, or a plan that is not JSON, is refused in plain words", () => {
  for (const text of ["", "no block here", "```js\nconsole.log(1)\n```", null, undefined, 12]) {
    assert.throws(() => parseShortsPlan(text), /has no plan in it/, String(text));
  }
  assert.throws(() => parseShortsPlan("```json\n{ shorts: [ }\n```"), /not written correctly/);
  assert.throws(() => parseShortsPlan("```\nnot json\n```"), /not written correctly/);
});

test("the list of shorts must be there and hold one to five shorts", () => {
  for (const value of [{}, [], null, 5, { shorts: "x" }, { shorts: {} }]) {
    assert.throws(() => parseShortsPlan(block(value)), { message: "The shorts plan has no list of shorts." });
  }
  assert.throws(() => parse(), /no shorts in it/);
  assert.throws(() => parse(...Array.from({ length: 6 }, () => short())), { message: "The shorts plan has 6 shorts; make 1 to 5." });
  assert.equal(parse(...Array.from({ length: 5 }, () => short())).shorts.length, 5);
});

test("a short needs a title of one to sixty characters, counted as letters", () => {
  assert.throws(() => parse(short(), short({ title: "  " })), { message: "Short 2 has no title." });
  assert.throws(() => parse(short({ title: "" })), { message: "Short 1 has no title." });
  assert.throws(() => parse(short({ title: 5 })), /Short 1 has no title/);
  assert.throws(() => parse({ pieces: [piece()] }), /Short 1 has no title/);
  assert.throws(() => parse(short({ title: "a".repeat(61) })), /Short 1 has a title longer than 60 characters/);
  assert.equal(parse(short({ title: "a".repeat(60) })).shorts[0].title.length, 60);
  // Sixty Kannada letters are 60 characters however many UTF-16 units; sixty-one are too many.
  assert.equal(Array.from(parse(short({ title: "ಮ".repeat(60) })).shorts[0].title).length, 60);
  assert.throws(() => parse(short({ title: "ಮ".repeat(61) })), /longer than 60/);
  assert.equal(parse(short({ title: "Two\nlines\tand   gaps" })).shorts[0].title, "Two lines and gaps");
});

test("a short holds one to twelve pieces", () => {
  assert.throws(() => parse(short({ pieces: [] })), { message: "Short 1 has no pieces." });
  assert.throws(() => parse(short({ pieces: "x" })), /has no pieces/);
  const many = (n) => Array.from({ length: n }, () => piece({ from: 0, to: 1 }));
  assert.throws(() => parse(short({ pieces: many(13) })), { message: "Short 1 has 13 pieces; a short may have 1 to 12." });
  assert.equal(parse(short({ pieces: many(12) })).shorts[0].seconds, 12);
});

test("a clip must be a video inside the project, and nothing that points elsewhere is accepted", () => {
  const refused = [
    "/etc/movie.mp4", "\\Windows\\movie.mp4", "//server/share/x.mp4", "C:\\x.mp4", "c:x.mp4", "assets/x.mp4:stream",
    "../x.mp4", "..\\x.mp4", "assets/../../x.mp4", "assets/./x.mp4", ".hidden/x.mp4", "assets/.x.mp4",
    ".hyperframes/study/x.mp4", "assets/x.txt", "assets/x.mp4.exe", "assets/x", "assets/nul.mp4", "assets/x.mp4.",
    "", "   ", "/", 5, null, ["a.mp4"], { a: 1 },
  ];
  for (const clip of refused) {
    assert.throws(() => parse(short({ pieces: [piece({ clip })] })), { message: "Short 1, piece 1: that clip is not a video inside this project." },
      JSON.stringify(clip));
  }
  assert.throws(
    () => parse(short({ pieces: [piece(), piece(), piece({ clip: "assets/x.txt" })] })),
    { message: "Short 1, piece 3: that clip is not a video inside this project." },
  );
  for (const clip of ["a.MP4", "assets/Clip 1.MOV", "assets/é/ಕ್ಲಿಪ್.m4v", "x/y.webm", "x/y.mkv", "assets//y.mp4", " assets/y.mp4 "]) {
    assert.doesNotThrow(() => parse(short({ pieces: [piece({ clip })] })), clip);
  }
  assert.equal(parse(short({ pieces: [piece({ clip: "assets//a\\b.mp4" })] })).shorts[0].pieces[0].clip, "assets/a/b.mp4");
});

test("the times of a piece must be numbers that make at least half a second", () => {
  const bad = (over, message) => assert.throws(() => parse(short({ pieces: [piece(over)] })), { message });
  bad({ from: 10, to: 10 }, "Short 1, piece 1: the end must come after the start.");
  bad({ from: 14, to: 8 }, "Short 1, piece 1: the end must come after the start.");
  bad({ from: -1, to: 8 }, "Short 1, piece 1: the start cannot be before the beginning of the clip.");
  bad({ from: "8", to: 14 }, "Short 1, piece 1: the start and the end must be numbers of seconds.");
  bad({ from: 8, to: null }, "Short 1, piece 1: the start and the end must be numbers of seconds.");
  bad({ from: 8, to: Infinity }, "Short 1, piece 1: the start and the end must be numbers of seconds.");
  bad({ from: NaN, to: 9 }, "Short 1, piece 1: the start and the end must be numbers of seconds.");
  bad({ from: 8, to: 8.49 }, "Short 1, piece 1: a piece must be at least half a second long.");
  // Exactly half a second is enough, however the decimals fall.
  assert.doesNotThrow(() => parse(short({ pieces: [piece({ from: 0.1, to: 0.6 }), piece({ from: 1, to: 6 })] })));
});

test("a short must last five to ninety seconds", () => {
  assert.throws(() => parse(short({ pieces: [piece({ from: 0, to: 120 })] })), {
    message: "Short 1 would be 120 seconds long; a short is 5 to 90 seconds.",
  });
  assert.throws(() => parse(short({ pieces: [piece({ from: 0, to: 3 })] })), {
    message: "Short 1 would be 3 seconds long; a short is 5 to 90 seconds.",
  });
  // Added up over the pieces, not one by one.
  const eight = piece({ from: 0, to: 8 });
  assert.throws(() => parse(short({ pieces: Array.from({ length: 12 }, () => eight) })), /would be 96 seconds long/);
  assert.equal(parse(short({ pieces: [piece({ from: 0, to: 5 })] })).shorts[0].seconds, 5);
  assert.equal(parse(short({ pieces: [piece({ from: 0, to: 90 })] })).shorts[0].seconds, 90);
});

test("the words are optional, trimmed on one line, and cut at four hundred characters", () => {
  const words = (value) => parse(short({ pieces: [piece({ words: value })] })).shorts[0].pieces[0].words;
  assert.equal(words(undefined), "");
  assert.equal(words(7), "");
  assert.equal(words("  so\nboring  "), "so boring");
  assert.equal(words("a".repeat(500)).length, 400);
  assert.equal(Array.from(words("ಮ".repeat(500))).length, 400);
});

test("a folder without SHORTS.md has no plan, and a plan that is a folder is no plan either", (t) => {
  const { dir } = source(t);
  assert.equal(readShortsPlan(dir), null);
  assert.equal(readShortsPlan(path.join(dir, "no such folder")), null);
  fs.mkdirSync(path.join(dir, SHORTS_FILE));
  assert.equal(readShortsPlan(dir), null);
});

test("the plan in SHORTS.md is read, and every clip in it must be a file in the folder", (t) => {
  const { dir } = source(t);
  fs.writeFileSync(path.join(dir, SHORTS_FILE), block(goodPlan()));
  const plan = readShortsPlan(dir);
  assert.equal(plan.shorts[0].seconds, 12.3);

  fs.writeFileSync(path.join(dir, SHORTS_FILE), block({ shorts: [short(), short({ pieces: [piece({ clip: "assets/prepared/99.mp4" })] })] }));
  assert.throws(() => readShortsPlan(dir), { message: 'Short 2, piece 1: the clip "assets/prepared/99.mp4" was not found in this video\'s folder.' });

  // A folder with a video's name is not a clip.
  fs.mkdirSync(path.join(dir, "assets", "folder.mp4"));
  fs.writeFileSync(path.join(dir, SHORTS_FILE), block({ shorts: [short({ pieces: [piece({ clip: "assets/folder.mp4" })] })] }));
  assert.throws(() => readShortsPlan(dir), /was not found/);

  // The same name in another letter case is the same file on Windows.
  fs.writeFileSync(path.join(dir, SHORTS_FILE), block({ shorts: [short({ pieces: [piece({ clip: "Assets/Prepared/03.MP4" })] })] }));
  assert.doesNotThrow(() => readShortsPlan(dir));
});

test("a plan with a mistake in it is refused with the sentence for that mistake", (t) => {
  const { dir } = source(t);
  fs.writeFileSync(path.join(dir, SHORTS_FILE), "Just some notes, no block.");
  assert.throws(() => readShortsPlan(dir), /has no plan in it/);
  fs.writeFileSync(path.join(dir, SHORTS_FILE), block({ shorts: [] }));
  assert.throws(() => readShortsPlan(dir), /no shorts in it/);
});

test("a SHORTS.md over a hundred kilobytes is refused without being read as a plan", (t) => {
  const { dir } = source(t);
  fs.writeFileSync(path.join(dir, SHORTS_FILE), `${block(goodPlan())}\n${"x".repeat(100_001)}`);
  assert.throws(() => readShortsPlan(dir), { message: "SHORTS.md is too large to be a list of shorts." });
  // Exactly at the limit is fine.
  const text = block(goodPlan());
  fs.writeFileSync(path.join(dir, SHORTS_FILE), text + " ".repeat(100_000 - Buffer.byteLength(text)));
  assert.doesNotThrow(() => readShortsPlan(dir));
});

test("a short's folder name carries the video's name, the number and the title, in at most eighty letters", () => {
  const dir = path.join("C:\\", "Users", "José Müller", "Videos", "City vlog");
  assert.equal(shortFolderName(dir, 2, "Boring day? Mall time!"), "City vlog-short-2-boring-day-mall-time");
  assert.equal(shortFolderName(dir, 1, "ಮಾಲ್ ದಿನ"), "City vlog-short-1-ಮಾಲ್-ದಿನ");
  assert.equal(shortFolderName(dir, 3, "!!!"), "City vlog-short-3-untitled");

  const long = shortFolderName(dir, 1, "word ".repeat(40));
  assert.ok(Array.from(long).length <= 80, long);
  assert.ok(!long.endsWith("-"), long);
});

test("a name that must be cut is never left with a hyphen at its end, and keeps its number", () => {
  const base = "b".repeat(40);
  // The cut falls exactly on the hyphen between two words of the title.
  const name = shortFolderName(path.join("C:\\", base), 1, `${"a".repeat(30)} ${"c".repeat(17)}`);
  assert.equal(name, `${base}-short-1-${"a".repeat(30)}`);

  const huge = shortFolderName(path.join("C:\\", "v".repeat(200)), 3, "Mall time");
  assert.ok(Array.from(huge).length <= 80, huge);
  assert.match(huge, /-short-3-mall-time$/);
  // Two shorts of one very long video still get different names.
  assert.notEqual(huge, shortFolderName(path.join("C:\\", "v".repeat(200)), 4, "Mall time"));

  // Letters outside the basic plane are cut whole, never in half.
  const astral = shortFolderName(path.join("C:\\", "😀".repeat(100)), 1, "x");
  assert.ok(Array.from(astral).length <= 80);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(astral));
});

test("a short becomes an upright project beside the video, with its duration and an escaped title", (t) => {
  const { root, dir } = source(t);
  const made = makeShortProject(dir, { ...goodPlan().shorts[0], title: "<b>Fish & \"chips\" it's</b>", seconds: 12.3 }, 1);
  assert.equal(path.dirname(made), root);
  assert.equal(path.basename(made), "City vlog-short-1-b-fish-chips-it-s-b");
  assert.ok(path.isAbsolute(made));

  const html = fs.readFileSync(path.join(made, "index.html"), "utf8");
  assert.match(html, /<meta charset="UTF-8">/);
  assert.match(html, /<meta name="viewport" content="width=1080, height=1920">/);
  assert.match(html, /width:1080px; height:1920px/);
  // 12.3 seconds of pieces round up to 13, and three seconds more are left for an ending card.
  assert.match(
    html,
    /id="root" data-composition-id="main" data-start="0" data-duration="16"\s+data-width="1080" data-height="1920"/,
  );
  assert.match(html, /<title>&lt;b&gt;Fish &amp; &quot;chips&quot; it&#39;s&lt;\/b&gt;<\/title>/);
  assert.ok(!html.includes("<b>"), "the title is never markup");
  assert.ok(!/<script/i.test(html), "no network script");
});

test("the duration is worked out from the pieces when the short has no seconds yet", (t) => {
  const { dir } = source(t);
  const made = makeShortProject(dir, { title: "Plain", pieces: [piece({ from: 0, to: 6 }), piece({ from: 6, to: 12 })] }, 1);
  assert.match(fs.readFileSync(path.join(made, "index.html"), "utf8"), /data-duration="15"/);
});

test("the clips a short uses keep their size and time, the others are left out, and shared files come along", (t) => {
  const { dir } = source(t);
  const made = makeShortProject(dir, { ...goodPlan().shorts[0] }, 1);
  const same = (relative) => {
    const a = fs.statSync(path.join(dir, ...relative.split("/")));
    const b = fs.statSync(path.join(made, ...relative.split("/")));
    assert.equal(b.size, a.size, relative);
    assert.equal(b.mtimeMs, a.mtimeMs, relative);
  };
  same("assets/prepared/03.mp4");
  same("assets/fonts/Noto.ttf");
  same("assets/music/song.mp3");
  same("assets/vendor/gsap.min.js");
  assert.ok(!fs.existsSync(path.join(made, "assets", "prepared", "04.mp4")), "an unused video stays out");
  assert.ok(!fs.existsSync(path.join(made, "assets", ".cache")), "hidden folders stay out");
  assert.equal(fs.readFileSync(path.join(made, "STYLE.md"), "utf8"), "# Look\nRed and gold.");
  assert.equal(fs.readFileSync(path.join(made, "hyperframes.json"), "utf8"), "{\"registry\":\"x\"}");
  assert.ok(!fs.existsSync(path.join(made, "DESIGN.md")), "files the video does not have are not made up");
  // A short is a video of its own: its meta.json names it, not the video it was cut from.
  const meta = JSON.parse(fs.readFileSync(path.join(made, "meta.json"), "utf8"));
  assert.equal(meta.id, path.basename(made));
  assert.equal(meta.name, path.basename(made));

  // STYLE.md is a copy, not a link: an assistant editing one short's look must not change the video's.
  fs.appendFileSync(path.join(made, "STYLE.md"), "\nchanged");
  assert.equal(fs.readFileSync(path.join(dir, "STYLE.md"), "utf8"), "# Look\nRed and gold.");
});

test("the study keeps the clips and sounds the short has, with their folders, and drops the footage it has not", (t) => {
  const { dir } = source(t);
  const made = makeShortProject(dir, { ...goodPlan().shorts[0] }, 1);
  const index = JSON.parse(fs.readFileSync(path.join(made, ".hyperframes", "study", "index.json"), "utf8"));
  assert.deepEqual(index.clips.map((clip) => clip.file), ["assets/prepared/03.mp4", "assets/music/song.mp3"]);
  assert.equal(index.version, 1);
  assert.equal(index.about, "Made by the app.");
  const study = path.join(made, ".hyperframes", "study");
  assert.equal(fs.readFileSync(path.join(study, "03-ab12cd34", "sheet-1.jpg"), "utf8"), "picture");
  assert.equal(fs.readFileSync(path.join(study, "03-ab12cd34", "transcript.txt"), "utf8"), "words");
  assert.equal(fs.readFileSync(path.join(study, "song-99aa11bb", "notes.txt"), "utf8"), "a song");
  assert.ok(!fs.existsSync(path.join(study, "04-ef56ab78")), "the unused video's study is not copied");
  // The source's own index is as it was.
  const original = JSON.parse(fs.readFileSync(path.join(dir, ".hyperframes", "study", "index.json"), "utf8"));
  assert.equal(original.clips.length, 3);
});

test("a study entry is matched to its clip whatever the letter case or slashes", (t) => {
  const { dir } = source(t);
  const made = makeShortProject(dir, short({ pieces: [piece({ clip: "Assets\\Prepared\\03.MP4" })] }), 1);
  const index = JSON.parse(fs.readFileSync(path.join(made, ".hyperframes", "study", "index.json"), "utf8"));
  assert.ok(index.clips.some((clip) => clip.file === "assets/prepared/03.mp4"));
});

test("a video without a study still makes its short, and a study folder that points elsewhere is not followed", (t) => {
  const { root, dir } = source(t);
  fs.rmSync(path.join(dir, ".hyperframes"), { recursive: true, force: true });
  const plain = makeShortProject(dir, { ...goodPlan().shorts[0] }, 1);
  assert.ok(!fs.existsSync(path.join(plain, ".hyperframes")));
  assert.ok(fs.existsSync(path.join(plain, "assets", "prepared", "03.mp4")));

  const outside = path.join(root, "outside");
  put(path.join(outside, "secret.txt"), "private");
  put(path.join(dir, ".hyperframes", "study", "index.json"), JSON.stringify({
    clips: [{ file: "assets/prepared/03.mp4", study: "../outside" }, { file: "assets/prepared/03.mp4", study: ".hyperframes/study/../.." }],
  }));
  const made = makeShortProject(dir, { ...goodPlan().shorts[0] }, 2);
  assert.deepEqual(fs.readdirSync(outside), ["secret.txt"]);
  assert.ok(!fs.existsSync(path.join(made, "..", "secret.txt")));
  assert.ok(fs.existsSync(path.join(made, ".hyperframes", "study", "index.json")));
});

test("SHORT.md lists the pieces in order, with what is said in each", (t) => {
  const { dir } = source(t);
  const plan = parse(short({
    title: "Boring day? Mall time!",
    pieces: [piece({ words: "The thing is... my day is so boring." }), piece({ clip: "assets/prepared/04.mp4", from: 1.5, to: 7, words: "" })],
  }));
  const made = makeShortProject(dir, plan.shorts[0], 2);
  assert.equal(
    fs.readFileSync(path.join(made, "SHORT.md"), "utf8"),
    "# Short 2: Boring day? Mall time!\n\n" +
      "About 11.5 seconds, from the video \"City vlog\". Use these pieces, in this order " +
      "(times are inside each clip's own file, in seconds):\n\n" +
      "- assets/prepared/03.mp4, 8 to 14: \"The thing is... my day is so boring.\"\n" +
      "- assets/prepared/04.mp4, 1.5 to 7\n",
  );
  // Both clips are used, so both are there.
  assert.ok(fs.existsSync(path.join(made, "assets", "prepared", "04.mp4")));
  assert.ok(fs.existsSync(path.join(made, "assets", "prepared", "03.mp4")));
});

test("making the same short again makes a new folder with -2, -3 and never touches the first", (t) => {
  const { root, dir } = source(t);
  const first = makeShortProject(dir, { ...goodPlan().shorts[0] }, 1);
  fs.writeFileSync(path.join(first, "mine.txt"), "the person's own edit");
  const second = makeShortProject(dir, { ...goodPlan().shorts[0] }, 1);
  const third = makeShortProject(dir, { ...goodPlan().shorts[0] }, 1);
  assert.equal(path.basename(second), `${path.basename(first)}-2`);
  assert.equal(path.basename(third), `${path.basename(first)}-3`);
  assert.equal(fs.readFileSync(path.join(first, "mine.txt"), "utf8"), "the person's own edit");
  assert.equal(fs.readdirSync(root).length, 4);
});

test("it gives up after fifty folders of one name", (t) => {
  const { root, dir } = source(t);
  const name = shortFolderName(dir, 1, goodPlan().shorts[0].title);
  fs.mkdirSync(path.join(root, name));
  for (let n = 2; n <= 50; n++) fs.mkdirSync(path.join(root, `${name}-${n}`));
  assert.throws(() => makeShortProject(dir, { ...goodPlan().shorts[0] }, 1), /too many folders/);
  assert.equal(fs.readdirSync(root).length, 1 + 50, "the video and its fifty folders: nothing else was made");
});

test("a short can be made in another folder", (t) => {
  const { root, dir } = source(t);
  const parentDir = path.join(root, "Shorts é", "next");
  const made = makeShortProject(dir, { ...goodPlan().shorts[0] }, 1, { parentDir });
  assert.equal(path.dirname(made), parentDir);
  assert.ok(fs.existsSync(path.join(made, "index.html")));
});

test("the source folder is exactly as it was after the shorts are made", (t) => {
  const { dir } = source(t);
  const before = listing(dir);
  makeShorts(dir, parseShortsPlan(block({ shorts: [short(), short({ pieces: [piece({ clip: "assets/prepared/04.mp4" })] })] })));
  assert.deepEqual(listing(dir), before);
});

test("every short of the plan is made in order, each in its own folder", (t) => {
  const { root, dir } = source(t);
  const plan = parseShortsPlan(block({
    shorts: [short({ title: "One" }), short({ title: "Two", pieces: [piece({ clip: "assets/prepared/04.mp4" })] })],
  }));
  const made = makeShorts(dir, plan);
  assert.deepEqual(made.map((folderPath) => path.basename(folderPath)), ["City vlog-short-1-one", "City vlog-short-2-two"]);
  assert.ok(made.every((folderPath) => path.dirname(folderPath) === root));
  assert.ok(fs.existsSync(path.join(made[0], "assets", "prepared", "03.mp4")));
  assert.ok(!fs.existsSync(path.join(made[0], "assets", "prepared", "04.mp4")));
  assert.ok(fs.existsSync(path.join(made[1], "assets", "prepared", "04.mp4")));
  assert.ok(!fs.existsSync(path.join(made[1], "assets", "prepared", "03.mp4")));
  assert.match(fs.readFileSync(path.join(made[1], "SHORT.md"), "utf8"), /^# Short 2: Two\n/);
  assert.throws(() => makeShorts(dir, {}), /no list of shorts/);
});

test("where a link is not possible the file is copied with the original's size and time", (t) => {
  const { dir } = source(t);
  const link = fs.linkSync;
  fs.linkSync = () => { throw Object.assign(new Error("EXDEV: cross-device link not permitted"), { code: "EXDEV" }); };
  let made;
  try {
    made = makeShortProject(dir, { ...goodPlan().shorts[0] }, 1);
  } finally {
    fs.linkSync = link;
  }
  for (const relative of ["assets/prepared/03.mp4", "assets/music/song.mp3", "assets/fonts/Noto.ttf"]) {
    const a = fs.statSync(path.join(dir, ...relative.split("/")));
    const b = fs.statSync(path.join(made, ...relative.split("/")));
    assert.equal(b.size, a.size, relative);
    // The study compares whole milliseconds, so that is what has to survive the copy.
    assert.equal(Math.round(b.mtimeMs), Math.round(a.mtimeMs), relative);
    assert.notEqual(b.ino, a.ino, "a real copy");
  }
  assert.equal(fs.readFileSync(path.join(made, "assets", "prepared", "03.mp4"), "utf8"), "used clip");
});

test("a clip kept outside the assets folder is brought along too", (t) => {
  const { dir } = source(t);
  put(path.join(dir, "footage", "Raw 1.mp4"), "raw");
  const made = makeShortProject(dir, short({ pieces: [piece({ clip: "footage/raw 1.MP4" })] }), 1);
  assert.equal(fs.readFileSync(path.join(made, "footage", "Raw 1.mp4"), "utf8"), "raw");
});

test("a link or junction in the assets folder is not followed out of the video", (t) => {
  const { root, dir } = source(t);
  const outside = path.join(root, "elsewhere");
  put(path.join(outside, "private.png"), "private");
  put(path.join(outside, "private.mp4"), "private");
  try {
    fs.symlinkSync(outside, path.join(dir, "assets", "linked"), "junction");
    fs.symlinkSync(path.join(outside, "private.png"), path.join(dir, "assets", "alias.png"), "file");
  } catch {
    // Making a link may need rights this computer's account does not have; the junction alone is the case that matters.
  }
  if (!fs.existsSync(path.join(dir, "assets", "linked"))) t.skip("this account cannot make a junction");
  const made = makeShortProject(dir, { ...goodPlan().shorts[0] }, 1);
  assert.ok(!fs.existsSync(path.join(made, "assets", "linked")));
  assert.ok(!fs.existsSync(path.join(made, "assets", "alias.png")));
  assert.deepEqual(fs.readdirSync(outside).sort(), ["private.mp4", "private.png"]);
  // A plan naming a clip through the junction is refused when it is read.
  fs.writeFileSync(path.join(dir, SHORTS_FILE), block({ shorts: [short({ pieces: [piece({ clip: "assets/linked/private.mp4" })] })] }));
  assert.throws(() => readShortsPlan(dir), /was not found/);
});

test("when making a short fails, the half-made folder is removed and the video is left alone", (t) => {
  const { root, dir } = source(t);
  const before = listing(dir);
  const copy = fs.copyFileSync;
  fs.copyFileSync = () => { throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" }); };
  try {
    assert.throws(() => makeShortProject(dir, { ...goodPlan().shorts[0] }, 1), /could not be made/);
  } finally {
    fs.copyFileSync = copy;
  }
  assert.deepEqual(fs.readdirSync(root), ["City vlog"]);
  assert.deepEqual(listing(dir), before);
  assert.throws(() => makeShortProject(path.join(root, "missing"), { ...goodPlan().shorts[0] }, 1), /could not be found/);
  assert.deepEqual(fs.readdirSync(root), ["City vlog"]);
});

test("a video with no assets folder still gets its project", (t) => {
  const root = folder(t);
  const dir = path.join(root, "Bare");
  put(path.join(dir, "STYLE.md"), "look");
  const made = makeShortProject(dir, { ...goodPlan().shorts[0] }, 1);
  assert.deepEqual(fs.readdirSync(made).sort(), ["SHORT.md", "STYLE.md", "index.html", "meta.json"]);
});
