# Plan: Profiles, Pairing Suggestions and Sharper Tips

- Status: Agreed, not started
- Date: 2026-11-25
- Covers: releases 0.5.0, 0.6.0 and 0.7.0

## Goal

Make Cost Guard's advice fit the kind of work its user does, and let it
recommend the model and effort that cost least for each kind of task, based on
that person's own results.

## Context

The plan is for the primary user in `PRD.md`: one engineer who uses Claude Code
daily. Release 0.4.0 applies one rule to everyone: the same $5 task limit, the
same definition of a routine task, the same tips in the same order. This plan
replaces those single rules with four profiles, adds suggestions backed by the
person's own history, and tightens four existing tips.

Constraints that hold throughout:

- **Quiet by default and no setup** (`PRD.md` section 3). A person who never
  picks a profile sees exactly what 0.4.0 shows.
- **Nothing added to the chat.** No feature here puts text into the main
  conversation. The only new model call is one small-model call at setup.
- **No new recipient for data.** The setup call goes to the provider the session
  already uses.
- **Wording.** Guidance is written as Cost Guard's own rules. The code base
  names no company and no outside source for that guidance.

## Process Overview

1. Check the existing interactive surfaces in a live session.
2. Move built-in guidance into one data file.
3. Add four profiles and the order in which settings win.
4. Add profile setup: proposed by the small model, or picked by hand.
5. Add the `/spend profile` commands and the per-folder override.
6. Release 0.5.0.
7. Add the "Did this do the job?" question and the record of its answers.
8. Suggest cheaper pairings of model and effort that have proved themselves.
9. Suggest moving up one model when a pairing keeps failing.
10. Restart pass and fail evidence when a new model version appears.
11. Release 0.6.0.
12. Sharpen four tips.
13. Release 0.7.0.

## Detailed Steps

### Step 1: Check the existing surfaces live

**What happens:** Run the manual checks in `TEST_STRATEGY.md` section 5 in an
interactive session: the band and its layout, the pane and its buttons, the
pause question's four answers, the feedback question, the Sonnet and effort
tips, and "Edit it" on a rewrite.

**Input:** Cost Guard 0.4.0 installed from this repository.

**Output:** Each check marked passed or failed in `TEST_STRATEGY.md`; defects
fixed or listed in `RELEASE_NOTES.md`.

**Decisions:** None.

**Notes:** This is the 1.0 release blocker. Every later step adds interactive
surfaces, so it comes first: new work should not sit on parts nobody has seen
working.

### Step 2: Guidance data file

**What happens:** Add `hooks/guidance.ts`, a data-only file in the manner of
`hooks/pricing.ts`. Logic reads from it; no rule below is written into logic.

**Input:** The rules agreed in this plan.

**Output:** A file holding:

- The order of model families, cheapest first: Haiku, Sonnet, Opus, Fable.
- The order of effort levels: low, medium, high, xhigh, max.
- The default effort: medium. High suits plans, new architecture, edge cases and
  tests.
- The highest effort a suggestion may propose: high.
- The step up from a failing pairing: the next model family at medium effort,
  not a higher effort on the same model.
- Each profile's values (step 3).
- Tip thresholds, moved from where they sit in `hooks/register.tsx` and
  `hooks/history.ts`.
- The model versions the file was last reviewed against.

**Decisions:** Guidance changes as models change. It reaches the person only
through a plugin update, because Cost Guard makes no network requests. Release
notes for each version say which model versions the guidance covers.

**Notes:** Reword the comment at `hooks/pricing.ts:1` in this step so that it
names no company.

### Step 3: Four profiles

**What happens:** A profile supplies starting points. There are four, fixed.
Custom profiles are not part of this plan.

