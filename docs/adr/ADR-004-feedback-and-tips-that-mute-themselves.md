# ADR-004: Feedback and tips that mute themselves

- Status: Accepted
- Date: 2026-11-25
- Phase: 0.3 to 0.4

## Context

Cost Guard can learn from the person and can suggest cheaper ways to work. Both
compete for attention with the work itself. A tool that asks after every task,
or repeats advice that has been declined, is turned off. The spec's owner chose
feedback "occasional, only when useful" and all four kinds of suggestion.

## Decisions

### 1. Feedback is asked only when it would teach something

- The question is raised when the actual cost is over twice the 80% figure (and
  at least $0.50), under a quarter of the likely figure (when that was at least
  $0.50), or the task was paused.
- It is one row in the band with one-press answers, and it expires after one
  following task.

### 2. Each answer has a defined effect on what is learned

| Answer                                               | Effect                                    |
| ---------------------------------------------------- | ----------------------------------------- |
| Bigger than usual, Smaller than usual, Task ran away | The task's sample is removed from history |
| Estimate was off                                     | The task's sample is added twice more     |
| Limit was too low                                    | Counts toward the low-limit suggestion    |
| Dismiss                                              | Counts toward muting                      |

### 3. Actions are signals too

- Raising a limit at a pause counts the same as "Limit was too low". After
  three, Cost Guard suggests a higher default once and starts counting again.
- Accepting or declining a tip is recorded per kind.

### 4. Things that are ignored stop appearing

- Three dismissals of the feedback question in a row turn it off, with a notice
  that says how to turn it back on.
- A kind of tip declined three times and never accepted is no longer shown.
- Context and cache notes appear at most once a day each.

### 5. Tips act only when pressed

- A Sonnet or medium-effort offer changes nothing until its button is pressed,
  and then only for the current task.
- A rewrite is text to accept, edit or ignore. It is never submitted on its own.
- Cost Guard never raises a model or an effort level.

### 6. "Routine" is a fixed rule

- A routine task is any small task, or a medium task that is not code or
  debugging. The Sonnet offer follows this rule.
- A model-judged measure of difficulty was not adopted: it would add a second
  judgement to explain and to get wrong.

### 7. Rewrites only before a task starts

- A rewrite is offered for `/spend <task>`, where nothing is running yet. An
  ordinary prompt has already started when it is judged vague; interrupting it
  would cost more than it saves. Such prompts are counted in the weekly digest
  instead.

## Consequences

- There is no command to un-mute one kind of tip; only all tips can be switched.
  This is a known gap.
- The Sonnet offer can appear for a task that is harder than its size suggests.
  The person decides; declining three times silences it.
- Savings shown are rough: they use fixed price ratios and do not subtract the
  one-time cost of switching model mid-task. The documentation says so; the
  interface marks digest savings as rough and does not mention the switch cost.
- The muting counters and the effort tip have no automated test.
