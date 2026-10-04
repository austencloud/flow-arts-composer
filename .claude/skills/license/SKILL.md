---
description: Use when auditing, reviewing, or fixing license compliance across the monorepo. Checks package.json fields, LICENSE files, root LICENSE references, dependency licenses, and npm publish readiness.
argument-hint: "[audit|fix|deps|check <package>]"
---

# License Audit

**Args:** `$ARGUMENTS` — `audit` (default), `fix`, `deps`, or `check <package-path>`

## Source of Truth

Root `LICENSE` file declares the canonical license for every directory. All package.json `"license"` fields and per-package LICENSE files must match it.

### License Map (from root LICENSE)

| License | Directories |
|---------|-------------|
| MIT | `packages/flow-arts-core`, `packages/domain`, `packages/vtg-domain`, `packages/spin-science-domain`, `packages/9square-domain`, `packages/tka-types`, `packages/feedback-types`, `packages/render-core`, `packages/sequence-engine` |
| Elastic-2.0 | `src/`, `packages/render-composition`, `packages/animation-renderer`, `packages/pictograph`, `mcp-server/`, `mcp-server-pkg/`, `packages/mcp-game-controller`, `packages/mcp-tika-talk` |
| CC BY-SA 4.0 | Sequence datasets, deck data, pictograph reference data, notation docs |

**License text files:** `licenses/MIT.txt`, `licenses/ELv2.txt`, `licenses/CC-BY-SA-4.0.txt`

## Commands

### `audit` (default) — Full Compliance Check

Run all checks, report findings. No changes.

**Step 1: Package.json license fields**

For every `packages/*/package.json`, `mcp-server/package.json`, `mcp-server-pkg/package.json`, `deployment/functions/package.json`, `flowtrails/package.json`, and root `package.json`:

```
Grep for "license" in all package.json files
```

Compare each against the License Map. Flag mismatches.

**Step 2: Per-package LICENSE files**

Every package directory must contain a LICENSE file. Check:
- File exists
- First line matches expected license (`MIT License` or `Elastic License 2.0`)
- Content matches canonical text in `licenses/`

**Step 3: Root LICENSE references**

Parse root LICENSE for all `packages/*/` path references. For each:
- Verify the directory exists (flag ghost references)
- Verify it's listed under the correct license section

Also check: are there packages that exist in `packages/` but are NOT listed in root LICENSE?

**Step 4: npm publish readiness**

For any package with `"files"` array in package.json: verify `"LICENSE"` is in the array. For `mcp-server-pkg/` specifically (the only npm-published package), this is critical.

**Step 5: Report**

Present results as a table:

```
| Package | Field | LICENSE file | Root ref | Publish | Status |
|---------|-------|-------------|----------|---------|--------|
| domain  | MIT ✓ | MIT ✓       | §1 ✓     | n/a     | PASS   |
```

Statuses: `PASS`, `MISMATCH`, `MISSING`, `GHOST`

### `fix` — Auto-Fix All Issues

Run `audit` first, then fix every finding:
- Wrong `"license"` field → edit package.json
- Missing LICENSE file → copy from `licenses/`
- Ghost root LICENSE reference → remove from LICENSE
- Missing `"LICENSE"` in files array → add it

### `deps` — Dependency License Scan

Check all production dependencies for license compatibility.

```bash
cd E:/tka-platform && npx license-checker --production --summary 2>/dev/null || echo "license-checker not installed"
```

If `license-checker` not available, manually scan `node_modules/*/package.json` license fields. Flag:
- **GPL-2.0, GPL-3.0, AGPL** — copyleft, incompatible with ELv2 commercial use
- **SSPL** — incompatible
- **UNLICENSED / no license** — risk
- **Unknown** — investigate

### `check <package>` — Single Package Deep Check

For one package, run all checks and also verify:
- Copyright year range is current
- Author field is present
- Package name matches root LICENSE listing

## Rules

- Root LICENSE is always the source of truth. If package.json disagrees, package.json is wrong.
- Never change root LICENSE section assignments without asking the user first — those are legal decisions.
- Ghost references (root LICENSE lists a package that doesn't exist) should be flagged, not auto-removed without confirmation.
- New packages added to `packages/` need to be classified. Ask the user: MIT or ELv2?
