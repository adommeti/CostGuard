import type { EngineInterface } from "claude-code";

import type { DayCost, Digest, LedgerRow, Offer, Score, Size, TaskKind } from "../types";
import { costOf, type RawUsage } from "./pricing";

// ---------------------------------------------------------------- paths

/** The user's home folder, forward slashes. */
export async function homeOf($: EngineInterface): Promise<string> {
  const raw =
    (await $.env.get("USERPROFILE").catch(() => undefined)) ??
    (await $.env.get("HOME").catch(() => undefined)) ??
    "";
  return raw.replace(/\\/g, "/").replace(/\/+$/, "");
}

export async function dataDir($: EngineInterface): Promise<string> {
  return `${await homeOf($)}/.claude/cost-guard`;
}

/** Appends one line to a text file, starting a fresh file past 3 MB. */
export async function appendLine($: EngineInterface, path: string, line: string): Promise<void> {
  let old = "";
  if (await $.fs.exists(path).catch(() => false)) {
    const st = await $.fs.stat(path).catch(() => undefined);
    if (st && st.size > 3_000_000) {
      old = String(await $.fs.read(path).catch(() => ""));
      await $.fs.write(`${path}.old`, old);
      old = "";
    } else {
      old = String(await $.fs.read(path).catch(() => ""));
    }
  }
  const sep = old && !old.endsWith("\n") ? "\n" : "";
  await $.fs.write(path, `${old}${sep}${line}\n`);
}

export async function readJsonLines<T>($: EngineInterface, path: string): Promise<T[]> {
  if (!(await $.fs.exists(path).catch(() => false))) return [];
  const text = String(await $.fs.read(path).catch(() => ""));
  const rows: T[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line) as T);
    } catch {
      // a torn line: skip it
    }
  }
  return rows;
}

// ---------------------------------------------------------------- dates

