# Feedback & Release Workflow

**Repository status (2026-10-14):** The five-status explanation below records the earlier workflow. Current command behavior is owned by `scripts/fetch-feedback.js`, `scripts/release.js` and the linked skills; the old batch description does not establish every release's process.

Complete guide to the feedback-to-release pipeline in Flow Arts Composer.

---

## Overview

The feedback system uses a **5-status workflow** with two distinct phases:

1. **Kanban Phase** (4 columns): Active development tracking
2. **Release Phase**: Batch items into versioned releases

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         KANBAN PHASE                                    │
│                                                                         │
│  ┌─────┐    ┌─────────────┐    ┌───────────┐    ┌───────────┐        │
│  │ NEW │───▶│ IN-PROGRESS │───▶│ IN-REVIEW │───▶│ COMPLETED │        │
│  └─────┘    └─────────────┘    └───────────┘    └───────────┘        │
│    │              │                   │                │               │
│    │              │                   │                │               │
│    └──────────────┴───────────────────┴────────────────┘               │
│                           │                                             │
│                           ▼                                             │
│                      ┌──────────┐                                       │
│                      │ ARCHIVED │ (wont-fix, declined, deferred)       │
│                      └──────────┘                                       │
└─────────────────────────────────────────────────────────────────────────┘

                              │
                              │  /release
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         RELEASE PHASE                                   │
│                                                                         │
│  COMPLETED items are:                                                  │
│  1. Tagged with version number (fixedInVersion)                        │
│  2. Moved to ARCHIVED status                                           │
│  3. Included in GitHub release notes                                   │
│  4. Shown in What's New tab                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Status Definitions

### 1. `new` - Unclaimed

**What it means:** Feedback has been submitted and is ready for someone to work on.

**Who sets it:** Automatic on submission via feedback form

**Next actions:**

- Run `/fb` to auto-claim the oldest item
- Or manually view with `node scripts/fetch-feedback.js <id>`

**Displayed:** In Kanban "New" column

---

### 2. `in-progress` - Claimed & Working

**What it means:** An agent/developer has claimed this and is actively working on it.

**Who sets it:** `/fb` command auto-claims and sets this status

**Next actions:**

1. Assess: Is this a good idea? (see /fb protocol step 2)
2. Interpret: What are they actually asking for?
3. Get approval: Confirm approach with user
4. Implement: Fix bug or add feature
5. Move to `in-review`

**Stale detection:** If `in-progress` for >2 hours, next `/fb` run can reclaim it

**Displayed:** In Kanban "In Progress" column

---

### 3. `in-review` - Awaiting User Verification

**What it means:** Implementation is done, waiting for user to test and confirm it works.

**Who sets it:** Agent/developer after implementing

**Command:**

```bash
node scripts/fetch-feedback.js <id> in-review "Testing steps:
1. Navigate to [module/tab]
2. [Action to perform]
3. Expected: [what should happen]"
```

**Next actions:**

- User tests the fix/feature
- If works → move to `completed`
- If broken → move back to `in-progress` with notes

**Displayed:** In Kanban "In Review" column

---

### 4. `completed` - Verified & Staged for Release

**What it means:** User confirmed it works. Item is now **staged for the next release**.

**Who sets it:** User after testing

**Command:**

```bash
# Preview what will be in next release (optional but recommended)
node scripts/release.js -p

# Mark as completed
node scripts/fetch-feedback.js <id> completed "Verified working on [device/browser]"
```

**Important:**

- Items stay in `completed` status until `/release` is run
- This allows batching multiple fixes into one release
- They are **not yet archived** - still visible in Kanban

**Displayed:** In Kanban "Completed" column (special styling)

---

### 5. `archived` - Closed

**What it means:** Item is closed and no longer active. Two ways to get here:

#### Path A: Released (from `completed`)

When `/release` runs, all `completed` items are:

1. Tagged with `fixedInVersion` field (e.g., "0.1.1")
2. Moved to `archived` status
3. Included in release changelog
4. Added to What's New tab

#### Path B: Declined (from any status)

