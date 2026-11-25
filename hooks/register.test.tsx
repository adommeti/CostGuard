import { expect, test } from "claude-code/testing";

const PANE = {
  plugin: "cost-guard",
  component: "Pane",
  requestId: "cost-guard",
  props: {
    title: "Cost Guard",
    isFocused: false,
    bodyColumns: 60,
    placement: "dock",
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const;

// A /spend run as a test types it: the engine fills in where it came from.
const spend = (args: string) => ({ command: "spend", args }) as never;

const BAND = {
  plugin: "cost-guard",
  component: "AbovePrompt",
  requestId: "band",
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: true,
    maxRows: 5,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 5 },
    view: {},
  },
} as const;

/** Stands in for the engine: a cost that tests move, a store, and an answer to each question. */
function world(on: any, answers: string[] = []) {
  const w = {
    stepUsd: 1.2,
    usage: null as unknown,
    usd: 0,
    modelCalls: 0,
    models: [] as string[],
    asked: [] as string[],
    store: {} as Record<string, unknown>,
    toasts: [] as string[],
  };
  on("command.register", () => ({ value: { command: "spend" } }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.status", () => ({ value: undefined }));
  on("ui.toast", (_: unknown, e: any) => {
    w.toasts.push(String(e.text ?? ""));
    return { value: undefined };
  });
  on("tool.call", (_: unknown, e: any) => {
    if (e.tool !== "AskUserQuestion") return { result: {} };
    const question = String(e.questions?.[0]?.question ?? "");
    w.asked.push(question);
    const a = answers.shift();
    if (a === undefined) return { deny: "dismissed" };
    return { result: { questions: e.questions, answers: { [question]: a } } };
  });
  on("clock.now", () => ({ value: 1_764_000_000_000 }));
  on("session.id", () => ({ value: "s1" }));
  on("session.usage", () => ({
    value: { startedAt: 0, context: { window: 1 }, rateLimits: [], cost: { usd: w.usd } },
  }));
  on("store.get", (_: unknown, e: any) => ({ value: w.store[e.key] }));
  on("store.set", (_: unknown, e: any) => {
    w.store[e.key] = e.value;
    return { value: undefined };
  });
  on("prompt.submit", (_: unknown, e: any) => ({ text: e.text }));
  on("turn.start", (_: unknown, e: any) => ({ turnId: e.turnId }));
  on("turn.complete", (_: unknown, e: any) => ({ text: e.answer }));
  on("turn.step", async function* (_: unknown, e: any) {
    w.modelCalls += 1;
    w.models.push(e.model);
    w.usd += w.stepUsd; // each model request costs $1.20 unless a test says otherwise
    return {
      turnId: e.turnId,
      index: e.index,
      answer: "ok",
      toolUses: [],
      stopReason: "tool_use" as const,
      usage: w.usage,
    };
  });
  return w;
}

async function step($: any, index: number, turnId = "t1"): Promise<string> {
  let text = "";
  for await (const c of $.turn.step({ turnId, index, model: "opus", messageCount: 1 })) {
    if (c.kind === "text") text += c.text;
  }
  return text;
}

test("/spend <task> shows an estimate with start buttons", async ($, on) => {
  world(on);
  const out = await $.command.run(spend("$3 fix the failing login test"));
  expect(out.text).toContain("Estimate for this debug task");
  for (const surface of ["terminal", "desktop"] as const) {
    const ui = await $.ui.mount({ ...PANE, surface });
    expect((await ui.find({ type: "Text", text: /Likely about/ }))?.text).toContain("$");
    expect(await ui.find({ type: "Button", key: "limit" })).toBeTruthy();
    await ui.unmount();
  }
});

test("every prompt is tracked with the default $5 limit, and the pause asks first", async ($, on) => {
  const w = world(on, ["Stop the task"]);
  await $.turn.start({ turnId: "t1", text: "add a small helper" });
  // $1.20 a request: after 4 requests $4.80 is spent, so the 5th would pass $5.
  for (let i = 0; i < 4; i += 1) expect(await step($, i)).toBe("");
  const fifth = await step($, 4);
  expect(w.modelCalls).toBe(4);
  expect(w.asked.length).toBe(1);
  expect(w.asked[0]).toContain("$5.00 limit");
  expect(fifth).toContain("Cost Guard paused this task");
  // Stopped stays stopped, with no second question.
  expect(await step($, 5)).toContain("Cost Guard paused");
  expect(w.asked.length).toBe(1);
});

test('"Add $1" lets the task continue in place', async ($, on) => {
  const w = world(on, ["Add $1"]);
  await $.command.run(spend("$3 build a small script"));
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  await ui.press({ key: "limit" });
  await $.turn.start({ turnId: "t1", text: "build a small script" });
  await step($, 0);
  await step($, 1); // $2.40 of $3: the next would pass it
  expect(await step($, 2)).toBe(""); // asked, $1 added, request sent
  expect(w.asked.length).toBe(1);
  expect(w.modelCalls).toBe(3);
  await ui.unmount();
});

test('"Finish on Sonnet" hands the rest of the task to Sonnet', async ($, on) => {
  const w = world(on, ["Finish on Sonnet (+$1.50)"]);
  await $.command.run(spend("$3 build a small script"));
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  await ui.press({ key: "limit" });
  await $.turn.start({ turnId: "t1", text: "build a small script" });
  await step($, 0);
  await step($, 1);
  await step($, 2);
  expect(w.models).toEqual(["opus", "opus", "sonnet"]);
  await ui.unmount();
});

test("a daily budget pauses and asks, and the band shows the task", async ($, on) => {
  const w = world(on, ["Stop"]);
  w.store.config = { dailyBudget: 2, taskLimit: null, alertUsd: 1 };
  await $.turn.start({ turnId: "t1", text: "research the market" });
  await step($, 0); // today $1.20
  await step($, 1); // today $2.40, over $2
  expect(await step($, 2)).toContain("Cost Guard paused");
  expect(w.asked[0]).toContain("daily budget");
  expect(w.modelCalls).toBe(2);

  const ui = await $.ui.mount({ ...BAND, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: /\$2\.40/ })).toBeTruthy();
  await ui.unmount();
});

test("finishing a task logs it and counts it into today", async ($, on) => {
  const w = world(on);
  let written = "";
  on("fs.exists", () => ({ value: false }));
  on("fs.write", (_: unknown, e: any) => {
    written = String(e.text ?? e.content ?? "");
    return { value: undefined };
  });
  on("env.get", () => ({ value: "C:\\Users\\me" }));
  await $.turn.start({ turnId: "t1", text: "fix the bug" });
  await step($, 0);
  await $.turn.complete({
    turnId: "t1",
    answer: "done",
    durationMs: 5,
    isAborted: false,
    reason: "answer",
  });
  expect(written).toContain('"actual":1.2');
  expect((w.store.spend as any).days["2025-11-24"]).toBe(1.2);
});

test("/spend opens the home pane with budgets, and the dashboard draws", async ($, on) => {
  const w = world(on);
  on("fs.exists", () => ({ value: false }));
  on("env.get", () => ({ value: "C:\\Users\\me" }));
  w.store.config = { dailyBudget: 25, period: { kind: "week", usd: 100 }, emoji: true };
  w.store.spend = { days: { "2025-11-24": 6.1, "2025-11-23": 3 }, sess: { s1: 0 } };
  await $.command.run(spend(""));
  for (const surface of ["terminal", "desktop"] as const) {
    const ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.find({ type: "Text", text: /Today \$6\.10/ })).toBeTruthy();
    expect(await ui.find({ type: "Text", text: /This week/ })).toBeTruthy();
    await ui.unmount();
  }
  await $.command.run(spend("report"));
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: /Daily cost/ })).toBeTruthy();
  await ui.unmount();
});

