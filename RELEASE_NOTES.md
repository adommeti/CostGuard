# Release Notes

## 0.4.0 — Pre-release

Cost Guard 0.4.0 is a **pre-1.0 release**. It is feature-complete against
`PRD.md` and passes its 13 hook tests, validation and formatting checks. It has
had very little use in live sessions. Try it on your own work before
recommending it to others.

---

## Release blockers

These must be closed before a `1.0.0` tag.

### Not verified in live sessions

**Impact: high. Affects confidence in everything the tests mock.**

The manual checks in `TEST_STRATEGY.md` section 5 have not been recorded as
passed. The real small-model call, the pause question inside a running task, the
band's layout with several rows, and the model switch from a band button are
verified only against a mocked engine.

---

## Known limitations

### Figures are estimates

Every dollar figure comes from Claude Code's client-side cost figure and can
differ from the invoice. Do not bill anyone from them.

### A limit can be overshot

The check runs before each model request. The last request can take a task
slightly over its limit, and requests already in flight in parallel subagents
all complete. Use your provider's spend limits where a hard cap is required.

### Switching model mid-task has a one-time cost

The new model cannot reuse the prompt cache, so its first request re-reads the
chat at full price. The saving shown on a Sonnet offer does not subtract that.

### Rewrites only for `/spend <task>`

An ordinary prompt has already started when it is judged vague. It is counted in
the weekly digest and nothing more.

### "Routine" is a rule of thumb

A routine task is any small task, or a medium task that is not code or
debugging. The Sonnet offer follows that rule, not a judgement of difficulty.

### Digest savings are rough

They assume fixed ratios, for example that Sonnet costs half of Opus for the
same task.

### Price table gaps

For past transcripts only: Haiku 5.5's higher price above 100K tokens is not
modelled; cache-read rates for older models are assumed to be 10% of input;
unknown models are priced as Sonnet 5.5.

### Past chats carry no size

`/spend learn` records a model family for each past task, not a size.
Size-matched estimates build up only from tasks tracked after installation.

### Personal and per machine

Totals do not include spend on another computer. There is no team view.

### Automated coverage has gaps

Listed in `TEST_STRATEGY.md` section 4.

---

## What changed in this release

### 0.4.0

- Tips: Sonnet and medium-effort offers, context and cache notes, prompt
  rewrites for vague `/spend` requests.
- Weekly digest in the report and the dashboard.
- The ledger records context size, cache re-read cost, vagueness and model
  hand-offs.
- `/spend set tips on|off`.

### 0.3.0

- Small-model sizing of every prompt: kind and size.
- Estimates matched by kind, size, model family and effort; calibration from
  recent tasks.
- One-tap feedback when an estimate was far off or a task was paused.
- Accuracy scorecard.
- `/spend set sizing on|off`, `/spend set feedback on|off`.

### 0.2.0

- Every prompt tracked silently with a default limit; the band shows only for
  expensive tasks.
- Pause and ask in place, replacing the hard stop.
- Daily, weekly and monthly budgets with pace.
- Cost basis: list prices, a discount, or a subscription plan.
- Theme colours; emoji as an option.
- Command renamed to `/spend`.

### 0.1.0

- Estimate before a task, live cost with a hard stop, subagent cap, spend log,
  HTML dashboard, learning from past chats.

---

## Upgrade notes

Settings, totals and history carry over between versions. Session state from an
older version is discarded on reload where its shape changed; a task in progress
during an upgrade may stop being tracked until the next prompt.

## Reporting problems

Open an issue in this repository. Include the Cost Guard version, the Claude
Code version, what you did, what you expected and what happened. Do not paste
the ledger or the dashboard without reading them first: both hold the openings
of your prompts.
