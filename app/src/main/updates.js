// "Check for a new version" (M5-05, first part; written by ChatGPT's Codex, reviewed by Claude). Asked only when the
// person presses the button in Settings, never in the background: AGENTS.md rules out telemetry, and one GET to
// GitHub's public API, with nothing about the person in it, is all this does. Releases are published by hand
// (docs/MAINTENANCE.md); until the first one, GitHub answers 404 and the person is told none is published yet.
import electron from "electron";

const RELEASE_API = "https://api.github.com/repos/webziko/kushmanji/releases/latest";
const RELEASES_PAGE = "https://github.com/webziko/kushmanji/releases/latest";
const RELEASE_PAGE_PREFIX = "https://github.com/webziko/kushmanji/releases/";
const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const { app } = electron;

function readVersion(tag) {
  if (typeof tag !== "string") return null;
  const match = VERSION.exec(tag);
  if (!match) return null;
  return {
    parts: match.slice(1, 4).map(BigInt),
    prerelease: Boolean(match[4]),
    label: tag.replace(/^v/, "").split(/[+-]/, 1)[0],
  };
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index++) {
    if (left[index] > right[index]) return 1;
    if (left[index] < right[index]) return -1;
  }
  return 0;
}

/**
 * Only Kushmanji's own release pages on github.com. Checked on the parsed address, not the text, so "..", an
 * encoded slash or a different host written into the path cannot lead anywhere else.
 */
export function isReleasePageUrl(page) {
  if (typeof page !== "string" || !page.startsWith(RELEASE_PAGE_PREFIX)) return false;
  try {
    const url = new URL(page);
    return url.origin === "https://github.com" && url.pathname.startsWith("/webziko/kushmanji/releases/") &&
      !/%2f|%5c|\\/i.test(page) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export async function checkForUpdate({ fetchImpl = fetch, current = app.getVersion() }) {
  let response;
  try {
    response = await fetchImpl(RELEASE_API, {
      method: "GET",
      headers: {
        "User-Agent": `Kushmanji/${current}`,
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { state: "offline", current };
  }

  if (response.status === 404) return { state: "none", current };
  if (response.status !== 200) return { state: "problem", current };

  let release;
  try {
    release = await response.json();
  } catch (error) {
    return { state: error?.name === "TimeoutError" ? "offline" : "problem", current };
  }
  if (
    !release || typeof release !== "object" || Array.isArray(release) || typeof release.tag_name !== "string"
  ) {
    return { state: "problem", current };
  }

  const latest = readVersion(release.tag_name);
  const installed = readVersion(current);
  if (!latest || !installed) return { state: "problem", current };
  if (release.draft === true || release.prerelease === true || latest.prerelease) {
    return { state: "newest", current };
  }
  if (compareVersions(latest.parts, installed.parts) <= 0) return { state: "newest", current };

  return {
    state: "newer",
    current,
    latest: latest.label,
    page: isReleasePageUrl(release.html_url) ? release.html_url : RELEASES_PAGE,
  };
}
