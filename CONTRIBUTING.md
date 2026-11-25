# Contributing to Cost Guard

Cost Guard is a Claude Code mod that tracks, limits and reduces what tasks cost.
Product and engineering specs live in `PRD.md`, `ARCHITECTURE.md`, `UX_SPEC.md`,
`SECURITY_AND_PRIVACY.md` and `TEST_STRATEGY.md`; architecture decisions are
recorded in `docs/adr/`. Read the relevant spec and ADRs before changing
behaviour they cover.

## Toolchain

- **Claude Code**, a current version. It provides `claude plugin validate` and
  `claude plugin test`, which are the type check and the test runner. There is
  no separate TypeScript or test dependency.
- **Node.js 22** and npm, for Prettier only.

The mod itself has no dependencies. `package.json` exists for development
tooling and is not read by Claude Code. Prettier is pinned to an exact version:
a formatter that drifts between machines turns every pull request into a
formatting diff.

Run `npm ci` once after cloning. `docs/DEVELOPMENT.md` covers running the mod
from its folder.

## Running checks

```sh
npm run format:check    # prettier --check .
npm run validate        # claude plugin validate .
npm run test            # claude plugin test .

npm run check           # all of the above
npm run format          # prettier --write .
```

`npm run validate` reports two "plugin directory" notes that are expected and
not failures: there is no icon, and a hooks module is subject to the directory's
own review. It must end with `Validation passed`.

A passing `npm run check` is meaningful for what the hooks do against a mocked
engine. It says nothing about a real session, a real model reply, or how the
band looks in a terminal. See "Live-session behaviour" below.

## What CI verifies

CI runs one job, defined in `.github/workflows/ci.yml`, on every pull request
and every push to `main`:

- **Check** — `npm ci`, the format check, then validation and the hook tests
  with a freshly installed Claude Code CLI.

**This workflow has not yet run.** Two things are unverified until it has:

- whether `claude plugin validate` and `claude plugin test` run on a hosted
  runner with no signed-in account (neither calls a model, but that is
  reasoning, not evidence);
- whether the globally installed CLI version produces the same type-check result
  as the version the mod was developed against.

If either step fails for those reasons, fix the workflow, not the mod, and
record what was learned here. Do not describe a change as CI-verified until this
section no longer carries this notice.

## Live-session behaviour

Nothing automated exercises the real engine. Before describing behaviour as
working, run the relevant manual checks in `TEST_STRATEGY.md` section 5, and say
in the pull request which you ran. Label anything verified only by tests.

Changes most likely to pass tests and fail live:

- anything drawn in the band or pane (layout, wrapping, hotkeys);
- anything that awaits the question dialog inside `turn.step`;
- anything that parses a small-model reply;
- anything that rewrites `model` or `effort` on a request.

## Tests

Every meaningful change includes tests. Do not delete tests to make a build
pass, and do not cast away a type error in the hooks module to get past
validation — fix the underlying issue. Casts in the test file are acceptable
where a test supplies only the fields a hook reads.

Costs in tests are chosen so the expected figure can be worked out by hand; put
the working in a comment beside the assertion.

## Documentation

Documents are part of the change, not a follow-up:

- behaviour a user sees → `UX_SPEC.md` and `docs/USER_GUIDE.md`;
- structure, events, state or cost sources → `ARCHITECTURE.md`;
- anything read, stored or sent → `SECURITY_AND_PRIVACY.md`;
- a decision later changes must respect → a new ADR in `docs/adr/`, numbered in
  sequence, with Status, Date, Context, Decisions and Consequences. An accepted
  ADR is not edited to change its decision; a new ADR supersedes it.
- user-visible changes → `RELEASE_NOTES.md`.

State limits and unverified claims plainly. A document that overstates what was
checked is a defect.

## Versioning

The version lives in `.claude-plugin/plugin.json` and `package.json`; keep them
equal. Before 1.0, a minor version marks a set of new behaviour and a patch
version a fix. A change to the shape of a session-state value bumps that atom's
`shape` in `hooks/register.tsx`.

## Branches, commits and PRs

`main` is always releasable. Work happens on a branch named for its type and
subject (`feat/weekly-budget-tests`, `fix/pause-question-timeout`,
`docs/user-guide`) and lands through a pull request once CI is green.

Commit subjects follow conventional-commit style (`feat:`, `fix:`, `refactor:`,
`perf:`, `test:`, `docs:`, `chore:`, `style:`), under 72 characters, describing
why the change was made rather than restating what changed. An optional scope
names the area: `fix(gate):`, `feat(tips):`.

The repository owner is the sole author of every commit. Do not add a co-author,
`Generated-by`, or any other AI or assistant attribution trailer or tag to a
commit message, PR body, tag, or release note.
