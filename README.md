# Cost Guard

**Spend control for Claude Code that stays out of the way.**

Cost Guard is a Claude Code mod. It estimates what each task will cost, measures
what it did cost, and pauses to ask before a task, daily, weekly or monthly
budget is passed. It learns from every finished task and suggests cheaper ways
to work. It has no dependencies and keeps everything on your computer.

[![Release](https://img.shields.io/badge/release-0.4.0-blue)](RELEASE_NOTES.md)
[![Platform](https://img.shields.io/badge/platform-Claude%20Code-lightgrey)](docs/INSTALLATION.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

> **This is a pre-1.0 release.** 0.4.0 is feature-complete against its spec and
> passes its test suite, but it has had little use in live sessions. Every
> dollar figure is a client-side estimate; the invoice is the authority. Read
> the [Release Notes](RELEASE_NOTES.md) before relying on it.

---

## Why it exists

Claude Code shows what a session has cost, after the fact. That leaves three
gaps:

- **No warning before an expensive task.** A broad prompt on a large model can
  cost tens of dollars, and nothing says so up front.
- **No stop.** A task that runs away keeps spending until someone notices.
- **No feedback.** Nothing tells you that most of a task's cost was re-reading a
  long chat, or that a routine task ran on the most expensive model.

Cost Guard fills those gaps without adding a step to ordinary work. Small tasks
show nothing at all.

## What it does

### Track every task

Each prompt gets a silent estimate and is measured. A task is one turn of the
main chat, including its subagents. Tasks estimated at $1 or more get a one-line
band above the prompt with spend, limit, estimate and today's total, in your
theme's colours.

### Pause and ask before a limit

Before each model request, Cost Guard checks the task limit, the daily budget
and the weekly or monthly budget. If the request would pass one, the task pauses
and asks: add $1, double the limit, finish on Sonnet, or stop. The task
continues in place.

### Four budgets

- A default limit on every task ($5 unless changed).
- A per-task limit: `/spend $8 <task>`.
- A daily budget.
- A weekly or monthly budget with pace ("at this pace the budget runs out on
  11-21").

### Your cost basis

API list prices by default. `/spend setup` switches to a discount off list or a
subscription plan, where plan-limit use is shown and dollars are marked ≈ as
API-equivalent.

### Estimates that learn

A small model (Haiku) reads each prompt and names its kind, its size, and
whether it is vague. Each finished task corrects future estimates for its kind,
size, model family and effort. When an estimate was far off or a task was
paused, the band asks one question; the answer adjusts what is learned.

### Tips that save money

- **Cheaper model or effort.** A routine task that would run on Opus or Fable
  gets an offer of Sonnet with the likely saving.
- **Context notes.** When most of a task's cost was re-reading a long chat, or
  the prompt cache had lapsed, a note says what it cost.
- **Prompt rewrite.** A vague `/spend` request gets a tighter version to use,
  edit or ignore.
- **Weekly digest.** The week's spend by kind, the costliest tasks, and the
  habits that would save the most.

A kind of tip turned down three times and never taken stops appearing.

### Keep subagents off the largest models

A subagent that would run on Opus, Fable or Mythos runs on Sonnet instead. This
can be turned off in the plugin's settings.

### Dashboard and scorecard

`/spend` opens today, budgets and a 7-day sparkline. `/spend report` adds 14
days, recent tasks, the weekly digest and an accuracy scorecard. `/spend export`
saves the same as a self-contained HTML page.

## Installation

This repository is private. You need read access to it on GitHub and a git
credential for github.com already set up on your computer.

```
/plugin install cost-guard --marketplace adommeti/cost-guard
```

Answer `y` to add the marketplace, then press Enter. Cost Guard needs no setup:
it starts tracking with your next prompt. See
[docs/INSTALLATION.md](docs/INSTALLATION.md) for credentials, updating and
uninstalling.

## Documentation

| Document                                        | What it covers                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| [User Guide](docs/USER_GUIDE.md)                | Every command and setting, and how to read the band and the reports |
| [Installation](docs/INSTALLATION.md)            | Installing, updating, uninstalling, running beside other mods       |
| [Troubleshooting](docs/TROUBLESHOOTING.md)      | Symptoms, causes and fixes                                          |
| [Development Guide](docs/DEVELOPMENT.md)        | Running the mod from its folder, checks, repository layout          |
| [PRD](PRD.md)                                   | What the product is for and what it must do                         |
| [UX Spec](UX_SPEC.md)                           | Every surface, its wording and its rules                            |
| [Architecture](ARCHITECTURE.md)                 | Hooks, state, cost sources, the estimator                           |
| [Security and Privacy](SECURITY_AND_PRIVACY.md) | What is read, stored and sent                                       |
| [Test Strategy](TEST_STRATEGY.md)               | What is tested, and what is not                                     |
| [Release Notes](RELEASE_NOTES.md)               | Known limitations and what changed                                  |
| [Contributing](CONTRIBUTING.md)                 | Checks, CI, commits and pull requests                               |
| [ADRs](docs/adr/)                               | Architecture decisions and their reasons                            |

## What this release does not do

- **It does not bill.** Figures are estimates from Claude Code's client-side
  cost figure and can differ from the invoice.
- **It does not guarantee a hard cap.** The check runs before each model
  request, so the last request can take a task slightly over, and parallel
  subagents can overshoot together.
- **It does not share data with a team.** Totals are personal and per machine.
  There is no roll-up.
- **It does not run outside Claude Code.** It is a Claude Code mod and does not
  work in GitHub Copilot or other tools.
- **It does not rewrite ordinary prompts.** Rewrites appear only for
  `/spend <task>`; an ordinary prompt has already started when it is judged
  vague.

## License

[MIT](LICENSE).
