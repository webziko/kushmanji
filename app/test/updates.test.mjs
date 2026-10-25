import assert from "node:assert/strict";
import test from "node:test";
import { checkForUpdate, isReleasePageUrl } from "../src/main/updates.js";

const CURRENT = "1.9.9";
const RELEASE_URL = "https://api.github.com/repos/webziko/kushmanji/releases/latest";
const SAFE_PAGE = "https://github.com/webziko/kushmanji/releases/latest";

function release(tag_name, values = {}) {
  return {
    tag_name,
    draft: false,
    prerelease: false,
    html_url: `https://github.com/webziko/kushmanji/releases/${tag_name}`,
    ...values,
  };
}

function fakeFetch(status, body) {
  return async () => ({ status, json: async () => body });
}

test("a higher version uses the fixed GET request and exact headers", async () => {
  let request;
  const result = await checkForUpdate({
    current: CURRENT,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { status: 200, json: async () => release("1.10.0") };
    },
  });

  assert.deepEqual(result, {
    state: "newer",
    current: CURRENT,
    latest: "1.10.0",
    page: "https://github.com/webziko/kushmanji/releases/1.10.0",
  });
  assert.equal(request.url, RELEASE_URL);
  assert.deepEqual(Object.keys(request.options).sort(), ["headers", "method", "signal"]);
  assert.deepEqual(request.options.method, "GET");
  assert.deepEqual(request.options.headers, {
    "User-Agent": `Kushmanji/${CURRENT}`,
    Accept: "application/vnd.github+json",
  });
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.equal(request.options.signal.aborted, false);
});

test("a higher version with a leading v is reported without the v", async () => {
  const result = await checkForUpdate({
    current: CURRENT,
    fetchImpl: fakeFetch(200, release("v2.0.0")),
  });

  assert.deepEqual(result, {
    state: "newer",
    current: CURRENT,
    latest: "2.0.0",
    page: "https://github.com/webziko/kushmanji/releases/v2.0.0",
  });
});

test("the same or an older version is reported as newest", async (t) => {
  for (const tag of ["1.9.9", "v1.8.12"]) {
    await t.test(tag, async () => {
      assert.deepEqual(await checkForUpdate({
        current: CURRENT,
        fetchImpl: fakeFetch(200, release(tag)),
      }), { state: "newest", current: CURRENT });
    });
  }
});

test("draft and pre-release results are ignored", async (t) => {
  for (const item of [
    release("2.0.0", { draft: true }),
    release("v2.0.0-beta.1", { prerelease: true }),
  ]) {
    await t.test(item.tag_name, async () => {
      assert.deepEqual(await checkForUpdate({
        current: CURRENT,
        fetchImpl: fakeFetch(200, item),
      }), { state: "newest", current: CURRENT });
    });
  }
});

test("GitHub 404 means that no version is published yet", async () => {
  assert.deepEqual(await checkForUpdate({ current: CURRENT, fetchImpl: fakeFetch(404, null) }), {
    state: "none",
    current: CURRENT,
  });
});

test("a failed request is reported as offline", async () => {
  assert.deepEqual(await checkForUpdate({
    current: CURRENT,
    fetchImpl: async () => { throw new Error("network unavailable"); },
  }), { state: "offline", current: CURRENT });
});

test("a timed out request is reported as offline", async () => {
  const originalTimeout = AbortSignal.timeout;
  let timeoutMs;
  AbortSignal.timeout = (milliseconds) => {
    timeoutMs = milliseconds;
    return originalTimeout.call(AbortSignal, milliseconds);
  };

  try {
    assert.deepEqual(await checkForUpdate({
      current: CURRENT,
      fetchImpl: async (_url, { signal }) => {
        assert.ok(signal instanceof AbortSignal);
        throw new DOMException("The operation timed out", "TimeoutError");
      },
    }), { state: "offline", current: CURRENT });
  } finally {
    AbortSignal.timeout = originalTimeout;
  }
  assert.equal(timeoutMs, 10_000);
});

test("an unexpected HTTP status is a problem", async () => {
  assert.deepEqual(await checkForUpdate({ current: CURRENT, fetchImpl: fakeFetch(500, {}) }), {
    state: "problem",
    current: CURRENT,
  });
});

test("a response without a version tag is a problem", async () => {
  assert.deepEqual(
    await checkForUpdate({ current: CURRENT, fetchImpl: fakeFetch(200, { html_url: SAFE_PAGE }) }),
    { state: "problem", current: CURRENT },
  );
});

test("a response body that cannot be read is a problem", async () => {
  assert.deepEqual(await checkForUpdate({
    current: CURRENT,
    fetchImpl: async () => ({ status: 200, json: async () => { throw new SyntaxError("bad JSON"); } }),
  }), { state: "problem", current: CURRENT });
});

test("a timeout while reading the response is reported as offline", async () => {
  assert.deepEqual(await checkForUpdate({
    current: CURRENT,
    fetchImpl: async () => ({
      status: 200,
      json: async () => { throw new DOMException("The operation timed out", "TimeoutError"); },
    }),
  }), { state: "offline", current: CURRENT });
});

test("a release URL on another site uses the fixed release page", async () => {
  const result = await checkForUpdate({
    current: CURRENT,
    fetchImpl: fakeFetch(200, release("2.0.0", { html_url: "https://example.com/releases/2.0.0" })),
  });

  assert.equal(result.page, SAFE_PAGE);
});

test("the release-page check accepts only the Kushmanji GitHub releases path", () => {
  assert.equal(isReleasePageUrl("https://github.com/webziko/kushmanji/releases/2.0.0"), true);
  assert.equal(isReleasePageUrl("https://github.com.evil.test/webziko/kushmanji/releases/2.0.0"), false);
  assert.equal(isReleasePageUrl("https://example.com/webziko/kushmanji/releases/2.0.0"), false);
  assert.equal(isReleasePageUrl("javascript:alert(1)"), false);
  assert.equal(isReleasePageUrl(null), false);
});

test("the page check reads the real address: no way out of Kushmanji's releases on github.com", () => {
  assert.equal(isReleasePageUrl("https://github.com/webziko/kushmanji/releases/tag/v0.2.0"), true);
  for (const page of [
    "https://github.com/webziko/kushmanji/releases/../../../someone-else",
    "https://github.com/webziko/kushmanji/releases/%2e%2e/%2e%2e/x",
    "https://github.com/webziko/kushmanji/releases/..%2f..%2fx",
    "https://github.com/webziko/kushmanji/releases/..\\..\\x",
  ]) assert.equal(isReleasePageUrl(page), false, page);
});
