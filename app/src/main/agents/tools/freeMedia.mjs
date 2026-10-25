// Free pictures and sounds for the assistant (M8-12): two tools beside "look at the video" in the app's own small MCP
// server (look.mjs), searching Openverse (api.openverse.org: openly licensed pictures and sounds, no key needed).
// The owner asked for it on 2026-10-24; what Openverse allows and asks is in docs/RESEARCH.md:
// - Only licences that let a video use the file without binding it: public domain (cc0, pdm) and CC BY (credit
//   needed). Creative Commons counts music set to pictures as an adaptation, so "no derivatives" cannot be used
//   and "share alike" would bind the whole video.
// - Openverse does not check licences itself: every file keeps its original page, licence and credit line, in
//   `assets/free-media/ledger.json` and in CREDITS.md at the project's root, which the person can paste into a
//   description. Its terms ask for "made with Openverse, not endorsed by it" and forbid bulk downloads: one file is
//   fetched only when the assistant chooses it.
// - Anonymous use: about 20 searches a minute and 200 a day per computer. No key: an open-source app cannot keep one.
// The download follows the picture's own address, which can be on any site, so it is checked like anything from
// outside: https only, no address on this computer or its network, a size cap, and the bytes must really be a
// picture or a sound. It writes only inside the one project the server was started for.
import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export const API = "https://api.openverse.org/v1";
export const LICENCES = ["cc0", "pdm", "by"];
const ENDPOINT = { image: "images", sound: "audio" };
const MAX_RESULTS = 8;
const MAX_PREVIEWS = 6;
const PREVIEW_BYTES = 400_000;
const MAX_BYTES = { image: 40_000_000, sound: 25_000_000 };
const TIMEOUT_MS = 30_000;
// Openverse's picture search can take 15 to 30 seconds and more (seen 2026-10-25); a download is quicker.
const API_TIMEOUT_MS = 60_000;
const MAX_HOPS = 4;
export const MEDIA_FOLDER = ["assets", "free-media"];
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FIND_TOOL = {
  name: "find_free_media",
  description:
    "Search Openverse for free pictures or sounds (sound effects, ambience, some music) that a video may use: " +
    "public domain, or free with credit. Answers with up to eight results, each with its id, licence and source, " +
    "and small previews of the pictures. Nothing is saved: choose one and call use_free_media with its id.",
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["image", "sound"], description: "image for pictures, sound for sounds" },
      query: { type: "string", minLength: 1, maxLength: 120, description: "A few plain English words" },
      count: { type: "integer", minimum: 1, maximum: MAX_RESULTS, description: `At most ${MAX_RESULTS}` },
    },
    required: ["kind", "query"],
  },
};

export const USE_TOOL = {
  name: "use_free_media",
  description:
    "Save one result of find_free_media into this video's assets/free-media folder and record its credit in " +
    "CREDITS.md. Answers with the file's path in the project and the credit line. Tell the person what you used " +
    "and its licence; a file \"free with credit\" must be credited where the video is posted.",
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["image", "sound"] },
      id: { type: "string", description: "The id find_free_media gave" },
    },
    required: ["kind", "id"],
  },
};

/** The licence in plain words, as the assistant should tell the person. */
export function plainLicence(code, version) {
  if (code === "cc0") return "public domain (CC0)";
  if (code === "pdm") return "public domain";
  if (code === "by") return `free with credit (CC BY${version ? ` ${version}` : ""})`;
  return "not usable here";
}

const kindOf = (kind) => {
  if (!Object.hasOwn(ENDPOINT, kind)) throw new Error('kind must be "image" or "sound".');
  return kind;
};

/** The search address: only the licences above, nothing marked mature. */
export function searchUrl(kind, query, count = MAX_RESULTS) {
  const words = String(query ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 120);
  if (!words) throw new Error("Give a few words to search for.");
  const url = new URL(`${API}/${ENDPOINT[kindOf(kind)]}/`);
  url.searchParams.set("q", words);
  url.searchParams.set("license", LICENCES.join(","));
  url.searchParams.set("mature", "false");
  url.searchParams.set("page_size", String(Math.min(Math.max(Math.trunc(Number(count)) || MAX_RESULTS, 1), MAX_RESULTS)));
  return url;
}

