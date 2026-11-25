# User Guide

Cost Guard works without being asked. This guide explains what it shows, what
each command does, and how to read its figures.

## Contents

- [Orientation](#orientation)
- [The band](#the-band)
- [When a task reaches its limit](#when-a-task-reaches-its-limit)
- [Pricing a task before it starts](#pricing-a-task-before-it-starts)
- [Budgets](#budgets)
- [How you pay](#how-you-pay)
- [Estimates and how they learn](#estimates-and-how-they-learn)
- [Tips](#tips)
- [Reports](#reports)
- [Commands](#commands)
- [Settings](#settings)
- [Reading the figures correctly](#reading-the-figures-correctly)

## Orientation

A **task** is one prompt and everything Claude does to answer it, including
subagents. Every task gets:

- an **estimate**: a likely cost and an 80% figure (four tasks in five should
  cost no more);
- a **limit**: $5 unless you change it;
- an **actual cost**, measured when the task ends.

Most tasks are small and Cost Guard shows nothing for them.

## The band

One line above the prompt, shown for a task estimated at $1 or more, or one that
has grown to $1.

```
▰▰▰▱▱▱▱▱▱▱ $1.84 of $5.00 · est $1.20 · today $6.10
```

- The bar is spend against the limit. It is green, turns amber at 75%, and red
  at the limit.
- `est` is the likely cost.
- `today` is everything spent today on this computer, and your daily budget if
  you set one.

When no large task is running, the band appears only if a daily, weekly or
monthly budget is 80% spent.

## When a task reaches its limit

Before a model request that would pass the limit, the task pauses and asks.

| Choice           | What happens                                                     |
| ---------------- | ---------------------------------------------------------------- |
| Add $1           | The limit rises by $1 and the task continues                     |
| Double the limit | The limit doubles and the task continues                         |
| Finish on Sonnet | The rest of the task runs on Sonnet, and the limit rises by half |
| Stop the task    | The turn ends with a note of what was spent                      |
| Other            | Type an amount to add, such as `3`                               |

Closing the question without answering stops the task. After a stop, your next
message starts a new task with a fresh limit.

Raising limits often is a sign the default is low. After three raises Cost Guard
suggests a higher default once.

## Pricing a task before it starts

```
/spend migrate the billing module to the new client
/spend $8 migrate the billing module to the new client
```

The pane shows the estimate, what it is based on, and buttons to start with a
limit, start with no limit, or cancel. With `$8` the limit is $8; without it,
Cost Guard suggests one a little above the 80% figure.

If the request is vague, the pane offers a tighter wording. **Use this prompt**
starts the task with it, **Edit it** puts it in your prompt box, **Keep mine**
dismisses it. Bracketed placeholders such as `[file]` mark details the rewrite
could not know.

## Budgets

| Budget             | Set with                                            | At the limit                                   |
| ------------------ | --------------------------------------------------- | ---------------------------------------------- |
| Default task limit | `/spend set task 5`                                 | Pauses and asks                                |
| One task           | `/spend $8 <task>`                                  | Pauses and asks                                |
| Daily              | `/spend set daily 25`                               | Pauses and asks: add $5, ignore today, or stop |
| Weekly or monthly  | `/spend set weekly 100` or `/spend set monthly 400` | Pauses and asks: carry on today, or stop       |

Use `off` in place of an amount to remove a budget. Weekly and monthly are
alternatives; setting one replaces the other. The pane shows pace for the longer
budget: projected spend, and the day the budget runs out at the current rate.
Daily and longer budgets give one notice at 80%.

## How you pay

`/spend setup` asks four questions: how you pay, the default task limit, a daily
budget, and a longer budget.

- **API list prices** (default): figures are dollars at published rates.
- **Discount**: list prices less a percentage. Also `/spend set discount 15`.
- **Subscription plan**: you do not pay per token, so dollars are shown with ≈
  as an API-equivalent, and the pane shows your use of the plan's five-hour and
  seven-day limits.

## Estimates and how they learn

- **Sizing.** A small model reads each prompt and names its kind (research,
  code, debug, review, docs, data, other) and size (small, medium, large). Turn
  this off with `/spend set sizing off`; estimates then use keywords.
- **History.** The estimate comes from your past tasks of the same kind, size,
  model and effort where there are at least five, and from broader groups where
  there are not. With little history it uses starter figures.
- **Past chats.** `/spend learn` asks permission, then reads your last 30 days
  of Claude Code chats on this computer to seed the history. `/spend forget`
  deletes what it learned.
- **Feedback.** When a task cost far more or less than estimated, or was paused,
  the band asks one question.

| Answer                                 | Effect                                                |
| -------------------------------------- | ----------------------------------------------------- |
| Bigger than usual / Smaller than usual | That task is left out of future estimates             |
| Estimate was off                       | That task counts three times                          |
| Limit was too low                      | Counts toward a suggestion to raise the default limit |
| Task ran away                          | That task is left out of future estimates             |
| Dismiss                                | Nothing; three in a row turn the question off         |

`/spend set feedback on` turns the question back on.

## Tips

| Tip                    | When                                                                          | Action                                    |
| ---------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- |
| Use Sonnet             | A routine task would run on Opus or Fable                                     | One press switches this task              |
| Use medium effort      | A small task at xhigh or max effort                                           | One press switches this task              |
| Re-reading a long chat | 40% or more of a task's cost went on re-reading a chat of 150K tokens or more | Run `/compact`, or start a fresh chat     |
| Cache had lapsed       | A request re-wrote most of a long chat to the cache                           | Avoid long pauses mid-task on a long chat |
| Tighter prompt         | A `/spend` request is vague                                                   | Use, edit or keep yours                   |

A kind of tip you decline three times and never accept stops appearing.
`/spend set tips off` turns all tips off.

## Reports

- `/spend` — today, budgets, a 7-day sparkline, the current task.
- `/spend report` — 14 days of daily spend, recent tasks with estimate against
  actual, the weekly digest, and the accuracy scorecard.
- `/spend export` — the same as an HTML page, saved to
  `~/.claude/cost-guard/dashboard.html` and opened in your browser.

The **weekly digest** lists the last seven days by kind, the three costliest
tasks, and up to three habits with a rough weekly saving.

The **scorecard** shows the share of finished tasks that cost no more than their
80% figure. About 80% means the estimates are well calibrated. Much lower means
they run low; much higher means they run high.

## Commands

| Command                     | What it does                                              |
| --------------------------- | --------------------------------------------------------- |
| `/spend`                    | Open the pane                                             |
| `/spend <task>`             | Estimate the task, then choose how to start it            |
| `/spend $5 <task>`          | Same, with a $5 limit                                     |
| `/spend setup`              | How you pay, default task limit, daily and longer budgets |
| `/spend set <name> <value>` | Change one setting                                        |
| `/spend report`             | The report in the pane                                    |
| `/spend export`             | The report as an HTML page                                |
| `/spend learn` / `forget`   | Use, or stop using, your past chats for estimates         |
| `/spend stop`               | Stop watching the current task                            |
| `/spend help`               | List the commands                                         |

## Settings

| Name                 | Values           | Default | Meaning                                             |
| -------------------- | ---------------- | ------- | --------------------------------------------------- |
| `task`               | dollars or `off` | 5       | Limit on every task                                 |
| `daily`              | dollars or `off` | off     | Daily budget                                        |
| `weekly` / `monthly` | dollars or `off` | off     | Longer budget                                       |
| `alert`              | dollars          | 1       | The band shows for tasks estimated at or above this |
| `discount`           | percent          | 0       | Discount off list prices                            |
| `emoji`              | `on` / `off`     | off     | Emoji marks in the band and pane                    |
| `sizing`             | `on` / `off`     | on      | Small-model reading of each prompt                  |
| `feedback`           | `on` / `off`     | on      | The one-tap question                                |
| `tips`               | `on` / `off`     | on      | Cost-saving tips                                    |

"Keep subagents on Sonnet or Haiku" is a plugin setting, changed under
`/plugin`.

## Reading the figures correctly

- **Every figure is an estimate.** It comes from Claude Code's own cost figure
  and can differ from your invoice.
- **A limit is checked before each request.** The last request can take a task a
  little over.
- **"Today" is this computer only.**
- **A Sonnet saving does not include the switch.** The first request on the new
  model re-reads the chat at full price.
- **Digest savings are rough.** Treat them as a ranking of habits, not a
  forecast.
