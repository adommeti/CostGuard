# Cost Guard — Technical Architecture

## 1. Architecture objective

Cost Guard must sit on the path of every model request so it can pause a task
before money is spent, and it must never be the reason a request fails.
Everything else follows from those two aims: one hooks module, no dependencies,
hooks that fail open, and state that survives a reload.

## 2. High-level components

Cost Guard is a Claude Code function-hooks mod: a TypeScript module that Claude
Code loads and calls on engine events. It runs in the engine's sandboxed hooks
environment, with no Node and no DOM. Files, processes, the model and the
session are reached only through the engine interface, `$`.

| Component             | File                 | Role                                                                                             |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| Hooks                 | `hooks/register.tsx` | Every hook, the `/spend` command, the limit gates, sizing, feedback, tips, the band and the pane |
| Settings and totals   | `hooks/config.ts`    | Defaults, cost basis, spend by day, week and month maths, pace, bar drawing                      |
| History and estimates | `hooks/history.ts`   | Keyword classifier, transcript scanner, estimator, scorecard, weekly digest, file helpers        |
| Prices                | `hooks/pricing.ts`   | Per-model list prices; the cost formula for past transcripts                                     |
| Dashboard             | `hooks/dashboard.ts` | The self-contained HTML dashboard                                                                |
| State contract        | `types/index.d.ts`   | Types for session state and every stored shape                                                   |

## 3. Repository layout

```
.claude-plugin/
  plugin.json          manifest: name, version, author, the capSubagents setting
  marketplace.json     makes this repository installable
hooks/
  hooks.json           points Claude Code at register.tsx
  register.tsx         all hooks
  config.ts  history.ts  pricing.ts  dashboard.ts
  register.test.tsx    the test suite
types/index.d.ts       state contract
docs/                  guides and ADRs
```

## 4. Core types

Defined in `types/index.d.ts`.

- `Config`: cost basis, discount, task limit, daily and longer budgets, band
  threshold, and the emoji, sizing, feedback and tips switches.
- `Offer`: an estimate before a task starts: kind, size, likely figure (`p50`),
  80% figure (`p80`), its basis, and any Sonnet offer or rewrite.
- `Active`: the task being watched: estimate, limit, baseline cost, spend, model
  family, effort, largest context seen, and cache re-read cost.
- `LedgerRow`: one finished task as logged.
- `Totals`, `Gate`: today's and the period's spend; today's budget answers and
  which notices have been shown.
- `Nudge`, `Tip`: the pending feedback question and tip.
- `Score`, `Digest`, `Report`: the scorecard, the weekly digest and the
  dashboard's figures.

## 5. Events and hooks

