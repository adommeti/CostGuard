/** A task kind, guessed from the words of the request. */
export type TaskKind = "research" | "code" | "debug" | "review" | "docs" | "data" | "other";

/** How big a task looks: minutes, a solid piece of work, or a long multi-step job. */
export type Size = "small" | "medium" | "large";

/** The user's settings, kept across sessions. */
export type Config = {
  /** How cost is counted: list prices, list prices less a discount, or a subscription plan. */
  basis: "list" | "discount" | "subscription";
  discountPct: number;
  /** The limit every task gets unless one is given; null for none. */
  taskLimit: number | null;
  dailyBudget: number | null;
  period: { kind: "week" | "month"; usd: number } | null;
  /** The band shows for tasks estimated at or above this. */
  alertUsd: number;
  emoji: boolean;
  /** A small model reads each prompt to judge its kind and size. */
  sizing: boolean;
  /** Ask one tap when an estimate was far off or a task was paused. */
  feedback: boolean;
  /** Show cost-saving tips: cheaper model or effort, context, prompt rewrites. */
  tips: boolean;
};

/** What the pre-start estimate says about a task. */
export type Offer = {
  text: string;
  kind: TaskKind;
  p50: number;
  p80: number;
  basis: string;
  size: Size | null;
  /** The small model found the request unclear about its goal or scope. */
  isVague?: boolean;
  /** A cheaper model that would do, and the likely cost on it. */
  alt?: { model: string; p50: number };
  /** A tighter wording of the request. */
  rewrite?: string;
  askedLimit: number | null;
  suggestedLimit: number;
};

/** The task Cost Guard is watching right now. */
export type Active = {
  text: string;
  kind: TaskKind;
  p50: number;
  p80: number;
  limit: number | null;
  startUsd: number;
  startedAt: number;
  turnId: string | null;
  spent: number;
  lastStep: number;
  isStopped: boolean;
  /** Started with /spend, not tracked silently. */
  isExplicit: boolean;
  /** A model the rest of the task was handed to, or null. */
  model: string | null;
  size: Size | null;
  /** The model family and effort the task runs at, once a request has shown them. */
  tier: string | null;
  effort: string | null;
  /** An effort level the rest of the task was moved to, or null. */
  effortTo: "low" | "medium" | "high" | null;
  isVague: boolean;
  /** The largest context a main-chat request of the task was answered over, in tokens. */
  ctx: number;
  /** What the task spent re-reading cached chat history, in dollars. */
  reread: number;
};

/** The finished task's summary, shown once. */
export type Done = {
  text: string;
  p50: number;
  actual: number;
  limit: number | null;
  isStopped: boolean;
};

export type DayCost = { day: string; usd: number };

export type LedgerRow = {
  at: string;
  day: string;
  text: string;
  kind: TaskKind;
  p50: number;
  p80: number;
  limit: number | null;
  actual: number;
  isStopped: boolean;
  isExplicit?: boolean;
  size?: Size;
  tier?: string;
  effort?: string;
  isVague?: boolean;
  ctx?: number;
  reread?: number;
  /** The model the task was handed to part-way, if any. */
  handed?: string;
};

/** Spend by day, and what each session had cost when last counted. */
export type Spend = { days: Record<string, number>; sess: Record<string, number> };

/** Running totals for the band and the gates. */
export type Totals = {
  day: string;
  today: number;
  /** Spend in the current week or month; 0 with no longer budget. */
  period: number;
  /** Where the period is heading at this pace. */
  projected: number;
  /** The day the period budget is reached at this pace, or null. */
  hitDay: string | null;
};

/** Today's answers to budget questions. */
export type Gate = {
  day: string;
  dayExtra: number;
  isDayIgnored: boolean;
  isPeriodIgnored: boolean;
  warned: string[];
};

/** The model and effort of the main chat's last request. */
export type Last = { model: string; effort: string | null };

/** A one-tap question about a finished task, shown in the band. */
export type Nudge = {
  why: "over" | "under" | "paused";
  actual: number;
  p50: number;
  kind: TaskKind;
  day: string;
};

/** A cost-saving tip shown in the band. Info tips only inform; the others offer a switch. */
export type Tip = {
  kind: "model" | "effort" | "compact" | "cache";
  text: string;
  turnId: string | null;
  isInfo: boolean;
};

/** The last seven days: where the money went and what would save the most. */
export type Digest = {
  total: number;
  tasks: number;
  byKind: { kind: TaskKind; usd: number }[];
  top: { text: string; usd: number }[];
  habits: { text: string; saves: number }[];
};

/** How good the estimates have been. */
export type Score = {
  n: number;
  /** Share of tasks that cost no more than the 80% figure. */
  within: number;
  /** Median of actual cost over the likely (p50) estimate; 1 is spot on. */
  medianRatio: number;
  /** `within` over the latest 20 tasks and the 20 before them; null with too few. */
  recent: number | null;
  prior: number | null;
  byKind: { kind: TaskKind; n: number; within: number }[];
};

/** The dashboard's figures. */
export type Report = {
  days: DayCost[];
  today: number;
  last7: number;
  last30: number;
  source: string;
  tasks: LedgerRow[];
  withinP80: number;
  score: Score;
  digest: Digest;
};

export type Panel =
  | { view: "home"; days: DayCost[] }
  | { view: "offer"; offer: Offer; askConsent: boolean }
  | { view: "done"; done: Done }
  | { view: "report"; report: Report }
  | { view: "note"; text: string };

declare module "claude-code" {
  interface PluginState {
    "cost-guard": {
      panel: Shaped<Panel | null>;
      active: Shaped<Active | null>;
      totals: Shaped<Totals | null>;
      gate: Shaped<Gate | null>;
      last: Shaped<Last | null>;
      nudge: Shaped<Nudge | null>;
      tip: Shaped<Tip | null>;
    };
  }
}