const oneLine = (text, max = 120) => String(text ?? "").replace(/[\u0000-\u001f\u007f`*_<>[\]#|]/g, " ")
  .replace(/\s+/g, " ").trim().slice(0, max);

/** The results a video may use, in the few fields the assistant needs. */
export function usableResults(json) {
  const results = Array.isArray(json?.results) ? json.results : [];
  return results.filter((item) => typeof item?.id === "string" && ID.test(item.id) &&
    LICENCES.includes(item.license) && item.mature !== true &&
    !(Array.isArray(item.unstable__sensitivity) && item.unstable__sensitivity.length))
    .map((item) => ({
      id: item.id,
      title: oneLine(item.title) || "untitled",
      creator: oneLine(item.creator) || "unknown",
      licence: plainLicence(item.license, item.license_version),
      source: oneLine(item.source ?? item.provider, 40),
      size: item.width && item.height ? `${item.width} by ${item.height}` : "",
      seconds: Number.isFinite(item.duration) ? Math.round(item.duration / 100) / 10 : null,
      thumbnail: typeof item.thumbnail === "string" ? item.thumbnail : "",
    }));
}

/** The results as lines for the assistant. */
export function describeResults(kind, items) {
  if (!items.length) return `No usable free ${kind === "image" ? "pictures" : "sounds"} found. Try other words.`;
  return items.map((item, index) => [
    `${index + 1}. id ${item.id}: "${item.title}" by ${item.creator}`,
    item.licence, item.source && `from ${item.source}`, item.size, item.seconds != null && `${item.seconds} s`,
  ].filter(Boolean).join(", ")).join("\n");
}

/** True for an address on this computer or its local network, which a download must never reach. */
export function isPrivateAddress(address) {
  const ip = String(address).replace(/^::ffff:/i, "");
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  return true;
}

async function checkedUrl(text, lookup) {
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("the file's address is not usable");
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("the file is not on a safe https address");
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("the file's address could not be reached safely");
  }
  return url;
}

/**
 * Fetch `address` with every redirect checked by hand, reading at most `maxBytes`. Returns a Buffer.
 * `fetchImpl` and `lookup` are passed in so the tests can stand in for the internet.
 */
export async function download(address, { fetchImpl = fetch, lookup = dns.lookup, maxBytes, userAgent }) {
  let url = await checkedUrl(address, lookup);
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const response = await fetchImpl(url, {
      redirect: "manual", headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next || hop === MAX_HOPS) throw new Error("the file's address kept moving");
      url = await checkedUrl(new URL(next, url).href, lookup);
      continue;
    }
    if (!response.ok) throw new Error(`the file's site answered ${response.status}`);
    const declared = Number(response.headers.get("content-length"));
    if (declared > maxBytes) throw new Error("the file is too big");
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) throw new Error("the file is too big");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new Error("the file's address kept moving");
}

/** What the bytes really are: the file extension, or null for anything else. */
export function fileType(bytes) {
  const b = Buffer.from(bytes ?? []);
  const text = (from, to) => b.subarray(from, to).toString("latin1");
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "image", ext: "jpg" };
  if (text(0, 8) === "\x89PNG\r\n\x1a\n") return { kind: "image", ext: "png" };
  if (text(0, 4) === "GIF8") return { kind: "image", ext: "gif" };
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return { kind: "image", ext: "webp" };
  if (text(0, 4) === "RIFF" && text(8, 12) === "WAVE") return { kind: "sound", ext: "wav" };
  if (text(0, 4) === "OggS") return { kind: "sound", ext: "ogg" };
  if (text(0, 4) === "fLaC") return { kind: "sound", ext: "flac" };
  if (text(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { kind: "sound", ext: "mp3" };
  return null;
}

/** A short, safe file name from a title. */
export function slug(title) {
  const plain = String(title ?? "").normalize("NFKD").replace(/[^\x20-\x7e]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return plain || "media";
}

const within = (root, file) => {
  const relative = path.relative(root, file);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
};

/** The project's assets/free-media folder, made if needed, as it really is inside the project; else an error. */
function mediaFolder(projectDir) {
  const root = fs.realpathSync.native(projectDir);
  let folder = projectDir;
  // One level at a time, so a link leading out is found before anything is made on the other side of it.
  for (const part of MEDIA_FOLDER) {
    folder = path.join(folder, part);
    fs.mkdirSync(folder, { recursive: true });
    if (!within(root, fs.realpathSync.native(folder))) throw new Error("this video's assets folder leads outside it");
  }
  return folder;
}

function writeSafely(file, data) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, data);
  try {
    fs.renameSync(temp, file);
  } catch {
    // An indexer or antivirus can hold the file for a moment on Windows.
    fs.copyFileSync(temp, file);
    fs.rmSync(temp, { force: true });
  }
}

