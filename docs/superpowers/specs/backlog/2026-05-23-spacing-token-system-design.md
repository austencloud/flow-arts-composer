---
status: backlog
value: 3
effort: M
remaining: Audit spacing-token usage against the design and identify the first concrete migration slice before implementation.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Spacing Token System

## Status: BACKLOG

## Problem

Spacing is the least-tokenized design axis in the codebase. Font-size tokens are at 52% adoption (3,937 tokenized vs 3,684 hardcoded). Spacing tokens sit at 13% (1,201 tokenized vs 7,783 hardcoded px declarations across padding, margin, and gap properties in `.svelte` files).

Two competing token sets already exist, neither widely adopted:

| Token set | Defined in | Scale | Unit | Usage |
|---|---|---|---|---|
| `--spacing-*` | `@austencloud/theme` `tokens.css` | xs/sm/md/lg/xl/2xl | `rem` | 1,155 occurrences across 145 files |
| `--space-2026-*` | `src/app.css` `:root` block | xs/sm/md/lg/xl/2xl | `px` | 46 occurrences across 5 files (all in `train/practice/`) |

The `--space-2026-*` set was added as part of a "2026 Refined Minimalism" token block in `app.css` and uses a different scale (6/12/20/28/40/48px) from the theme package set (4/8/16/24/32/48px). Both are incomplete and neither aligns with actual usage patterns.

### Actual hardcoded px distribution

Measured across all `.svelte` files, counting `padding`, `margin`, and `gap` properties only:

| px value | Count | Nearest 4px grid | Notes |
|---|---|---|---|
| 8 | 1,741 | 8 | Dominant value by far |
| 12 | 1,184 | 12 | Second most common |
| 6 | 954 | 8 (round up) or 4 (round down) | Between grid points |
| 4 | 848 | 4 | |
| 10 | 789 | 8 or 12 | Between grid points |
| 16 | 633 | 16 | |
| 2 | 426 | 2 | Micro spacing |
| 20 | 228 | 20 | |
| 14 | 195 | 12 or 16 | Between grid points |
| 24 | 186 | 24 | |
| 3 | 137 | 4 | |
| 5 | 92 | 4 | |
| 1 | 85 | 2 | Micro |
| 32 | 77 | 32 | |
| 48 | 35 | 48 | |
| 40 | 30 | 40 | |
| 7 | 21 | 8 | |
| 28 | 15 | 28 or 32 | |

The natural clusters are at **2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48px**. The highest-frequency values (8, 12, 6, 4, 10, 16) account for ~78% of all hardcoded spacing.

## Design

### Unified spacing scale

Retire `--space-2026-*`. Extend `--spacing-*` (already in the theme package) to cover the full distribution. Keep `rem` units for accessibility (respects user font-size preferences). Keep the existing token names as aliases during migration.

```css
:root {
  /* Spacing Scale - 4px base grid with half-step at 6px */
  --spacing-0:   0;
  --spacing-px:  1px;           /* pixel-precise borders/offsets */
  --spacing-0.5: 0.125rem;      /*  2px - micro gaps */
  --spacing-1:   0.25rem;       /*  4px */
  --spacing-1.5: 0.375rem;      /*  6px */
  --spacing-2:   0.5rem;        /*  8px */
  --spacing-2.5: 0.625rem;      /* 10px */
  --spacing-3:   0.75rem;       /* 12px */
  --spacing-4:   1rem;          /* 16px */
  --spacing-5:   1.25rem;       /* 20px */
  --spacing-6:   1.5rem;        /* 24px */
  --spacing-8:   2rem;          /* 32px */
  --spacing-10:  2.5rem;        /* 40px */
  --spacing-12:  3rem;          /* 48px */

  /* Semantic aliases (backward-compatible with existing --spacing-* usage) */
  --spacing-xs:  var(--spacing-1);    /*  4px */
  --spacing-sm:  var(--spacing-2);    /*  8px */
  --spacing-md:  var(--spacing-4);    /* 16px */
  --spacing-lg:  var(--spacing-6);    /* 24px */
  --spacing-xl:  var(--spacing-8);    /* 32px */
  --spacing-2xl: var(--spacing-12);   /* 48px */
}
```

The numeric names follow the Tailwind convention (value = px / 4) because the codebase already uses Tailwind-style naming for other scales. Semantic aliases preserve backward compatibility with the 1,155 existing `--spacing-xs` through `--spacing-2xl` references.

### Where it lives

**Canonical definition:** `@austencloud/theme` package, `css/tokens.css`. This is where `--spacing-xs` through `--spacing-2xl` already live (lines 49-54 of `tokens.css`). The extended numeric scale goes in the same block.

**No duplication in `app.css`.** The `--space-2026-*` block (lines 628-634 of `src/app.css`) gets deleted once its 46 references are migrated. The mobile override at lines 1041-1043 (`@media (max-width: 768px)`) stays but references the semantic aliases.

**Import chain:** The theme package is already imported via `@austencloud/theme/css/tokens.css` (through the bundle `index.css`). No new imports needed.

### Non-standard values: rounding policy

Values that don't land on the 4px grid get rounded to the nearest scale value during migration. Rounding table for the common off-grid values:

| Current | Count | Round to | Token | Rationale |
|---|---|---|---|---|
| 6px | 954 | 6px | `--spacing-1.5` | Too many to round; earns its own step |
| 10px | 789 | 10px | `--spacing-2.5` | Same; 10px is a genuine half-step between 8 and 12 |
| 14px | 195 | 12px or 16px | `--spacing-3` or `--spacing-4` | Case-by-case; most 14px are "padding that's a bit more than 12" |
| 3px | 137 | 4px | `--spacing-1` | Negligible visual difference |
| 5px | 92 | 4px | `--spacing-1` | Negligible visual difference |
| 1px | 85 | 1px | `--spacing-px` | Intentional; borders and fine offsets |
| 7px | 21 | 8px | `--spacing-2` | Negligible visual difference |
| 28px | 15 | 32px | `--spacing-8` | Close enough; 28px has no design justification over 32px |

