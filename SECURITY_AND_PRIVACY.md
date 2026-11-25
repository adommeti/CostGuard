# Cost Guard — Security and Privacy Requirements

## 1. Trust boundaries

Cost Guard runs inside Claude Code's hooks sandbox with the permissions of the
person who installed it. It has no server, no account and no network access of
its own.

| Boundary                  | What crosses it                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| Mod ↔ Claude Code engine | Every file, process, model and session call, through `$`                                            |
| Mod → model provider      | The first 4,000 characters of a prompt, for sizing and rewrites, through the session's own provider |
| Mod → local disk          | Settings, spend totals, history, the ledger, the exported dashboard                                 |
| Mod → browser             | `/spend export` opens the local dashboard file                                                      |

## 2. Least privilege

- Cost Guard reads only `~/.claude/projects` (with consent) and its own folder,
  `~/.claude/cost-guard`.
- It writes only to its own folder and the plugin store.
- It runs one process: the operating system's opener for the exported dashboard.
- It makes no HTTP requests. `plugin.json` declares no network hosts.

## 3. Data sent to a model

- **What:** the first 4,000 characters of a prompt.
- **When:** for sizing, on every prompt of 12 characters or more while `sizing`
  is on; for a rewrite, on a `/spend` request judged vague while `tips` is on.
- **Where:** the provider the session already uses, through the engine. No other
  service.
- **Control:** `/spend set sizing off` stops sizing calls. `/spend set tips off`
  stops rewrite calls.

The same text is already being sent to that provider as the prompt itself. Cost
Guard adds a second, smaller request; it adds no new recipient.

## 4. Data read from past chats

- Read only after the person answers yes to `/spend learn`. Consent is stored
  and can be withdrawn with `/spend forget`, which deletes what was learned.
- Scope: transcripts modified in the last 30 days, at most 600 files, the last 4
  MB of each.
- Kept: the kind, model family, cost and day of each task. Prompt text is used
  in memory to classify the task and is not stored.

## 5. Data stored locally

| Data                                | Location                              | Contains prompt text                         |
| ----------------------------------- | ------------------------------------- | -------------------------------------------- |
| Settings, totals, history, counters | Claude Code's plugin store            | No                                           |
| Ledger                              | `~/.claude/cost-guard/ledger.jsonl`   | Yes: the first 160 characters of each prompt |
| Dashboard                           | `~/.claude/cost-guard/dashboard.html` | Yes: the same openings, for recent tasks     |

The ledger and the dashboard are the only places prompt text is kept. Treat them
like the transcripts they summarise. Deleting the files clears them. Do not
attach the dashboard to a ticket or message without reading it first.

## 6. The exported dashboard

- Self-contained HTML with inline SVG. No scripts, no external stylesheets, no
  fonts or images loaded from a network.
- Every value written into the page is HTML-escaped, including prompt openings,
  so a prompt containing markup cannot run in the browser.

## 7. Model output is untrusted

- The sizing reply is parsed by matching whole words against fixed lists (seven
  kinds, three sizes, "vague"). Anything else is discarded.
- The rewrite is shown as text for the person to accept, edit or ignore. It is
  never run or submitted without a button press.
- A prompt that tries to instruct the small model can at worst produce a wrong
  size or an unhelpful rewrite.

## 8. Changing the model or effort

Cost Guard rewrites the model of a request in three cases only: the subagent
cap, "Finish on Sonnet" at a pause, and an accepted Sonnet tip. It rewrites
effort only on an accepted effort tip. Each is either a setting the person can
turn off or a button the person pressed. It never raises a model or an effort
level.

## 9. Fail open

A security control that fails closed would stop work; a cost control that fails
closed would too. Cost Guard fails open: if a hook throws, the request proceeds
unguarded. The consequence is that Cost Guard is not a guarantee. It must not be
the only control where a hard spending cap is required; use the provider's own
spend limits for that.

## 10. Logging

Cost Guard writes no debug log of its own. It logs no keys, tokens or
environment values. The only environment value it reads is the home directory,
to locate its folder.

## 11. Dependencies

None at run time. The repository's only development dependency is Prettier,
pinned to an exact version in `package.json`.

## 12. Sharing the repository

Before the repository was first committed, its files were scanned for known key
and token formats and read for internal hostnames, employer names and other
people's data. Repeat both before any change of visibility.

## 13. Threat scenarios to test

| Scenario                            | Expected behaviour                     | Covered by a test          |
| ----------------------------------- | -------------------------------------- | -------------------------- |
| A prompt contains HTML or script    | Escaped in the dashboard               | No                         |
| The small model returns free text   | Reply discarded; keyword result stands | Partly: valid replies only |
| The small model times out or errors | Estimate proceeds without it           | No                         |
| A store or file write fails         | The hook continues                     | No                         |
| The pause question is dismissed     | The turn stops                         | Yes                        |
| `agent.spawn` hook throws           | The subagent spawns unchanged          | No                         |

The untested rows are gaps, listed in `TEST_STRATEGY.md`.
