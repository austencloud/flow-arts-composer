---
description: Use when managing museum project items, running department briefings, or tracking creative decisions
argument-hint: "[session|capture|create|link|search|<id>|list]"
---

# Museum Development Tracking System

Track creative worldbuilding decisions, brainstorming sessions, and design evolution with full traceability.

## Departments

All items are tagged by department. These are the 7 departments:

| Department | Tag | Covers |
|---|---|---|
| Lore & Narrative | `lore` | The Order, Scribes, K's arc, timeline, world bible |
| Exhibit Design | `exhibit-design` | Room concepts, floor plan, spatial flow, naming, what's in the museum |
| Experience Design | `experience-design` | Interaction, pacing, emotional arc, tone, level system, performer count |
| Art Direction | `art-direction` | Visual philosophy, era aesthetics, lighting, costume design |
| Audio | `audio` | Sound design, ambient transitions, music, voice acting |
| Engineering | `engineering` | UE5, animation pipeline, hand IK, MetaHuman, Scribe integration |
| Production | `production` | MVP scope, milestones, phasing, pre-production |

Cross-cutting: `audit` tag marks items from concept audits (weak threads, concerns, risks).
System: `meta` tag marks decisions about the tracking system itself.

## Usage

- `/museum` - **Department briefing** (dispatches 7 agents, synthesizes status)
- `/museum list` - Raw item list
- `/museum list --tag <tag>` - Filter by tag
- `/museum <dept>` - Focus on a specific department (e.g., `/museum lore`)
- `/museum session "Title"` - Start a new brainstorming session
- `/museum capture <sessionId> decision "Content"` - Capture a decision during session
- `/museum <id>` - View item details
- `/museum <id> verdict accepted "Rationale"` - Set verdict on a decision
- `/museum link <from> <to> spawned "Note"` - Link two items
- `/museum search "query"` - Search items

## Arguments

$ARGUMENTS - Command and arguments (see help for full list)

## Before Anything Else: Load Current State

**Museum work is primarily creative, not technical.** The primary inputs are the tracker and the docs, not the codebase.

**Step 0 (mandatory before any assessment, brainstorming, or opinion):**

1. Run `node scripts/museum-dev.js list` to see all items
2. Read the 10 most recent decisions (sort by date, newest first)
3. Read `E:/flow-arts-private/museum/story-bible.md` (canonical source of truth, kept in the private repo), then other docs in `docs/museum/` as needed
4. Check for supersession chains — recent decisions often replace older ones

**Why this order matters:** The docs in `docs/museum/` are original designs. The tracker is where those designs get revised. A concept praised in `vtg-wing.md` may have been scrapped three sessions ago. Read the tracker first.

## Detailed Instructions

See `commands-reference.md` for per-command workflows, the proposal system, evaluation integrity rules, and workflow examples.

Claude-generated ideas are always captured as `proposal`, not `decision`. Casual approval ("sure", "cool") does not promote a proposal. Only explicit user direction or `/museum promote <id>` does. Full rules in `commands-reference.md`.