When feedback won't be implemented:

```bash
node scripts/fetch-feedback.js <id> archived "Reason: [declined/wont-fix/deferred/duplicate]"
```

**Displayed:** In Kanban "Archived" column (collapsed by default)

---

## Complete Workflow Example

### Scenario: User reports "Gallery thumbnails too small on mobile"

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. SUBMISSION                                                            │
│    User fills out feedback form → status: "new"                         │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. CLAIMING                                                              │
│    Agent runs: /fb                                                       │
│    Status: new → in-progress                                             │
│    Field: claimedAt timestamp set                                        │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. ASSESSMENT                                                            │
│    Agent reviews: "This is valid, gallery uses 80px thumbs on mobile"   │
│    Agent asks: "Want me to increase to 120px?"                          │
│    User: "Yes, do it"                                                    │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. IMPLEMENTATION                                                        │
│    Agent updates GalleryThumbnail.svelte                                │
│    Changes min-height from 80px to 120px in mobile media query          │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 5. REVIEW REQUEST                                                        │
│    Agent runs:                                                           │
│    node scripts/fetch-feedback.js abc123 in-review "Testing steps:              │
│    1. Open gallery on mobile (or resize to <768px)                      │
│    2. Thumbnails should now be 120px tall                               │
│    3. Verify text is still readable"                                    │
│                                                                          │
│    Status: in-progress → in-review                                       │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 6. USER TESTING                                                          │
│    User opens gallery on phone                                           │
│    Confirms: "Looks good! Much better."                                  │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 7. MARK COMPLETED                                                        │
│    User (or agent) runs:                                                 │
│    node scripts/release.js -p                                            │
│    → Shows: "3 items ready for v0.1.1 (2 bugs, 1 feature)"             │
│                                                                          │
│    node scripts/fetch-feedback.js abc123 completed "Verified on iPhone"         │
│                                                                          │
│    Status: in-review → completed                                         │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 8. BATCHING                                                              │
│    Item sits in "completed" status with 2 other items                   │
│    User decides: "Let's ship these 3 fixes together"                    │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 9. RELEASE                                                               │
│    User runs: /release                                                   │
│    Script:                                                               │
│    - Bumps version: 0.1.0 → 0.1.1                                       │
│    - Creates git tag v0.1.1                                              │
│    - Creates GitHub release with changelog                               │
│    - Archives all 3 completed items                                      │
│    - Tags each with fixedInVersion: "0.1.1"                             │
│                                                                          │
│    Status: completed → archived                                          │
│    Field: fixedInVersion = "0.1.1"                                      │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 10. USERS SEE IT                                                         │
│     Settings → What's New tab shows:                                     │
│     "v0.1.1 - Bug Fixes"                                                │
│     • Fixed gallery thumbnails too small on mobile                       │
│     • Fixed [other item]                                                 │
│     • Fixed [other item]                                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Reference Commands

### Claiming & Status Updates

```bash
# Auto-claim next item
node scripts/fetch-feedback.js

# List all feedback
node scripts/fetch-feedback.js list

# View specific item
node scripts/fetch-feedback.js <id>

# Update status
node scripts/fetch-feedback.js <id> in-progress "Working on it"
node scripts/fetch-feedback.js <id> in-review "Test steps: ..."
node scripts/fetch-feedback.js <id> completed "Verified"
node scripts/fetch-feedback.js <id> archived "Declined: out of scope"

# Update title
node scripts/fetch-feedback.js <id> title "Short descriptive title"
```

### Complex Items (Subtasks)

```bash
# Add subtask
node scripts/fetch-feedback.js <id> subtask add "Step 1" "Description"

# Add dependent subtask (depends on subtask 1)
node scripts/fetch-feedback.js <id> subtask add "Step 2" "Description" 1

# Update subtask status
node scripts/fetch-feedback.js <id> subtask 1 in-progress
node scripts/fetch-feedback.js <id> subtask 1 completed

# List subtasks
node scripts/fetch-feedback.js <id> subtask list
```

### Release Preview & Execution

