---
description: Use when packaging and publishing a new version with changelog and GitHub release
---

# Release Command

Build release notes from verified, reachable behavior, then publish the version,
tag, and GitHub release. Never treat commit subjects as final copy.

## 1. Gather Evidence

Always gather feedback, commits, the existing release history, and the current
worktree.

```bash
node scripts/release.js --dry-run
git log v{LAST_VERSION}..HEAD --oneline --no-merges
node scripts/fetch-feedback.js list --status completed
gh release list --limit 100
git status --short
```

## 2. Build the Changelog

Read `references/changelog-policy.md` in full before drafting. Follow its
availability audit, prior-release search, evidence table, writing rules, and
manifest schema.

Required outcomes:

- Every note is tied to a real user entry point.
- Guest-visible and sign-in-only behavior are distinguished.
- Disabled, tester-only, broken, and unresolved behavior is excluded.
- Existing capabilities are not announced as new.
- Every sentence makes sense without repository or app-module knowledge.
- Headline examples follow `references/release-media.md`: baked motion that
  tells a short story, never a page screenshot.

Mark completed feedback that is not user-facing:
`node scripts/fetch-feedback.js <id> internal-only true`

## 3. Show the Preview

Present the source counts, prior-release findings, availability evidence table,
version rationale, categorized changelog, and worktree warnings.

Do not request release confirmation while product work is uncommitted or a
listed behavior is known to be broken or actively removed.

## 4. Get Confirmation

Ask the user to choose: release now, change the version, edit the changelog, or
cancel.

## 5. Write and Validate the Manifest

Create the ignored manifest only after approval. The script validates its
private `audience` and `surface` fields, then strips them before publishing.

```json
[
  {
    "category": "improved",
    "text": "Fuse rebuilt: mix and reshape sequences after signing in.",
    "audience": "account",
    "surface": { "module": "create", "tab": "fuse" }
  }
]
```

Write that JSON to `.release-changelog.json`, then run:

```bash
node scripts/release.js --confirm --changelog .release-changelog.json --highlights 1 --version X.Y.Z --from-main
```

Releases without an audited custom changelog are blocked.

## 6. Finish the Release

```bash
git push origin main
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file .release-notes.md
git push origin main
```

A release is complete only after the GitHub release exists and the archived
feedback/version record is verified.

`release.js` archives its selected feedback and creates the version record.
Never run `archive-feedback.js` afterward; it is only for standalone legacy
releases and refuses to overwrite an existing version.

## Version Rule

Use a minor bump only for a genuinely new, reachable user capability. Use a
patch bump for fixes, redesigns, layout work, and improvements.
