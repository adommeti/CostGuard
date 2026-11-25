# ADR-003: Small-model sizing and estimate matching

- Status: Accepted
- Date: 2026-11-25
- Phase: 0.3

## Context

Version 0.2 classified a prompt by keywords and scaled the estimate by word
count. Both are weak signals: a short prompt can ask for a large job, and the
same kind of task costs very differently on different models and effort levels.
Estimates need a better reading of the task and a finer match to past tasks,
without slowing ordinary prompts or adding much cost.

## Decisions

### 1. Haiku names the kind, the size, and whether the request is vague

- One call through `$.model.complete` with the model `haiku`, low effort, and at
  most the first 4,000 characters of the prompt.
- The reply is three words. It is parsed by matching whole words against fixed
  lists; anything else is discarded.
- `$.model.classify` was considered and not used: one prompt returning three
  labels is a single call, where classify would need one per label.

### 2. Sizing never delays an ordinary prompt

- For a tracked prompt, the task starts on a keyword estimate and the sizing
  call runs without being awaited. Its result updates the task only if the same
  turn is still active.
- For `/spend <task>`, the estimate waits for sizing, because the person asked
  for an estimate and nothing is running yet.
- Time cap 8 seconds. Prompts under 12 characters are skipped. Any failure
  leaves the keyword result in place.

### 3. Estimates use the closest match with at least five tasks

- Groups are tried in order: kind, size, model family and effort; kind, size and
  model family; kind and size; kind.
- Five is the minimum for a median and an 80th percentile to mean anything;
  below it the next broader group is used.
- Model family and effort for the task are those of the main chat's last
  request.

### 4. Thin history is corrected by calibration, not by guesswork

- When no group qualifies, starter figures or a blend are used and multiplied by
  the median of the last 20 actual-to-estimate ratios, kept between 0.5 and 2.
- Matched groups are not calibrated: they are already the person's own costs.

### 5. Sizing is on by default and can be turned off

- The spec's owner chose default-on. `/spend set sizing off` returns to
  keywords.

## Consequences

- Each prompt of 12 characters or more sends up to 4,000 characters to Haiku a
  second time. This is a privacy fact (`SECURITY_AND_PRIVACY.md` section 3) and
  a small cost, which appears in the session's cost like any other.
- Tasks learned from past chats carry a model family and no size, so
  size-matched groups fill only from tasks tracked after installation.
- The size factors (small ×0.45, large ×2.4) and starter figures are judgement,
  not measurement. The scorecard exists to show whether they are wrong.
- The estimate shown in the band can change a moment after a task starts.
- The parsing of free-text replies and the timeout path have no automated test.
