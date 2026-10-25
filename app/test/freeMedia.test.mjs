// Free pictures and sounds from Openverse for the assistant (M8-12), with the internet stood in for.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  creditsText, download, fileType, FIND_TOOL, freeMediaTools, isPrivateAddress, plainLicence, searchUrl, slug,
  usableResults, USE_TOOL,
} from "../src/main/agents/tools/freeMedia.mjs";
import { answer, TOOL } from "../src/main/agents/tools/look.mjs";

const ID = "5505514b-5257-4fbf-95b1-6af487d7b8f8";
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
const PNG = Buffer.from("\x89PNG\r\n\x1a\n0000", "latin1");
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

/** A stand-in for fetch: `routes` maps an address to { status, json, bytes, headers }. */
function fakeFetch(routes, seen = []) {
  return async (url) => {
    const key = String(url);
    seen.push(key);
    const route = routes[key];
    if (!route) return response({ status: 404 });
    return response(route);
  };
}

function response({ status = 200, json, bytes, headers = {} }) {
  const body = bytes ?? Buffer.from(json ? JSON.stringify(json) : "");
  const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    status, ok: status >= 200 && status < 300,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    json: async () => JSON.parse(body.toString("utf8")),
    body: (async function* chunks() { yield body; })(),
  };
}

const item = (extra = {}) => ({
  id: ID, title: "Sunset over the hills", creator: "Kiwi Tom", license: "by", license_version: "2.0",
  license_url: "https://creativecommons.org/licenses/by/2.0/", foreign_landing_url: "https://www.flickr.com/photos/x/1",
  url: "https://live.staticflickr.com/2942/sunset.jpg", source: "flickr", width: 1024, height: 572,
  thumbnail: `https://api.openverse.org/v1/images/${ID}/thumb/`, mature: false, unstable__sensitivity: [],
  attribution: "\"Sunset over the hills\" by Kiwi Tom is licensed under CC BY 2.0.", ...extra,
});

const tempProject = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kushmanji free media é "));
  fs.writeFileSync(path.join(dir, "index.html"), "<html></html>");
  return dir;
};

test("the search asks only for licences a video may use, nothing mature, at most eight", () => {
  const url = searchUrl("image", "  sunset\nover hills  ", 50);
  assert.equal(url.origin + url.pathname, "https://api.openverse.org/v1/images/");
  assert.equal(url.searchParams.get("q"), "sunset over hills");
  assert.equal(url.searchParams.get("license"), "cc0,pdm,by");
  assert.equal(url.searchParams.get("mature"), "false");
  assert.equal(url.searchParams.get("page_size"), "8");
  assert.equal(searchUrl("sound", "whoosh").pathname, "/v1/audio/");
  assert.throws(() => searchUrl("video", "x"));
  assert.throws(() => searchUrl("image", "   "));
});

test("only usable results are offered, in plain words", () => {
  const results = usableResults({ results: [
    item(), item({ id: "not-an-id" }), item({ license: "by-sa" }), item({ license: "by-nd" }),
    item({ mature: true }), item({ unstable__sensitivity: ["text"] }), item({ license: "cc0", title: "Hills`*<b>" }),
  ] });
  assert.equal(results.length, 2);
  assert.equal(results[0].licence, "free with credit (CC BY 2.0)");
  assert.equal(results[1].licence, "public domain (CC0)");
  assert.equal(results[1].title, "Hills b");
  assert.equal(plainLicence("pdm"), "public domain");
  assert.equal(plainLicence("by-nc"), "not usable here");
});

test("addresses on this computer or its network are never fetched", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.5", "172.20.0.1", "169.254.169.254", "0.0.0.0",
    "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "not an address"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) assert.equal(isPrivateAddress(address), false, address);
});