```bash
# Quick preview (use in /fb workflow)
node scripts/release.js -p

# Full preview
node scripts/release.js --dry-run

# Execute release (via /release command)
/release
```

---

## Best Practices

### 1. **Always provide testing instructions**

When moving to `in-review`, give clear steps. Bad example:

```bash
node scripts/fetch-feedback.js <id> in-review "Fixed"  # ❌ Too vague
```

Good example:

```bash
node scripts/fetch-feedback.js <id> in-review "Testing:
1. Go to Browse → Gallery
2. Resize browser to 375px width
3. Thumbnails should be 120px tall
4. Check text is readable"  # ✅ Clear and actionable
```

### 2. **Preview before marking completed**

Always run `node scripts/release.js -p` before marking as `completed`. This helps you:

- See if you have enough fixes for a release
- Understand version bump (patch vs minor)
- Plan batching strategy

### 3. **Use subtasks for complex work**

If a feedback item requires multiple steps or has prerequisites, break it down:

```bash
node scripts/fetch-feedback.js <id> subtask add "Add database schema" "..."
node scripts/fetch-feedback.js <id> subtask add "Create API endpoint" "..." 1
node scripts/fetch-feedback.js <id> subtask add "Update UI component" "..." 2
```

This lets multiple agents work on prerequisites in parallel.

### 4. **Batch releases thoughtfully**

Don't ship every single bug fix immediately. Good batching strategies:

- **Daily builds**: 3-5 small bug fixes
- **Feature releases**: 1-2 features + related bug fixes
- **Hotfixes**: Critical bugs only, ship ASAP

Use `node scripts/release.js -p` to see what's ready and decide timing.

### 5. **Archive declined items promptly**

If feedback won't be implemented, move it to `archived` with a reason:

```bash
node scripts/fetch-feedback.js <id> archived "Declined: out of scope for v1"
node scripts/fetch-feedback.js <id> archived "Won't fix: working as intended"
node scripts/fetch-feedback.js <id> archived "Duplicate of #xyz123"
node scripts/fetch-feedback.js <id> archived "Deferred: revisit in Q2"
```

This keeps the Kanban board clean and communicates decisions.

---

## Troubleshooting

### "I marked something as completed but it's not in What's New"

**Cause:** `completed` items are staged, not released yet.

**Solution:** Run `/release` to batch them into a version.

### "Item has been in-progress for days"

**Cause:** Agent claimed it but got stuck or abandoned it.

**Solution:** If >2 hours old, next `/fb` run will auto-reclaim it as stale.

### "I want to unclaim an item I'm working on"

**Solution:** Move it back to `new`:

```bash
node scripts/fetch-feedback.js <id> new "Unclaiming for now"
```

### "Release is showing old commits, not my completed feedback"

**Cause:** No items have `status: completed` in Firestore.

**Solution:** Make sure you used `completed` not `archived` when marking items ready for release.

---

## Architecture Notes

### Why Two Phases?

The split between Kanban (active work) and Release (versioning) allows:

1. **Flexible batching** - you control when things ship
2. **Clear history** - see exactly what went into each version
3. **Parallel workflows** - multiple agents can work on different items
4. **User transparency** - What's New tab shows version-tagged changes

### Database Schema

```typescript
interface FeedbackItem {
  // Identity
  id: string;

  // Content
  type: "bug" | "feature" | "general";
  title: string;
  description: string;

  // Kanban tracking
  status: "new" | "in-progress" | "in-review" | "completed" | "archived";
  claimedAt?: Timestamp;

  // Release tracking
  fixedInVersion?: string; // e.g., "0.1.1"
  archivedAt?: Timestamp;

  // Complex work
  subtasks?: Subtask[];

  // Metadata
  createdAt: Timestamp;
  module?: string;
  tab?: string;
}
```

---

## Related Documentation

- `/fb` command: `.agents/skills/fb/SKILL.md`
- `/release` command: `.agents/skills/release/SKILL.md`
- Release script: `scripts/release.js`
- Fetch feedback script: `fetch-feedback.js`