/** CREDITS.md from the ledger: what needs credit, what does not, and Openverse's own line. */
export function creditsText(records) {
  const credited = records.filter((record) => record.license === "by");
  const free = records.filter((record) => record.license !== "by");
  const line = (record) => `- ${record.file}: ${oneLine(record.attribution, 400) ||
    `"${record.title}" by ${record.creator}, ${plainLicence(record.license, record.license_version)}`} ` +
    `(source: ${record.page})`;
  return [
    "# Credits",
    "",
    "Pictures and sounds in this video found with Openverse (openverse.org). Openverse does not endorse this video,",
    "and does not check licences: each file's original page is listed, so it can be checked there.",
    "",
    "## Credit needed (copy these lines where the video is posted)",
    "",
    ...(credited.length ? credited.map(line) : ["- none"]),
    "",
    "## Public domain (no credit needed)",
    "",
    ...(free.length ? free.map(line) : ["- none"]),
    "",
  ].join("\n");
}

/** Keep `bytes` as this item's file in the project, and record it. Returns the record. */
export function saveMedia(projectDir, item, bytes, type) {
  const folder = mediaFolder(projectDir);
  const name = `${slug(item.title)}-${item.id.slice(0, 8)}.${type.ext}`;
  writeSafely(path.join(folder, name), bytes);
  const ledgerFile = path.join(folder, "ledger.json");
  let ledger = [];
  try {
    ledger = JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
    if (!Array.isArray(ledger)) ledger = [];
  } catch {
    // No ledger yet, or one that cannot be read: it is made again from this file on.
  }
  const record = {
    id: item.id, file: [...MEDIA_FOLDER, name].join("/"), kind: type.kind, title: oneLine(item.title) || "untitled",
    creator: oneLine(item.creator) || "unknown", license: item.license, license_version: item.license_version ?? "",
    license_url: String(item.license_url ?? ""), page: String(item.foreign_landing_url ?? ""),
    attribution: oneLine(item.attribution, 400), fetched: new Date().toISOString(),
  };
  ledger = [...ledger.filter((entry) => entry?.id !== item.id), record];
  writeSafely(ledgerFile, `${JSON.stringify(ledger, null, 2)}\n`);
  writeSafely(path.join(projectDir, "CREDITS.md"), creditsText(ledger));
  return record;
}

/** The two tools for one project. `fetchImpl` and `lookup` stand in for the internet in tests. */
export function freeMediaTools(projectDir, { fetchImpl = fetch, lookup = dns.lookup, version = "0" } = {}) {
  const userAgent = `Kushmanji/${version} (+https://github.com/webziko/kushmanji)`;
  const askApi = async (url) => {
    let response;
    try {
      response = await fetchImpl(url, { headers: { "User-Agent": userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    } catch {
      throw new Error("Openverse could not be reached; check the internet, or go on without it");
    }
    if (response.status === 429) throw new Error("Openverse asks to wait a minute before searching again");
    if (!response.ok) throw new Error(`Openverse answered ${response.status}`);
    return response.json();
  };

  async function find(args) {
    const kind = kindOf(args?.kind);
    const items = usableResults(await askApi(searchUrl(kind, args?.query, args?.count)));
    const content = [{ type: "text", text: describeResults(kind, items) }];
    if (kind === "image") {
      for (const [index, item] of items.slice(0, MAX_PREVIEWS).entries()) {
        // Openverse's own small preview; a missing one is simply left out.
        if (!item.thumbnail.startsWith(`${API}/images/`)) continue;
        const bytes = await download(item.thumbnail, { fetchImpl, lookup, maxBytes: PREVIEW_BYTES, userAgent })
          .catch(() => null);
        const type = bytes && fileType(bytes);
        if (type?.kind !== "image") continue;
        const mimeType = { jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" }[type.ext];
        content.push({ type: "text", text: `Preview of ${index + 1}:` },
          { type: "image", data: bytes.toString("base64"), mimeType });
      }
    }
    return content;
  }

  async function use(args) {
    const kind = kindOf(args?.kind);
    const id = String(args?.id ?? "");
    if (!ID.test(id)) throw new Error("Give an id that find_free_media gave.");
    const item = await askApi(new URL(`${API}/${ENDPOINT[kind]}/${id}/`));
    if (!LICENCES.includes(item?.license)) throw new Error("that file's licence does not let a video use it freely");
    if (item.mature === true) throw new Error("that file is marked for adults only");
    const bytes = await download(String(item.url ?? ""), { fetchImpl, lookup, maxBytes: MAX_BYTES[kind], userAgent });
    const type = fileType(bytes);
    if (type?.kind !== kind) throw new Error(`the file is not a ${kind === "image" ? "picture" : "sound"} this app can use`);
    const record = saveMedia(projectDir, item, bytes, type);
    return [{ type: "text", text:
      `Saved as ${record.file} (${plainLicence(record.license, record.license_version)}). ` +
      (record.license === "by"
        ? `Credit needed where the video is posted: ${(record.attribution || `"${record.title}" by ${record.creator}`).replace(/\.+$/, "")}. `
        : "No credit needed. ") +
      "It is listed in CREDITS.md at the project's root." }];
  }

  return { find, use };
}
