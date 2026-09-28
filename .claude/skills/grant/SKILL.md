---
description: Use when working on grant applications, checking deadlines, or drafting proposal sections
argument-hint: "[status|deadlines|<id>|<id> draft|<id> status <new-status>|add|research <query>]"
---

# Grant Tracker & Drafting Assistant

Manage grant applications from discovery through submission, with section-by-section drafting workshops.

## Data Files

Grant files live in the private repo `austencloud/flow-arts-private`, cloned at
`E:/flow-arts-private`. This public repository must not hold grant material, so
never create grant files here. If the clone is missing, run
`gh repo clone austencloud/flow-arts-private E:/flow-arts-private`. Commit grant
changes in that repo with explicit paths.

- **Tracker:** `E:/flow-arts-private/grants/grant-tracker.md` (source of truth for all grants)
- **Knowledge base:** `E:/flow-arts-private/grants/grant-writing-knowledge.md` (read during drafting)
- **Drafts:** `E:/flow-arts-private/grants/drafts/<id>-<section-slug>.md` (approved draft sections)

## Commands

| Command | What it does |
|---------|-------------|
| `/grant` or `/grant status` | Dashboard with all grants, deadlines, days remaining |
| `/grant deadlines` | Upcoming deadlines sorted by urgency with alerts |
| `/grant <id>` | Full details for a specific grant (e.g., `/grant CC`) |
| `/grant <id> draft` | Start or continue section-by-section drafting workshop |
| `/grant <id> status <status>` | Update status |
| `/grant add` | Add a new grant opportunity interactively |
| `/grant research <query>` | Web search for new opportunities matching Austen's profile |

## Arguments

$ARGUMENTS - Command and optional grant ID or query

## Instructions

### For no arguments or "status":

Read `E:/flow-arts-private/grants/grant-tracker.md`. Display dashboard with ID, Name, Status, Deadline, Days Left, Amount columns. Flag urgency: CRITICAL (under 7 days), URGENT (under 14), APPROACHING (under 30).

### For "deadlines":

Same as status but sorted by deadline, only showing upcoming grants (not waiting/submitted/awarded/rejected). Include action items from the tracker.

### For "<id>":

Read the tracker, find the grant by ID (case-insensitive), display all fields including checked/unchecked sections.

### For "<id> draft":

See `drafting-reference.md` for the full section-by-section workshop workflow.

### For "<id> status <status>":

Valid statuses: `not-started`, `researching`, `drafting`, `submitted`, `awarded`, `rejected`, `waiting`

Update the status in the tracker. If `submitted`, congratulate and note the date. If `rejected`, ask what feedback was given and note it.

### For "add":

Ask for: grant name, deadline, amount, URL, which framing angle fits. Generate a short ID (2-5 uppercase letters), add to tracker with sections TBD, suggest web searching for requirements.

### For "research <query>":

Web search for grants matching the query plus Austen's profile (individual artist, Chicago, technology + art, notation system, video game, flow arts). Present name, amount, deadline, fit assessment.

## Statuses

`not-started` -> `researching` -> `drafting` -> `submitted` -> `awarded` or `rejected`

`waiting` = deadline hasn't opened yet

## Urgency Protocol

When any grant is CRITICAL (under 7 days), display a prominent alert with grant name, days remaining, sections complete, and a pointer to `/grant <id> draft`.
