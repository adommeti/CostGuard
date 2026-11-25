# Installation

Cost Guard installs into Claude Code as a plugin from this repository. It needs
no configuration.

## Requirements

- Claude Code, a current version, in a terminal session.
- Read access to this repository on GitHub. It is private: the owner must invite
  you.
- A git credential for github.com already set up on your computer. The install
  never prompts for one.

To set up a credential, either add an SSH key to your GitHub account, or install
the GitHub CLI and run:

```sh
gh auth login
gh auth setup-git
```

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install cost-guard --marketplace adommeti/CostGuard
```

1. `Add marketplace?` names the source. Answer `y`.
2. The plugin's details appear with the user scope selected. Press Enter.
3. A settings screen offers "Keep subagents on Sonnet or Haiku". Leave it on
   unless you have a reason not to.
4. `Installed cost-guard. Plugin is now active.`

From a shell, the same install is:

```sh
claude plugin install cost-guard --marketplace adommeti/CostGuard
```

In the desktop app, where `/plugin` does not run: click + next to the prompt
box, then Plugins, Add marketplace with `adommeti/CostGuard`, then Add plugin.

## First run

A one-time note says Cost Guard is watching. From then on:

- every prompt is tracked with a $5 limit;
- nothing shows unless a task is estimated at $1 or more;
- `/spend` opens the pane.

The first time Cost Guard counts a session that was already running, it adds
that session's whole cost so far to today.

Optional next steps:

- `/spend setup` to say how you pay and set budgets.
- `/spend learn` to seed estimates from your last 30 days of chats.

## Running beside other budget mods

Disable any other mod that tracks or limits spend. Two such mods would both
watch the same tasks and both interrupt them.

```
/plugin disable <other-mod>@<its-marketplace>
```

## Updating

```sh
claude plugin marketplace update cost-guard
claude plugin update cost-guard
```

Settings, totals and history carry over. See "Upgrade notes" in the
[Release Notes](../RELEASE_NOTES.md).

## Uninstalling

```sh
claude plugin uninstall cost-guard
```

Uninstalling removes the mod. It does not remove the ledger and dashboard in
`~/.claude/cost-guard`; delete that folder to remove them. Run `/spend forget`
before uninstalling if you want what was learned from past chats deleted.

## If the install fails

| Message                                        | Cause                                             | Fix                                                                           |
| ---------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `Marketplace file not found at …`              | No access to the repository, or no git credential | Check you can open the repository on github.com; set up a credential as above |
| `Plugin "cost-guard" not found in marketplace` | An old copy of the marketplace                    | `/plugin marketplace update cost-guard`                                       |
| The command is "not available"                 | You are in the desktop app's Code tab             | Use a terminal session, or the desktop steps above                            |
