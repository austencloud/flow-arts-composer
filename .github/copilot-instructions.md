# GitHub Copilot Instructions - Flow Arts Composer

> Movement notation software for flow artists. Creates visual "pictographs" showing dance/flow art sequences - think musical notation for physical movement with props, grid positions, arrows, timing, and orientations.

---

## CATASTROPHIC DATA LOSS PREVENTION

**On January 2, 2026, an AI ran `git checkout -- .` and DESTROYED 8 HOURS OF USER WORK. The changes were UNRECOVERABLE.**

### FORBIDDEN COMMANDS - NEVER RUN WITHOUT EXPLICIT USER CONFIRMATION:

```bash
git checkout -- .
git checkout -- <any-file>
git reset --hard
git reset HEAD~
git clean -fd
git clean -f
rm -rf (on code directories)
```

**Mental model:** Every file in `git status` that shows as modified = HOURS OF USER WORK

**ALWAYS ASK** before running any command that discards uncommitted changes.

---

## Core Architecture

### Technology Stack

- **SvelteKit 2.0** with **Svelte 5** (runes: `$state`, `$derived`, `$effect`)
- **TypeScript 5.0** with strict mode
- **InversifyJS 7.9** for dependency injection
- **Firebase** for auth, persistence, cloud storage
- **Vite 6.0** for build tooling
- **Netlify** for deployment

### Project Structure

```
src/lib/
├── features/           # Feature modules (create, learn, library, etc.)
│   └── [feature]/
│       ├── components/ # UI components
│       ├── services/   # Business logic (contracts + implementations)
│       ├── state/      # Svelte 5 runes state (.svelte.ts files)
│       └── domain/     # Types, models, enums
├── shared/            # Cross-cutting infrastructure
│   ├── inversify/     # DI container & modules
│   ├── pictograph/    # Core rendering engine
│   ├── auth/          # Authentication
│   └── [domain]/      # Other shared domains
└── routes/            # SvelteKit pages
```

---

## CRITICAL: No Barrel Exports

**NEVER use barrel exports (index.ts files that re-export other modules).**

**Why:**

- Barrel exports cause massive bundle bloat in Vite
- Importing one item from a barrel loads the ENTIRE barrel
- Tree-shaking doesn't work reliably with re-exports
- Network requests skyrocket in dev mode

**Do this:**

```typescript
// ✅ CORRECT - Direct imports
import { MyComponent } from "../../components/MyComponent.svelte";
import { MyService } from "../../services/implementations/MyService";
```

**NOT this:**

```typescript
// ❌ WRONG - Barrel imports
import { MyComponent } from "../../components";
import { MyService } from "../../services";
```

**Rules:**

- Never create `index.ts` files in `src/` directory
- If you see an `index.ts` that re-exports, flag it for removal
- Direct imports are more verbose but vastly better for performance

---

## Service Naming Convention (CRITICAL)

**Never use the word "Service" in service names.** Use descriptive, verb-based names.

The word "Service" is redundant - everything in `services/` is already a service.

| If the service does...  | Name it...      | Example                                |
| ----------------------- | --------------- | -------------------------------------- |
| Detection/checking      | `*Detector`     | `LOOPDetector`, `ReversalDetector`     |
| Management/coordination | `*Manager`      | `TurnManager`, `CollectionManager`     |
| Configuration           | `*Configurator` | `CardConfigurator`                     |
| Orchestration           | `*Orchestrator` | `GenerationOrchestrator`               |
| Persistence/storage     | `*Persister`    | `SequencePersister`, `FilterPersister` |
| Loading data            | `*Loader`       | `SequenceLoader`, `OptionLoader`       |
| Filtering               | `*Filter`       | `OptionFilter`, `BrowseFilter`       |
| Sorting                 | `*Sorter`       | `OptionSorter`, `BrowseSorter`       |
| Validation              | `*Validator`    | `SequenceValidator`                    |
| Transformation          | `*Transformer`  | `SequenceTransformer`                  |
| Analysis                | `*Analyzer`     | `SequenceAnalyzer`, `PositionAnalyzer` |
| Calculation             | `*Calculator`   | `SequenceStatsCalculator`              |
| Export/conversion       | `*Exporter`     | `SequenceExporter`, `CocoExporter`     |
| Repository/CRUD         | `*Repository`   | `LibraryRepository`                    |
| Caching                 | `*Cache`        | `BrowseCache`, `SequenceCache`       |