test("a download is https only, checked at every redirect, and capped", async () => {
  const userAgent = "Kushmanji/test";
  await assert.rejects(download("http://example.com/a.jpg", { fetchImpl: fakeFetch({}), lookup: publicLookup,
    maxBytes: 100, userAgent }), /safe https/);
  await assert.rejects(download("https://inside.test/a.jpg", { fetchImpl: fakeFetch({}),
    lookup: async () => [{ address: "192.168.0.10" }], maxBytes: 100, userAgent }), /reached safely/);
  const lookup = async (host) => [{ address: host === "evil.test" ? "127.0.0.1" : "93.184.216.34" }];
  await assert.rejects(download("https://cdn.test/a.jpg", { fetchImpl: fakeFetch({
    "https://cdn.test/a.jpg": { status: 302, headers: { Location: "https://evil.test/x" } },
  }), lookup, maxBytes: 100, userAgent }), /reached safely/);
  const moved = await download("https://cdn.test/a.jpg", { fetchImpl: fakeFetch({
    "https://cdn.test/a.jpg": { status: 301, headers: { Location: "/b.jpg" } },
    "https://cdn.test/b.jpg": { bytes: JPG },
  }), lookup, maxBytes: 100, userAgent });
  assert.deepEqual(moved, JPG);
  await assert.rejects(download("https://cdn.test/big.jpg", { fetchImpl: fakeFetch({
    "https://cdn.test/big.jpg": { bytes: Buffer.alloc(200) },
  }), lookup, maxBytes: 100, userAgent }), /too big/);
  await assert.rejects(download("https://cdn.test/said.jpg", { fetchImpl: fakeFetch({
    "https://cdn.test/said.jpg": { bytes: JPG, headers: { "Content-Length": "999999" } },
  }), lookup, maxBytes: 100, userAgent }), /too big/);
});

test("a file is what its bytes say, not what its name says", () => {
  assert.equal(fileType(JPG).ext, "jpg");
  assert.equal(fileType(PNG).ext, "png");
  assert.equal(fileType(Buffer.from("RIFF0000WEBPVP8 ", "latin1")).ext, "webp");
  assert.equal(fileType(Buffer.from("ID3\x04", "latin1")).kind, "sound");
  assert.equal(fileType(Buffer.from("RIFF0000WAVEfmt ", "latin1")).ext, "wav");
  assert.equal(fileType(Buffer.from("OggS", "latin1")).ext, "ogg");
  assert.equal(fileType(Buffer.from("fLaC", "latin1")).ext, "flac");
  assert.equal(fileType(Buffer.from("<html>not a picture</html>")), null);
  assert.equal(slug("Sunset über the Hills!"), "sunset-uber-the-hills");
  assert.equal(slug("ಕನ್ನಡ"), "media");
});