const USAGE = {
  input_tokens: 1,
  output_tokens: 1,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};
const settle = async () => {
  for (let i = 0; i < 200; i += 1) await Promise.resolve();
};

test("the small model sizes a task, for /spend and for tracked prompts", async ($, on) => {
  world(on);
  on("model.complete", () => ({ value: { isAnswered: true, text: "code large", usage: USAGE } }));
  // Starter figure for a code task is $1.20; large is 2.4 times that.
  const out = await $.command.run(spend("rework the billing module end to end"));
  expect(out.text).toContain("code task");
  expect(out.text).toContain("$2.88");

  await $.turn.start({ turnId: "t9", text: "please look into why the nightly job is slow" });
  await settle();
  await $.command.run(spend(""));
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: /large code task/ })).toBeTruthy();
  await ui.unmount();
});

test("a far-off estimate asks one tap, the answer teaches, and the scorecard shows", async ($, on) => {
  const w = world(on);
  let ledger = "";
  on("fs.exists", () => ({ value: ledger !== "" }));
  on("fs.read", () => ({ value: ledger }));
  on("fs.stat", () => ({
    value: { kind: "file" as const, size: ledger.length, mtimeMs: 0, isLink: false },
  }));
  on("fs.write", (_: unknown, e: any) => {
    ledger = String(e.text ?? e.content ?? "");
    return { value: undefined };
  });
  on("env.get", () => ({ value: "C:\\Users\\me" }));
  w.store.config = { taskLimit: null };
  await $.turn.start({ turnId: "t1", text: "fix the bug" }); // debug: likely $0.90, 80% under $2.80
  for (let i = 0; i < 5; i += 1) await step($, i); // costs $6.00
  await $.turn.complete({
    turnId: "t1",
    answer: "done",
    durationMs: 5,
    isAborted: false,
    reason: "answer",
  });

  const band = await $.ui.mount({ ...BAND, surface: "terminal" });
  expect(await band.find({ type: "Text", text: /Last task cost \$6\.00/ })).toBeTruthy();
  await band.press({ key: "fb-off" });
  await band.unmount();
  // "Estimate was off": the task now counts three times.
  expect((w.store.history as any).samples.filter((s: any) => s.usd === 6).length).toBe(3);
  expect((w.store.calib as any).ratios.length).toBe(1);

  await $.command.run(spend("report"));
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: /Estimate accuracy/ })).toBeTruthy();
  await ui.unmount();
});