```typescript
// ✅ CORRECT
class LOOPDetector implements ILOOPDetector {}
class SequencePersister implements ISequencePersister {}

// ❌ WRONG
class LOOPDetectionService implements ILOOPDetectionService {}
class SequencePersistenceService implements ISequencePersistenceService {}
```

---

## Dependency Injection (InversifyJS)

**Services are resolved via DI container, NOT imported directly.**

```typescript
// ✅ CORRECT - Use DI
import { resolve, TYPES } from "$lib/shared/inversify/di";
const myService = resolve<IMyService>(TYPES.IMyService);

// ❌ WRONG - Don't import services directly
import { MyService } from "./services/MyService";
const myService = new MyService();
```

**Container Architecture:**

- **3-tier loading:** Core (Tier 1) → Shared (Tier 2) → Features (Tier 3, on-demand)
- **HMR-aware:** Container rebuilds on hot reload
- **Lazy loading:** Heavy libraries (PixiJS) loaded when needed

**When adding new services:**

1. Create interface in `contracts/IMyService.ts`
2. Create implementation in `implementations/MyService.ts` with `@injectable()` decorator
3. Add binding in appropriate `*.module.ts`: `bind(TYPES.IMyService).to(MyService)`
4. Add symbol to `types.ts`: `IMyService: Symbol.for('IMyService')`

---

## Svelte 5 Patterns

### State Management with Runes

**DO NOT use legacy Svelte stores.** Use runes exclusively:

```typescript
// ✅ CORRECT - Svelte 5 runes
let count = $state(0);
let doubled = $derived(count * 2);
let { prop1, prop2 } = $props<Props>();

$effect(() => {
  console.log(`Count changed: ${count}`);
});

// ❌ WRONG - Legacy stores
import { writable, derived } from "svelte/store";
const count = writable(0);
```

**Prefer `$derived` over `$effect`** when computing values. Only use `$effect` for side effects.

**State Factory Pattern:**

```typescript
// State files end in .svelte.ts
export function createMyState() {
  let data = $state<MyData>({ ... });
  let computed = $derived(transform(data));

  return {
    get data() { return data; },
    get computed() { return computed; },
    updateData(newData: MyData) { data = newData; }
  };
}
```

**Context Pattern for Shared State:**

```typescript
import { getContext, setContext } from "svelte";

const key = Symbol("myState");
export const getMyState = () => getContext<MyState>(key);
export const setMyState = (state: MyState) => setContext(key, state);
```

---

## CSS & Styling

### NEVER Create Global CSS Utility Classes in Svelte

**Svelte scopes styles for good reasons. Do not fight the framework.**

**The mistake:** Seeing "duplicated" CSS like `.container { max-width: 1200px }` in multiple components and thinking "I should extract this!"

**Why it's wrong:**

- Svelte scopes styles intentionally - each component is self-contained
- "Duplication" in scoped styles isn't a problem - it's explicit, isolated
- Global utility classes create coupling - change the global, break N components

| ✅ SHARE (via CSS variables)             | ❌ DON'T SHARE (keep scoped)            |
| ---------------------------------------- | --------------------------------------- |
| Colors: `var(--theme-card-bg)`           | Layout: `.container { max-width }`      |
| Spacing tokens: `var(--spacing-md)`      | Typography: `h2 { font-size }`          |
| Border radii: `var(--radius-lg)`         | Section padding: `.section { padding }` |
| Semantic colors: `var(--semantic-error)` | Grid definitions                        |

