// Plain words for a turn stopped by a sign-out or a lost connection (M2-12).
import assert from "node:assert/strict";
import { test } from "node:test";
import { plainProblem } from "../src/main/agents/problems.js";

const claude = { name: "Claude", signIn: "claude auth login" };

test("a sign-out says so, with the command that signs in again", () => {
  for (const error of ["Invalid API key · Please run /login", "API Error: 401 {\"type\":\"authentication_error\"}",
    "Not logged in", "OAuth token has expired"]) {
    const got = plainProblem({ error }, claude);
    assert.equal(got?.kind, "signed-out", error);
    assert.match(got.said, /Claude is signed out.*claude auth login/);
  }
});

test("a lost connection says so", () => {
  for (const error of ["getaddrinfo ENOTFOUND api.anthropic.com", "stream error: fetch failed", "ECONNRESET",
    "Could not resolve host: chatgpt.com"]) {
    assert.equal(plainProblem({ error }, claude)?.kind, "offline", error);
  }
});

test("other failures are left as they are", () => {
  assert.equal(plainProblem({ error: "Claude stopped unexpectedly (exit code 1)." }, claude), null);
  assert.equal(plainProblem({ error: "" }, claude), null);
  assert.equal(plainProblem({}, claude), null);
});
