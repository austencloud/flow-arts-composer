---
description: Use when checking MVP progress, adding scope, or deciding what to work on next toward launch
argument-hint: "[status|scope|next|add <area> <item>|complete <id>]"
---

# MVP Tracker

**Target:** March 17, 2026 (TKA 4th Birthday)
**One sentence:** Create, record, share, and save your choreography to learn and grow as a flow artist.
**Mantra:** If it's not on this list, it's not MVP.

## Purpose

Keep development focused on shipping. This skill is the single source of truth for what's in scope, what's done, and what's next. When scope creep tempts, this skill says no.

## Commands

| Command | What it does |
|---------|-------------|
| `/mvp` or `/mvp status` | Show current progress across all areas |
| `/mvp scope` | Show full scope definition with acceptance criteria |
| `/mvp next` | Show the single highest-priority unfinished item |
| `/mvp add <area> <item>` | Propose adding something (requires justification) |
| `/mvp complete <id>` | Mark an item done with verification proof |

## How It Works

1. Read the MVP tracker file: `E:/flow-arts-private/plans/mvp-tracker.md`
2. Execute the requested command
3. For `status`: show completion percentage per area + overall
4. For `scope`: display the full scope with acceptance criteria
5. For `next`: find the highest-priority incomplete item and present it
6. For `add`: require the user to justify why this is MVP, not post-MVP. Push back if it's scope creep.
7. For `complete`: require verification evidence before marking done

## Scope Guard

**The default answer to "should we add this?" is NO.**

### The 5-Verb Test

Every item must directly enable one of: **create, record, share, save, learn.**
If it doesn't serve one of these verbs, it's post-MVP.

### Scope Gate Questions (ask all 4)

| Question | If yes... |
|----------|-----------|
| "Can a user complete the core flow without this?" | Cut it |
| "Is a workaround available?" | Cut it |
| "Does nothing else depend on this?" | Cut it |
| "Has nobody been promised this?" | Cut it |

If all 4 answers are "yes," it's out. No debate.

### Emergency Scope Reduction

When time pressure hits (and it will), apply the Value Quotient:

> VQ = (Problem Severity x User Impact) / (Dev Time x Integration Complexity)

Score each remaining item 1-5 on each factor. VQ > 1.0 stays. VQ < 1.0 gets cut or moved to post-MVP.

### Red Flags (stop and reassess)

- More than 2 items in-progress simultaneously
- Can't explain what you're working on in one sentence
- A single item has been in-progress for more than 2 sessions

## Tracker File

Source of truth: `E:/flow-arts-private/plans/mvp-tracker.md`, in the private repo `austencloud/flow-arts-private`. Commit tracker changes there with explicit paths. Items have priority (P0 blocker / P1 must-have / P2 should-have), status (not-started / in-progress / complete), and acceptance criteria.

Show progress as bar chart per area with overall percentage and days remaining.

## Rules

- **WIP limit: 2 items max.** Complete or cut before starting another.
- **P0s first.** Don't touch P1s while P0s remain.
- **Never add without user approval.** Push back on scope creep.
- **Verification required for completion.** Evidence, not claims.
- **`/mvp next` returns ONE item**, not a list.
- **"While I'm in here..."** — scope creep in disguise. File it, move on.
