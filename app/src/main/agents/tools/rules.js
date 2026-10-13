import fs from "node:fs";
import path from "node:path";

// What an `ffmpeg` or `ffprobe` command may touch at the "Editing tools" access level: files inside the project
// folder, and nothing else. No network, no camera, microphone or screen, no file anywhere else on the computer.
//
// This reads the command the way FFmpeg will and refuses what it can see is outside those limits. It is a guard,
// not a sandbox: it stops an agent that wanders or is talked into something, and its refusals tell the agent
// what to do instead. What it cannot see is listed in SECURITY.md ("The honest limits").
//
// It is deliberately strict in one direction only. Every argument is checked, whatever option it belongs to, so
// a gap in the tables below can make a refusal less well-worded but cannot let a path through.

/** Options that take no value. Everything else that starts with "-" is taken to be followed by one. */
const FLAGS = new Set(
  (
    // ffmpeg
    "y n an vn sn dn hide_banner stdin shortest re copyts start_at_zero stats benchmark benchmark_all report " +
    "ignore_unknown copy_unknown xerror accurate_seek seek_timestamp autorotate autoscale find_stream_info " +
    "bitexact psnr vstats qphist deinterlace fix_sub_duration force_fps copyinkf dump hex debug_ts " +
    "auto_conversion_filters recast_media " +
    // ffprobe
    "show_format show_streams show_packets show_frames show_chapters show_programs show_stream_groups " +
    "show_error show_data show_private_data private show_program_version show_library_versions show_versions " +
    "show_pixel_formats count_frames count_packets pretty unit prefix byte_binary_prefix sexagesimal sections " +
    // both: questions that print a list and exit
    "version buildconf formats muxers demuxers devices codecs decoders encoders bsfs protocols filters pix_fmts " +
    "layouts sample_fmts dispositions colors hwaccels L h help ?"
  ).split(" "),
);

/** Options whose value is a file. `-i` is handled apart, because what it names depends on `-f`. */
const FILE_OPTIONS = new Set(
  "passlogfile progress vstats_file sdp_file attach dump_attachment stats_enc_pre stats_enc_post stats_mux_pre fpre o".split(
    " ",
  ),
);

const BLOCKED_OPTIONS = new Map([
  ["protocol_whitelist", "Changing which sources FFmpeg may open is not allowed here."],
  ["filter_script", "A filter kept in a separate file cannot be checked here. Put the filter on the command line."],
  ["filter_complex_script", "A filter kept in a separate file cannot be checked here. Put the filter on the command line."],
]);

/** `-f` values that are not file formats but a camera, a microphone, the screen or a display. */
const DEVICES = new Set(
  (
    "dshow gdigrab vfwcap ddagrab x11grab avfoundation kmsgrab fbdev v4l2 video4linux2 alsa pulse oss sndio jack " +
    "openal decklink libcdio iec61883 libdc1394 android_camera bktr sdl sdl2 opengl caca xv audiotoolbox"
  ).split(" "),
);
const CAPTURE_FILTER = /\b(ddagrab|gdigrab|dshow|vfwcap|x11grab|avfoundation|kmsgrab)\b/i;

const MAX_LIST_BYTES = 1_000_000;

const outside = (shown) =>
  `"${shown}" is outside this project. Here FFmpeg may only read and write files inside the project folder: ` +
  "use a path relative to the project folder. Footage kept somewhere else has to be added to the project first.";
const network = (shown) =>
  `"${shown}" is a network address. Here FFmpeg may only use files inside the project folder.`;
const capture = (shown) =>
  `"${shown}" records from a camera, a microphone or the screen. Here FFmpeg may only use files inside the project folder.`;

/** True when `target` is `root` or below it. Windows paths compare without regard to case. */
function within(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * Where a path really leads, following links and junctions for the part of it that exists. A junction inside
 * the project that points elsewhere must count as elsewhere.
 */
function realOf(target) {
  const tail = [];
  let current = target;
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...tail);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return target;
      tail.unshift(path.basename(current));
      current = parent;
    }
  }
}

