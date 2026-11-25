# Cost Guard — Product Requirements

## 1. Purpose

Cost Guard gives one person control over what they spend in Claude Code, without
adding a step to ordinary work. It answers three questions: what will this cost,
what did it cost, and how could it cost less.

## 2. Users

- **Primary:** an engineer who uses Claude Code daily, pays by API usage or a
  subscription plan, and wants to avoid surprise costs.
- **Secondary:** a colleague who installs the mod from this repository and
  expects it to work with no setup.

Team reporting is out of scope (section 8).

## 3. Principles

1. **Quiet by default.** Small tasks show nothing. Cost Guard speaks only when a
   task is expensive, a budget is near, or it has something to teach.
2. **No setup.** It works from the first prompt with defaults. Every setting is
   optional.
3. **Ask, do not block.** At a limit the task pauses and asks in place; the
   person decides.
4. **Honest figures.** Every dollar figure is labelled an estimate. Subscription
   dollars are marked ≈.
5. **Local.** State stays on the person's computer. The only model calls go to
   the provider the session already uses.
6. **Learns without nagging.** Feedback is one tap and only when it would teach
   something. Ignored prompts stop appearing.

## 4. Functional requirements

### 4.1 Tracking

- FR-1: Every main-chat turn is a task with an estimate, a limit and a measured
  actual cost, including its subagents.
- FR-2: Tasks estimated or grown to the band threshold ($1 by default) show a
  band above the prompt. Others show nothing.
- FR-3: `/spend <task>` shows an estimate before the task starts, with start
  options. `/spend $N <task>` sets the limit.

### 4.2 Budgets

- FR-4: Four budgets: default task limit ($5), per-task limit, daily, and weekly
  or monthly.
- FR-5: The weekly or monthly budget shows pace: the projected spend and the day
  the budget runs out.
- FR-6: Daily and longer budgets raise one notice at 80%.

### 4.3 Limits

- FR-7: Before each model request, if the request would pass a limit, the task
  pauses and asks.
- FR-8: Task-limit choices: add $1, double the limit, finish on Sonnet, stop; a
  typed amount is accepted.
- FR-9: The task continues in place after an answer. Stop, or dismissing the
  question, ends the turn with a message.

### 4.4 Cost basis

- FR-10: Default basis is API list prices.
- FR-11: `/spend setup` switches to a percentage discount or a subscription
  plan. On a plan, plan-limit use is shown and dollars are marked ≈.

### 4.5 Learning

- FR-12: A small model names each prompt's kind, size and whether it is vague.
  It can be turned off.
- FR-13: Each finished task corrects estimates for its kind, size, model family
  and effort.
- FR-14: With consent, the last 30 days of local transcripts seed the estimates.
  The person can undo this.
- FR-15: When an estimate was far off or a task was paused, one question is
  asked. Three dismissals in a row turn the question off.
- FR-16: An accuracy scorecard shows the share of tasks within the 80% figure,
  overall, by kind, and recent against earlier.

### 4.6 Suggestions

- FR-17: A routine task on Opus or Fable gets an offer of Sonnet with the likely
  saving, accepted with one press.
- FR-18: A small task at xhigh or max effort gets an offer of medium effort.
- FR-19: A note appears when most of a task's cost was re-reading a long chat,
  or when the prompt cache had lapsed. Each at most once a day.
- FR-20: A vague `/spend` request gets a rewritten prompt to use, edit or
  ignore.
- FR-21: A weekly digest shows spend by kind, the costliest tasks, and up to
  three habits with rough savings.
- FR-22: A kind of tip declined three times and never accepted stops appearing.

### 4.7 Subagents

- FR-23: Subagents that would run on Opus, Fable or Mythos run on Sonnet. A
  plugin setting turns this off.

### 4.8 Reporting

- FR-24: `/spend` shows today, budgets and a 7-day sparkline. `/spend report`
  shows 14 days, recent tasks, the digest and the scorecard.
- FR-25: `/spend export` writes a self-contained HTML dashboard with no scripts
  and no network requests.

## 5. Non-functional requirements

- NFR-1: A failure in Cost Guard never blocks a model request or a subagent.
  Hooks fail open.
- NFR-2: The small-model call has a time cap (8 seconds for sizing) and never
  delays an ordinary prompt: it runs after the turn has started.
- NFR-3: No dependencies. No network access of its own.
- NFR-4: The look follows the user's theme through theme colour names; no fixed
  colours in the terminal.
- NFR-5: Emoji are off by default.

## 6. Defaults

| Setting                        | Default         |
| ------------------------------ | --------------- |
| Cost basis                     | API list prices |
| Task limit                     | $5              |
| Band threshold                 | $1              |
| Daily, weekly, monthly budgets | Off             |
| Small-model sizing             | On              |
| Feedback question              | On              |
| Tips                           | On              |
| Emoji                          | Off             |
| Subagent cap                   | On              |

## 7. Success measures

- About 80% of finished tasks cost no more than their 80% figure.
- The person changes at least one habit named in a weekly digest.
- Fewer than one feedback question per ten tasks.

These are aims. None has been measured yet.

## 8. Out of scope

- Team or organization roll-ups, shared budgets, and central reporting.
- Billing, chargeback, or invoice reconciliation.
- Support for tools other than Claude Code.
- Enforcing a cap that cannot be overshot (see `ARCHITECTURE.md`, section 7).