test("using a result saves it in assets/free-media, with its credit in the ledger and CREDITS.md", async () => {
  const dir = tempProject();
  try {
    const tools = freeMediaTools(dir, { lookup: publicLookup, fetchImpl: fakeFetch({
      [`https://api.openverse.org/v1/images/${ID}/`]: { json: item() },
      "https://live.staticflickr.com/2942/sunset.jpg": { bytes: JPG },
    }) });
    const [said] = await tools.use({ kind: "image", id: ID });
    assert.match(said.text, /Saved as assets\/free-media\/sunset-over-the-hills-5505514b\.jpg/);
    // The credit line is kept whole, ending in one full stop.
    assert.match(said.text, /Credit needed where the video is posted: "Sunset over the hills" by Kiwi Tom is licensed under CC BY 2\.0\. It is listed/);
    assert.deepEqual(fs.readFileSync(path.join(dir, "assets", "free-media", "sunset-over-the-hills-5505514b.jpg")), JPG);
    const ledger = JSON.parse(fs.readFileSync(path.join(dir, "assets", "free-media", "ledger.json"), "utf8"));
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].page, "https://www.flickr.com/photos/x/1");
    const credits = fs.readFileSync(path.join(dir, "CREDITS.md"), "utf8");
    assert.match(credits, /Openverse does not endorse/);
    assert.match(credits, /## Credit needed[\s\S]*Kiwi Tom is licensed under CC BY 2\.0/);
    // The same file again replaces its record, not doubles it.
    await tools.use({ kind: "image", id: ID });
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "assets", "free-media", "ledger.json"), "utf8")).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a licence that would bind the video, a page that is not a picture, or a made-up id is refused", async () => {
  const dir = tempProject();
  try {
    const refuse = (detail, bytes) => freeMediaTools(dir, { lookup: publicLookup, fetchImpl: fakeFetch({
      [`https://api.openverse.org/v1/images/${ID}/`]: { json: detail },
      "https://live.staticflickr.com/2942/sunset.jpg": { bytes },
    }) });
    await assert.rejects(refuse(item({ license: "by-sa" }), JPG).use({ kind: "image", id: ID }), /licence/);
    await assert.rejects(refuse(item(), Buffer.from("<html>")).use({ kind: "image", id: ID }), /not a picture/);
    await assert.rejects(refuse(item(), JPG).use({ kind: "image", id: "../../etc" }), /id that find_free_media gave/);
    assert.equal(fs.existsSync(path.join(dir, "CREDITS.md")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an assets folder that is a link leading out of the project is refused", async () => {
  const dir = tempProject();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "kushmanji outside "));
  try {
    fs.symlinkSync(outside, path.join(dir, "assets"), "junction");
    const tools = freeMediaTools(dir, { lookup: publicLookup, fetchImpl: fakeFetch({
      [`https://api.openverse.org/v1/images/${ID}/`]: { json: item() },
      "https://live.staticflickr.com/2942/sunset.jpg": { bytes: JPG },
    }) });
    await assert.rejects(tools.use({ kind: "image", id: ID }), /leads outside/);
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    // A junction is removed with rmdir, which takes away the link and never what it points at.
    fs.rmdirSync(path.join(dir, "assets"));
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("a search answers with lines and previews; the server lists and routes the tools", async () => {
  const seen = [];
  const tools = freeMediaTools(tempProject(), { lookup: publicLookup, fetchImpl: fakeFetch({
    [searchUrl("image", "sunset").href]: { json: { results: [item()] } },
    [`https://api.openverse.org/v1/images/${ID}/thumb/`]: { bytes: PNG },
  }, seen) });
  const found = await tools.find({ kind: "image", query: "sunset" });
  assert.match(found[0].text, new RegExp(`id ${ID}: "Sunset over the hills" by Kiwi Tom, free with credit`));
  assert.equal(found.at(-1).type, "image");
  assert.equal(found.at(-1).mimeType, "image/png");

  const look = async () => [];
  const list = await answer({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { look, freeMedia: tools });
  assert.deepEqual(list.result.tools.map((tool) => tool.name), [TOOL.name, FIND_TOOL.name, USE_TOOL.name]);
  const failed = await answer({ jsonrpc: "2.0", id: 2, method: "tools/call",
    params: { name: USE_TOOL.name, arguments: { kind: "image", id: "nope" } } }, { look, freeMedia: tools });
  assert.equal(failed.result.isError, true);
  assert.match(failed.result.content[0].text, /^Nothing found or saved:/);
});

test("the credits file lists what needs credit apart from what does not", () => {
  const text = creditsText([
    { file: "assets/free-media/a.jpg", license: "cc0", title: "A", creator: "X", page: "https://p/a" },
    { file: "assets/free-media/b.mp3", license: "by", license_version: "4.0", title: "B", creator: "Y",
      page: "https://p/b", attribution: "\"B\" by Y is licensed under CC BY 4.0." },
  ]);
  assert.ok(text.indexOf("b.mp3") < text.indexOf("## Public domain"));
  assert.ok(text.indexOf("a.jpg") > text.indexOf("## Public domain"));
});
