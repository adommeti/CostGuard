// Cost Guard, by Anantha Dommeti.
// Tracks what every task costs, estimates it up front, pauses and asks before
// a task, daily or longer budget is passed, keeps subagents on Sonnet or Haiku,
// and draws a themed band and dashboard. Every figure is a local estimate.

import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type {
  Active,
  Config,
  DayCost,
  Gate,
  LedgerRow,
  Nudge,
  Offer,
  Panel,
  Report,
  Size,
  TaskKind,
  Tip,
  Totals,
} from "../types";
import {
  bar,
  basisLabel,
  flushSpend,
  fmt,
  loadConfig,
  loadSpend,
  markOf,
  multOf,
  paceLine,
  planLine,
  saveConfig,
  spark,
  toneOf,
  totalsOf,
  usdNow,
} from "./config";
import { dashboardHtml } from "./dashboard";
import {
  addSample,
  appendLine,
  dataDir,
  dayOf,
  dropSample,
  estimate,
  lastDays,
  loadHistory,
  readJsonLines,
  saveHistory,
  scanTranscripts,
  scoreOf,
  sumDays,
  tierOf,
} from "./history";
import { digestOf, isRoutine } from "./history";
import { priceOf } from "./pricing";
import type { Hint } from "./history";

const PANE = "cost-guard";
const TITLE = "Cost Guard";
const panel = atom({ plugin: "cost-guard", key: "panel" } as const, null, { shape: "panel-2" });
const active = atom({ plugin: "cost-guard", key: "active" } as const, null, { shape: "active-4" });
const tip = atom({ plugin: "cost-guard", key: "tip" } as const, null, { shape: "tip-1" });
const last = atom({ plugin: "cost-guard", key: "last" } as const, null, { shape: "last-1" });
const nudge = atom({ plugin: "cost-guard", key: "nudge" } as const, null, { shape: "nudge-1" });
const totals = atom({ plugin: "cost-guard", key: "totals" } as const, null, { shape: "totals-1" });
const gate = atom({ plugin: "cost-guard", key: "gate" } as const, null, { shape: "gate-1" });

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const round2 = (n: number) => Math.round(n * 100) / 100;

const HELP = [
  "Cost Guard tracks every task, and pauses to ask before a limit is passed.",
  "  /spend                    open the Cost Guard pane (today, budgets, last 7 days)",
  "  /spend <task>             estimate the task, then choose how to start it",
  "  /spend $5 <task>          the same, with a $5 limit",
  "  /spend setup              how you pay, default task limit, daily and longer budgets",
  "  /spend set <name> <value> one setting: task, daily, weekly, monthly, alert (dollars or off),",
  "                            discount (percent), emoji, sizing, feedback, tips (on or off)",
  "  /spend report             14-day dashboard in the pane",
  "  /spend export             save the dashboard as an HTML page and open it",
  "  /spend learn | forget     use, or stop using, your past chats for estimates",
  "  /spend stop               stop watching the current task",
  "All figures are estimates; your bill is the authority.",
].join("\n");

async function consentOf($: EngineInterface): Promise<"yes" | "no" | undefined> {
  const v = await $.store.get("consent").catch(() => undefined);
  return v === "yes" || v === "no" ? v : undefined;
}

async function showPane($: EngineInterface, p: Panel): Promise<void> {
  await update($, panel, () => p);
  await $.ui.open({ id: PANE, title: TITLE });
}

/** Counts the session's new spend into today and refreshes the running totals. */
async function refreshTotals($: EngineInterface, c: Config): Promise<Totals> {
  const s = await flushSpend($, c);
  const t = totalsOf(s, c, await $.clock.now());
  await update($, totals, () => t);
  return t;
}

async function gateOf($: EngineInterface): Promise<Gate> {
  const day = dayOf(await $.clock.now());
  const g = await read($, gate);
  return g && g.day === day
    ? g
    : { day, dayExtra: 0, isDayIgnored: false, isPeriodIgnored: false, warned: [] };
}

async function recentDays($: EngineInterface, count: number): Promise<DayCost[]> {
  const days = await mergedDays($);
  return lastDays(days, await $.clock.now(), count);
}

/** Days Cost Guard counted itself, filled in from past chats where those say more. */
async function mergedDays($: EngineInterface): Promise<Record<string, number>> {
  const days = { ...(await loadSpend($)).days };
  const h = (await consentOf($)) === "yes" ? await loadHistory($) : null;
  for (const [d, n] of Object.entries(h?.days ?? {})) days[d] = Math.max(days[d] ?? 0, n);
  return days;
}

// ---------------------------------------------------------------- learning

let isScanning = false;

async function learn($: EngineInterface): Promise<void> {
  if (isScanning) return;
  isScanning = true;
  await showPane($, { view: "note", text: "Reading your last 30 days of chats on this computer…" });
  try {
    const c = await loadConfig($);
    const mult = multOf(c);
    const h = await scanTranscripts($, 30);
    const days: Record<string, number> = {};
    for (const [d, n] of Object.entries(h.days)) days[d] = round2(n * mult);
    await saveHistory($, {
      ...h,
      days,
      samples: h.samples.map((s) => ({ ...s, usd: s.usd * mult })),
    });
    const total = Object.values(days).reduce((s, n) => s + n, 0);
    await showPane($, {
      view: "note",
      text: `Learned from ${h.samples.length} tasks in ${h.files} chat files (about ${fmt(c)(total)} over 30 days). Estimates now use your own history.`,
    });
  } catch (err) {
    await showPane($, {
      view: "note",
      text: `Could not read past chats: ${String(err).slice(0, 200)}. Estimates keep using starter figures.`,
    });
  } finally {
    isScanning = false;
  }
}

// ---------------------------------------------------------------- sizing and calibration

const KINDS: readonly TaskKind[] = ["research", "code", "debug", "review", "docs", "data", "other"];
const SIZES: readonly Size[] = ["small", "medium", "large"];

/** A small model reads the request and names its kind, its size and whether it is vague; null when it cannot. */
async function sizeUp(
  $: EngineInterface,
  text: string,
): Promise<{ kind: TaskKind; size: Size; isVague: boolean } | null> {
  if (text.trim().length < 12) return null; // "yes", "continue": nothing to read
  try {
    const r = await $.model.complete({
      model: "haiku",
      effort: "low",
      maxTokens: 200,
      timeoutMs: 8000,
      system:
        "You size requests made to a coding assistant. Reply with exactly three words: a kind, a size, and clear or vague.",
      prompt: `Kinds: research, code, debug, review, docs, data, other.\nSizes: small (a quick answer or a one-file change), medium (several files or steps), large (a long multi-step job: a feature, a broad investigation, many files).\nvague: the request does not say what outcome is wanted, or gives no hint where to look, so the assistant must explore widely. Otherwise clear.\n\n<request>\n${text.slice(0, 4000)}\n</request>\n\nReply with the kind, the size, and clear or vague. Nothing else.`,
    });
    if (!r.isAnswered) return null;
    const words = r.text.toLowerCase();
    const kind = KINDS.find((k) => new RegExp(`\\b${k}\\b`).test(words));
    const size = SIZES.find((s) => new RegExp(`\\b${s}\\b`).test(words));
    return kind && size ? { kind, size, isVague: /\bvague\b/.test(words) } : null;
  } catch {
    return null;
  }
}

