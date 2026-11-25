# Cost Guard — UX Specification

## 1. Surfaces

Cost Guard draws in four places. Each has one job.

| Surface                 | Job                                      | When it shows                                  |
| ----------------------- | ---------------------------------------- | ---------------------------------------------- |
| Band (above the prompt) | Live status, the feedback question, tips | Only when there is something to say            |
| Pane (side panel)       | Estimates, reports, settings summary     | On `/spend` commands                           |
| Question dialog         | Pause-and-ask at a limit; setup          | When a limit is reached; on `/spend setup`     |
| Toast                   | One-line notices                         | Welcome, 80% of a budget, finished costly task |

## 2. The band

The band is up to three rows, in this order.

### 2.1 Task meter

Shown when the task is a `/spend` task, or its estimate or spend has reached the
band threshold.

```
▰▰▰▱▱▱▱▱▱▱ $1.84 of $5.00 · est $1.20 · today $6.10/$25.00 · on sonnet
```

- The bar and its colour show spend against the limit: `success` below 75%,
  `warning` from 75%, `error` at the limit.
- Without a limit, the ratio is spend against the 80% figure.
- Suffixes appear only when true: `on <model>`, `<level> effort`, `paused`.

When no task qualifies and a daily or longer budget is at 80% or more, the row
shows that budget instead.

### 2.2 Feedback question

Shown after a task whose estimate was far off, or which was paused.

```
Last task cost $6.00, estimate $0.90.  1: Bigger than usual  2: Estimate was off  3: Dismiss
Last task paused at $5.00.  1: Limit was too low  2: Task ran away  3: Dismiss
```

- One press answers it. It expires after one following task.
- "Smaller than usual" replaces "Bigger than usual" when the task cost under a
  quarter of its estimate.

### 2.3 Tip

```
Tip: This looks routine. Sonnet would cost about $0.60 instead of $1.20.  4: Use Sonnet  5: No thanks
```

- A tip with an action has an accept button and "No thanks". A note has "OK".
- The label "Tip:" uses the theme's `suggestion` colour.

### 2.4 Rules

- The band never shows over a survey (`hasSurvey`).
- Hotkeys 1 to 3 belong to the feedback question; 4 and 5 to the tip.
- With emoji on, marks replace words: 🟢 🟡 🔴 before the bar, 💬 before the
  question, 💡 in place of "Tip:".

## 3. The pane

| View   | Opened by              | Contents                                                                          |
| ------ | ---------------------- | --------------------------------------------------------------------------------- |
| Home   | `/spend`               | Today, budgets with bars, pace, 7-day sparkline, current task, settings line      |
| Offer  | `/spend <task>`        | Estimate (likely and 80% figure), its basis, Sonnet offer, start buttons, rewrite |
| Done   | End of a `/spend` task | Estimate against actual                                                           |
| Report | `/spend report`        | 14-day bars, recent tasks, weekly digest, scorecard                               |
| Note   | Help, settings changes | Plain text                                                                        |

### 3.1 Offer view buttons

1. Start with a $N limit (primary)
2. Start on Sonnet, about $X ($N limit) — only when a Sonnet offer applies
3. Start with no limit
4. Not now

A vague request adds a rewritten prompt with three buttons: Use this prompt,
Edit it, Keep mine. "Edit it" puts `/spend <rewrite>` in the prompt box.

## 4. The pause question

Header "Cost Guard". At most four options, as the question dialog allows; a
typed amount goes under Other.

| Limit                          | Options                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Task                           | Add $1 · Double the limit · Finish on Sonnet (+half the limit) · Stop the task |
| Task, already on a cheap model | Add $1 · Double the limit · Add $5 · Stop the task                             |
| Day                            | Add $5 to today · Ignore the budget today · Stop                               |
| Week or month                  | Carry on today · Stop                                                          |

Dismissing the dialog is the same as Stop. Subagents that reach a limit together
share one question.

## 5. Wording

- Money is always `$0.00`, two decimals. On a subscription basis it is `≈$0.00`.
- "Estimate" or "est" for the likely figure; "80% figure" for the upper one. The
  words p50 and p80 appear in documentation, not in the interface.
- Figures are estimates, and the `/spend help` text says so. No surface presents
  a figure as a bill.
- Sentences are short and say what happened and what the person can do.

## 6. Quietness rules

1. A task under the band threshold draws nothing.
2. A context note of each kind appears at most once a day.
3. The feedback question turns itself off after three dismissals in a row, and
   says how to turn it back on.
4. A kind of tip declined three times and never accepted stops appearing.
5. The welcome toast appears once per installation.

## 7. Theme

Terminal colours are theme colour names only: `success`, `warning`, `error`,
`suggestion`, and dimmed text. No fixed colour values are used in the terminal,
so the band and pane follow light, dark and custom themes. The exported HTML
dashboard carries its own light and dark styles.