The 6px and 10px half-steps are not "exceptions" -- they have 954 and 789 occurrences respectively, making them more popular than 16px (633). They earn scale slots.

### Migration strategy

**Automated codemod, not manual.** 7,783 hardcoded declarations across 500+ files rules out manual migration. A PostCSS plugin or AST-based codemod can handle the mechanical replacement.

#### Codemod design

A Node.js script using `postcss` (already in the dependency tree via SvelteKit/Vite) that:

1. Parses each `.svelte` file's `<style>` block
2. Matches `padding`, `margin`, `gap` (and their longhands like `padding-top`, `margin-left`) declarations with hardcoded `px` values
3. Replaces each px value with the corresponding `var(--spacing-N)` token
4. Handles compound shorthand: `padding: 8px 16px` becomes `padding: var(--spacing-2) var(--spacing-4)`
5. Skips values in `calc()`, `clamp()`, `min()`, `max()` expressions (too complex for automated replacement)
6. Skips negative values (negative margins are structural, not spacing tokens)
7. Runs in dry-run mode first, outputting a diff for review

```
node scripts/spacing-codemod.js --dry-run    # preview changes
node scripts/spacing-codemod.js              # apply changes
```

#### Phased rollout

The codemod handles exact-match values (4, 8, 12, 16, 20, 24, 32, 40, 48px) in one pass. Off-grid values (6, 10, 14px) get a second pass after visual review of the rounding choices.

| Phase | Scope | Approach | Estimated declarations |
|---|---|---|---|
| 1 | Define scale in theme package | Manual edit to `tokens.css` | 0 (infrastructure only) |
| 2 | Delete `--space-2026-*` | Migrate 46 refs in train/practice, delete app.css block | 46 |
| 3 | Codemod exact grid values | Automated: 4, 8, 12, 16, 20, 24, 32, 40, 48px | ~4,965 |
| 4 | Codemod half-steps | Automated: 6px, 10px | ~1,743 |
| 5 | Manual off-grid rounding | 14px (case-by-case), 3px, 5px, 7px, 28px | ~460 |
| 6 | Lint rule enforcement | Stylelint or custom ESLint rule to block new hardcoded px in spacing properties | 0 (prevention) |

After phases 3-5, expected adoption goes from 13% to ~95%+. The remaining 5% are `calc()` expressions, negative margins, and genuinely one-off values (like print layout measurements).

#### Lint enforcement

After migration, add a stylelint rule (or custom ESLint rule for `.svelte` files) that warns on hardcoded px values in `padding`, `margin`, and `gap` properties. This prevents regression -- the same approach that would work for font-size and color tokens.

```js
// Pseudo-rule: warn on padding/margin/gap with raw px
"declaration-property-value-disallowed-list": {
  "/^(padding|margin|gap)/": ["/^\\d+px/"]
}
```

### Semantic aliases vs numeric tokens

Both are exposed. Use guidelines:

- **Numeric tokens** (`--spacing-2`, `--spacing-3`) for precise control. These are the canonical definitions.
- **Semantic aliases** (`--spacing-sm`, `--spacing-md`) when the intent is "small gap" or "standard padding" regardless of exact pixel value. The mobile override already uses these (reducing `--spacing-md` from 16px to 12px on mobile).

The codemod maps px values to numeric tokens by default. Developers can upgrade to semantic aliases in follow-up work when the semantic intent is clear.

## Files touched

| File | Change |
|---|---|
| `@austencloud/theme` `css/tokens.css` | Extend `:root` with numeric spacing scale |
| `src/app.css` lines 628-634 | Delete `--space-2026-*` block |
| `src/app.css` lines 1041-1043 | Keep mobile override, verify alias references |
| `scripts/spacing-codemod.js` | New codemod script |
| ~500 `.svelte` files | Automated token replacement |
| 5 `train/practice/*.svelte` files | Migrate `--space-2026-*` to `--spacing-*` |

## Risks

- **Visual regression from rounding.** The 3px-to-4px and 5px-to-4px rounding is 1px difference, unlikely to be visible. The 14px cases need manual review because 14-to-12 vs 14-to-16 is a 2px shift that can affect tight layouts. Run `npm run build` + visual spot-check on the 15 heaviest files (listed in the problem section) after each codemod phase.
- **Shorthand parsing edge cases.** `padding: 8px 12px 8px 16px` has four values to map. The codemod must handle 1/2/3/4-value shorthand correctly. PostCSS's value parser handles this natively.
- **`calc()` expressions.** `padding: calc(8px + 4px)` should not be touched. The codemod must detect function contexts and skip them.
- **Theme package versioning.** The scale extension requires a minor version bump of `@austencloud/theme` (0.1.0 to 0.2.0). The app pins `^0.1.0`, so update the pin to `^0.2.0` after publishing.

## Non-goals

- Converting `width`, `height`, `top`, `left`, `right`, `bottom`, `border-radius`, `border-width`, or other non-spacing properties. Those have their own token systems (`--radius-*`, `--icon-size-*`, etc.) or are structural values that don't belong in a spacing scale.
- Responsive spacing utilities (like Tailwind's `p-4 md:p-8`). The codebase uses scoped `<style>` blocks, not utility classes. The token system works within that pattern.
- Design-time tooling (Figma plugin, design token sync). Out of scope for this spec; can be layered on later.
