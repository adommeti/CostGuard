# Cost Guard — Test Strategy

## 1. Quality bar

A change is not done until its behaviour is covered by a test that would fail
without it, `npm run check` passes, and anything not verified in a live session
is labelled as such. A green test suite says the hooks behave as written against
a mocked engine. It does not say the mod behaves well in a real session.

## 2. Test layers

### 2.1 Hook tests (automated)

`hooks/register.test.tsx`, run by `claude plugin test .`. Each test loads the
real hooks module and drives it with engine events. Test hooks stand in for the
engine: they answer `$` calls (`session.usage`, `store.get`, `model.complete`,
`fs.*`, the question dialog) with fixed values.

The shared `world()` helper sets up:

- a clock fixed at one instant, so day arithmetic is repeatable;
- a session cost that rises by a set amount per model request ($1.20 unless a
  test changes it);
- an in-memory plugin store;
- a queue of answers for the question dialog; an empty queue dismisses it.

### 2.2 Validation (automated)

`claude plugin validate .` reads the manifest, the marketplace file and the
hooks module as the engine will. It type-checks the module and the tests against
the engine's types and holds every session-state key to the contract in
`types/index.d.ts`.

### 2.3 Formatting (automated)

`prettier --check .` over code, JSON and Markdown.

### 2.4 Live session (manual)

Behaviour that depends on the real engine, a real model or a real terminal is
checked by hand. See section 5.

## 3. What the hook tests cover

| Area                                  | Test                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Estimate before start                 | `/spend <task>` shows an estimate with start buttons                                             |
| Silent tracking, default limit, pause | every prompt is tracked with the default $5 limit, and the pause asks first                      |
| Continue in place                     | "Add $1" lets the task continue in place                                                         |
| Model hand-off                        | "Finish on Sonnet" hands the rest of the task to Sonnet                                          |
| Daily budget, band                    | a daily budget pauses and asks, and the band shows the task                                      |
| Ledger and totals                     | finishing a task logs it and counts it into today                                                |
| Home pane, dashboard                  | `/spend` opens the home pane with budgets, and the dashboard draws                               |
| Small-model sizing                    | the small model sizes a task, for `/spend` and for tracked prompts                               |
| Feedback, calibration, scorecard      | a far-off estimate asks one tap, the answer teaches, and the scorecard shows                     |
| Sonnet offer, rewrite                 | a routine, vague `/spend` task offers Sonnet and a tighter prompt                                |
| Context tip, weekly digest            | a task that mostly re-reads a long chat gets a /compact tip, and the week digest names the habit |
| Settings                              | `/spend set` changes one setting                                                                 |
| Subagent cap                          | subagents asking for Opus run on Sonnet                                                          |

## 4. Known gaps in automated coverage

These behaviours exist in the code and have no test. Each is a candidate for the
next change that touches its area.

- Weekly and monthly budgets: the gate, pace line and 80% notice.
- Discount and subscription cost bases.
- `/spend setup`, `/spend learn`, `/spend forget`, `/spend stop`,
  `/spend export`.
- The transcript scanner and `pricing.ts` cost formula.
- The estimator's match levels beyond starter figures (no test seeds five or
  more matching samples).
- The effort tip and the lapsed-cache note.
- Muting: three dismissals of the feedback question; three declines of a tip.
- Failure paths: a small-model timeout or error, a failed store or file write, a
  throwing `agent.spawn` hook.
- HTML escaping in the exported dashboard.
- Parallel subagents sharing one pause question.

## 5. Manual checks before a release

Run in a real Claude Code terminal session with the mod loaded from its folder.

1. A short prompt shows no band.
2. A prompt sized as large shows the band; the meter moves as the task runs.
3. With `/spend set task 0.50`, a task pauses; each of the four answers behaves
   as `UX_SPEC.md` section 4 says.
4. `/spend <vague task>` shows an estimate within about eight seconds, with a
   rewrite; "Edit it" fills the prompt box.
5. On Opus or Fable, a routine prompt shows the Sonnet tip; "Use Sonnet" changes
   the model on the next request.
6. The feedback question's hotkeys 1, 2 and 3 respond in the band.
7. The band reads well in a light theme and a dark theme, with emoji off and on.
8. `/spend export` opens a dashboard that renders in the browser's light and
   dark modes.
9. After a reload, a task in progress is still tracked.

As of 0.4.0 none of these has been recorded as passed. `RELEASE_NOTES.md` lists
that as a known limitation.

## 6. Test data rules

- Tests use invented prompts and invented costs. No real transcript, key or user
  path belongs in a test.
- Costs in tests are chosen so the expected figure can be worked out by hand,
  and the working is in a comment beside the assertion.

## 7. Definition of done for a change

1. The behaviour has a hook test, or the pull request says why it cannot.
2. `npm run check` passes locally.
3. CI is green.
4. Documents that describe the behaviour are updated in the same pull request:
   `UX_SPEC.md` for anything seen, `ARCHITECTURE.md` for anything structural,
   `docs/USER_GUIDE.md` for anything a user does.
5. A decision that future changes must respect has an ADR.
6. Anything verified only by tests, not in a live session, is labelled so in the
   pull request.
