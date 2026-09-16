---
name: add-to-library
description: Use when the user pastes sequence data (beat notation, JSON, natural language) and wants it added to their Firestore library
---

<!-- generated from .claude by scripts/sync-codex-skills.mjs; do not edit directly -->

# Add to Library

When explicitly invoked, treat the text after `$add-to-library` as `<arguments>`. Expected shape: `[paste sequence data or say 'add to library']`.

**Args:** `<arguments>`

Import a sequence into the user's Firestore library from any input format.

## Trigger

- `$add-to-library` with sequence data pasted
- User says "add this to my library" alongside sequence data
- User pastes sequence beat notation and asks to save/import it

## Workflow

### 1. Parse input

Accept any of these formats and convert to the JSON schema documented in `format-reference.md`:

| Format | How to parse |
|--------|-------------|
| **Structured beat notation** | Parse header block for metadata. Parse each beat line: extract letter, startPlacement, endPlacement, and per-hand motion fields (motionType, rotationDirection, startLocation, endLocation, turns, startOrientation, endOrientation). |
| **Raw JSON** | Validate it has `word` and `steps[]`. Normalize field names if needed. Pass through. |
| **Natural language** | Extract what you can. Ask one focused question for anything genuinely ambiguous. |
| **MCP generate_sequence output** | Already in the right format. Extract and pass through. |

### 2. Extract metadata

From the input, determine:
- **word** — sequence name (from header or filename)
- **gridMode** — diamond (default), box, or skewed
- **circularity** — if last beat's `endPlacement` == start placement, it's circular
- **loopType** — rotated, mirrored, swapped, inverted, or compound (e.g. mirrored_swapped)
- **difficulty** — if stated
- **tags** — if stated

### 3. Confidence gate

If you're confident in all metadata: proceed without asking.
If something is ambiguous (e.g. loop type not stated but sequence looks circular): ask one focused question.
If input is clearly incomplete (missing motion data): ask what's missing.

### 4. Build JSON

Construct the JSON object matching the schema in `format-reference.md`. Key rules:

- Every step needs: `beat`, `letter`, `startPlacement`, `endPlacement`, `motions.blue`, `motions.red`
- Every motion needs: `color`, `motionType`, `rotationDirection`, `startLocation`, `endLocation`, `turns`, `startOrientation`, `endOrientation`
- `rotationDirection` for static/dash without spin = `"noRotation"` (camelCase, not snake_case)
- Wrap in `{ "word": "...", "gridMode": "...", "startPlacement": "...", "steps": [...] }`

### 5. Write temp file and import

```powershell
# Write JSON to temp file
# (use `apply_patch` to create tmp-import-<word>.json)

# Run import with appropriate flags
node scripts/import-sequence.cjs tmp-import-<word>.json [--circular] [--loop-type <type>] [--notes "<tagline>"] [--visibility private]

# Clean up temp file (use PowerShell `Remove-Item` with the exact temporary path)
```

Flag rules:
- `--circular` — add when sequence is circular (endPlacement == startPlacement)
- `--loop-type X` — add when loop type is known (from input metadata or detection)
- `--notes "text"` — add when user provides a tagline or description
- `--visibility` — `private` by default; `unlisted` is allowed when explicitly requested
- For a public request, import privately first, then immediately run:

```powershell
pnpm sequence:publish -- <sequenceId>
```

The publisher promotes the owner record and writes the public projection,
retained revision, content-hash claim, and parity stamps in one guarded
transaction. Use `--owner <uid>` only when the sequence belongs to someone
other than the default library owner.

When a sequence was initially imported into the default library as a temporary
owner, transfer it after the recipient creates their account with:

```powershell
pnpm sequence:transfer -- <sequenceId> <uid|username|displayName>
```

This preserves the sequence id and public URL while moving the owner record,
public attribution, content-hash claim, shortcodes, and exact profile counters
in one guarded transaction. Add `--dry-run` to preview the resolved account and
counter changes without writing.

### 6. Report result

On success, report:
- Sequence word/name
- Firestore path: `users/{uid}/sequences/{id}`
- Sequence ID
- Metadata applied (circularity, loop type, grid mode)
- Public URL when public publishing was requested

On failure, show error and suggest fixes.

## Beat notation grammar

The structured format looks like this:

```
# WORD
id: <uuid>
owner: <name>
<N> beats | difficulty: <level> | loop: <type> | grid: <mode>
tags: <comma-separated>

## Beats
<beat#> <letter> <startPos>><endPos>
  blue: <motionType> <rotDir> <startLoc>><endLoc> t=<turns> <startOri>><endOri>
  red:  <motionType> <rotDir> <startLoc>><endLoc> t=<turns> <startOri>><endOri>
```

Field mappings:
- `motionType`: pro, anti, dash, static, float → use as-is
- `rotDir`: cw, ccw, no → map `no` to `"noRotation"`
- `loc`: n, e, s, w, ne, se, sw, nw, c → use as-is
- `ori`: in, out, cw, ccw → map `cw` to `"clock"`, `ccw` to `"counter"` (orientation namespace, not rotation)
- `t=<N>`: turns value (integer or decimal)
- Placements: alpha1, beta3, gamma5 etc. → use as-is

**Orientation mapping warning:** In the beat notation, `ori` values `cw`/`ccw` mean `clock`/`counter` (the orientation enum), NOT rotation direction. The `in`/`out` values map directly.

## Dry-run option

If user asks to preview before saving, add `--dry-run` flag. Shows what would be saved without writing to Firestore.
