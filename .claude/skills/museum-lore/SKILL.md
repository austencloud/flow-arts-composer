---
name: museum-lore
description: Use when discussing, analyzing, or brainstorming museum lore and narrative elements for The Kinetic Archive, or when conversation focuses on worldbuilding, story consistency, or narrative design
---

# Museum Lore Deep Dive

## Overview

Lore-focused discussion mode for The Kinetic Archive. Writers' room energy. This skill is an overlay on the `/museum` tracker system — use `/museum help` for the full command reference.

**When to use this vs `/museum`:**
- `/museum` = project management, department briefings, all 7 departments, all tracker commands
- `/museum-lore` = narrative discussion, story bible sync, lore sessions with strict close protocol

## The Two-Layer Rule

**Layer 1: Story Bible** (`E:/flow-arts-private/museum/story-bible.md`) is the canonical source of truth.
**Layer 2: Tracker** (`node scripts/museum-dev.js`) is the audit trail.

If there's a conflict, the story bible wins. The tracker records how you got there, not where you are.

The story bible is private. It lives in the private repo
`austencloud/flow-arts-private`, cloned at `E:/flow-arts-private`, so never
recreate it in this public repository. If the clone is missing, run
`gh repo clone austencloud/flow-arts-private E:/flow-arts-private`. Commit story
bible changes in that repo with explicit paths.

## Before Any Lore Discussion

**Read the story bible first.** Always. Before brainstorming, discussing, or proposing changes. Use the Read tool on `E:/flow-arts-private/museum/story-bible.md`. This prevents proposing ideas that contradict resolved decisions.

## Instructions

### For no arguments or "strengths" or "weaknesses":

**Step 1: Read the story bible** (always first — use the Read tool)

**Step 2: Load lore items from tracker**
```bash
node scripts/museum-dev.js list --tag lore
```

**Step 3: Analyze and discuss**

For **strengths**: Identify lore elements that are internally consistent, narratively compelling, comedically effective, and structurally sound. Explain WHY each works.

For **weaknesses**: Identify unresolved questions, contradictions, thin areas. Be specific about what breaks and why.

For **no arguments**: Brief status overview, then ask the user what angle to explore.

**Step 4: Conversational mode** — this is a DISCUSSION skill, not dispatch-and-report.

### For "<id>":

Read the item in detail, all linked items, and run cascade check:
```bash
node scripts/museum-dev.js <id>
node scripts/museum-dev.js links <id>
node scripts/museum-dev.js cascade <id>
node scripts/museum-dev.js trace <id>
```

Present the full context, then discuss whether it's holding up.

### For "session <title>":

Start a lore brainstorming session:
```bash
node scripts/museum-dev.js session "Title"
```

During the session, use standard tracker capture commands (see `/museum` skill for full reference). Tag all captures with `lore`:
```bash
node scripts/museum-dev.js <capturedId> tag add lore
```

### For "close" (SESSION CLOSING — MANDATORY):

This step is **required** before ending any lore session. It prevents orphaned proposals, floating questions, and story bible drift.

**Step 1:** List all captures: `node scripts/museum-dev.js tree <sessionId>`

**Step 2:** Review each capture with the user:

| Item Type | Possible Verdicts |
|-----------|-------------------|
| Decision | Already approved. Write into story bible if significant. Mark `completed`. |
| Proposal | **Promote** (user says yes -> `museum promote <id>`) or **Reject** (`museum <id> verdict rejected "reason"`) |
| Question | **Answer** (`museum <id> answer "..."`) or **Carry** (tag with `carries-to-next-session`) |

**Step 3:** Update `E:/flow-arts-private/museum/story-bible.md` with any promoted proposals or significant decisions. Add tracker IDs to the Canonical Decisions table, then commit the change in the private repo.

**Step 4:** Run cascade check on major changes: `node scripts/museum-dev.js cascade <decisionId>`

**Step 5:** Confirm: "Session closed. [N] items resolved, [M] carried to next session. Story bible updated."

## Key Rules

- Writers' room energy, not project management
- Claude's ideas are `proposal` type — only the user promotes to `decision`
- One honest pushback before capturing any Claude-generated idea
- NEVER capture without explicit user approval. Present -> ask -> yes -> THEN capture
- Proposals expire at session close. No zombies.
- Tag every capture with `lore`
- Always close sessions via `/museum-lore close`
- Read the story bible FIRST to avoid contradicting resolved decisions
- Run `museum cascade <id>` on major changes
- Be specific about weaknesses — what breaks, what contradicts, what's untested