/**
 * True when `target` is in the project. Judged by its spelling first, so a path that is plainly elsewhere is
 * refused without being touched: looking up `\servershare` would wait seconds for a server to answer.
 */
const inProject = ({ root, given }, target) =>
  (within(given, target) || within(root, target)) && within(root, realOf(target));

// "-5" and "-0:a:1" are values (a seek, a negative map), "-" alone is stdin or stdout. Anything else that
// starts with a dash and then a letter is an option.
const isOption = (token) => /^-{1,2}[A-Za-z/?]/.test(token);
const isFlag = (name) => FLAGS.has(name) || (name.startsWith("no") && FLAGS.has(name.slice(2)));

/** Why a file argument is refused, or null when it is a file inside the project. */
function fileProblem(token, where) {
  if (token === "-" || /^pipe:\d*$/i.test(token)) return null;
  // The usual way to throw an output away. Git Bash has already turned /dev/null into nul by the time we see it.
  if (/^(nul|\/dev\/null)$/i.test(token)) return null;
  if (token.includes("://")) return network(token);
  // "file:" only marks what follows as a file name. Any other word and a colon is one of FFmpeg's special
  // sources (concat:, crypto:, cache:, tcp:...). One letter and a colon is a drive.
  const value = token.replace(/^file:/i, "");
  const scheme = value.match(/^([a-z][a-z0-9+._-]+):/i)?.[1];
  if (scheme) return `"${token}" uses FFmpeg's "${scheme}:" source instead of a plain file, which cannot be checked here.`;
  // Windows allows none of these in a file name. Seeing one means the quoting went wrong on the way here, and a
  // path this check reads one way could be read another way further on.
  if (/["<>|]/.test(value)) return `${token} is not a file name Windows accepts. Check the quotes around it.`;
  return inProject(where, path.resolve(where.cwd, value)) ? null : outside(token);
}

/**
 * Why any other value is refused, or null. Filters can name files too (`subtitles=`, `movie=`, `lut3d=`), so
 * every value is searched for a path that leads out of the project.
 */
function textProblem(raw, where) {
  // Inside a filter a colon is written "\:", so "C\:/clips" is C:/clips and "http\://" is http://.
  const value = raw.replace(/\\+(?=[:'])/g, "");
  if (/[a-z][a-z0-9+.-]*:\/\//i.test(value)) return network(raw);
  if (CAPTURE_FILTER.test(value)) return capture(raw);
  if (/(^|[\\/=:'",;\s[])\.\.([\\/]|$)/.test(value)) {
    return `"${raw}" uses ".." in a path. Give the file's path from the project folder instead.`;
  }
  // \\server\share and //server/share.
  if (/(^|[=:'",;\s[])[\\/]{2}[^\\/]/.test(value)) return outside(raw);
  // A drive path (C:/..., C:\...) or a path from the drive's root (/Users/..., \Users\...). The first must not
  // follow a letter: in "scale=iw:ih/2" nothing is a drive.
  const absolute = /(?<![A-Za-z0-9])[A-Za-z]:[\\/][^'":,;|[\]*?<>]*|(?<=^|[=:'"])[\\/][\w.-][^'":,;|[\]*?<>]*/g;
  for (const [found] of value.matchAll(absolute)) {
    if (!inProject(where, path.resolve(where.cwd, found.trim()))) return outside(found.trim());
  }
  return null;
}

/** One `file ...` line of a concat list, unquoted the way FFmpeg does it: 'single quotes', and \ escapes. */
function unquote(text) {
  let out = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "'") quoted = !quoted;
    else if (char === "\\" && !quoted && i + 1 < text.length) out += text[++i];
    else out += char;
  }
  return out.trim();
}

/**
 * A list of clips to join (`-f concat`) names more files, and with `-safe 0` they may be anywhere. So the list
 * itself is read. Its entries are found from the list's own folder, as FFmpeg finds them.
 */
function listProblem(listFile, where, mustRead) {
  const full = path.resolve(where.cwd, listFile.replace(/^file:/i, ""));
  let text;
  try {
    if (fs.statSync(full).size > MAX_LIST_BYTES) throw new Error("too large");
    text = fs.readFileSync(full, "utf8");
  } catch {
    return mustRead
      ? `The list of clips "${listFile}" could not be read to check it. Save the list as a file inside the project first.`
      : null;
  }
  // A binary file, or a text file that is not a list: nothing more to check.
  if (text.includes("\0")) return null;
  for (const line of text.split(/\r?\n/)) {
    const entry = line.trim().match(/^file\s+(.+)$/i)?.[1];
    if (!entry) continue;
    const problem = fileProblem(unquote(entry), { ...where, cwd: path.dirname(full) });
    if (problem) return `In the list "${listFile}": ${problem}`;
  }
  return null;
}

/**
 * Decide whether one ffmpeg or ffprobe command stays inside the project.
 * `tool` is "ffmpeg" or "ffprobe", `args` its arguments as the program would receive them, `project` the
 * project folder and `cwd` the folder the command runs in. Returns `{ ok: true }` or `{ ok: false, reason }`,
 * where `reason` is a plain sentence for the agent to act on.
 */
export function checkCommand(tool, args, { project, cwd }) {
  const no = (reason) => ({ ok: false, reason });
  // The project folder as it was given and where that really is: they differ when a folder on the way is a link.
  const given = path.resolve(project);
  const where = { given, root: realOf(given), cwd: path.resolve(cwd) };
  if (!inProject(where, where.cwd)) return no("It has to be run from inside the project folder.");

  // What the next input is, set by the `-f` in front of it: a list of clips, a filter, or (null) a plain file.
  let format = null;
  let unsafeLists = false;
  const inputs = [];
  for (let i = 0; i < args.length; i++) {
    const token = String(args[i]);
    if (!isOption(token)) {
      // On its own, an argument is an output file for ffmpeg and the input for ffprobe.
      const isFilter = tool === "ffprobe" && format === "lavfi";
      const problem = isFilter ? textProblem(token, where) : fileProblem(token, where);
      if (problem) return no(problem);
      if (tool === "ffprobe") inputs.push({ file: token, format });
      // A `-f` describes the one file after it.
      format = null;
      continue;
    }

    const name = token.replace(/^-+/, "").split(":")[0];
    if (name.startsWith("/")) {
      return no(`"${token}" reads an option's value from a file, which cannot be checked here. Put the value on the command line.`);
    }
    if (BLOCKED_OPTIONS.has(name)) return no(BLOCKED_OPTIONS.get(name));
    const next = args[i + 1];
    if (isFlag(name) || next === undefined || isOption(String(next))) continue;
    const value = String(next);
    i++;

    let problem = null;
    if (name === "f") {
      if (DEVICES.has(value.toLowerCase())) return no(capture(`-f ${value}`));
      format = value.toLowerCase();
    } else if (name === "safe") {
      unsafeLists ||= value !== "1";
    } else if (name === "i") {
      problem = format === "lavfi" ? textProblem(value, where) : fileProblem(value, where);
      inputs.push({ file: value, format });
      format = null;
    } else if (FILE_OPTIONS.has(name)) {
      problem = fileProblem(value, where);
    } else {
      problem = textProblem(value, where);
    }
    if (problem) return no(problem);
  }

  for (const { file, format: kind } of inputs) {
    // FFmpeg also recognises a list by its first line, with no `-f concat`. That only matters once `-safe 0`
    // has lifted FFmpeg's own limits on where the entries may point.
    if (kind !== "concat" && !unsafeLists) continue;
    if (kind === "lavfi" || file === "-" || /^pipe:/i.test(file)) {
      if (kind === "concat") return no("A list of clips has to be a file inside the project, so that it can be checked.");
      continue;
    }
    const problem = listProblem(file, where, kind === "concat");
    if (problem) return no(problem);
  }
  return { ok: true };
}