test("a routine, vague /spend task offers Sonnet and a tighter prompt", async ($, on) => {
  const w = world(on);
  on("model.complete", (_: unknown, e: any) => ({
    value: String(e.system ?? "").includes("tighten")
      ? {
          isAnswered: true,
          text: "Write a half-page note in docs/notes.md summarising [topic]; done when it lists three key points.",
          usage: USAGE,
        }
      : { isAnswered: true, text: "docs small vague", usage: USAGE },
  }));
  // A first turn shows that the chat runs on Opus.
  await $.turn.start({ turnId: "t0", text: "hello there, how are you" });
  await step($, 0, "t0");
  await $.turn.complete({
    turnId: "t0",
    answer: "hi",
    durationMs: 5,
    isAborted: false,
    reason: "answer",
  });

  await $.command.run(spend("write something about the thing"));
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: /Sonnet would cost about/ })).toBeTruthy();
  expect(await ui.find({ type: "Text", text: /docs\/notes\.md/ })).toBeTruthy();
  expect(await ui.find({ type: "Button", key: "rw-use" })).toBeTruthy();
  await ui.press({ key: "alt" });
  await ui.unmount();

  await $.turn.start({ turnId: "t1", text: "write something about the thing" });
  await step($, 0);
  expect(w.models.at(-1)).toBe("sonnet");
  expect((w.store.tips as any).model.yes).toBe(1);
});

test("a task that mostly re-reads a long chat gets a /compact tip, and the week digest names the habit", async ($, on) => {
  const w = world(on);
  let ledger = "";
  on("fs.exists", () => ({ value: ledger !== "" }));
  on("fs.read", () => ({ value: ledger }));
  on("fs.stat", () => ({
    value: { kind: "file" as const, size: ledger.length, mtimeMs: 0, isLink: false },
  }));
  on("fs.write", (_: unknown, e: any) => {
    ledger = String(e.text ?? e.content ?? "");
    return { value: undefined };
  });
  on("env.get", () => ({ value: "C:\\Users\\me" }));
  w.store.config = { taskLimit: null, alertUsd: 0.05 };
  w.stepUsd = 0.05;
  // 200k tokens read from the cache at Opus 5.5's $0.20 a million: $0.04 of a $0.05 request.
  w.usage = {
    input_tokens: 1000,
    output_tokens: 100,
    cache_read_input_tokens: 200_000,
    cache_creation_input_tokens: 0,
    model: "claude-opus-5-5",
  };
  await $.turn.start({ turnId: "t1", text: "carry on with the refactor" });
  await step($, 0);
  await $.turn.complete({
    turnId: "t1",
    answer: "done",
    durationMs: 5,
    isAborted: false,
    reason: "answer",
  });
  expect(ledger).toContain('"reread":0.04');

  const band = await $.ui.mount({ ...BAND, surface: "terminal" });
  expect(await band.find({ type: "Text", text: /re-reading 201k tokens/ })).toBeTruthy();
  await band.press({ key: "tip-no" });
  await band.unmount();

  await $.command.run(spend("report"));
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: /This week/ })).toBeTruthy();
  expect(await ui.find({ type: "Text", text: /re-reading long chat history/ })).toBeTruthy();
  await ui.unmount();
});

test("/spend set changes one setting", async ($, on) => {
  const w = world(on);
  const out = await $.command.run(spend("set daily 25"));
  expect(out.text).toContain("daily $25.00");
  expect((w.store.config as any).dailyBudget).toBe(25);
});

test("subagents asking for Opus run on Sonnet", async ($, on) => {
  let model: string | undefined;
  on("agent.spawn", (_, e) => {
    model = e.model;
    return { model: e.model ?? "x", agentId: "a1" };
  });
  await $.agent.spawn({
    prompt: "look around",
    description: "look",
    subagentType: "general-purpose",
    model: "opus",
  } as never);
  expect(model).toBe("sonnet");
});