/** A tighter wording of a vague request, from the small model; null when it has none. */
async function rewriteOf($: EngineInterface, text: string): Promise<string | null> {
  try {
    const r = await $.model.complete({
      model: "haiku",
      effort: "low",
      maxTokens: 500,
      timeoutMs: 10000,
      system:
        "You tighten requests made to a coding assistant so they need less exploration. Reply with the rewritten request only.",
      prompt: `Rewrite the request below: state the goal, name the files or area if the request gives them, set the scope, and say what done looks like. Keep the person's intent. Invent no facts: where a specific is missing and matters, write a short [placeholder] for the person to fill. At most four sentences.\n\n<request>\n${text.slice(0, 4000)}\n</request>`,
    });
    const out = r.isAnswered ? r.text.trim() : "";
    return out.length >= 20 && out !== text.trim() ? out.slice(0, 1200) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- tips

type TipKind = "model" | "effort" | "compact" | "cache" | "rewrite";
type TipTally = Record<string, { yes: number; no: number }>;

async function tipTally($: EngineInterface, kind: TipKind, isAccepted: boolean): Promise<void> {
  const all = ((await $.store.get("tips").catch(() => undefined)) as TipTally | undefined) ?? {};
  const one = all[kind] ?? { yes: 0, no: 0 };
  await $.store
    .set("tips", {
      ...all,
      [kind]: isAccepted ? { ...one, yes: one.yes + 1 } : { ...one, no: one.no + 1 },
    })
    .catch(() => undefined);
}

/** A kind of tip the person has turned down three times and never taken is no longer shown. */
async function isMuted($: EngineInterface, kind: TipKind): Promise<boolean> {
  const all = ((await $.store.get("tips").catch(() => undefined)) as TipTally | undefined) ?? {};
  return (all[kind]?.no ?? 0) >= 3 && (all[kind]?.yes ?? 0) === 0;
}

const PRICE_VS_SONNET: Record<string, number> = { opus: 2, fable: 4 };

/** Sonnet's likely cost for a routine task that would run on Opus or Fable; null when there is no case for it. */
function cheaperFor(
  o: Offer,
  tier: string | null | undefined,
): { model: string; p50: number } | null {
  const ratio = tier ? PRICE_VS_SONNET[tier] : undefined;
  if (!ratio || !isRoutine(o.kind, o.size)) return null;
  return { model: "sonnet", p50: Math.max(0.01, round2(o.p50 / ratio)) };
}

/** The person's answer to a tip in the band. */
async function answerTip($: EngineInterface, t: Tip, isAccepted: boolean): Promise<void> {
  await update($, tip, () => null);
  if (t.isInfo) return;
  await tipTally($, t.kind, isAccepted);
  if (!isAccepted) return;
  if (t.kind === "model")
    await update($, active, (x) => (x && x.turnId === t.turnId ? { ...x, model: "sonnet" } : x));
  if (t.kind === "effort")
    await update($, active, (x) =>
      x && x.turnId === t.turnId ? { ...x, effortTo: "medium" as const } : x,
    );
}

type Calib = { ratios: number[] };
type Tally = { lowLimit: number; dismissed: number };

/** How far recent tasks ran from their likely estimate: the median of actual over p50. */
async function biasOf($: EngineInterface): Promise<number> {
  const v = (await $.store.get("calib").catch(() => undefined)) as Calib | undefined;
  const r = [...(v?.ratios ?? [])].sort((a, b) => a - b);
  return r.length >= 5 ? r[Math.floor(r.length / 2)]! : 1;
}

async function hintOf($: EngineInterface): Promise<Hint> {
  const l = await read($, last);
  return { tier: tierOf(l?.model) ?? null, effort: l?.effort ?? null, bias: await biasOf($) };
}

/** After the turn has started: size the task with the small model, sharpen its estimate, and offer a saving. */
async function resize($: EngineInterface, turnId: string, text: string): Promise<void> {
  const sized = await sizeUp($, text);
  if (!sized) return;
  const hint = await hintOf($);
  const o = estimate(text, await loadHistory($), null, {
    ...hint,
    kind: sized.kind,
    size: sized.size,
  });
  await update($, active, (x) =>
    x && x.turnId === turnId
      ? { ...x, kind: o.kind, size: o.size, p50: o.p50, p80: o.p80, isVague: sized.isVague }
      : x,
  );

  const c = await loadConfig($);
  if (!c.tips || o.p50 < c.alertUsd) return;
  const m = fmt(c);
  const alt = cheaperFor(o, hint.tier);
  let t: Tip | null = null;
  if (alt && !(await isMuted($, "model"))) {
    t = {
      kind: "model",
      text: `This looks routine. Sonnet would cost about ${m(alt.p50)} instead of ${m(o.p50)}.`,
      turnId,
      isInfo: false,
    };
  } else if (
    o.size === "small" &&
    (hint.effort === "xhigh" || hint.effort === "max") &&
    !(await isMuted($, "effort"))
  ) {
    t = {
      kind: "effort",
      text: `This looks small, and the chat is at ${hint.effort} effort. Medium effort would cost less.`,
      turnId,
      isInfo: false,
    };
  }
  if (t) await update($, tip, () => t);
}

async function tallyOf($: EngineInterface): Promise<Tally> {
  const v = (await $.store.get("tally").catch(() => undefined)) as Tally | undefined;
  return { lowLimit: v?.lowLimit ?? 0, dismissed: v?.dismissed ?? 0 };
}

/** A limit keeps being raised or called too low: say so once, then start counting again. */
async function noteLowLimit($: EngineInterface): Promise<void> {
  const c = await loadConfig($);
  const t = await tallyOf($);
  const n = t.lowLimit + 1;
  if (n >= 3 && c.taskLimit !== null) {
    $.ui.toast(
      `Tasks keep reaching the ${fmt(c)(c.taskLimit)} limit. Raise it with /spend set task ${Math.ceil(c.taskLimit * 2)}.`,
    );
    await $.store.set("tally", { ...t, lowLimit: 0 }).catch(() => undefined);
  } else await $.store.set("tally", { ...t, lowLimit: n }).catch(() => undefined);
}

/** The person's one tap about a finished task. */
async function answerNudge(
  $: EngineInterface,
  n: Nudge,
  choice: "one-off" | "off" | "low-limit" | "dismiss",
): Promise<void> {
  await update($, nudge, () => null);
  const t = await tallyOf($);
  if (choice === "dismiss") {
    const dismissed = t.dismissed + 1;
    await $.store.set("tally", { ...t, dismissed }).catch(() => undefined);
    if (dismissed >= 3) {
      await saveConfig($, { ...(await loadConfig($)), feedback: false });
      $.ui.toast(
        "Cost Guard will stop asking about estimates. Turn it back on with /spend set feedback on.",
      );
    }
    return;
  }
  await $.store.set("tally", { ...t, dismissed: 0 }).catch(() => undefined);
  if (choice === "one-off") {
    // An unusual task should not move future estimates.
    await dropSample($, n.actual, n.day).catch(() => undefined);
    $.ui.toast("Noted: that task will not change future estimates.");
  } else if (choice === "off") {
    // The estimate was wrong: let this task count three times over.
    await addSample($, { kind: n.kind, usd: n.actual, day: n.day }, 2).catch(() => undefined);
    $.ui.toast(`Noted: estimates for ${n.kind} tasks will move toward this one.`);
  } else {
    await noteLowLimit($);
  }
}

// ---------------------------------------------------------------- tasks

function taskOf(
  o: Offer,
  limit: number | null,
  startUsd: number,
  startedAt: number,
  turnId: string | null,
  isExplicit: boolean,
): Active {
  return {
    text: o.text,
    kind: o.kind,
    p50: o.p50,
    p80: o.p80,
    limit,
    startUsd,
    startedAt,
    turnId,
    spent: 0,
    lastStep: 0,
    isStopped: false,
    isExplicit,
    model: null,
    size: o.size,
    tier: null,
    effort: null,
    effortTo: null,
    isVague: o.isVague ?? false,
    ctx: 0,
    reread: 0,
  };
}

/** Starts a task the person asked for with /spend. */
async function startTask(
  $: EngineInterface,
  o: Offer,
  limit: number | null,
  model: string | null = null,
): Promise<void> {
  const c = await loadConfig($);
  const a = { ...taskOf(o, limit, await usdNow($, c), await $.clock.now(), null, true), model };
  await update($, active, () => a);
  await update($, panel, (): Panel => ({ view: "home", days: [] }));
  await $.prompt.submit({ text: o.text, asUser: true });
}

async function finishTask($: EngineInterface, a: Active): Promise<void> {
  const c = await loadConfig($);
  const m = fmt(c);
  const actual = Math.max(0, Math.round(((await usdNow($, c)) - a.startUsd) * 10_000) / 10_000);
  await update($, active, (x) => (x && x.turnId === a.turnId ? null : x));
  await refreshTotals($, c).catch(() => undefined);
  if (actual < 0.0005) return;
  const now = await $.clock.now();
  const row: LedgerRow = {
    at: new Date(now).toISOString(),
    day: dayOf(now),
    text: short(a.text, 160),
    kind: a.kind,
    p50: a.p50,
    p80: a.p80,
    limit: a.limit,
    actual,
    isStopped: a.isStopped,
    isExplicit: a.isExplicit,
    ...(a.size ? { size: a.size } : {}),
    ...(a.tier ? { tier: a.tier } : {}),
    ...(a.effort ? { effort: a.effort } : {}),
    ...(a.isVague ? { isVague: true } : {}),
    ...(a.ctx ? { ctx: a.ctx } : {}),
    ...(a.reread ? { reread: Math.round(a.reread * 10_000) / 10_000 } : {}),
    ...(a.model ? { handed: a.model } : {}),
  };
  await appendLine($, `${await dataDir($)}/ledger.jsonl`, JSON.stringify(row)).catch(
    () => undefined,
  );
  if (!a.isStopped) {
    const sample = {
      kind: a.kind,
      usd: actual,
      day: row.day,
      ...(a.size ? { size: a.size } : {}),
      ...(a.tier ? { tier: a.tier } : {}),
      ...(a.effort ? { effort: a.effort } : {}),
    };
    await addSample($, sample).catch(() => undefined);
    // Remember how far off the likely figure was, to correct estimates with little history.
    const calib = (await $.store.get("calib").catch(() => undefined)) as Calib | undefined;
    await $.store
      .set("calib", {
        ratios: [
          ...(calib?.ratios ?? []),
          Math.round((actual / Math.max(a.p50, 0.01)) * 100) / 100,
        ].slice(-20),
      })
      .catch(() => undefined);
  }
  // Ask one tap only when it would teach something: a pause, or an estimate far off.
  const why = a.isStopped
    ? "paused"
    : actual >= 0.5 && actual > a.p80 * 2
      ? "over"
      : a.p50 >= 0.5 && actual < a.p50 / 4
        ? "under"
        : null;
  await update($, nudge, (): Nudge | null =>
    c.feedback && why ? { why, actual, p50: a.p50, kind: a.kind, day: row.day } : null,
  );
  // A switch offered for this task is over with it; an info tip stays through one more task.
  const old = await read($, tip);
  if (old && (old.isInfo ? old.turnId !== a.turnId : old.turnId === a.turnId))
    await update($, tip, () => null);
  // Most of the cost was re-reading a long chat: suggest /compact, once a day.
  if (c.tips && a.ctx >= 150_000 && actual >= c.alertUsd / 2 && a.reread >= actual * 0.4) {
    const g = await gateOf($);
    if (!g.warned.includes("compact")) {
      await update($, gate, () => ({ ...g, warned: [...g.warned, "compact"] }));
      await update(
        $,
        tip,
        (): Tip => ({
          kind: "compact",
          text: `About ${m(a.reread)} of that task (${Math.round((a.reread / actual) * 100)}%) went on re-reading ${Math.round(a.ctx / 1000)}k tokens of chat history. /compact, or a fresh chat for a new topic, would cut that.`,
          turnId: a.turnId,
          isInfo: true,
        }),
      );
    }
  }
  if (a.isExplicit) {
    await showPane($, {
      view: "done",
      done: { text: a.text, p50: a.p50, actual, limit: a.limit, isStopped: a.isStopped },
    });
  } else if (actual >= c.alertUsd) {
    $.ui.toast(`That task cost about ${m(actual)} (estimate ${m(a.p50)}).`);
  }
}

// ---------------------------------------------------------------- gates

type Verdict =
  | { kind: "ok" }
  | { kind: "stopped" }
  | { kind: "task"; spent: number; limit: number }
  | { kind: "day"; today: number; budget: number }
  | { kind: "period"; total: number; budget: number };

/** Whether the next model request may go, and if not, which limit is in the way. */
async function verdictOf($: EngineInterface, c: Config): Promise<Verdict> {
  const a = await read($, active);
  if (a) {
    if (a.isStopped) return { kind: "stopped" };
    const spent = Math.max(0, (await usdNow($, c)) - a.startUsd);
    // The next request will cost about what the last one did.
    if (a.limit !== null && spent + Math.max(a.lastStep, 0.005) >= a.limit)
      return { kind: "task", spent, limit: a.limit };
  }
  const t = await read($, totals);
  const g = await gateOf($);
  if (t && t.day === g.day) {
    if (c.dailyBudget !== null && !g.isDayIgnored && t.today >= c.dailyBudget + g.dayExtra) {
      return { kind: "day", today: t.today, budget: c.dailyBudget + g.dayExtra };
    }
    if (c.period && !g.isPeriodIgnored && t.period >= c.period.usd)
      return { kind: "period", total: t.period, budget: c.period.usd };
  }
  return { kind: "ok" };
}

async function ask(
  $: EngineInterface,
  question: string,
  options: string[],
  header: string,
): Promise<string> {
  try {
    return await $.ui.ask(question, { options, header });
  } catch {
    return "Stop"; // dismissed, or nobody to ask
  }
}

const dollarsIn = (s: string): number | null => {
  const m = /(\d+(?:\.\d+)?)/.exec(s);
  return m ? Number(m[1]) : null;
};

/** Asks the person what to do about the limit in the way. 'stop' ends this step. */
async function resolveGate(
  $: EngineInterface,
  c: Config,
  v: Verdict,
  model: string,
): Promise<"go" | "stop"> {
  const m = fmt(c);
  const stop = async (why: string) => {
    await update($, active, (x) => (x ? { ...x, isStopped: true } : x));
    $.ui.toast(why);
    return "stop" as const;
  };
  if (v.kind === "task") {
    const isCheap = /sonnet|haiku/i.test(model);
    const bump = Math.max(0.5, round2(v.limit * 0.5));
    const third = isCheap ? "Add $5" : `Finish on Sonnet (+${m(bump)})`;
    const ans = await ask(
      $,
      `Cost Guard: this task has used about ${m(v.spent)} of its ${m(v.limit)} limit, and the next step would pass it. How should it continue? (Under Other, type a dollar amount to add.)`,
      ["Add $1", "Double the limit", third, "Stop the task"],
      "Cost limit",
    );
    if (ans.startsWith("Double")) {
      await update($, active, (x) => (x ? { ...x, limit: round2((x.limit ?? v.limit) * 2) } : x));
      await noteLowLimit($).catch(() => undefined);
    } else if (ans.startsWith("Finish on Sonnet")) {
      await update($, active, (x) =>
        x ? { ...x, limit: round2((x.limit ?? v.limit) + bump), model: "sonnet" } : x,
      );
    } else if (!ans.startsWith("Stop") && dollarsIn(ans) !== null && dollarsIn(ans)! > 0) {
      const add = dollarsIn(ans)!;
      await update($, active, (x) => (x ? { ...x, limit: round2((x.limit ?? v.limit) + add) } : x));
      await noteLowLimit($).catch(() => undefined);
    } else {
      return stop(`Cost Guard paused the task at about ${m(v.spent)}.`);
    }
    return "go";
  }
  if (v.kind === "day") {
    const ans = await ask(
      $,
      `Cost Guard: today's spend is about ${m(v.today)}, at the ${m(v.budget)} daily budget. What now? (Under Other, type a dollar amount to add for today.)`,
      ["Add $5 to today", "Ignore the budget today", "Stop"],
      "Daily budget",
    );
    const g = await gateOf($);
    if (ans.startsWith("Ignore")) await update($, gate, () => ({ ...g, isDayIgnored: true }));
    else if (!ans.startsWith("Stop") && dollarsIn(ans) !== null && dollarsIn(ans)! > 0) {
      // Enough to clear the budget even where today already ran past it.
      const extra = g.dayExtra + Math.max(dollarsIn(ans)!, v.today - v.budget + dollarsIn(ans)!);
      await update($, gate, () => ({ ...g, dayExtra: round2(extra) }));
    } else return stop(`Cost Guard paused: the daily budget of ${m(v.budget)} is reached.`);
    return "go";
  }
  if (v.kind === "period") {
    const name = c.period?.kind === "week" ? "weekly" : "monthly";
    const ans = await ask(
      $,
      `Cost Guard: spend this ${c.period?.kind ?? "period"} is about ${m(v.total)}, at the ${m(v.budget)} ${name} budget. Carry on today? (Change the budget with /spend set ${name} <amount>.)`,
      ["Carry on today", "Stop"],
      "Budget",
    );
    if (!ans.startsWith("Carry"))
      return stop(`Cost Guard paused: the ${name} budget of ${m(v.budget)} is reached.`);
    const g = await gateOf($);
    await update($, gate, () => ({ ...g, isPeriodIgnored: true }));
    return "go";
  }
  return "go";
}

// One question at a time: subagents that reach a limit together share the answer.
let asking: Promise<"go" | "stop"> | null = null;
function askOnce(fn: () => Promise<"go" | "stop">): Promise<"go" | "stop"> {
  if (!asking) {
    asking = fn().finally(() => {
      asking = null;
    });
  }
  return asking;
}

/** Toasts once a day when a budget passes 80%. */
async function warn($: EngineInterface, c: Config, t: Totals): Promise<void> {
  const g = await gateOf($);
  const m = fmt(c);
  const said = [...g.warned];
  if (
    c.dailyBudget !== null &&
    t.today >= c.dailyBudget * 0.8 &&
    t.today < c.dailyBudget &&
    !said.includes("day")
  ) {
    said.push("day");
    $.ui.toast(`Cost Guard: today is at ${m(t.today)} of the ${m(c.dailyBudget)} daily budget.`);
  }
  if (
    c.period &&
    t.period >= c.period.usd * 0.8 &&
    t.period < c.period.usd &&
    !said.includes("period")
  ) {
    said.push("period");
    $.ui.toast(`Cost Guard: ${paceLine(t, c)}.`);
  }
  if (said.length !== g.warned.length) await update($, gate, () => ({ ...g, warned: said }));
}

// ---------------------------------------------------------------- report

async function buildReport($: EngineInterface): Promise<Report> {
  const now = await $.clock.now();
  const c = await loadConfig($);
  await refreshTotals($, c).catch(() => undefined);
  const days = await mergedDays($);
  const rows = await readJsonLines<LedgerRow>($, `${await dataDir($)}/ledger.jsonl`);
  const tasks = rows.slice(-50);
  const judged = tasks.filter((t) => !t.isStopped);
  const within = judged.filter((t) => t.actual <= t.p80).length;
  return {
    days: lastDays(days, now, 14),
    today: round2(days[dayOf(now)] ?? 0),
    last7: sumDays(days, now, 7),
    last30: sumDays(days, now, 30),
    source: `Cost Guard's own tracking${(await consentOf($)) === "yes" ? " and your past chats" : ""}, counted at ${basisLabel(c)}`,
    tasks,
    withinP80: judged.length ? within / judged.length : 0,
    score: scoreOf(rows),
    digest: digestOf(rows, now),
  };
}

async function exportDashboard($: EngineInterface): Promise<string> {
  const r = await buildReport($);
  const path = `${await dataDir($)}/dashboard.html`;
  await $.fs.write(path, dashboardHtml(r, new Date(await $.clock.now()).toLocaleString()));
  const isWin = (await $.env.get("OS").catch(() => undefined)) === "Windows_NT";
  if (isWin)
    await $.process.run(["explorer.exe", path.replace(/\//g, "\\")]).catch(() => undefined);
  else
    await $.process
      .run(["open", path])
      .catch(() => $.process.run(["xdg-open", path]).catch(() => undefined));
  return path;
}

// ---------------------------------------------------------------- settings

function settingsLine(c: Config): string {
  const m = fmt(c);
  const off = (n: number | null) => (n === null ? "off" : m(n));
  const longer = c.period ? `${m(c.period.usd)} a ${c.period.kind}` : "off";
  return `Counting at ${basisLabel(c)}. Task limit ${off(c.taskLimit)} · daily ${off(c.dailyBudget)} · longer budget ${longer} · band from ${m(c.alertUsd)}.`;
}

/** "off" → null, "$25" or "25" → 25; undefined when it is neither. */
function amountOf(s: string): number | null | undefined {
  if (/^(off|none|no\b)/i.test(s.trim())) return null;
  const n = dollarsIn(s);
  return n !== null && n > 0 ? n : undefined;
}

async function runSetup($: EngineInterface): Promise<string> {
  const c = { ...(await loadConfig($)) };
  const q = (question: string, options: string[], header: string) =>
    $.ui.ask(question, { options, header });
  try {
    const pay = await q(
      "Cost Guard setup, 1 of 4: how do you pay for Claude Code?",
      ["API at list prices", "API with a discount", "Subscription plan"],
      "Cost basis",
    );
    if (pay.startsWith("API with")) {
      const pct = dollarsIn(
        await q(
          "What discount do you get off list prices? (Under Other, type a percentage.)",
          ["10%", "20%", "30%"],
          "Discount",
        ),
      );
      c.basis = "discount";
      c.discountPct = Math.min(95, Math.max(0, pct ?? 0));
    } else c.basis = pay.startsWith("Subscription") ? "subscription" : "list";

    const task = amountOf(
      await q(
        "Setup, 2 of 4: what limit should every task get by default? Cost Guard pauses and asks before a task passes it. (Under Other, type an amount.)",
        ["$5", "$2", "$10", "No default limit"],
        "Task limit",
      ),
    );
    if (task !== undefined) c.taskLimit = task;

    const daily = amountOf(
      await q(
        "Setup, 3 of 4: set a daily budget across all sessions? (Under Other, type an amount.)",
        ["No daily budget", "$10", "$25", "$50"],
        "Daily",
      ),
    );
    if (daily !== undefined) c.dailyBudget = daily;

    const longer = await q(
      'Setup, 4 of 4: set a weekly or monthly budget? (Under Other, type for example "150 week" or "400 month".)',
      ["No longer budget", "$100 a week", "$300 a month"],
      "Longer",
    );
    const usd = amountOf(longer);
    if (usd === null) c.period = null;
    else if (usd !== undefined) c.period = { kind: /month/i.test(longer) ? "month" : "week", usd };
  } catch {
    return "Setup cancelled; nothing was changed.";
  }
  await saveConfig($, c);
  await refreshTotals($, c).catch(() => undefined);
  return `Saved. ${settingsLine(c)}`;
}

async function setOne($: EngineInterface, name: string, value: string): Promise<string> {
  const c = { ...(await loadConfig($)) };
  const amount = amountOf(value);
  const need = `Give an amount or "off", for example /spend set ${name} 25.`;
  switch (name) {
    case "task":
      if (amount === undefined) return need;
      c.taskLimit = amount;
      break;
    case "daily":
      if (amount === undefined) return need;
      c.dailyBudget = amount;
      break;
    case "weekly":
    case "monthly":
      if (amount === undefined) return need;
      c.period =
        amount === null ? null : { kind: name === "weekly" ? "week" : "month", usd: amount };
      break;
    case "alert":
      if (amount === undefined || amount === null)
        return "Give an amount, for example /spend set alert 1.";
      c.alertUsd = amount;
      break;
    case "discount": {
      const pct = dollarsIn(value);
      if (pct === null && amount !== null)
        return 'Give a percentage or "off", for example /spend set discount 20.';
      c.basis = pct ? "discount" : "list";
      c.discountPct = Math.min(95, pct ?? 0);
      break;
    }
    case "emoji":
      c.emoji = /^(on|yes|true)$/i.test(value.trim());
      break;
    case "sizing":
      c.sizing = /^(on|yes|true)$/i.test(value.trim());
      break;
    case "feedback":
      c.feedback = /^(on|yes|true)$/i.test(value.trim());
      break;
    case "tips":
      c.tips = /^(on|yes|true)$/i.test(value.trim());
      break;
    default:
      return "Settings: task, daily, weekly, monthly, alert, discount, emoji, sizing, feedback, tips. For how you pay, use /spend setup.";
  }
  await saveConfig($, c);
  await refreshTotals($, c).catch(() => undefined);
  return `Saved. ${settingsLine(c)}`;
}

// ---------------------------------------------------------------- module

export const register: Register = (on, options) => {
  const capSubagents = (options as { capSubagents?: unknown } | undefined)?.capSubagents !== false;

  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "spend",
      description: "Cost Guard: see spend and budgets, estimate a task, or change limits",
      argumentHint:
        "[$limit] <task> | setup | set | report | export | learn | forget | stop | help",
    });
    const c = await loadConfig($);
    await refreshTotals($, c).catch(() => undefined);
    if ((await $.store.get("welcomed").catch(() => true)) !== true) {
      await $.store.set("welcomed", true).catch(() => undefined);
      $.ui.toast(
        `Cost Guard is on: list prices, ${fmt(c)(c.taskLimit ?? 0)} limit per task. Type /spend setup to change it.`,
      );
    }
    return next(e);
  });

  on("session.end", async ($, e, next) => {
    await flushSpend($, await loadConfig($)).catch(() => undefined);
    return next(e);
  });

  on("command.run", { command: "spend" }, async ($, e) => {
    const args = e.args.trim();
    const word = args.toLowerCase();
    const say = (text: string) => ({ text, isTextDisplayOnly: true as const });
    if (!args) {
      await refreshTotals($, await loadConfig($)).catch(() => undefined);
      await showPane($, { view: "home", days: await recentDays($, 7) });
      return say("Cost Guard pane opened. Figures are estimates.");
    }
    if (word === "help") return say(HELP);
    if (word === "setup") return say(await runSetup($));
    if (word.startsWith("set ")) {
      const [, name = "", ...rest] = args.split(/\s+/);
      return say(await setOne($, name.toLowerCase(), rest.join(" ")));
    }
    if (word === "report" || word === "dashboard") {
      await showPane($, { view: "report", report: await buildReport($) });
      return say("Cost Guard dashboard opened in the side pane. Figures are estimates.");
    }
    if (word === "export")
      return say(`Saved the dashboard to ${await exportDashboard($)} and opened it.`);
    if (word === "learn") {
      await $.store.set("consent", "yes");
      void learn($);
      return say("Reading your last 30 days of chats on this computer to improve estimates.");
    }
    if (word === "forget") {
      await $.store.set("consent", "no");
      await $.store.delete("history").catch(() => undefined);
      return say(
        "Cost Guard will not read past chats, and what it learned is deleted. Starter figures are used from now on.",
      );
    }
    if (word === "stop") {
      await update($, active, () => null);
      return say("Cost Guard stopped watching the current task.");
    }

    // "/spend $5 task", "/spend 5$ task" or "/spend task"
    const c = await loadConfig($);
    const m = /^\$?(\d+(?:\.\d+)?)\$?\s+(.+)$/s.exec(args);
    const hasLimit = m !== null && (args.startsWith("$") || /^\d+(?:\.\d+)?\$/.test(args));
    const askedLimit = hasLimit ? Number(m![1]) : null;
    const text = hasLimit ? m![2]!.trim() : args;
    const sized = c.sizing ? await sizeUp($, text) : null;
    const hint = await hintOf($);
    let offer = estimate(text, await loadHistory($), askedLimit, {
      ...hint,
      ...(sized ? { kind: sized.kind, size: sized.size } : {}),
    });
    offer = { ...offer, isVague: sized?.isVague ?? false };
    if (c.tips) {
      const alt = cheaperFor(offer, hint.tier);
      if (alt && !(await isMuted($, "model"))) offer = { ...offer, alt };
      if (sized?.isVague && !(await isMuted($, "rewrite"))) {
        const rewrite = await rewriteOf($, text);
        if (rewrite) offer = { ...offer, rewrite };
      }
    }
    await showPane($, { view: "offer", offer, askConsent: (await consentOf($)) === undefined });
    return say(
      `Estimate for this ${offer.kind} task: about ${fmt(c)(offer.p50)}, and 80% of similar tasks cost under ${fmt(c)(offer.p80)} (from ${offer.basis}). Choose how to start in the Cost Guard pane.`,
    );
  });

  // Every main-chat turn is a task: one started with /spend, or tracked quietly.
  on("turn.start", async ($, e, next) => {
    if (e.agentId === undefined) {
      const a = await read($, active);
      if (a && a.turnId === null) {
        await update($, active, (x) => (x && x.turnId === null ? { ...x, turnId: e.turnId } : x));
      } else {
        const c = await loadConfig($);
        const o = estimate(e.text || "continue", await loadHistory($), null, await hintOf($));
        const task = taskOf(
          o,
          c.taskLimit,
          await usdNow($, c),
          await $.clock.now(),
          e.turnId,
          false,
        );
        await update($, active, () => task);
        // The small model's reading arrives a moment later and sharpens the estimate.
        if (c.sizing && e.text) void resize($, e.turnId, e.text).catch(() => undefined);
      }
    }
    return next(e);
  });

  // Before every model request, main chat and subagents: is a limit in the way?
  on("turn.step", async function* ($, e, next) {
    const c = await loadConfig($);
    let isHalted = false;
    for (let i = 0; i < 4 && !isHalted; i += 1) {
      const v = await verdictOf($, c);
      if (v.kind === "ok") break;
      if (v.kind === "stopped") isHalted = true;
      else isHalted = (await askOnce(() => resolveGate($, c, v, e.model))) === "stop";
    }
    if (isHalted) {
      const msg =
        "Cost Guard paused this task at your limit. Send a message to carry on (it starts with a fresh limit), or change limits with /spend setup.";
      yield { kind: "text" as const, index: 0, text: msg };
      yield { kind: "stop" as const, stopReason: "end_turn" as const, usage: null };
      return {
        turnId: e.turnId,
        index: e.index,
        answer: msg,
        toolUses: [],
        stopReason: "end_turn" as const,
        usage: null,
      };
    }

    let a = await read($, active);
    if (e.agentId === undefined) {
      // What the main chat runs on, for matching this task to past ones.
      const effort = typeof e.effort === "string" ? e.effort : null;
      const l = await read($, last);
      if (!l || l.model !== e.model || l.effort !== effort)
        await update($, last, () => ({ model: e.model, effort }));
      if (a && a.tier === null) {
        const tier = tierOf(e.model) ?? null;
        a = { ...a, tier, effort };
        await update($, active, (x) => (x && x.turnId === a!.turnId ? { ...x, tier, effort } : x));
      }
    }
    const before = a ? Math.max(0, (await usdNow($, c)) - a.startUsd) : 0;
    const result = yield* next(
      a && (a.model || a.effortTo)
        ? {
            ...e,
            ...(a.model ? { model: a.model } : {}),
            ...(a.effortTo ? { effort: a.effortTo } : {}),
          }
        : e,
    );
    const task = a;
    if (task) {
      const after = Math.max(0, (await usdNow($, c)) - task.startUsd);
      // What this request was answered over, and what re-reading cached history cost.
      const u = e.agentId === undefined ? result.usage : null;
      const ctx = u
        ? u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
        : 0;
      const rate = u ? priceOf(u.model) : null;
      const reread =
        u && rate ? (u.cache_read_input_tokens * rate.cacheRead * multOf(c)) / 1_000_000 : 0;
      await update($, active, (x) =>
        x && x.turnId === task.turnId
          ? {
              ...x,
              spent: after,
              lastStep: Math.max(0, after - before),
              ctx: Math.max(x.ctx, ctx),
              reread: x.reread + reread,
            }
          : x,
      );
      // A big chat whose cache had lapsed pays to write it all again: say so once a day.
      if (
        u &&
        rate &&
        c.tips &&
        !task.model &&
        e.messageCount > 6 &&
        ctx >= 60_000 &&
        u.cache_creation_input_tokens >= ctx * 0.6
      ) {
        const g = await gateOf($);
        if (!g.warned.includes("cache")) {
          const extra =
            (u.cache_creation_input_tokens * (rate.input * 1.25 - rate.cacheRead) * multOf(c)) /
            1_000_000;
          await update($, gate, () => ({ ...g, warned: [...g.warned, "cache"] }));
          await update(
            $,
            tip,
            (): Tip => ({
              kind: "cache",
              text: `The prompt cache had lapsed, so that request re-wrote about ${Math.round(u.cache_creation_input_tokens / 1000)}k tokens of history (about ${fmt(c)(extra)} extra). On a long chat, a pause longer than the cache lifetime costs this each time.`,
              turnId: task.turnId,
              isInfo: true,
            }),
          );
        }
      }
    }
    const t = await refreshTotals($, c).catch(() => null);
    if (t) await warn($, c, t).catch(() => undefined);
    return result;
  });

  on("turn.complete", async ($, e, next) => {
    const r = await next(e);
    if (e.agentId === undefined) {
      const a = await read($, active);
      if (a && a.turnId === e.turnId) await finishTask($, a);
    }
    return r;
  });

  // Keep subagents off Opus and Fable.
  on("agent.spawn", async ($, e, next) => {
    if (!capSubagents || e.subagentType === "fork") return next(e);
    const asked = (e.model ?? "").toLowerCase();
    const isPricey = (id: string) => /opus|fable|mythos/.test(id);
    if (asked ? isPricey(asked) : isPricey(e.parentModel.toLowerCase()))
      return next({ ...e, model: "sonnet" });
    return next(e);
  }).catch(($, e, next) => next(e));

  // ---------------------------------------------------------------- the band

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const a = await read($, active);
    const t = await read($, totals);
    const c = await loadConfig($);
    const m = fmt(c);
    const { Box, Text, Button } = $.ui.resolve(e);
    const rows: JSX.Element[] = [];

    const dayRatio = c.dailyBudget !== null && t ? t.today / c.dailyBudget : 0;
    const periodRatio = c.period && t ? t.period / c.period.usd : 0;
    const todayText = t
      ? `today ${m(t.today)}${c.dailyBudget !== null ? `/${m(c.dailyBudget)}` : ""}`
      : "";

    // A task shows once it looks, or has become, expensive; /spend tasks always.
    if (a && (a.isExplicit || a.p50 >= c.alertUsd || a.spent >= c.alertUsd)) {
      const ratio = a.limit ? a.spent / a.limit : a.spent / Math.max(a.p80, 0.01);
      rows.push(
        <Box>
          <Text color={toneOf(ratio)}>
            {markOf(c, ratio)}
            {bar(ratio)}{" "}
          </Text>
          <Text>
            {m(a.spent)}
            {a.limit !== null ? ` of ${m(a.limit)}` : ""}
          </Text>
          <Text dimColor>
            {" "}
            · est {m(a.p50)}
            {todayText ? ` · ${todayText}` : ""}
            {a.model ? ` · on ${a.model}` : ""}
            {a.effortTo ? ` · ${a.effortTo} effort` : ""}
            {a.isStopped ? " · paused" : ""}
          </Text>
        </Box>,
      );
    } else if (t && Math.max(dayRatio, periodRatio) >= 0.8) {
      // No big task: speak only when a budget is nearly spent.
      const isDay = dayRatio >= periodRatio;
      const ratio = isDay ? dayRatio : periodRatio;
      rows.push(
        <Box>
          <Text color={toneOf(ratio)}>
            {markOf(c, ratio)}
            {bar(ratio)}{" "}
          </Text>
          <Text dimColor>
            {isDay
              ? `Today ${m(t.today)} of ${m(c.dailyBudget ?? 0)} daily budget`
              : paceLine(t, c)}
          </Text>
        </Box>,
      );
    }

    // One tap about the last task, when its estimate was far off or it was paused.
    const n = await read($, nudge);
    if (n && c.feedback) {
      const lead =
        n.why === "paused"
          ? `Last task paused at ${m(n.actual)}.`
          : `Last task cost ${m(n.actual)}, estimate ${m(n.p50)}.`;
      rows.push(
        <Box gap={1}>
          <Text dimColor>
            {c.emoji ? "💬 " : ""}
            {lead}
          </Text>
          {n.why === "paused" && (
            <Button
              key="fb-low"
              hotkey="1"
              plain
              label="Limit was too low"
              onPress={() => answerNudge($, n, "low-limit")}
            />
          )}
          {n.why === "paused" && (
            <Button
              key="fb-ran"
              hotkey="2"
              plain
              label="Task ran away"
              onPress={() => answerNudge($, n, "one-off")}
            />
          )}
          {n.why !== "paused" && (
            <Button
              key="fb-one"
              hotkey="1"
              plain
              label={n.why === "over" ? "Bigger than usual" : "Smaller than usual"}
              onPress={() => answerNudge($, n, "one-off")}
            />
          )}
          {n.why !== "paused" && (
            <Button
              key="fb-off"
              hotkey="2"
              plain
              label="Estimate was off"
              onPress={() => answerNudge($, n, "off")}
            />
          )}
          <Button
            key="fb-x"
            hotkey="3"
            plain
            label="Dismiss"
            onPress={() => answerNudge($, n, "dismiss")}
          />
        </Box>,
      );
    }

    // A cost-saving tip: a switch to accept or decline, or a note to acknowledge.
    const tp = await read($, tip);
    if (tp && c.tips) {
      rows.push(
        <Box gap={1}>
          <Text>
            <Text color="suggestion">{c.emoji ? "💡 " : "Tip: "}</Text>
            <Text dimColor>{tp.text}</Text>
          </Text>
          {tp.kind === "model" && (
            <Button
              key="tip-yes"
              hotkey="4"
              plain
              label="Use Sonnet"
              onPress={() => answerTip($, tp, true)}
            />
          )}
          {tp.kind === "effort" && (
            <Button
              key="tip-yes"
              hotkey="4"
              plain
              label="Use medium effort"
              onPress={() => answerTip($, tp, true)}
            />
          )}
          <Button
            key="tip-no"
            hotkey="5"
            plain
            label={tp.isInfo ? "OK" : "No thanks"}
            onPress={() => answerTip($, tp, false)}
          />
        </Box>,
      );
    }

    if (rows.length === 0) return next(e);
    return <Box flexDirection="column">{rows}</Box>;
  });

  // ---------------------------------------------------------------- the pane

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Progress } = $.ui.resolve(e);
    const p = await read($, panel);
    const a = await read($, active);
    const t = await read($, totals);
    const c = await loadConfig($);
    const m = fmt(c);
    const cols = Math.max(20, e.props.bodyColumns ?? 60);
    const close = () => update($, panel, () => null);
    const openReport = async () => showPane($, { view: "report", report: await buildReport($) });

    if (!p)
      return (
        <Text dimColor>
          Type /spend to see spend and budgets, or /spend &lt;task&gt; to estimate a task.
        </Text>
      );

    if (p.view === "note") {
      return (
        <Box flexDirection="column" gap={1}>
          <Text>{p.text}</Text>
          <Button key="ok" label="OK" onPress={close} />
        </Box>
      );
    }

    if (p.view === "home") {
      const taskRatio = a ? (a.limit ? a.spent / a.limit : a.spent / Math.max(a.p80, 0.01)) : 0;
      const dayRatio = c.dailyBudget !== null && t ? t.today / c.dailyBudget : 0;
      const periodRatio = c.period && t ? t.period / c.period.usd : 0;
      const plan = c.basis === "subscription" ? await planLine($) : "";
      return (
        <Box flexDirection="column" gap={1}>
          {a && (
            <Box flexDirection="column">
              <Text bold>{a.isStopped ? "Task paused" : "Current task"}</Text>
              <Text dimColor wrap="truncate-end">
                {short(a.text, cols)}
              </Text>
              <Progress
                label={
                  a.limit !== null
                    ? `Spent of ${m(a.limit)} limit`
                    : `Spent vs ${m(a.p80)} (80% of similar tasks)`
                }
                value={Math.min(1, taskRatio)}
                valueText={m(a.spent)}
                color={toneOf(taskRatio)}
              />
              <Text dimColor>
                Estimate {m(a.p50)} · {a.size ? `${a.size} ` : ""}
                {a.kind} task
                {a.model ? ` · handed to ${a.model}` : ""}
              </Text>
            </Box>
          )}
          <Box flexDirection="column">
            <Text bold>Spend</Text>
            <Text>
              {markOf(c, dayRatio)}Today {m(t?.today ?? 0)}
              {c.dailyBudget !== null ? ` of ${m(c.dailyBudget)}  ` : ""}
              {c.dailyBudget !== null && (
                <Text color={toneOf(dayRatio)}>
                  {bar(dayRatio, 5)} {Math.round(dayRatio * 100)}%
                </Text>
              )}
            </Text>
            {c.period && t && (
              <Text>
                {markOf(c, periodRatio)}
                {paceLine(t, c)}
              </Text>
            )}
            {p.days.length > 0 && (
              <Text>
                <Text color="suggestion">{spark(p.days.map((d) => d.usd))}</Text>
                <Text dimColor>
                  {" "}
                  last {p.days.length} days · {m(p.days.reduce((s, d) => s + d.usd, 0))}
                </Text>
              </Text>
            )}
            {plan !== "" && <Text dimColor>Plan limits used: {plan}</Text>}
          </Box>
          <Text dimColor>{settingsLine(c)} Change with /spend setup. Estimates only.</Text>
          <Box gap={1}>
            <Button key="report" label="14-day dashboard" onPress={openReport} />
            <Button
              key="export"
              label="Open as web page"
              onPress={async () => {
                await exportDashboard($);
              }}
            />
            <Button key="close" label="Close" onPress={close} />
          </Box>
        </Box>
      );
    }

    if (p.view === "done") {
      const d = p.done;
      const isOver = d.actual > d.p50;
      const verdict = d.isStopped
        ? `Paused at the ${m(d.limit ?? 0)} limit.`
        : isOver
          ? "Went over the estimate."
          : "Came in under the estimate.";
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Task finished</Text>
          <Text dimColor>{short(d.text, cols * 2)}</Text>
          <Text>
            Actual {m(d.actual)} · estimate {m(d.p50)} ·{" "}
            <Text color={d.isStopped || isOver ? "warning" : "success"}>{verdict}</Text>
          </Text>
          <Text dimColor>Estimates only; your bill is the authority.</Text>
          <Box gap={1}>
            <Button key="report" label="Dashboard" onPress={openReport} />
            <Button key="close" label="Close" onPress={close} />
          </Box>
        </Box>
      );
    }

    if (p.view === "report") {
      const r = p.report;
      const max = Math.max(0.01, ...r.days.map((d) => d.usd));
      const barRoom = Math.max(5, cols - 18);
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Daily cost (estimates)</Text>
          <Text>
            Today {m(r.today)} · 7 days {m(r.last7)} · 30 days {m(r.last30)}
          </Text>
          <Box flexDirection="column">
            {r.days.map((d) => (
              <Text>
                <Text dimColor>{d.day.slice(5)} </Text>
                <Text color="suggestion">
                  {"█".repeat(Math.round((d.usd / max) * barRoom)) || "·"}
                </Text>{" "}
                {m(d.usd)}
              </Text>
            ))}
          </Box>
          <Text dimColor>From {r.source}.</Text>
          {r.tasks.length > 0 && (
            <Box flexDirection="column">
              <Text bold>Recent tasks</Text>
              {r.tasks
                .slice(-6)
                .reverse()
                .map((x) => (
                  <Text wrap="truncate-end">
                    <Text color={x.actual <= x.p80 ? "success" : "warning"}>{m(x.actual)}</Text>
                    <Text dimColor> vs est {m(x.p50)} · </Text>
                    {short(x.text, Math.max(10, cols - 26))}
                  </Text>
                ))}
            </Box>
          )}
          {r.digest.tasks > 0 && (
            <Box flexDirection="column">
              <Text bold>This week</Text>
              <Text>
                {m(r.digest.total)} over {r.digest.tasks} tasks
                <Text dimColor>
                  {" "}
                  ·{" "}
                  {r.digest.byKind
                    .slice(0, 3)
                    .map((k) => `${k.kind} ${m(k.usd)}`)
                    .join(", ")}
                </Text>
              </Text>
              {r.digest.habits.map((hb) => (
                <Text>
                  <Text color="suggestion">{c.emoji ? "💡 " : "• "}</Text>
                  {hb.text}
                  {hb.saves > 0 ? <Text color="success"> About {m(hb.saves)} a week.</Text> : ""}
                </Text>
              ))}
              {r.digest.habits.length === 0 && <Text dimColor>No costly habits stood out.</Text>}
            </Box>
          )}
          {r.score.n > 0 && (
            <Box flexDirection="column">
              <Text bold>Estimate accuracy</Text>
              <Text>
                <Text color={r.score.within >= 0.7 ? "success" : "warning"}>
                  {Math.round(r.score.within * 100)}%
                </Text>{" "}
                of {r.score.n} tasks cost no more than the 80% figure
              </Text>
              <Text dimColor>
                Typical task: {r.score.medianRatio.toFixed(2)}× its likely estimate
                {r.score.recent !== null && r.score.prior !== null
                  ? ` · latest 20: ${Math.round(r.score.recent * 100)}%, the 20 before: ${Math.round(r.score.prior * 100)}%`
                  : ""}
              </Text>
              {r.score.byKind.slice(0, 4).map((k) => (
                <Text dimColor>
                  {k.kind}: {Math.round(k.within * 100)}% of {k.n}
                </Text>
              ))}
            </Box>
          )}
          <Box gap={1}>
            <Button
              key="export"
              label="Open as web page"
              onPress={async () => {
                await exportDashboard($);
              }}
            />
            <Button key="close" label="Close" onPress={close} />
          </Box>
        </Box>
      );
    }

    // p.view === 'offer'
    const o = p.offer;
    const limit = o.askedLimit ?? o.suggestedLimit;
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Cost estimate</Text>
        <Text dimColor>{short(o.text, cols * 2)}</Text>
        <Text>
          Likely about <Text color="suggestion">{m(o.p50)}</Text>; 80% of similar tasks cost under{" "}
          {m(o.p80)}.
        </Text>
        <Text dimColor>
          {o.kind} task · from {o.basis}. Estimates only; your bill is the authority.
        </Text>
        {o.alt && (
          <Text>
            <Text color="suggestion">{c.emoji ? "💡 " : "Tip: "}</Text>
            This looks routine. Sonnet would cost about {m(o.alt.p50)} instead of {m(o.p50)}.
          </Text>
        )}
        <Box flexDirection="column">
          <Button
            key="limit"
            variant="primary"
            label={`Start with a ${m(limit)} limit`}
            onPress={async () => {
              if (o.alt) await tipTally($, "model", false);
              await startTask($, o, limit);
            }}
          />
          {o.alt && (
            <Button
              key="alt"
              label={`Start on Sonnet, about ${m(o.alt.p50)} (${m(limit)} limit)`}
              onPress={async () => {
                await tipTally($, "model", true);
                await startTask($, o, limit, "sonnet");
              }}
            />
          )}
          <Button key="nolimit" label="Start with no limit" onPress={() => startTask($, o, null)} />
          <Button key="cancel" label="Not now" onPress={close} />
        </Box>
        {o.rewrite && (
          <Box flexDirection="column">
            <Text>
              <Text color="suggestion">{c.emoji ? "💡 " : "Tip: "}</Text>
              this request is vague, which usually costs more. A tighter version:
            </Text>
            <Text italic>{o.rewrite}</Text>
            <Box gap={1}>
              <Button
                key="rw-use"
                label="Use this prompt"
                onPress={async () => {
                  await tipTally($, "rewrite", true);
                  await startTask($, { ...o, text: o.rewrite ?? o.text }, limit);
                }}
              />
              <Button
                key="rw-edit"
                label="Edit it"
                onPress={async () => {
                  await tipTally($, "rewrite", true);
                  await $.prompt.fill({ text: `/spend ${o.rewrite ?? ""}`, mode: "replace" });
                  await close();
                }}
              />
              <Button
                key="rw-no"
                label="Keep mine"
                onPress={async () => {
                  await tipTally($, "rewrite", false);
                  await update($, panel, (x): Panel | null =>
                    x && x.view === "offer"
                      ? { ...x, offer: { ...x.offer, rewrite: undefined } }
                      : x,
                  );
                }}
              />
            </Box>
          </Box>
        )}
        {p.askConsent && (
          <Box flexDirection="column">
            <Text>
              Better estimates: may Cost Guard read your last 30 days of Claude Code chats? They are
              read on this computer only.
            </Text>
            <Box gap={1}>
              <Button
                key="learn"
                label="Yes, learn from my chats"
                onPress={async () => {
                  await $.store.set("consent", "yes");
                  await update($, panel, (x) =>
                    x && x.view === "offer" ? { ...x, askConsent: false } : x,
                  );
                  void learn($).then(async () => {
                    await showPane($, {
                      view: "offer",
                      offer: estimate(o.text, await loadHistory($), o.askedLimit),
                      askConsent: false,
                    });
                  });
                }}
              />
              <Button
                key="nolearn"
                label="Not now"
                onPress={async () => {
                  await $.store.set("consent", "no");
                  await update($, panel, (x) =>
                    x && x.view === "offer" ? { ...x, askConsent: false } : x,
                  );
                }}
              />
            </Box>
          </Box>
        )}
      </Box>
    );
  });
};
