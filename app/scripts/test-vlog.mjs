// Makes a practice project shaped like a phone vlog, for measuring the preview without anyone's own footage:
// 19 clips of 1080p H.264 at 16 Mbps with a keyframe every second (what the owner's phone records), each with
// 15.0 seconds of sound and 14.8 of picture, laid end to end with soft cross-fades, a title and captions.
//
//   node scripts/test-vlog.mjs <folder> [clips]
//
// Needs FFmpeg on PATH (or HYPERFRAMES_FFMPEG_PATH). Encoding runs at about real time: four to five minutes.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [folder, count = "19"] = process.argv.slice(2);
if (!folder) {
  console.error("Usage: node scripts/test-vlog.mjs <folder> [clips]");
  process.exit(2);
}
const dir = path.resolve(folder);
const clips = Number(count);
const ffmpeg = process.env.HYPERFRAMES_FFMPEG_PATH || "ffmpeg";
const SECONDS = 15;
const PICTURE = 14.8;
const FADE = 0.5;
fs.mkdirSync(path.join(dir, "assets"), { recursive: true });

for (let i = 0; i < clips; i++) {
  const file = path.join(dir, "assets", `clip-${String(i + 1).padStart(2, "0")}.mp4`);
  if (fs.existsSync(file)) continue;
  // Moving test pattern with grain, so the encoder really spends 16 Mbps the way real footage does.
  const picture = `testsrc2=size=1920x1080:rate=30,hue=h=${(i * 37) % 360},noise=alls=12:allf=t+u,trim=duration=${PICTURE}`;
  const ran = spawnSync(ffmpeg, [
    "-v", "error", "-y", "-f", "lavfi", "-i", picture, "-f", "lavfi", "-i", `sine=frequency=${220 + i * 20}:sample_rate=48000`,
    "-t", String(SECONDS), "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-b:v", "16M", "-maxrate", "16M", "-bufsize", "16M", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", file,
  ], { stdio: "inherit", windowsHide: true });
  if (ran.status !== 0) process.exit(ran.status ?? 1);
  console.log(`clip ${i + 1} of ${clips}`);
}

const parts = [];
const fades = [];
let at = 0;
for (let i = 0; i < clips; i++) {
  const id = `clip-${i + 1}`;
  // Two tracks taking turns, so each cross-fade's clips overlap without sharing a track.
  parts.push(`      <video id="${id}" class="clip" data-start="${at.toFixed(2)}" data-duration="${PICTURE}" ` +
    `data-media-start="0" data-track-index="${1 + (i % 2)}" src="assets/clip-${String(i + 1).padStart(2, "0")}.mp4" ` +
    "playsinline></video>");
  if (i > 0) fades.push(`tl.fromTo("#${id}", { opacity: 0 }, { opacity: 1, duration: ${FADE} }, ${at.toFixed(2)});`);
  if (i % 3 === 0) {
    parts.push(`      <p id="cap-${i}" class="clip caption" data-start="${(at + 1).toFixed(2)}" data-duration="4" ` +
      `data-track-index="4">Caption for part ${i + 1}</p>`);
  }
  at += PICTURE - FADE;
}
const total = (at + FADE).toFixed(2);

fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: #000; }
      #root { position: relative; width: 100%; height: 100%; font-family: Inter, system-ui, sans-serif; }
      video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      #title { position: absolute; top: 80px; width: 100%; text-align: center; color: #fff; font-size: 96px;
        text-shadow: 0 4px 24px #000; z-index: 5; }
      .caption { position: absolute; bottom: 90px; width: 100%; text-align: center; color: #fff; font-size: 54px;
        text-shadow: 0 2px 12px #000; z-index: 5; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1920"
      data-height="1080">
      <h1 id="title" class="clip" data-start="0" data-duration="4" data-track-index="3">A day in the city</h1>
${parts.join("\n")}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#title", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6 }, 0);
      ${fades.join("\n      ")}
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`);
if (!fs.existsSync(path.join(dir, "hyperframes.json"))) {
  fs.writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify({ name: path.basename(dir) }, null, 2) + "\n");
}
console.log(`${dir}: ${clips} clips, ${total} seconds`);
