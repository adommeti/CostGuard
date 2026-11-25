# ADR-001: Foundational architecture contracts

- Status: Accepted
- Date: 2026-11-25
- Phase: 0.1 to 0.2 (first build and redesign)

## Context

Cost Guard must stop a task before money is spent, show what a task cost, and
never be the reason a request fails. Claude Code offers a function-hooks
interface: a module is called on engine events and can observe, rewrite or
answer them. It also keeps its own client-side cost figure for the session.

This ADR records the five contracts every later change builds on.

## Decisions

### 1. Cost comes from Claude Code's session figure

- Live and actual cost is `$.session.usage().cost.usd`, the figure `/cost`
  shows. A task's cost is that figure now minus its value when the task started.
- Cost Guard does not recompute live cost from token counts. The engine's figure
  already prices uncached input, output, cache reads and cache writes, for the
  main chat, subagents and the mod's own small-model calls.
- `hooks/pricing.ts` exists for two narrower jobs only: pricing past
  transcripts, and the cache re-read share of a request.
- Every figure is presented as an estimate.

### 2. The gate sits before each model request

- Limits are checked in the `turn.step` hook before `next(e)` sends the request,
  for the main chat and every subagent.
- The check adds the last request's cost (at least $0.005) to spend so far, so a
  task pauses before the request expected to cross the limit.
- This is a check between requests, not a meter inside one.

### 3. One hooks module, no dependencies

- All hooks live in `hooks/register.tsx`, with pure helpers beside it.
- The mod has no run-time dependencies and makes no network requests of its own.
- Everything outside the module is reached through `$`.

### 4. Local state, in two tiers

- Session state (`$.state`), typed by `types/index.d.ts`, holds what belongs to
  one session: the active task, totals, pending question and tip. Each value
  carries a `shape` version.
- The plugin store (`$.store`) holds what outlives a session: settings, spend by
  day, history, counters.
- One file, `~/.claude/cost-guard/ledger.jsonl`, is the durable per-task record.
- Nothing is sent to a server. There is no team view.

### 5. Fail open

- A failure inside Cost Guard never blocks a request or a subagent. Hooks catch
  their own errors or carry a `.catch` that passes the event through.

## Consequences

- Figures can differ from the invoice, and Cost Guard cannot correct that.
  Documentation and the interface must say so wherever money is shown.
- A limit can be overshot by one request, and by parallel subagents already in
  flight. A true hard cap is out of reach by design; the provider's own spend
  limits are the control for that.
- Daily totals are built by adding each session's new spend after every request,
  which makes totals per machine.
- Failing open means Cost Guard is not a guarantee. `SECURITY_AND_PRIVACY.md`
  states this.
- A change that adds a network call, a dependency or a server needs a new ADR.
