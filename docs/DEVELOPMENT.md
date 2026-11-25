# Development Guide

How to run Cost Guard from its folder, check a change, and find your way around
the code. `CONTRIBUTING.md` covers the rules; this covers the mechanics.

## Prerequisites

- Claude Code, a current version.
- Node.js 22 and npm.
- Git. On Windows, line endings are handled by `.gitattributes`; no setting is
  needed.

```sh
git clone https://github.com/adommeti/CostGuard.git
cd CostGuard
npm ci
```

## Running locally

Start Claude Code with the folder as a plugin directory:

```sh
claude --plugin-dir .
```

The mod loads from the folder and reloads at the end of any turn in which a file
changed. A reload runs `register` and `session.start` again; session state and
the plugin store are kept, and the module's own variables start over.

If the installed copy of Cost Guard is also enabled, disable it first so the two
do not both run:

```
/plugin disable cost-guard@cost-guard
```

When Claude Code loads the mod it writes the engine's type definitions to
`.claude-plugin/types/`. That folder is ignored by git and regenerated on each
machine. `tsconfig.json` extends the `tsconfig.json` inside it, so an editor
resolves `'claude-code'` imports only after the mod has loaded once.

A failed hook prints one dim line in the transcript naming the plugin, the event
and the reason. `claude --debug` logs every occurrence.

## Checks

```sh
npm run check
```

runs, in order:

| Script         | Command                    | What it proves                                         |
| -------------- | -------------------------- | ------------------------------------------------------ |
| `format:check` | `prettier --check .`       | Formatting                                             |
| `validate`     | `claude plugin validate .` | Manifest, marketplace file, type check, state contract |
| `test`         | `claude plugin test .`     | The hook tests                                         |

`npm run format` rewrites files in place.

`claude plugin test` runs every `*.test.ts` and `*.test.tsx` under the folder
and has no filter option. To run one test while working on it, temporarily
comment out the others; do not commit that.

## Writing a test

Tests live in `hooks/register.test.tsx` and import from `'claude-code/testing'`.
Each test receives `$` (the engine interface) and `on` (to register test hooks
that stand in for the engine).

```tsx
test("a daily budget pauses and asks", async ($, on) => {
  const w = world(on, ["Stop"]); // answers for the question dialog, in order
  w.store.config = { dailyBudget: 2 };
  await $.turn.start({ turnId: "t1", text: "tidy the imports" });
  await step($, 0); // one model request: +$1.20
  // ...
});
```

- `world(on, answers)` mocks the clock, session cost, store, question dialog and
  model requests, and returns what it recorded.
- `step($, index)` drives one model request through the `turn.step` hook and
  collects any text the hook yielded.
- To mock the small model, add `on("model.complete", …)` returning
  `{ value: { isAnswered, text, usage } }`.
- The question dialog is a `tool.call` of `AskUserQuestion` in tests, not a
  `ui.ask` event.

## Tuning knobs

Constants a change is likely to touch, all in `hooks/`:

| Constant                     | File                                                 | Meaning                          |
| ---------------------------- | ---------------------------------------------------- | -------------------------------- |
| `DEFAULTS`                   | `config.ts`                                          | Every setting's default          |
| `STARTER`                    | `history.ts`                                         | Starter estimates by kind        |
| `SIZE_FACTOR`, `TIER_FACTOR` | `history.ts`                                         | Scaling by size and model family |
| `TABLE`                      | `pricing.ts`                                         | Per-model list prices            |
| Sizing and rewrite prompts   | `register.tsx` (`sizeUp`, `rewriteOf`)               | What the small model is asked    |
| Feedback thresholds          | `register.tsx` (`finishTask`)                        | When the question is raised      |
| Tip thresholds               | `register.tsx` (`resize`, `turn.step`, `finishTask`) | When each tip is raised          |

Changing a price in `TABLE` affects only past-transcript pricing and cache
re-read figures. Live cost comes from Claude Code.

## State changes

Session-state values are declared in `types/index.d.ts` and created with
`atom(...)` in `register.tsx`, each with a `shape` string. When you change the
type of a value, bump its shape (`active-4` → `active-5`). Without the bump, a
reload hands new code a value in the old layout.

Values in the plugin store have no shape check. Read them defensively:
`loadConfig` merges stored settings over `DEFAULTS` so a setting added later has
a value.

## Releasing

1. Update the version in `.claude-plugin/plugin.json` and `package.json`.
2. Add the changes to `RELEASE_NOTES.md`; revise the known limitations.
3. Run `npm run check` and the manual checks in `TEST_STRATEGY.md` section 5.
4. Merge to `main`, then tag `v<version>` and push the tag. The release workflow
   re-runs the checks and publishes the GitHub release.

Users pick up the release with `claude plugin marketplace update cost-guard`
then `claude plugin update cost-guard`.

## Repository layout

```
.claude-plugin/     plugin.json, marketplace.json
.github/workflows/  ci.yml
hooks/              the mod: register.tsx and its helpers; the tests
types/              the state contract
docs/               guides
docs/adr/           architecture decision records
*.md                specs: PRD, UX, architecture, security, tests, release notes
package.json        development tooling only
```
