import type { EngineInterface } from "claude-code";

import type { Config, Spend, Totals } from "../types";
import { dayOf } from "./history";

// ---------------------------------------------------------------- settings

export const DEFAULTS: Config = {
  basis: "list",
  discountPct: 0,
  taskLimit: 5,
  dailyBudget: null,
  period: null,
  alertUsd: 1,
  emoji: false,
  sizing: true,
  feedback: true,
  tips: true,
};

export async function loadConfig($: EngineInterface): Promise<Config> {
  const v = await $.store.get("config").catch(() => undefined);
  return { ...DEFAULTS, ...(v && typeof v === "object" ? (v as Partial<Config>) : {}) };
}

export async function saveConfig($: EngineInterface, c: Config): Promise<void> {
  await $.store.set("config", c);
}

/** What a list-price dollar is worth to this user. */
export const multOf = (c: Config) =>
  c.basis === "discount" ? Math.max(0, 1 - c.discountPct / 100) : 1;

/** The session's cost so far, in the user's dollars. An estimate. */
export async function usdNow($: EngineInterface, c: Config): Promise<number> {
  const u = await $.session.usage().catch(() => undefined);
  return (u?.cost?.usd ?? 0) * multOf(c);
}

/** Formats dollars; on a subscription they are API-equivalent, marked with ≈. */
export const fmt = (c: Config) => (n: number) =>
  `${c.basis === "subscription" ? "≈" : ""}$${n.toFixed(2)}`;

export const basisLabel = (c: Config) =>
  c.basis === "list"
    ? "API list prices"
    : c.basis === "discount"
      ? `list prices less ${c.discountPct}%`
      : "subscription (API-equivalent dollars)";

/** The plan's rate-limit windows, for subscription users: "5-hour 23% · weekly 41%". */
export async function planLine($: EngineInterface): Promise<string> {
  const u = await $.session.usage().catch(() => undefined);
  const names: Record<string, string> = {
    five_hour: "5-hour",
    seven_day: "weekly",
    spend_limit: "spend limit",
  };
  return (u?.rateLimits ?? [])
    .map((r) => `${names[r.kind] ?? r.kind} ${Math.round(r.percentUsed)}%`)
    .join(" · ");
}

// ---------------------------------------------------------------- spend by day

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export async function loadSpend($: EngineInterface): Promise<Spend> {
  const v = (await $.store.get("spend").catch(() => undefined)) as Spend | undefined;
  return v && typeof v.days === "object" && typeof v.sess === "object" ? v : { days: {}, sess: {} };
}

let chain: Promise<unknown> = Promise.resolve();

/**
 * Adds what this session has cost since it was last counted to today's total.
 * Calls run one at a time, so two subagents finishing together count once each.
 */
export function flushSpend($: EngineInterface, c: Config): Promise<Spend> {
  const run = chain.then(() => doFlush($, c));
  chain = run.catch(() => undefined);
  return run;
}

async function doFlush($: EngineInterface, c: Config): Promise<Spend> {
  const s = await loadSpend($);
  const id = (await $.session.id().catch(() => "")) || "unknown";
  const usd = await usdNow($, c);
  const seen = s.sess[id] ?? 0;
  // A session whose cost fell (a /clear) starts counting again from zero.
  const delta = usd + 0.0001 < seen ? usd : Math.max(0, usd - seen);
  if (delta === 0 && s.sess[id] !== undefined) return s;
  const now = await $.clock.now();
  const today = dayOf(now);
  const cutoff = dayOf(now - 120 * 86_400_000);
  const days: Record<string, number> = {};
  for (const [d, n] of Object.entries(s.days)) if (d >= cutoff) days[d] = n;
  days[today] = round4((days[today] ?? 0) + delta);
  const sess: Record<string, number> = {};
  for (const [k, n] of Object.entries(s.sess).slice(-40)) if (k !== id) sess[k] = n;
  sess[id] = round4(usd);
  const out = { days, sess };
  await $.store.set("spend", out).catch(() => undefined);
  return out;
}

// ---------------------------------------------------------------- periods

/** The days of the current week (from Monday) or month so far, and its full length. */
export function periodDays(
  kind: "week" | "month",
  nowMs: number,
): { days: string[]; length: number; startMs: number } {
  const d = new Date(nowMs);
  d.setHours(12, 0, 0, 0);
  let start: Date;
  let length: number;
  if (kind === "week") {
    start = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86_400_000);
    length = 7;
  } else {
    start = new Date(d.getFullYear(), d.getMonth(), 1, 12);
    length = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }
  const days: string[] = [];
  for (let t = start.getTime(); t <= d.getTime() + 1000; t += 86_400_000) days.push(dayOf(t));
  return { days, length, startMs: start.getTime() };
}

export function totalsOf(s: Spend, c: Config, nowMs: number): Totals {
  const day = dayOf(nowMs);
  const today = s.days[day] ?? 0;
  if (!c.period) return { day, today, period: 0, projected: 0, hitDay: null };
  const p = periodDays(c.period.kind, nowMs);
  const period = p.days.reduce((sum, d) => sum + (s.days[d] ?? 0), 0);
  const perDay = period / Math.max(1, p.days.length);
  const projected = perDay * p.length;
  let hitDay: string | null = null;
  if (perDay > 0 && projected > c.period.usd) {
    const idx = Math.ceil(c.period.usd / perDay);
    hitDay = dayOf(p.startMs + (Math.min(idx, p.length) - 1) * 86_400_000);
  }
  return { day, today, period, projected, hitDay };
}

/** "This week $31.40 of $100 · on pace for $62" */
export function paceLine(t: Totals, c: Config): string {
  if (!c.period) return "";
  const m = fmt(c);
  const name = c.period.kind === "week" ? "This week" : "This month";
  const head = `${name} ${m(t.period)} of ${m(c.period.usd)}`;
  if (t.period >= c.period.usd) return `${head} · budget reached`;
  if (t.hitDay) return `${head} · at this pace the budget runs out on ${t.hitDay.slice(5)}`;
  return `${head} · on pace for ${m(t.projected)}`;
}

// ---------------------------------------------------------------- small drawings

/** A bar of `width` cells: ▰▰▰▱▱▱▱▱ */
export function bar(ratio: number, width = 8): string {
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  const full = Math.round(r * width);
  return "▰".repeat(full) + "▱".repeat(width - full);
}

/** ▁▂▅▃▇▂▄ for a run of values. */
export function spark(values: readonly number[]): string {
  const max = Math.max(0.0001, ...values);
  return values.map((v) => "▁▂▃▄▅▆▇█".charAt(Math.min(7, Math.round((v / max) * 7)))).join("");
}

/** The theme colour for how full something is. */
export const toneOf = (ratio: number): "success" | "warning" | "error" =>
  ratio >= 1 ? "error" : ratio >= 0.75 ? "warning" : "success";

export const markOf = (c: Config, ratio: number) =>
  c.emoji ? (ratio >= 1 ? "🔴 " : ratio >= 0.75 ? "🟡 " : "🟢 ") : "";
