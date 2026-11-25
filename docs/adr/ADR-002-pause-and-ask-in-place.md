# ADR-002: Pause and ask in place at a limit

- Status: Accepted
- Date: 2026-11-25
- Phase: 0.2

## Context

Version 0.1 ended the turn when a task reached its limit. The person then had to
type a new command to continue, which lost the turn's momentum and made a limit
feel like a penalty. People respond to that by setting limits high or turning
them off, which defeats the purpose.

The alternative is to hold the request, ask what to do, and continue the same
turn. That depends on a hook being able to await a question dialog while a model
request waits.

## Decisions

### 1. The gate awaits a question inside `turn.step`

- When a check fails, the hook calls `$.ui.ask` and awaits the answer before
  deciding whether to send the request. This was confirmed to work before the
  design was adopted; no fallback path exists.
- After an answer that raises a limit, the checks run again, up to four times,
  so a daily budget is still asked about after a task limit is raised.

### 2. Four options, and a typed amount

- The question dialog takes at most four options. For a task limit: Add $1,
  Double the limit, Finish on Sonnet, Stop the task.
- Other amounts are typed under the dialog's own "Other" choice.
- "Finish on Sonnet" also raises the limit by half, because a hand-off with no
  headroom would pause again at once. When the task is already on a cheap model,
  the option is replaced by Add $5.

### 3. Dismissal means stop

- Closing the question without an answer stops the task. The safe reading of
  silence at a spending limit is not to spend.

### 4. Stopping ends the turn from inside the hook

- The hook yields a text chunk explaining the pause and a stop chunk, in place
  of the request. No request is sent.

### 5. One question for simultaneous subagents

- Requests that reach a limit while a question is open share its in-flight
  promise rather than opening one each.

### 6. Raising a limit is a signal

- A limit raised at a pause counts toward a one-time suggestion to raise the
  default (ADR-004).

## Consequences

- A task can wait indefinitely on an unanswered question. This is accepted:
  nothing is being spent while it waits.
- A stopped task is marked paused in the ledger and is left out of estimate
  history, since its cost is not what the task would have cost.
- The next message after a stop starts a new task with a fresh limit; the
  earlier spend is not carried into it.
- The behaviour is verified against a mocked question dialog only.
  `TEST_STRATEGY.md` lists the live checks still to be recorded.