| Profile      | Typical work                                  | Sonnet offer applies to                           | Task limit | Tips shown first                        |
| ------------ | --------------------------------------------- | ------------------------------------------------- | ---------- | --------------------------------------- |
| Daily driver | Mixed                                         | Small tasks; medium tasks that are not code/debug | $5         | All, as in 0.4.0                        |
| Developer    | Code, debug, review                           | Small tasks; medium docs and review               | $5         | Effort offers; vague-prompt counts      |
| Operations   | Scripts, logs, configuration, many short jobs | Small and medium tasks of every kind              | $3         | Sonnet offers; effort offers            |
| Research     | Research, review, investigation, docs, data   | Small tasks only                                  | $8         | Long-chat re-read and cache-lapse notes |

A profile changes five things:

1. The default task limit.
2. Which tasks count as routine, and so get a Sonnet offer. This replaces the
   single rule in `isRoutine` (`hooks/history.ts`).
3. The starter estimates per kind (`STARTER` in `hooks/history.ts`), used only
   until the person's own history takes over.
4. The starting pairings offered before the person has evidence of their own
   (step 8).
5. The order in which tips and digest habits are shown.

A profile never touches spend totals, budgets, history or learned estimates.

**Input:** The guidance file.

**Output:** A `Profile` type; profile values in `hooks/guidance.ts`; `isRoutine`
and the starter estimates read from the active profile.

**Decisions:** Settings win in this order, highest first:

1. A setting the person set by hand, for example `/spend set task 12`.
2. The profile set for the current project folder.
3. The person's default profile.
4. Daily driver.

**Notes:**

- Daily driver must reproduce 0.4.0 exactly. A test asserts it.
- Today `saveConfig` stores every setting, so a stored $5 limit cannot be told
  from the default. Settings set by hand must be recorded as such from 0.5.0. On
  upgrade, a stored value equal to the 0.4.0 default counts as not set by hand.
- A change of profile takes effect on the next task, never partway through one.
- The figures in the table are drafts. See Open Questions.

### Step 4: Profile setup

**What happens:** `/spend learn` and `/spend setup` offer two ways to choose a
profile. The person picks one.

- **Let the small model propose.** One call reads a sample of past prompts and
  names a profile.
- **Pick by hand.** The person chooses from the list, or skips and stays on
  Daily driver.

**Input:** For the proposal: consent given through `/spend learn`, and the past
chats that command already reads (last 30 days).

**Output:** A stored profile name and how it was chosen: proposed, calculated,
or by hand.

**Decisions:**

- **What is sent.** One call holding the first 400 characters of up to 200 of
  the most recent past prompts.
- **Cost ceiling.** 3 cents. The sample is trimmed before sending if its
  estimated cost, from `hooks/pricing.ts`, would pass that.
- **What is accepted back.** One word, matched against the four profile names.
  Anything else is discarded.
- **The reason shown.** Calculated locally from the mix of task kinds, for
  example "58% research and review". No free text from the model reaches the
  screen.
- **Confirmation.** The proposal is shown with its reason and the person keeps
  it or picks another.
- **What is stored.** The profile name and how it was chosen. No prompt text.
- **Undo.** `/spend forget` also resets the profile to Daily driver.
- **Existing users.** On upgrade they stay on Daily driver and see one notice
  that profiles exist. No profile is proposed unasked, because proposing means
  reading past chats.

**Notes:** This sends old prompts to the provider a second time. It is the same
provider that received them first. `SECURITY_AND_PRIVACY.md` gains a line saying
so.

### Step 5: Commands and the per-folder override

**What happens:** Add the profile commands to `/spend`.

| Command                        | What it does                                                |
| ------------------------------ | ----------------------------------------------------------- |
| `/spend profile`               | Shows the profile, how it was chosen, and what it sets      |
| `/spend profile research`      | Switches the default profile                                |
| `/spend profile research here` | Sets the profile for the current project folder only        |
| `/spend profile clear here`    | Removes this folder's override                              |
| `/spend learn`                 | As today, plus the offer to let the small model propose one |

**Input:** The session's working folder, from the engine.

**Output:** A plugin store entry `profile` holding the default profile, how it
was chosen, and a map of folder to profile.

**Decisions:**

