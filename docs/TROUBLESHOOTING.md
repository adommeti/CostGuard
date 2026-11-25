# Troubleshooting

Each entry gives a symptom, the likely cause, and what to do. If nothing here
helps, see [Getting help](#getting-help).

## Installation and start-up

### `/spend` is not recognised

**Cause:** the mod is not loaded, or failed to load.

**Fix:** run `/plugin` and check that `cost-guard` is listed and enabled. If it
is listed with an error, run `/reload-plugins` and read the message.

### "`/spend` refused: another plugin registered it already"

**Cause:** another mod owns the same command name.

**Fix:** disable the other mod, then `/reload-plugins`.

### Two mods interrupt the same task

**Cause:** another budget mod is also installed.

**Fix:** disable one. See
[Installation](INSTALLATION.md#running-beside-other-budget-mods).

## The band

### The band never appears

**Cause:** this is the default for small tasks. The band shows only when a task
is estimated at, or has grown to, the `alert` amount ($1).

**Fix:** none needed. To see it more often, `/spend set alert 0.25`.

### The band is cut off or wraps badly

**Cause:** a narrow terminal with the task meter, a feedback question and a tip
all showing.

**Fix:** answer or dismiss the question or tip; widen the terminal. If it
happens at a normal width, report it with the terminal's column count.

### Number keys do not press the band's buttons

**Cause:** the band does not have keyboard focus.

**Fix:** move focus to the band (ctrl+x then tab, or click it), then press the
number.

## Limits and pauses

### A task stopped and I did not choose Stop

**Cause:** the pause question was closed without an answer, which counts as
Stop.

**Fix:** send your next message to continue the work as a new task. To avoid
frequent pauses, raise the default: `/spend set task 10`.

### A task went over its limit

**Cause:** the limit is checked before each model request, so the last request
can pass it; parallel subagents already running all finish.

**Fix:** expected behaviour. Set the limit a little below what you can accept.
For a hard cap, use your provider's spend limits.

### This session is paused on every prompt

**Cause:** the daily or longer budget is spent.

**Fix:** answer "Ignore the budget today" or "Carry on today" at the question,
or raise the budget with `/spend set daily <amount>`.

### I want no limits

**Fix:** `/spend set task off`, and `off` for `daily`, `weekly` and `monthly`.

## Figures

### "Today" jumped when I installed Cost Guard

**Cause:** the first time a running session is counted, its whole cost so far is
added to today.

**Fix:** none; it happens once per session that predates the mod.

### Figures do not match my invoice

**Cause:** figures are client-side estimates. Rates, rounding and anything
billed outside Claude Code differ.

**Fix:** treat the invoice as correct. If you have a negotiated rate,
`/spend set discount <percent>`.

### Dollars show with ≈

**Cause:** the cost basis is a subscription plan, where dollars are an
API-equivalent.

**Fix:** none; change the basis with `/spend setup` if it is wrong.

### "Today" is lower than I expect

**Cause:** totals cover this computer only.

## Estimates

### Estimates are far off

**Cause:** little history, or history that does not resemble your current work.

**Fix:** run `/spend learn` once. Answer the feedback question when it appears.
Check the scorecard in `/spend report`: estimates settle as tasks accumulate.

### `/spend <task>` is slow to show the estimate

**Cause:** it waits for the small model's reading, for up to eight seconds, and
up to ten more for a rewrite of a vague request.

**Fix:** `/spend set sizing off` removes the first wait; `/spend set tips off`
removes the second.

### The estimate says "starter figures"

**Cause:** fewer than ten past tasks are recorded.

**Fix:** none needed; or run `/spend learn`.

## Feedback and tips

### The feedback question stopped appearing

**Cause:** it was dismissed three times in a row and turned itself off.

**Fix:** `/spend set feedback on`.

### A tip stopped appearing

**Cause:** that kind of tip was declined three times and never accepted.

**Fix:** there is no command to reset one kind in this release. Report it if you
want the tip back.

### "Use Sonnet" was pressed but the task seems to cost the same

**Cause:** the first request on the new model re-reads the chat at full price,
because it cannot reuse the prompt cache.

**Fix:** expected; the saving comes on later requests. On a task that is nearly
finished, switching can cost more than it saves.

## Reports

### `/spend export` does not open a browser

**Cause:** the operating system's opener failed or is blocked.

**Fix:** open `~/.claude/cost-guard/dashboard.html` by hand.

### The report shows no tasks

**Cause:** no task has finished since installation. Tasks from `/spend learn`
feed estimates but do not appear in the task list.

## Getting help

Open an issue in the repository with:

- the Cost Guard version (in `/plugin`) and the Claude Code version
  (`claude --version`);
- what you did, what you expected, what happened;
- the exact text of any message.

Read the ledger and dashboard before attaching either: both hold the first 160
characters of your prompts.
