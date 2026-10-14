// What a reply cost, in words a person can use (M15-05). Claude Code and Codex both report the tokens a turn used.
// Plans count them against the person's allowance, re-read context far more cheaply than new words, so the
// weight below gives re-read ("cached") tokens a tenth. The bands are rough on purpose: they say whether a
// request was a small one, not what the plan's exact meter shows.
const LITTLE = 40_000;
const SOME = 250_000;

const count = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : 0);

/** `{ tokens, level }` from the raw counts, or null when none were reported. */
export function weigh({ fresh = 0, cached = 0, written = 0 }) {
  const total = count(fresh) + count(cached) + count(written);
  if (!total) return null;
  const tokens = Math.round(count(fresh) + count(cached) / 10 + count(written));
  return { tokens, level: tokens < LITTLE ? "little" : tokens < SOME ? "some" : "a lot", fresh: count(fresh),
    cached: count(cached), written: count(written) };
}

/** Claude Code's `result` event: `usage` with input, cache creation, cache read and output tokens. */
export function fromClaude(event) {
  const usage = event?.usage ?? {};
  return weigh({
    fresh: count(usage.input_tokens) + count(usage.cache_creation_input_tokens),
    cached: usage.cache_read_input_tokens,
    written: usage.output_tokens,
  });
}

/** Codex's `turn.completed` event: `usage` with input (cached ones included), cached input and output tokens. */
export function fromCodex(event) {
  const usage = event?.usage ?? {};
  return weigh({
    fresh: Math.max(0, count(usage.input_tokens) - count(usage.cached_input_tokens)),
    cached: usage.cached_input_tokens,
    written: usage.output_tokens,
  });
}