- A project folder is the folder the session was started in. A session started
  in a subfolder uses the nearest parent that has an override.
- When a folder's profile differs from the default, the band shows the profile
  name on tasks that display the band.
- At most 50 folder overrides are kept; the oldest is dropped. An override for a
  folder that no longer exists is ignored.
- The profile is never switched silently within a session.

### Step 6: Release 0.5.0

**What happens:** Update the documents and ship.

**Output:**

- `PRD.md`: new requirements for profiles and their setup.
- `UX_SPEC.md`: the profile view, the setup choice, the band's profile name.
- `ARCHITECTURE.md`: the guidance file, the `profile` store, the order in which
  settings win.
- `SECURITY_AND_PRIVACY.md`: the setup call and what it sends.
- `docs/USER_GUIDE.md`: profiles and commands.
- `docs/adr/ADR-005`: profiles are fixed starting points, held per person with
  an override per folder.
- `RELEASE_NOTES.md`: what changed and which model versions the guidance covers.
- Tests: Daily driver equals 0.4.0; the order in which settings win; a setup
  reply that is not a profile name; a failed setup call; the nearest-parent
  rule.

### Step 7: The "Did this do the job?" question

**What happens:** Record whether a task's result was good enough. Without this,
suggestions would always favour the cheapest pairing.

**Input:** A finished task, its pairing (model family and effort), and the
person's usual pairing for that kind and size.

**Output:** A plugin store entry of evidence per kind, size, model family and
effort: tasks run, marked done, marked failed.

**Decisions:**

- **When it is asked.** Only after a task that ran on a cheaper pairing than the
  person's usual for that kind and size. Answers: "Yes" and "Had to redo".
- **A second source.** The existing feedback question (asked when an estimate
  was far off or a task was paused) gains the answer "Had to redo". This is how
  failures on the person's usual pairing are recorded.
- **A failure** is "Had to redo", or a switch to a larger model by hand partway
  through a task.
- **One question per task at most.** If a task qualifies for both questions,
  "Did this do the job?" is asked and the estimate feedback is skipped.
- **Follow-up prompts are not read as redos.** A follow-up is usually the next
  step, and guessing would spoil the evidence.
- **Muting.** If the feedback question has muted itself, suggestions already
  proven continue, nothing new is added, and `/spend profile` says that
  suggestions are paused and how to turn the question back on.

**Notes:** A task that failed quietly, without running over its estimate, is not
counted on the usual pairing. This was accepted: suggestions to move up will be
slow to appear and will sometimes be missed.

### Step 8: Cheaper pairing suggestions

**What happens:** Offer a cheaper pairing of model and effort for a kind and
size of task once it has proved itself.

**Input:** The evidence from step 7; cost history; the profile's starting
pairings.

**Output:** An offer before the next task of that kind and size, and a line in
the weekly digest. Example: "Your medium review tasks cost about $1.40 on Opus
at medium and about $0.60 on Sonnet at high."

**Decisions:**

- **Proof.** A pairing is suggested after at least five tasks of that kind and
  size on it, with at least four marked as done.
- **Effort may rise** only inside a pairing that costs less overall, and never
  above high.
- **Never xhigh or max.**
- **When it applies.** Only at the start of a task, because a change of model
  loses the prompt cache. A change of effort alone keeps the cache and may be
  offered at any point.
- **The saving shown** subtracts the one-time cost of re-reading the chat on the
  new model. This closes a limitation listed in `RELEASE_NOTES.md`.
- **A button press** is always required, and the change lasts for that task.
- **Muting.** A kind of suggestion declined three times and never accepted stops
  appearing, as other tips do.
- **A failed pairing** stops being offered for that kind and size.

**Notes:** Before the person has five tasks on a pairing, only the profile's
starting pairings are offered. For Daily driver that is the 0.4.0 Sonnet offer,
unchanged.

### Step 9: Move-up suggestions

**What happens:** Suggest a larger model when a pairing keeps failing for a kind
and size of task.

