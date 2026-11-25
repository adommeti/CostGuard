// List prices in US dollars per million tokens (Anthropic first-party API rates).
// Used only to price past transcripts; live spend comes from Claude Code's own
// cost ledger. Every figure is an estimate: the bill is the authority.
// Edit this table if your organization has negotiated rates.

type Price = { input: number; output: number; cacheRead: number };

// Order matters: the first pattern that matches the model id wins.
const TABLE: ReadonlyArray<readonly [RegExp, Price]> = [
  [/fable-5-2|mythos-5-2/, { input: 8, output: 40, cacheRead: 0.2 }],
  [/fable|mythos/, { input: 10, output: 50, cacheRead: 1 }],
  [/opus-5-5/, { input: 4, output: 20, cacheRead: 0.2 }],
  [/opus/, { input: 5, output: 25, cacheRead: 0.5 }],
  [/sonnet-5-5/, { input: 2, output: 10, cacheRead: 0.1 }],
  [/sonnet-5/, { input: 2, output: 10, cacheRead: 0.2 }],
  [/sonnet/, { input: 3, output: 15, cacheRead: 0.3 }],
  [/haiku-5-5/, { input: 0.1, output: 0.5, cacheRead: 0.01 }],
  [/haiku/, { input: 1, output: 5, cacheRead: 0.1 }],
];

// Unknown models are priced as Sonnet 5.5.
const FALLBACK: Price = { input: 2, output: 10, cacheRead: 0.1 };

export type RawUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
};

export function priceOf(model: string): Price {
  const id = model.toLowerCase();
  for (const [pattern, price] of TABLE) if (pattern.test(id)) return price;
  return FALLBACK;
}

/** The estimated dollar cost of one API response's usage. */
export function costOf(model: string, u: RawUsage): number {
  const p = priceOf(model);
  const n = (x: number | undefined) => (typeof x === "number" && x > 0 ? x : 0);
  const writes = n(u.cache_creation_input_tokens);
  const w1h = n(u.cache_creation?.ephemeral_1h_input_tokens);
  const w5m = Math.max(0, writes - w1h);
  const dollars =
    n(u.input_tokens) * p.input +
    n(u.output_tokens) * p.output +
    n(u.cache_read_input_tokens) * p.cacheRead +
    w5m * p.input * 1.25 +
    w1h * p.input * 2;
  return dollars / 1_000_000;
}