export function dayOf(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------------------------------------------------------- kinds

const KIND_WORDS: ReadonlyArray<readonly [TaskKind, RegExp]> = [
  ["debug", /\b(debug|bug|error|fail(s|ing|ed)?|crash|broken|exception|stack ?trace|fix)\b/i],
  ["review", /\b(review|audit|critique|check (my|the|this)|pr\b|pull request)\b/i],
  [
    "research",
    /\b(research|analy[sz]e|compare|investigate|why|explain|summari[sz]e|find out|market|competitor)\b/i,
  ],
  ["data", /\b(sql|query|dataset|csv|excel|xlsx|dashboard|chart|metrics?|report on)\b/i],
  ["docs", /\b(write|draft|document|readme|memo|email|spec|proposal|slides?|deck)\b/i],
  [
    "code",
    /\b(build|implement|create|add|refactor|code|function|class|api|feature|mod|plugin|script|test)\b/i,
  ],
];

export function kindOf(text: string): TaskKind {
  for (const [kind, pattern] of KIND_WORDS) if (pattern.test(text)) return kind;
  return "other";
}

// Starter figures (USD) used until there is enough local history.
const STARTER: Record<TaskKind, { p50: number; p80: number }> = {
  research: { p50: 0.6, p80: 1.8 },
  code: { p50: 1.2, p80: 3.5 },
  debug: { p50: 0.9, p80: 2.8 },
  review: { p50: 0.5, p80: 1.5 },
  docs: { p50: 0.4, p80: 1.2 },
  data: { p50: 0.8, p80: 2.4 },
  other: { p50: 0.3, p80: 1.0 },
};

// ---------------------------------------------------------------- history

export type Sample = {
  kind: TaskKind;
  usd: number;
  day: string;
  size?: Size;
  tier?: string;
  effort?: string;
};

/** The model family of a model id: haiku, sonnet, opus or fable. */
export function tierOf(model: string | null | undefined): string | undefined {
  const m = /haiku|sonnet|opus|fable|mythos/.exec((model ?? "").toLowerCase());
  return m ? (m[0] === "mythos" ? "fable" : m[0]) : undefined;
}

/** What a scan of past transcripts found, kept in $.store. */
export type History = {
  scannedAt: number;
  files: number;
  samples: Sample[];
  days: Record<string, number>;
};

const STORE_KEY = "history";
const MAX_SAMPLES = 3000;

export async function loadHistory($: EngineInterface): Promise<History | null> {
  const v = (await $.store.get(STORE_KEY).catch(() => undefined)) as History | undefined;
  return v && Array.isArray(v.samples) && typeof v.days === "object" ? v : null;
}

export async function saveHistory($: EngineInterface, h: History): Promise<void> {
  await $.store.set(STORE_KEY, { ...h, samples: h.samples.slice(-MAX_SAMPLES) });
}

/** Adds one finished task to the stored samples, so estimates keep learning. */
export async function addSample($: EngineInterface, s: Sample, times = 1): Promise<void> {
  const h = (await loadHistory($)) ?? { scannedAt: 0, files: 0, samples: [], days: {} };
  await saveHistory($, {
    ...h,
    samples: [...h.samples, ...Array.from({ length: times }, () => s)],
  });
}

/** Takes back the latest sample of this cost: the person said the task was a one-off. */
export async function dropSample($: EngineInterface, usd: number, day: string): Promise<void> {
  const h = await loadHistory($);
  if (!h) return;
  const at = h.samples.findLastIndex((s) => s.day === day && Math.abs(s.usd - usd) < 0.00005);
  if (at >= 0) await saveHistory($, { ...h, samples: h.samples.filter((_, i) => i !== at) });
}

type Row = {
  type?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  timestamp?: string;
  message?: { id?: string; model?: string; usage?: RawUsage; content?: unknown };
};

function promptText(row: Row): string | null {
  if (row.type !== "user" || row.isMeta || row.isSidechain) return null;
  const c = row.message?.content;
  let text = "";
  if (typeof c === "string") text = c;
  else if (Array.isArray(c)) {
    for (const b of c as Array<{ type?: string; text?: string }>) {
      if (b?.type === "tool_result") return null;
      if (b?.type === "text" && typeof b.text === "string") text += b.text;
    }
  }
  text = text.trim();
  if (!text || text.startsWith("<")) return null;
  return text;
}

const FOUR_MB = 4 * 1024 * 1024 - 1024;

async function readTail($: EngineInterface, path: string, size: number): Promise<string> {
  const offset = Math.max(0, size - FOUR_MB);
  const text = String(await $.fs.read(path, { offset, length: size - offset }));
  // A read that starts mid-file starts mid-line: drop the partial first line.
  return offset > 0 ? text.slice(text.indexOf("\n") + 1) : text;
}

/**
 * Reads this computer's Claude Code transcripts from the last `daysBack` days:
 * the cost of each task (a typed prompt and everything until the next one)
 * and the cost of each day. Nothing leaves the machine.
 */
export async function scanTranscripts(
  $: EngineInterface,
  daysBack = 30,
  onProgress?: (done: number, all: number) => void,
): Promise<History> {
  const home = await homeOf($);
  const root = `${home}/.claude/projects`;
  const cutoff = (await $.clock.now()) - daysBack * 86_400_000;
  const files: { path: string; size: number; isSub: boolean }[] = [];

  for (const proj of await $.fs.list(root).catch(() => [])) {
    if (proj.kind !== "dir") continue;
    const dir = `${root}/${proj.name}`;
    for (const f of await $.fs.list(dir).catch(() => [])) {
      if (f.kind === "file" && f.name.endsWith(".jsonl") && f.mtimeMs >= cutoff)
        files.push({ path: `${dir}/${f.name}`, size: f.size, isSub: false });
      if (f.kind === "dir") {
        const sub = `${dir}/${f.name}/subagents`;
        for (const s of await $.fs.list(sub).catch(() => [])) {
          if (s.kind === "file" && s.name.endsWith(".jsonl") && s.mtimeMs >= cutoff)
            files.push({ path: `${sub}/${s.name}`, size: s.size, isSub: true });
        }
      }
    }
  }
  files.sort((a, b) => Number(a.isSub) - Number(b.isSub));
  const chosen = files.slice(0, 600);

  const samples: Sample[] = [];
  const days: Record<string, number> = {};
  const seen = new Set<string>();

  for (let i = 0; i < chosen.length; i += 1) {
    const f = chosen[i]!;
    onProgress?.(i, chosen.length);
    let text = "";
    try {
      text = await readTail($, f.path, f.size);
    } catch {
      continue;
    }
    let task: { kind: TaskKind; usd: number; day: string; tier?: string } | null = null;
    const close = () => {
      if (task && task.usd > 0.0005)
        samples.push({
          kind: task.kind,
          usd: Math.round(task.usd * 10_000) / 10_000,
          day: task.day,
          ...(task.tier ? { tier: task.tier } : {}),
        });
      task = null;
    };
    for (const line of text.split("\n")) {
      if (!line) continue;
      let row: Row;
      try {
        row = JSON.parse(line) as Row;
      } catch {
        continue;
      }
      const ms = row.timestamp ? Date.parse(row.timestamp) : NaN;
      if (!Number.isFinite(ms) || ms < cutoff) continue;
      const prompt = f.isSub ? null : promptText(row);
      if (prompt !== null) {
        close();
        task = { kind: kindOf(prompt), usd: 0, day: dayOf(ms) };
        continue;
      }
      if (row.type === "assistant" && row.message?.usage) {
        const id = row.message.id ?? "";
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        const usd = costOf(row.message.model ?? "", row.message.usage);
        const day = dayOf(ms);
        days[day] = (days[day] ?? 0) + usd;
        if (task) {
          const t = task as { usd: number; tier?: string };
          t.usd += usd;
          t.tier = tierOf(row.message.model) ?? t.tier;
        }
      }
    }
    close();
  }

  for (const d of Object.keys(days)) days[d] = Math.round(days[d]! * 100) / 100;
  return { scannedAt: await $.clock.now(), files: chosen.length, samples, days };
}

// ---------------------------------------------------------------- estimate

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A limit a little above the 80th percentile, rounded up to the next 50 cents. */
export function suggestLimit(p80: number): number {
  return Math.max(0.5, Math.ceil(p80 * 1.25 * 2) / 2);
}

/** What is known about a task beyond its words. */
export type Hint = {
  kind?: TaskKind;
  size?: Size | null;
  tier?: string | null;
  effort?: string | null;
  bias?: number;
};

const SIZE_FACTOR: Record<Size, number> = { small: 0.45, medium: 1, large: 2.4 };
// Starter figures assume an Opus-class model.
const TIER_FACTOR: Record<string, number> = { haiku: 0.05, sonnet: 0.5, opus: 1, fable: 2 };

export function estimate(
  text: string,
  h: History | null,
  askedLimit: number | null,
  hint: Hint = {},
): Offer {
  const kind = hint.kind ?? kindOf(text);
  const size = hint.size ?? null;
  const tier = hint.tier ?? null;
  const effort = hint.effort ?? null;
  const samples = h?.samples ?? [];
  const costs = (keep: (s: Sample) => boolean) =>
    samples
      .filter(keep)
      .map((s) => s.usd)
      .sort((a, b) => a - b);
  const all = costs(() => true);

  // The closest match with at least five past tasks wins.
  const levels: { costs: number[]; label: string; hasSize: boolean }[] = [];
  if (size && tier && effort) {
    levels.push({
      costs: costs(
        (s) => s.kind === kind && s.size === size && s.tier === tier && s.effort === effort,
      ),
      label: `${size} ${kind} tasks on ${tier} at ${effort} effort`,
      hasSize: true,
    });
  }
  if (size && tier)
    levels.push({
      costs: costs((s) => s.kind === kind && s.size === size && s.tier === tier),
      label: `${size} ${kind} tasks on ${tier}`,
      hasSize: true,
    });
  if (size)
    levels.push({
      costs: costs((s) => s.kind === kind && s.size === size),
      label: `${size} ${kind} tasks`,
      hasSize: true,
    });
  levels.push({ costs: costs((s) => s.kind === kind), label: `${kind} tasks`, hasSize: false });
  const hit = levels.find((l) => l.costs.length >= 5);

  // Without a size, a longer request usually means a bigger task.
  const words = text.split(/\s+/).filter(Boolean).length;
  const sizeFactor = size ? SIZE_FACTOR[size] : words > 120 ? 1.6 : words > 50 ? 1.25 : 1;
  const bias = Math.min(2, Math.max(0.5, hint.bias ?? 1));

  let p50: number;
  let p80: number;
  let basis: string;
  if (hit) {
    const f = hit.hasSize ? 1 : sizeFactor;
    p50 = quantile(hit.costs, 0.5) * f;
    p80 = quantile(hit.costs, 0.8) * f;
    basis = `${hit.costs.length} of your past ${hit.label}`;
  } else if (all.length >= 10) {
    // Too few tasks of this kind: scale the starter shape by your overall spend.
    const ratio = quantile(all, 0.5) / STARTER.other.p50;
    p50 =
      (STARTER[kind].p50 * Math.min(Math.max(ratio, 0.2), 5) * 0.5 + quantile(all, 0.5) * 0.5) *
      sizeFactor *
      bias;
    p80 = Math.max(p50 * 1.5, quantile(all, 0.8) * sizeFactor * bias);
    basis = `${all.length} of your past tasks (few were ${kind})`;
  } else {
    const t = (tier ? TIER_FACTOR[tier] : undefined) ?? 1;
    p50 = STARTER[kind].p50 * sizeFactor * t * bias;
    p80 = STARTER[kind].p80 * sizeFactor * t * bias;
    basis = "starter figures (little local history yet)";
  }
  p50 = round2(Math.max(0.01, p50));
  p80 = round2(Math.max(p50, p80));
  return { text, kind, p50, p80, basis, size, askedLimit, suggestedLimit: suggestLimit(p80) };
}

// ---------------------------------------------------------------- daily report

export function lastDays(days: Record<string, number>, todayMs: number, count: number): DayCost[] {
  const out: DayCost[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const day = dayOf(todayMs - i * 86_400_000);
    out.push({ day, usd: round2(days[day] ?? 0) });
  }
  return out;
}

export function sumDays(days: Record<string, number>, todayMs: number, count: number): number {
  return round2(lastDays(days, todayMs, count).reduce((s, d) => s + d.usd, 0));
}

export type { LedgerRow };

// ---------------------------------------------------------------- scorecard

/** How good the estimates have been, over tasks that ran to their end. */
export function scoreOf(rows: readonly LedgerRow[]): Score {
  const done = rows.filter((r) => !r.isStopped && r.actual >= 0.01 && r.p50 > 0);
  const share = (list: readonly LedgerRow[]) =>
    list.length ? list.filter((r) => r.actual <= r.p80).length / list.length : 0;
  const ratios = done.map((r) => r.actual / r.p50).sort((a, b) => a - b);
  const kinds = [...new Set(done.map((r) => r.kind))];
  return {
    n: done.length,
    within: share(done),
    medianRatio: ratios.length ? Math.round(quantile(ratios, 0.5) * 100) / 100 : 1,
    recent: done.length >= 10 ? share(done.slice(-20)) : null,
    prior: done.length >= 40 ? share(done.slice(-40, -20)) : null,
    byKind: kinds
      .map((kind) => ({
        kind,
        n: done.filter((r) => r.kind === kind).length,
        within: share(done.filter((r) => r.kind === kind)),
      }))
      .sort((a, b) => b.n - a.n),
  };
}

// ---------------------------------------------------------------- weekly digest

/** A small task, or a medium one of a kind that seldom needs the largest model. */
export function isRoutine(kind: TaskKind, size: Size | null | undefined): boolean {
  return size === "small" || (size === "medium" && kind !== "code" && kind !== "debug");
}

/** Where the last seven days' money went, and the habits that would save the most. Savings are rough. */
export function digestOf(rows: readonly LedgerRow[], nowMs: number): Digest {
  const from = dayOf(nowMs - 6 * 86_400_000);
  const week = rows.filter((r) => r.day >= from && r.actual > 0);
  const sum = (list: readonly LedgerRow[]) => list.reduce((s, r) => s + r.actual, 0);
  const total = sum(week);
  const kinds = [...new Set(week.map((r) => r.kind))];
  const habits: { text: string; saves: number }[] = [];
  const usd = (n: number) => `$${n.toFixed(2)}`;

  const reread = week.reduce((s, r) => s + (r.reread ?? 0), 0);
  if (total > 0 && reread >= total * 0.15) {
    habits.push({
      text: `${usd(reread)} (${Math.round((reread / total) * 100)}% of the week) went on re-reading long chat history. Run /compact when a chat gets long, and start a fresh chat for a new topic.`,
      saves: reread * 0.5,
    });
  }
  const pricey = week.filter(
    (r) => isRoutine(r.kind, r.size) && (r.tier === "opus" || r.tier === "fable") && !r.handed,
  );
  if (pricey.length > 0) {
    const saves = pricey.reduce((s, r) => s + r.actual * (r.tier === "fable" ? 0.75 : 0.5), 0);
    habits.push({
      text: `${pricey.length} routine tasks ran on Opus or Fable and cost ${usd(sum(pricey))}. Sonnet would likely have done them: switch with /model for routine work.`,
      saves,
    });
  }
  const eager = week.filter(
    (r) => r.size === "small" && (r.effort === "xhigh" || r.effort === "max"),
  );
  if (eager.length > 0) {
    habits.push({
      text: `${eager.length} small tasks ran at ${eager[0]!.effort} effort and cost ${usd(sum(eager))}. Medium effort is usually enough for small tasks.`,
      saves: sum(eager) * 0.3,
    });
  }
  const vague = week.filter((r) => r.isVague);
  if (vague.length > 0) {
    habits.push({
      text: `${vague.length} prompts were vague about the goal or where to look, and cost ${usd(sum(vague))}. Naming the files and what "done" means cuts exploration.`,
      saves: sum(vague) * 0.2,
    });
  }
  const paused = week.filter((r) => r.isStopped).length;
  if (paused >= 3)
    habits.push({
      text: `${paused} tasks were stopped at their limit. If the limit is too low for your work, raise it with /spend set task.`,
      saves: 0,
    });

  return {
    total: round2(total),
    tasks: week.length,
    byKind: kinds
      .map((kind) => ({ kind, usd: round2(sum(week.filter((r) => r.kind === kind))) }))
      .sort((a, b) => b.usd - a.usd),
    top: [...week]
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 3)
      .map((r) => ({ text: r.text, usd: round2(r.actual) })),
    habits: habits
      .sort((a, b) => b.saves - a.saves)
      .slice(0, 3)
      .map((h) => ({ text: h.text, saves: round2(h.saves) })),
  };
}