**Rule:** Share design tokens (values), not layout classes (rules).

### 3-Layer CSS Variable Hierarchy

**Layer 1: Static Layout Tokens (`--settings-*`)**

- Defined in `settings-tokens.css`
- Spacing, radius, typography, transitions
- Never change with background

**Layer 2: Dynamic Theme Variables (`--theme-*`)**

- Injected by `background-theme-calculator.ts` based on luminance
- Adapt to light/dark backgrounds automatically
- Variables: `--theme-panel-bg`, `--theme-card-bg`, `--theme-accent`, `--theme-text`, `--theme-stroke`

**Layer 3: Semantic Colors (`--semantic-*`, `--prop-*`)**

- Constant colors that never change
- Status: `--semantic-error`, `--semantic-success`, `--semantic-warning`, `--semantic-info`
- Domain-specific: `--prop-blue`, `--prop-red`

**Pattern for new components:**

```css
.card {
  background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  color: var(--theme-text, #ffffff);
}
.error {
  color: var(--semantic-error);
}
```

### Unified Panel Background System

**NO blur effects on content panels.** Use theme variables exclusively.

```css
/* Main Panels */
background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));

/* Cards/Sub-panels */
background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
```

**Override Drawer Glassmorphism:**

```css
:global(.your-drawer-class) {
  --sheet-bg: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  --sheet-filter: none; /* Disable blur */
}
```

**When to use blur:** ONLY for modal backdrops to dim content behind. Never for content panels, drawers, forms.

### Typography System (Accessibility-First)

**Tier 1: Essential Text (14px minimum)**

- Use `var(--font-size-min)` or `var(--font-size-sm)`
- For: body text, form labels, buttons, links, error messages

**Tier 2: Supplementary Text (12px minimum)**

- Use `var(--font-size-compact)` or `var(--font-size-xs)`
- For: navigation labels under icons, badges, timestamps, metadata

**NEVER go below 12px for any user-visible text.**

---

## Testing Philosophy: "Earned Tests"

**Tests are earned, not given.** Code must prove it deserves a test.

**When to write tests:**

| Scenario                   | Write Test? | Why                              |
| -------------------------- | ----------- | -------------------------------- |
| Pure algorithm/calculation | ✅ Yes      | Math is stable, bugs are subtle  |
| Silent data corruption     | ✅ Yes      | Won't notice until it's too late |
| Bug that regressed twice   | ✅ Yes      | Proven problem                   |
| New feature, still evolving| ❌ No       | Will change, test will die       |
| UI component               | ❌ No       | You'll see if it's broken        |
| Glue code / wiring         | ❌ No       | Obvious when broken              |

**The "silent bug" test:** Ask "If this breaks, will I notice immediately, or will it silently produce wrong output?" Only test the silent ones.

**Current test files in `tests/unit/`:**

- `DimensionCalculationService.test.ts` - Export dimension math
- `GridPlacementDeriver.test.ts` - Grid position calculations
- `ReversalDetectionService.test.ts` - Prop reversal detection
- `DataTransformer.test.ts` - Pictograph data transforms

---

## File Organization & Composition

### 2025 AI-Assisted Development Philosophy

- **Single responsibility per file** - each file does one thing well
- **Composition over consolidation** - build features by composing services
- **Don't warn about "too many files"** - AI navigation makes file count a non-issue
- **Extract when there are multiple responsibilities** - not to hit arbitrary line counts

**Why this matters:**

- Smaller files = smaller context windows = faster/cheaper AI assistance
- Cleaner git diffs
- Each file fully readable in one screen
- Easier to test, modify, and reason about

**What's NOT a good split:**

- Re-export files that just forward imports
- Wrapper components with no logic
- Splitting cohesive logic just to reduce line count

---

## New Module Checklist

When creating a new module, complete these steps:

### Step 1: Add to `moduleLoaders` in ModuleRenderer.svelte