**Input:** Failures recorded in step 7.

**Output:** A suggestion shown with the person's own figures. Example: "3 of
your last 5 large debug tasks on Sonnet were redone, costing about $X in all.
Opus at medium would likely have cost $Y."

**Decisions:**

- **Trigger.** Three failures in the last five tasks of the same kind and size
  on the same pairing.
- **One step.** The next model family at medium effort.
- **Main chat only.** The cap that keeps subagents on Sonnet is unchanged.
- The rules in step 8 on timing, the button press and muting apply.

**Notes:** This changes a rule. `SECURITY_AND_PRIVACY.md` section 8 and ADR-004
say Cost Guard never raises a model or an effort level. The rule becomes: never
without a suggestion the person accepted. `docs/adr/ADR-006` records the change
and supersedes that line of ADR-004.

### Step 10: New model versions

**What happens:** Evidence is stored by model family, so a new version would
inherit what the old one proved or failed. When a new version of a family is
first seen:

- Pass and fail evidence for that family restarts. Pairings that were ruled out
  are offered again; proven ones earn their five tasks again.
- Cost history is kept. Estimates correct themselves from recent tasks.
- Built-in pairings are skipped for a version the guidance file does not list.
  Suggestions for it come only from the person's own history until a plugin
  update covers it.
- One notice is shown, once: "New Sonnet version seen. Cheaper pairings will be
  tried again."

**Input:** The model id on each request.

**Output:** A stored list of model versions seen per family.

**Decisions:** None beyond the above.

**Notes:** For a short time after each model release there are fewer suggestions
and a few more questions. This was accepted.

### Step 11: Release 0.6.0

**Output:** `PRD.md`, `UX_SPEC.md`, `ARCHITECTURE.md`, `SECURITY_AND_PRIVACY.md`
and `docs/USER_GUIDE.md` updated; `docs/adr/ADR-006`; `RELEASE_NOTES.md`. Tests:
the proof threshold; the failure trigger; one question per task; the effort
ceiling; the net saving; the restart on a new version; an unanswerable session.

### Step 12: Sharper tips

**What happens:** Four changes, each independent of the others.

1. **Four-part prompt check.** The small model judges a request against four
   parts: outcome (what done looks like), check (how it is proved), guard (what
   must not change), limit (when to stop). A rewrite fills the missing parts,
   with bracketed placeholders where a fact is missing. "Limit" may point to the
   task limit.
2. **Long-chat note.** As well as the cost, the note says what to do: `/clear`
   if the next task is unrelated, or `/compact` with a line on what to keep if
   it needs some of the history.
3. **Heavy starting context.** A tip when a new session already holds 80,000
   tokens or more before the first prompt, pointing to `/context` and to the
   number of skills and connectors loaded.
4. **Tool output.** A tip when most of a task's cost was tool output, such as
   logs or long test runs, suggesting a subagent that returns a short report.

**Input:** Figures the ledger already records, plus the starting context size
and the share of cost from tool output, which are new.

**Output:** Changed sizing and rewrite prompts; two new tip kinds; one reworded
note.

**Decisions:**

- Each tip follows the existing rules: at most once a day for notes, and muted
  after three declines.
- A tip that names a command is checked against the current engine first.
- The 80,000 token threshold lives in the guidance file.

**Notes:** Sizing replies are still matched against fixed word lists. The
four-part check adds words to that list; it does not let free text through.

### Step 13: Release 0.7.0

**Output:** Documents updated as in step 11; `docs/adr/ADR-007` for the
four-part check; tests for each tip's trigger and its muting.

## Delivery Process

Nothing in this plan is written directly to `main`. Every step follows the
process in `CONTRIBUTING.md`, which branch protection enforces.

For each step:

1. **Requirements.** Update `PRD.md` and `UX_SPEC.md` for the step's behaviour
   before or with the code.
2. **Design.** Update `ARCHITECTURE.md` and `SECURITY_AND_PRIVACY.md`; write the
   ADR where the step names one.
