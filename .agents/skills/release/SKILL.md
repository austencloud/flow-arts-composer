---
name: release
description: Use when packaging and publishing a new version with changelog and GitHub release
---

<!-- generated from .claude by scripts/sync-codex-skills.mjs; do not edit directly -->

# Release Command

Build release notes from verified, reachable behavior, then publish the version,
tag, and GitHub release. Never treat commit subjects as final copy.

## 1. Gather Evidence

Always gather feedback, commits, the existing release history, and the current
worktree.

```powershell
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

Present the notes themselves on the editable page, not only as a list in chat.
Austen asked for this on 2026-11-02 so he can edit wording himself instead of
routing every change through chat. The page is the private artifact
[TKA Release Notes](https://claude.ai/artifact/EmasiiQUZwPSNVitLNWa93),
laid out like the What's New sheet, with each note editable in place.

1. Write the draft to its database (`ArtifactData`, the artifact's `url`):
   collection `drafts`, doc `current`, body
   `{version, entries: [{id, category, audience, surface, text, highlight?}], editedAt}`.
   Give each entry a stable `id` (`n01`, `n02`, ...) and mark the headline
   with `highlight: true`. Read the doc first and pin the write to its
   `version`. The page itself does not need republishing.
2. Send him the link and ask him to edit there, or to say it reads right.
3. Before the release, read `drafts/current` back. That read is the final
   copy: drop `id` and `highlight` and write the entries, in order, to the
   manifest below. `--highlights` takes 1-based positions among the `added`
   and `improved` entries, so count the highlighted ones in that list.

If the artifact is gone or a different account is signed in, publish
`notes-editor.html` (beside this file) as a new artifact with
`capabilities: {db: {}, user: {}}`, then update the link above.

## 4. Get Confirmation

Ask the user to choose: release now, change the version, edit the changelog, or
cancel. His edits on the page do not count as a yes; the yes comes in chat.

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

```powershell
node scripts/release.js --confirm --changelog .release-changelog.json --highlights 1 --version X.Y.Z --from-main
```

Releases without an audited custom changelog are blocked.

## 6. Finish the Release

```powershell
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