```typescript
// src/lib/shared/modules/ModuleRenderer.svelte
const moduleLoaders = {
  // ... existing modules
  yourmodule: () => import("../../features/your-module/YourModule.svelte"),
};
```

### Step 2: Add to MODULE_DEFINITIONS in module-definitions.ts

```typescript
// src/lib/shared/navigation/config/module-definitions.ts
{
  id: "yourmodule",
  label: "Your Module",
  icon: '<i class="fas fa-icon" style="color: #hexcolor;" aria-hidden="true"></i>',
  color: "#hexcolor",
  description: "What your module does",
  isMain: true,
  sections: [],
}
```

### Step 3: Add DI module if needed

If your module has injectable services, create `src/lib/shared/inversify/modules/yourmodule.module.ts` and register in `loadFeatureModule()` in `di.ts`.

**Navigation is automatic** - new modules get bottom navigation on mobile by default.

---

## Option Picker Architecture

The option picker uses a **shared rendering primitive** with two layout branches:

```
Shared Primitive (single source of truth):
$lib/shared/pictograph/option/OptionPictograph.svelte

Desktop (≥750px):
OptionCardContent.svelte → OptionPictograph

Mobile (<750px):
OptionPictographCell.svelte → OptionPictograph
```

**When fixing rendering issues:** Edit `OptionPictograph.svelte` - both layouts use it.

---

## Development Workflows

### Common Commands

```bash
npm run dev           # Start dev server (all features visible)
npm run dev:clean     # Clean cache and restart
npm run build         # Production build
npm run check         # Type check all files
npm run test          # Unit + integration tests
npm run validate      # Lint + check + test
```

### Feedback Script Syntax (CRITICAL)

**The feedback script uses POSITIONAL arguments, NOT flags.**

```bash
# ✅ CORRECT - Positional arguments
node scripts/fetch-feedback.js create "Title" "Description" feature module tab

# ❌ WRONG - Do NOT use flag syntax
node scripts/fetch-feedback.js create --title "Title" --description "Desc"
```

**Create syntax:**

```bash
node scripts/fetch-feedback.js create "title" "description" [type] [module] [tab]
```

**Update status:**

```bash
node scripts/fetch-feedback.js <id> <status> "resolution notes"
```

---

## Feedback & Release Workflows

### Feedback Workflow

- **5 statuses**: `new → in-progress → in-review → completed → archived`
- **Kanban phase**: Active development (new/in-progress/in-review)
- **Staging phase**: Ready for next release (completed)
- **Release phase**: Shipped and versioned (archived)

### Release Workflow

```bash
node scripts/release.js -p              # Preview next release
node scripts/release.js --version X.Y.Z --confirm \
  --changelog .release-changelog.json --from-main  # Execute release
```

Before execution, follow `.claude/skills/release/SKILL.md`: check prior release
notes, trace every candidate to its real guest/account surface, and write the
audited changelog manifest. Releases without that manifest are blocked.

**A release is NOT complete until the GitHub Release is created:**

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "changelog here"
```

### What Goes in Release Notes

**Release notes are for FLOW ARTISTS, not developers.**

- ✅ Include: Features flow artists will use, bug fixes that impact workflow, UX improvements
- ❌ Mark internal-only: Dev tooling, admin features, internal refactoring, documentation

**Test:** "Would a flow artist who doesn't code care about this?"

---

## Key Files

- `src/lib/shared/inversify/container.ts` - DI container initialization
- `src/lib/shared/inversify/types.ts` - Service symbols
- `src/lib/shared/settings/utils/background-theme-calculator.ts` - Theme variables
- `vite.config.ts` - Build configuration

---

## Project Context

- **Primary developer**: Austen Cloud (austencloud@gmail.com)
- **Purpose**: Movement notation for flow artists (staff, clubs, fans, etc.)
- **Domain**: "Pictographs" are visual diagrams showing movement sequences
- **User base**: Flow artists creating prop sequences, NOT general dancers

**When in doubt, assume development mode and help build features!**