3. **Build.** Work on a branch named for its type and subject, for example
   `feat/guidance-file`, `feat/profiles`, `feat/profile-setup`,
   `feat/job-question`, `feat/pairing-suggestions`, `feat/sharper-tips`. One
   step, one branch, one pull request.
4. **Test.** Add tests with the change. `npm run check` passes locally.
5. **Review.** Open a pull request. The **Check** job passes on a branch that is
   up to date with `main`. The pull request says which manual checks in
   `TEST_STRATEGY.md` section 5 were run and labels anything verified only by
   tests.
6. **Merge.** With a merge commit, once CI is green.

For each release (steps 6, 11 and 13):

1. A `chore/release-0.x.0` branch sets the version in
   `.claude-plugin/plugin.json` and `package.json` and completes
   `RELEASE_NOTES.md`, and lands through a pull request.
2. The manual checks for every surface the release adds are run in a live
   session and recorded.
3. A `v0.x.0` tag on `main` triggers the release workflow, which re-runs the
   whole gate and publishes the release.
4. The release is used for at least two weeks before work on the next one
   starts, so that step 8 has real tasks to learn from and the draft figures in
   step 3 can be reviewed.

## Edge Cases and Failure Modes

- **The setup reply is not a profile name, or the call fails.** Use the profile
  calculated from the mix of task kinds. With fewer than 20 past tasks, stay on
  Daily driver.
- **Sizing is turned off.** Profiles still apply. Pairing suggestions stop,
  because they need a task's size.
- **Tips are turned off.** No offers or suggestions. Evidence is still recorded.
- **A session nobody can answer.** Profile limits apply. No question is asked
  and no suggestion is applied.
- **A subagent.** The Sonnet cap is unchanged. Move-up suggestions apply to the
  main chat only.
- **A model the guidance file does not know.** Suggestions come only from the
  person's own history.
- **A project folder moved or deleted.** Its override is ignored.
- **Subscription cost basis.** Savings are marked ≈, as every other dollar
  figure is.
- **The feedback question has muted itself.** See step 7.
- **A cheaper pairing fails.** It stops being offered for that kind and size. A
  failed run and its redo cost more than the saving, which is why the proof rule
  in step 8 is strict.
- **Anything in the new code throws.** The request goes ahead unguarded, as in
  the rest of Cost Guard.

## Dependencies and Requirements

- Step 1 is done before step 2 starts.
- Steps 7 to 10 need steps 2 to 5: suggestions read the guidance file and the
  active profile.
- Step 8 needs several weeks of tracked tasks before it has anything to say.
- Step 12 depends on nothing in steps 7 to 10.
- History samples and ledger rows need the model version, the profile in force,
  and the answer to the job question. These are new fields.
- The engine must report the session's working folder and the model id of each
  request. Both are available in the current engine types.
- Every release passes the checks in `CONTRIBUTING.md`.

## Open Questions

None blocks the work. Three assumptions were made and should be checked against
real use:

1. **Profile figures are drafts.** The task limits and Sonnet-offer rules in
   step 3 have not been tested against real spending. Review them after two
   weeks on 0.5.0.
2. **Operations was discussed least.** It is taken to mean many short tasks on
   scripts, logs and configuration.
3. **Starting pairings per profile** beyond the Sonnet offer are not yet set
   out. They are to be drafted in step 2 from the rules there: medium effort by
   default, high for plans and architecture, nothing above high.

## Success Criteria

- A person on Daily driver sees no change from 0.4.0.
- About 80% of finished tasks cost no more than their 80% figure, on every
  profile (`PRD.md` section 7).
- Fewer than one question per ten tasks, counting both questions.
- At least one cheaper pairing is suggested, accepted and still in use a month
  later.
- No suggested pairing is marked "Had to redo" on more than one task in five
  after it has been proven.
- The setup call costs no more than 3 cents.
- No company or outside source of guidance is named anywhere in the code base.