| Event                     | What Cost Guard does                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session.start`           | Registers `/spend`, counts the session's spend into today, shows a one-time welcome toast                                                                               |
| `command.run` (`spend`)   | Home pane, setup, single settings, report, export, learn, forget, stop, or an estimate for a task                                                                       |
| `turn.start`              | Starts tracking the turn as a task, or binds it to a `/spend` task; starts small-model sizing without waiting for it                                                    |
| `turn.step`               | Runs the limit gates and the pause question before the request; applies a model or effort switch; afterwards updates spend, totals, context size and cache re-read cost |
| `turn.complete`           | Finishes the task: ledger row, history sample, calibration, feedback question, context tip                                                                              |
| `agent.spawn`             | Rewrites Opus, Fable or Mythos subagents to Sonnet                                                                                                                      |
| `session.end`             | Counts the session's remaining spend into today                                                                                                                         |
| `ui.render` (AbovePrompt) | Draws the band                                                                                                                                                          |
| `ui.render` (Pane)        | Draws the pane's views                                                                                                                                                  |

## 6. Task lifecycle

A task is one main-chat turn.

1. **Start.** `turn.start` makes a quick estimate from keywords and history,
   records the session's cost as the baseline, and applies the default limit. A
   `/spend` task uses the limit chosen in the pane.
2. **Size.** The small model's reading arrives a moment later and the estimate
   is recomputed. The update is applied only if the same turn is still active.
3. **Guard.** Before each model request, three checks run in order: task, day,
   period (section 7).
4. **Watch.** After each request, spend and totals are updated.
5. **Finish.** `turn.complete` logs the actual cost (session cost now minus
   baseline), adds a history sample unless the task was paused, and decides
   whether to ask for feedback or show a context tip.

## 7. The limit gate

The gate runs inside the `turn.step` hook, before `next(e)` sends the request.
It applies to the main chat and to every subagent.

- **Task:** spend so far plus the last request's cost (at least $0.005) reaches
  the task limit.
- **Day:** today's spend reaches the daily budget.
- **Period:** this week's or month's spend reaches the longer budget.

When a check fails, the hook awaits a question (`$.ui.ask`). An answer that
raises a limit lets the loop re-check, up to four times; Stop, or a dismissed
question, ends the turn by yielding a text chunk and a stop chunk in place of
the request. Subagents that reach a limit at the same moment share one in-flight
question.

The gate is a check before a request, not a meter inside one. Two consequences
are accepted (ADR-001):

- The last request can take a task slightly over its limit.
- Requests already in flight in parallel subagents all complete.

## 8. Cost sources

| Figure                    | Source                                                                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live and actual task cost | Claude Code's session cost (`$.session.usage().cost.usd`), the figure `/cost` shows. It already prices uncached input, output, cache reads and cache writes, including subagents and Cost Guard's own small-model calls |
| Cost basis                | The session figure multiplied by one minus the discount, if set. On a subscription basis the same figure is shown, marked ≈                                                                                             |
| Daily and period totals   | After every request, each session's new spend is added to today, so several sessions on one machine add up                                                                                                              |
| Cache re-read cost        | Per main-chat request: cache-read tokens times the model's cache-read rate from `pricing.ts`                                                                                                                            |
| Past transcripts          | Priced by `pricing.ts`: input and output at each model's rate, cache reads at its cache-read rate, 5-minute cache writes at 1.25 times input, 1-hour writes at 2 times input                                            |

Known gaps in `pricing.ts`: Haiku 5.5's higher price above 100K tokens is not
modelled; cache-read rates for older models are assumed to be 10% of input;
unknown models are priced as Sonnet 5.5.

## 9. Estimator

`estimate()` in `hooks/history.ts` returns a likely figure (median, `p50`) and
an 80th-percentile figure (`p80`).

1. **Closest match.** It uses the first of these groups of past tasks that has
   at least five: same kind, size, model family and effort; same kind, size and
   model family; same kind and size; same kind.
2. **Thin history.** With ten or more tasks overall but few of this kind, the
   kind's starter figure is blended with the overall median. With less, starter
   figures are used, scaled by model family.
3. **Size.** When the matched group ignores size, figures are scaled: small
   ×0.45, medium ×1, large ×2.4. Without a small-model reading, long prompts are
   scaled up instead.
4. **Calibration.** Blended and starter estimates are multiplied by the median
   of the last 20 actual-to-estimate ratios, kept between 0.5 and 2.

The suggested limit is the 80% figure plus a quarter, rounded up to the next
$0.50, and at least $0.50.

## 10. Small-model calls

Two calls, both to Haiku through `$.model.complete`, both sending at most the
first 4,000 characters of the prompt:

- **Sizing** returns three words: a kind, a size, and clear or vague. Time cap 8
  seconds. Prompts under 12 characters are skipped. Any failure falls back to
  the keyword classifier.
- **Rewrite** returns a tighter wording of a vague `/spend` request. Time cap 10
  seconds. It is told to invent no facts and to leave bracketed placeholders.

For ordinary prompts sizing runs after the turn has started, so it never delays
the first request (ADR-003).

## 11. Feedback and tips

- **Feedback question:** raised when the actual cost is over twice the 80%
  figure (and at least $0.50), under a quarter of the likely figure (when that
  was at least $0.50), or the task was paused.
- **Answers:** "Bigger than usual", "Smaller than usual" and "Task ran away"
  remove that task's sample. "Estimate was off" adds it twice more. "Limit was
  too low", and any limit raise at a pause, count toward a one-time suggestion
  to raise the default after three.
- **Tips:** a Sonnet or medium-effort offer after sizing; a context note when a
  task spent 40% or more of its cost re-reading a chat of 150K tokens or more; a
  cache note when a request on a chat of 60K tokens or more wrote at least 60%
  of its context to the cache.
- **Muting:** three straight dismissals turn the feedback question off; a kind
  of tip declined three times and never accepted stops appearing (ADR-004).

## 12. State and storage

| Store                                                        | Holds                                                                                                   | Lifetime                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Session state (`$.state`)                                    | Pane view, active task, totals, today's budget answers, last model and effort, pending question and tip | One session; survives mod reloads      |
| Plugin store `config`                                        | Settings                                                                                                | Across sessions                        |
| Plugin store `spend`                                         | Spend by day (120 days); what each recent session had cost when last counted (40 sessions)              | Across sessions                        |
| Plugin store `history`                                       | Kind, size, model family, effort, cost and day of up to 3,000 tasks; no prompt text                     | Across sessions                        |
| Plugin store `calib`, `tally`, `tips`, `consent`, `welcomed` | Calibration ratios; feedback counts; tips accepted and declined; consent; welcome shown                 | Across sessions                        |
| `~/.claude/cost-guard/ledger.jsonl`                          | One row per task, with the first 160 characters of the prompt                                           | Permanent; rotates to `.old` past 3 MB |
| `~/.claude/cost-guard/dashboard.html`                        | Last exported dashboard                                                                                 | Overwritten on export                  |

Each session-state atom carries a `shape` version. A shape change makes a reload
start that value afresh, so new code never reads an old value's layout.

## 13. Failure behaviour

- The `agent.spawn` hook has a `.catch` that passes the event through unchanged.
- Store and file writes are wrapped so a failed write never throws into a hook.
- A failed or slow small-model call returns null and the keyword classifier's
  result stands.
- A hook whose drawing fails is skipped by the engine alone; other plugins still
  draw.

## 14. Frontend

The band and pane are JSX compiled against the engine's element table
(`$.ui.resolve(e)`): `Box`, `Text`, `Button`, `Progress`. Colours are theme
colour names only. `UX_SPEC.md` is the authority on what each surface shows.
