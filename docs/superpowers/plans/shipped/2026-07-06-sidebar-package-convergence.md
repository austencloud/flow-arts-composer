# Sidebar Package Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `@austencloud/sidebar` from the live TKA hover-expand overlay sidebar, then migrate both TKA and cirque-aflame onto it as thin wrappers and publish `1.0.0`.

**Architecture:** The package owns the shell (hover-expand overlay rail, hover-intent, pin, reserved-width contract, the single no-layout-shift morphing module/section tree, brand slide-reveal, account shape-morph). Everything domain-specific (i18n, haptics, auth, feature-flags, footer, admin context menus) is host-supplied through the DI seam the package already has (`translateLabel`, `onHaptic`, `filterSection`, `getBadgeCount`, snippets). Both apps become thin wrappers; the package is the single source of truth.

**Tech Stack:** Svelte 5 (runes), `@sveltejs/package` (svelte-package), pnpm workspace + Changesets, Vitest (+ vitest-browser-svelte for component tests).

**Spec:** `docs/superpowers/specs/2026-07-06-sidebar-package-convergence-design.md`

**Repos (three, separate git):**
- Package: `E:\shared-packages\packages\sidebar`
- TKA: `E:\tka-platform`
- cirque: `E:\cirque-aflame` (app is `ringmaster`)

**Live TKA source of truth (port from these):**
- `E:\tka-platform\src\lib\shared\navigation\components\DesktopNavigationSidebar.svelte` (orchestrator + hover-expand state machine)
- `E:\tka-platform\src\lib\shared\navigation\services\hover-intent.ts`
- `E:\tka-platform\src\lib\shared\navigation\components\desktop-sidebar\SidebarHeader.svelte` (brand + pin)
- `E:\tka-platform\src\lib\shared\navigation\components\account\AccountRow.svelte` (account shape-morph)
- `E:\tka-platform\src\lib\shared\navigation\components\desktop-sidebar\{ModuleGroup,ModuleButton,SectionsList,SectionButton}.svelte` (the morphing tree)
- `E:\tka-platform\src\lib\shared\navigation\components\NotificationBadge.svelte`

---

## Plan structure

This document details **Phase A (the package rebuild)** in full. Phases B and C get their own plan documents authored **after Phase A builds green**, because the exact wrapper code for TKA and cirque depends on the final, built package API (prop names, snippet signatures). Their task lists are enumerated at the end so nothing is lost; they are not placeholders — they are the next two plans in the sequence.

- **Phase A** — Rebuild `@austencloud/sidebar` v1 (this document, full detail). Deliverable: a locally-built, unit- and component-tested package rendering the hover-expand sidebar in a dev harness.
- **Phase B** — Migrate TKA to consume it via `file:` link (own plan doc).
- **Phase C** — Migrate cirque + Changesets publish `1.0.0` + pin both apps (own plan doc).

---

## Phase A — File structure (package)

```
E:\shared-packages\packages\sidebar\
├─ package.json                      # MODIFY: description/keywords; version bump deferred to changeset
├─ tsconfig.json                     # keep (extends ../../tsconfig.base.json)
├─ vitest.config.ts                  # CREATE: node + browser projects
├─ css\
│  └─ sidebar-tokens.css             # REWRITE: --theme-*/--duration-*/--min-touch-target defaults
├─ dev\                              # CREATE: minimal harness to render the sidebar locally
│  └─ Harness.svelte
└─ src\
   ├─ index.ts                       # REWRITE: barrel (Sidebar, SidebarAccount, NotificationBadge, hover-intent, pin-state, types)
   ├─ types.ts                       # REWRITE: generic NavItem types (no ModuleId union / TranslationKey)
   ├─ Sidebar.svelte                 # REWRITE: orchestrator (hover-expand state machine, reserved width, slots, tree)
   ├─ SidebarAccount.svelte          # CREATE: circle<->row shape morph primitive
   ├─ NotificationBadge.svelte       # CREATE: lift-as-is
   ├─ services\
   │  ├─ hover-intent.ts             # CREATE: port (zero-dep timer controller)
   │  └─ hover-intent.test.ts        # CREATE: unit tests
   └─ sidebar\
      ├─ SidebarBrand.svelte         # CREATE: brand slide-reveal + home link + pin
      ├─ ModuleGroup.svelte          # CREATE: port + decouple
      ├─ ModuleButton.svelte         # CREATE: port + decouple
      ├─ SectionsList.svelte         # CREATE: port + decouple
      ├─ SectionButton.svelte        # CREATE: port + decouple
      ├─ pin-state.ts                # CREATE: localStorage read/write
      ├─ pin-state.test.ts           # CREATE: unit tests
      └─ Sidebar.css                 # REWRITE: shell + tree styling on --theme-*/--duration-* tokens
```

Delete from the old package (stale push-collapse design): `src/sidebar/CollapsedModuleButton.svelte`, `src/sidebar/CollapsedTabButton.svelte`, `src/sidebar/collapse-state.ts` (replaced by `pin-state.ts`).

---

## Phase A — Tasks

### Task A1: Wire the dev/test harness and token sheet

**Files:**
- Modify: `E:\shared-packages\packages\sidebar\package.json`
- Create: `E:\shared-packages\packages\sidebar\vitest.config.ts`
- Rewrite: `E:\shared-packages\packages\sidebar\css\sidebar-tokens.css`

- [ ] **Step 1: Confirm the package builds today (baseline).**

Run: `cd /e/shared-packages && pnpm --filter @austencloud/sidebar build`
Expected: PASS (svelte-package emits `dist/`). This confirms toolchain before we change code.

- [ ] **Step 2: Add Vitest + vitest-browser-svelte to the package devDeps.**

Edit `package.json` — add to `devDependencies`: `"vitest": "^2"`, `"@vitest/browser": "^2"`, `"vitest-browser-svelte": "^0.1.0"`, `"playwright": "^1.48.0"`. Add scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```
Update `description` to `"Hover-expand overlay sidebar for Svelte 5: rail rail<->pinned tri-state, no-layout-shift morphing nav tree, DI seam for i18n/haptics/auth/flags"` and add keywords `["sidebar","navigation","hover-expand","overlay","svelte","austencloud"]`.

- [ ] **Step 3: Create `vitest.config.ts` with a node project (pure logic) and a browser project (components).**

```ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: ['src/**/*.test.ts'], exclude: ['src/**/*.svelte.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.svelte.test.ts'],
          browser: { enabled: true, provider: 'playwright', instances: [{ browser: 'chromium' }] },
        },
      },
    ],
  },
});
```

- [ ] **Step 4: Rewrite `css/sidebar-tokens.css`** to default the `--theme-*/--duration-*/--min-touch-target/--z-sidebar` contract (every value a plain fallback so a bare consumer still works):

```css
/* @austencloud/sidebar default tokens. Import once at app root; a host that
   already defines --theme-*/--duration-* overrides these. Every consuming
   var() in the components ALSO carries an inline fallback, so this sheet is
   optional. */
:where(:root) {
  --theme-panel-bg: rgba(10, 10, 15, 0.95);
  --theme-stroke: rgba(255, 255, 255, 0.08);
  --theme-stroke-strong: rgba(255, 255, 255, 0.16);
  --theme-accent: #818cf8;
  --theme-accent-strong: #6366f1;
  --theme-text: #f4f4f5;
  --theme-text-dim: #a1a1aa;
  --theme-card-bg: rgba(255, 255, 255, 0.03);
  --theme-card-hover-bg: rgba(255, 255, 255, 0.06);
  --theme-shadow: rgba(0, 0, 0, 0.45);
  --semantic-error: #ef4444;
  --semantic-info: #3b82f6;
  --semantic-success: #22c55e;
  --duration-instant: 100ms;
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-emphasis: 280ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --min-touch-target: 44px;
  --z-sidebar: 200;
}
```

- [ ] **Step 5: Install + commit.**

Run: `cd /e/shared-packages && pnpm install`
```bash
git add packages/sidebar/package.json packages/sidebar/vitest.config.ts packages/sidebar/css/sidebar-tokens.css pnpm-lock.yaml
git commit -m "chore(sidebar): add vitest harness + reconcile default token sheet onto --theme-*/--duration-*" -- packages/sidebar/package.json packages/sidebar/vitest.config.ts packages/sidebar/css/sidebar-tokens.css pnpm-lock.yaml
```

---

### Task A2: Port the hover-intent controller (TDD)

**Files:**
- Create: `E:\shared-packages\packages\sidebar\src\services\hover-intent.ts`
- Test: `E:\shared-packages\packages\sidebar\src\services\hover-intent.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHoverIntent } from './hover-intent';

describe('createHoverIntent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires onOpen only after openDelay of sustained hover', () => {
    const onOpen = vi.fn(), onClose = vi.fn();
    const c = createHoverIntent({ openDelay: 50, closeDelay: 300, onOpen, onClose });
    c.pointerEnter();
    expect(onOpen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(49);
    expect(onOpen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('cancels a pending open if the pointer leaves before the delay', () => {
    const onOpen = vi.fn(), onClose = vi.fn();
    const c = createHoverIntent({ openDelay: 50, closeDelay: 300, onOpen, onClose });
    c.pointerEnter();
    c.pointerLeave();
    vi.advanceTimersByTime(100);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('fires onClose only after closeDelay grace', () => {
    const onOpen = vi.fn(), onClose = vi.fn();
    const c = createHoverIntent({ openDelay: 0, closeDelay: 300, onOpen, onClose });
    c.pointerEnter();
    vi.advanceTimersByTime(0);
    c.pointerLeave();
    vi.advanceTimersByTime(299);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('openNow / closeNow fire immediately and clear timers', () => {
    const onOpen = vi.fn(), onClose = vi.fn();
    const c = createHoverIntent({ openDelay: 50, closeDelay: 300, onOpen, onClose });
    c.openNow();
    expect(onOpen).toHaveBeenCalledOnce();
    c.closeNow();
    expect(onClose).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `cd /e/shared-packages && pnpm --filter @austencloud/sidebar test -- hover-intent`
Expected: FAIL — `Cannot find module './hover-intent'`.

- [ ] **Step 3: Create `src/services/hover-intent.ts`** — copy verbatim from `E:\tka-platform\src\lib\shared\navigation\services\hover-intent.ts` (it is zero-dependency and already generic), changing only the default `openDelay` from `120` to `50` in the destructuring default so the package default matches the live rail behavior:

```ts
export function createHoverIntent({
  openDelay = 50,
  closeDelay = 300,
  onOpen,
  onClose,
}: HoverIntentOptions): HoverIntentController {
```
(everything else identical to the source file, including the `HoverIntentOptions`/`HoverIntentController` interfaces and the timer body.)

- [ ] **Step 4: Run tests, verify pass.**

Run: `cd /e/shared-packages && pnpm --filter @austencloud/sidebar test -- hover-intent`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit.**

```bash
git add packages/sidebar/src/services/hover-intent.ts packages/sidebar/src/services/hover-intent.test.ts
git commit -m "feat(sidebar): port zero-dep hover-intent controller (openDelay default 50)" -- packages/sidebar/src/services/hover-intent.ts packages/sidebar/src/services/hover-intent.test.ts
```

---

### Task A3: Pin-state persistence (TDD)

**Files:**
- Create: `E:\shared-packages\packages\sidebar\src\sidebar\pin-state.ts`
- Test: `E:\shared-packages\packages\sidebar\src\sidebar\pin-state.test.ts`
- Delete: `E:\shared-packages\packages\sidebar\src\sidebar\collapse-state.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readPinState, writePinState } from './pin-state';

describe('pin-state', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
  });

  it('returns the fallback when no key is stored', () => {
    expect(readPinState('sk', true)).toBe(true);
    expect(readPinState('sk', false)).toBe(false);
  });

  it('round-trips a written value', () => {
    writePinState('sk', true);
    expect(readPinState('sk', false)).toBe(true);
    writePinState('sk', false);
    expect(readPinState('sk', true)).toBe(false);
  });

  it('is a no-op when key is null', () => {
    expect(() => writePinState(null, true)).not.toThrow();
    expect(readPinState(null, true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `cd /e/shared-packages && pnpm --filter @austencloud/sidebar test -- pin-state`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/sidebar/pin-state.ts`.**

```ts
/** localStorage persistence for the sidebar's pinned (rail<->pinned) state.
 *  key === null disables persistence (read returns the fallback, write no-ops). */
export function readPinState(key: string | null, fallback: boolean): boolean {
  if (!key || typeof localStorage === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

export function writePinState(key: string | null, pinned: boolean): void {
  if (!key || typeof localStorage === 'undefined') return;
  localStorage.setItem(key, pinned ? 'true' : 'false');
}
```

- [ ] **Step 4: Run tests, verify pass.**

Run: `cd /e/shared-packages && pnpm --filter @austencloud/sidebar test -- pin-state`
Expected: PASS (3 tests).

- [ ] **Step 5: Delete the stale `collapse-state.ts` and commit.**

```bash
git rm packages/sidebar/src/sidebar/collapse-state.ts
git add packages/sidebar/src/sidebar/pin-state.ts packages/sidebar/src/sidebar/pin-state.test.ts
git commit -m "feat(sidebar): pin-state persistence; drop stale collapse-state" -- packages/sidebar/src/sidebar/pin-state.ts packages/sidebar/src/sidebar/pin-state.test.ts packages/sidebar/src/sidebar/collapse-state.ts
```

---

### Task A4: Generic nav types

**Files:**
- Rewrite: `E:\shared-packages\packages\sidebar\src\types.ts`

- [ ] **Step 1: Rewrite `src/types.ts`** to the generic, host-agnostic shapes (drop the `ModuleId` union and `TranslationKey` label typing; labels are plain strings, resolved by `translateLabel`):

```ts
import type { Snippet } from 'svelte';

export interface Section {
  id: string;
  label: string;
  icon: string;
  color?: string;
  gradient?: string;
  disabled?: boolean;
}

export interface SectionGroup {
  id: string;
  label: string;
  sections: Section[];
}

export interface ModuleDefinition {
  id: string;
  label: string;
  icon: string;
  color?: string;
  isMain?: boolean;
  sections: Section[];
}

export interface SidebarProps {
  modules: ModuleDefinition[];
  currentModule: string;
  currentSection: string;

  onModuleChange?: (moduleId: string, targetSection?: string) => void | Promise<void>;
  onSectionChange?: (sectionId: string) => void;
  onModuleContextMenu?: (moduleId: string, e: MouseEvent) => void;
  onSectionContextMenu?: (moduleId: string, sectionId: string, e: MouseEvent) => void;
  onModuleHover?: (moduleId: string) => void;

  pinned?: boolean;
  pinStorageKey?: string | null;
  railWidth?: number;
  expandedWidth?: number;
  hoverIntent?: { openDelay?: number; closeDelay?: number };
  disableHoverExpand?: boolean;
  onReservedWidthChange?: (px: number) => void;

  onHaptic?: () => void;
  translateLabel?: (moduleId: string) => string;
  translateSectionLabel?: (moduleId: string, sectionId: string, fallback: string) => string;
  filterSection?: (moduleId: string, sectionId: string) => boolean;
  getBadgeCount?: (moduleId: string, sectionId?: string) => number;

  homeHref?: string | null;
  brandLead?: Snippet | string;
  brandRest?: Snippet | string;
  brand?: Snippet<[expanded: boolean]>;

  renderIcon?: Snippet<[name: string, size: number]>;
  beforeTree?: Snippet<[expanded: boolean]>;
  account?: Snippet<[expanded: boolean]>;
  footer?: Snippet<[expanded: boolean]>;
  class?: string;
}
```

- [ ] **Step 2: Type-check.**

Run: `cd /e/shared-packages && pnpm --filter @austencloud/sidebar check`
Expected: may report downstream errors in the old `Sidebar.svelte` (expected — rewritten in A9). Confirm `types.ts` itself has no error.

- [ ] **Step 3: Commit.**

```bash
git add packages/sidebar/src/types.ts
git commit -m "feat(sidebar): generic nav types + full SidebarProps seam" -- packages/sidebar/src/types.ts
```

---

### Task A5: SidebarBrand (slide-reveal + home link + package-owned pin)

**Files:**
- Create: `E:\shared-packages\packages\sidebar\src\sidebar\SidebarBrand.svelte`
- Test: `E:\shared-packages\packages\sidebar\src\sidebar\SidebarBrand.svelte.test.ts`

- [ ] **Step 1: Create `SidebarBrand.svelte`** by porting `E:\tka-platform\...\desktop-sidebar\SidebarHeader.svelte`, generalizing the hardcoded brand. Keep its CSS (the `.brand-home`, `.brand`, `.brand-rest` 0fr→1fr reveal, `.pin-toggle`, the 48px right gutter) verbatim. Change the script + markup to:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    mode,               // "rail" | "hover" | "pinned"
    onToggleCollapse,
    homeHref = null,
    brandLead,
    brandRest,
    brand,
  } = $props<{
    mode: 'rail' | 'hover' | 'pinned';
    onToggleCollapse: () => void;
    homeHref?: string | null;
    brandLead?: Snippet | string;
    brandRest?: Snippet | string;
    brand?: Snippet<[expanded: boolean]>;
  }>();

  const expanded = $derived(mode !== 'rail');
  const pinLabel = $derived(mode === 'pinned' ? 'Collapse sidebar to rail' : 'Pin sidebar open');
  const isLeadString = $derived(typeof brandLead === 'string');
  const isRestString = $derived(typeof brandRest === 'string');
</script>

<div class="sidebar-header">
  <svelte:element
    this={homeHref ? 'a' : 'div'}
    class="brand-home"
    class:expanded
    href={homeHref ?? undefined}
    aria-label={homeHref ? 'Go to home' : undefined}
  >
    {#if brand}
      {@render brand(expanded)}
    {:else}
      <span class="brand" class:expanded>
        {#if isLeadString}<span class="brand-tka">{brandLead}</span>{:else if brandLead}{@render brandLead()}{/if}<span class="brand-rest"><span class="brand-rest-text">{#if isRestString}{brandRest}{:else if brandRest}{@render brandRest()}{/if}</span></span>
      </span>
    {/if}
  </svelte:element>

  <button
    class="pin-toggle"
    class:visible={expanded}
    class:pinned={mode === 'pinned'}
    onclick={onToggleCollapse}
    aria-label={pinLabel}
    title={pinLabel}
    tabindex={expanded ? 0 : -1}
    aria-hidden={!expanded}
  >
    <i class="fas {mode === 'pinned' ? 'fa-chevron-left' : 'fa-thumbtack'}" aria-hidden="true"></i>
  </button>
</div>

<style>
  /* ...verbatim from SidebarHeader.svelte: .sidebar-header, .brand-home(.expanded),
     .brand(.expanded), .brand-rest, .brand-rest-text, .pin-toggle(.visible/.pinned),
     focus-visible, prefers-reduced-motion. No changes. */
</style>
```

Note: the pin button lives OUTSIDE the `brand` override branch, so a full-override brand keeps the pin (spec §5, judgment call A). `svelte:element` renders `<a>` only when `homeHref` is set, else a non-navigating `<div>` (cirque/TKA both pass `/`).

- [ ] **Step 2: Write the component test** `SidebarBrand.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SidebarBrand from './SidebarBrand.svelte';

describe('SidebarBrand', () => {
  it('renders brandLead + brandRest and links home when homeHref set', async () => {
    const screen = render(SidebarBrand, {
      mode: 'pinned', onToggleCollapse: () => {},
      homeHref: '/', brandLead: 'TKA', brandRest: ' Composer',
    });
    await expect.element(screen.getByText('TKA')).toBeInTheDocument();
    const link = screen.getByLabelText('Go to home');
    await expect.element(link).toHaveAttribute('href', '/');
  });

  it('pin button is present and fires onToggleCollapse when expanded', async () => {
    const onToggle = vi.fn();
    const screen = render(SidebarBrand, {
      mode: 'hover', onToggleCollapse: onToggle, homeHref: '/', brandLead: 'TKA', brandRest: ' Composer',
    });
    const pin = screen.getByLabelText('Pin sidebar open');
    await pin.click();
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run the test, verify pass.**

Run: `cd /e/shared-packages && pnpm --filter @austencloud/sidebar test -- SidebarBrand`
Expected: PASS (2 tests). If the browser project needs Playwright chromium: `pnpm --filter @austencloud/sidebar exec playwright install chromium` first.

- [ ] **Step 4: Commit.**

```bash
git add packages/sidebar/src/sidebar/SidebarBrand.svelte packages/sidebar/src/sidebar/SidebarBrand.svelte.test.ts
git commit -m "feat(sidebar): SidebarBrand — slide-reveal wordmark, home link, package-owned pin" -- packages/sidebar/src/sidebar/SidebarBrand.svelte packages/sidebar/src/sidebar/SidebarBrand.svelte.test.ts
```

---

### Task A6: SidebarAccount (circle<->row shape morph primitive)

**Files:**
- Create: `E:\shared-packages\packages\sidebar\src\SidebarAccount.svelte`
- Test: `E:\shared-packages\packages\sidebar\src\SidebarAccount.svelte.test.ts`

- [ ] **Step 1: Create `SidebarAccount.svelte`** by porting `E:\tka-platform\...\account\AccountRow.svelte`, keeping the CSS verbatim (`.account-row`, the `border-radius` morph transition, `.account-row.collapsed` with `calc(var(--min-touch-target)/2)`, `.avatar-col` 44px left-anchor, `.account-label`) and replacing all TKA imports (`authState`, `RobustAvatar`, `getHapticFeedback`, `authDrawerState`) with props:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    variant = 'expanded',      // "expanded" | "collapsed"
    isAuthenticated = false,
    displayName = 'Account',
    avatar,                    // Snippet — host renders its avatar (photo/fallbacks)
    onclick,
    onHaptic,
  } = $props<{
    variant?: 'expanded' | 'collapsed';
    isAuthenticated?: boolean;
    displayName?: string;
    avatar?: Snippet;
    onclick?: () => void;
    onHaptic?: () => void;
  }>();

  function handleClick() {
    onHaptic?.();
    onclick?.();
  }
</script>

<button
  class="account-row"
  class:collapsed={variant === 'collapsed'}
  onclick={handleClick}
  aria-label={isAuthenticated ? 'Account menu' : 'Sign in'}
  aria-haspopup={isAuthenticated ? 'menu' : undefined}
>
  <span class="avatar-col">
    {#if avatar}{@render avatar()}{:else}
      <div class="avatar-guest">
        <i class="fas fa-user-plus" aria-hidden="true"></i>
      </div>
    {/if}
  </span>

  {#if variant !== 'collapsed'}
    <span class="account-label">{isAuthenticated ? displayName : 'Sign in'}</span>
    {#if isAuthenticated}
      <i class="fas fa-chevron-up chevron" aria-hidden="true"></i>
    {/if}
  {/if}
</button>

<style>
  /* ...verbatim from AccountRow.svelte: the base .account-row (with the
     border-radius transition), :not(.drawer):not(.collapsed) height/gap/padding,
     .avatar-col 44px anchor, .account-row.collapsed calc(min-touch-target/2)
     radius, .avatar-guest, .account-label + label-fade-in, .chevron,
     reduced-motion + high-contrast. Drop the drawer variant (host-only). */
</style>
```
Auth/avatar/guest-signup routing stays in the host: the host passes `isAuthenticated`, an `avatar` snippet, and an `onclick` that opens either the account popover or the signup sheet.

- [ ] **Step 2: Write the component test** `SidebarAccount.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SidebarAccount from './SidebarAccount.svelte';

describe('SidebarAccount', () => {
  it('shows the display name when authenticated + expanded', async () => {
    const screen = render(SidebarAccount, { variant: 'expanded', isAuthenticated: true, displayName: 'Austen' });
    await expect.element(screen.getByText('Austen')).toBeInTheDocument();
  });

  it('shows "Sign in" and fires onclick + onHaptic when guest', async () => {
    const onclick = vi.fn(), onHaptic = vi.fn();
    const screen = render(SidebarAccount, { variant: 'expanded', isAuthenticated: false, onclick, onHaptic });
    await screen.getByText('Sign in').click();
    expect(onclick).toHaveBeenCalledOnce();
    expect(onHaptic).toHaveBeenCalledOnce();
  });

  it('collapsed variant hides the label (icon-only)', async () => {
    const screen = render(SidebarAccount, { variant: 'collapsed', isAuthenticated: true, displayName: 'Austen' });
    await expect.element(screen.getByText('Austen')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run, verify pass.**

Run: `cd /e/shared-packages && pnpm --filter @austencloud/sidebar test -- SidebarAccount`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit.**

```bash
git add packages/sidebar/src/SidebarAccount.svelte packages/sidebar/src/SidebarAccount.svelte.test.ts
git commit -m "feat(sidebar): SidebarAccount shape-morph primitive (avatar via snippet)" -- packages/sidebar/src/SidebarAccount.svelte packages/sidebar/src/SidebarAccount.svelte.test.ts
```

---

### Task A7: NotificationBadge (lift-as-is)

**Files:**
- Create: `E:\shared-packages\packages\sidebar\src\NotificationBadge.svelte`

- [ ] **Step 1: Copy `E:\tka-platform\...\navigation\components\NotificationBadge.svelte` verbatim** into `src/NotificationBadge.svelte` (recon confirmed zero imports, pure props `count`/`max` + CSS consuming only theme vars).

- [ ] **Step 2: Type-check the single file compiles.**

Run: `cd /e/shared-packages && pnpm --filter @austencloud/sidebar check`
Expected: no error attributable to NotificationBadge (Sidebar.svelte errors still expected until A9).

- [ ] **Step 3: Commit.**

```bash
git add packages/sidebar/src/NotificationBadge.svelte
git commit -m "feat(sidebar): lift NotificationBadge primitive" -- packages/sidebar/src/NotificationBadge.svelte
```

---

### Task A8: Port the morphing nav tree (ModuleGroup / ModuleButton / SectionsList / SectionButton)

**Files:**
- Create: `src/sidebar/ModuleGroup.svelte`, `src/sidebar/ModuleButton.svelte`, `src/sidebar/SectionsList.svelte`, `src/sidebar/SectionButton.svelte`

Port each from its live TKA counterpart at `E:\tka-platform\...\desktop-sidebar\<Name>.svelte`, keeping ALL markup + CSS (the no-layout-shift morph: fixed 44px icon column, left-anchored icon, the tab-inset slide). Apply these exact decoupling substitutions in every file:

| Live TKA import / call | Replace with |
|---|---|
| `import { t } ...` + `t(section.labelKey)` | prop `translateSectionLabel?.(moduleId, section.id, section.label) ?? section.label` |
| `t(module.labelKey)` | prop `translateLabel?.(module.id) ?? module.label` |
| `getReactiveLocale()` derived | delete (labels are plain strings now) |
| `getHapticFeedback().trigger('selection')` | prop `onHaptic?.()` |
| `inboxState...` badge reads | prop `getBadgeCount?.(module.id, section?.id) ?? 0` |
| `authState`/`resolveAccessTier`/`isTabAccessible`/`getAccessibleTabs` | prop `filterSection?.(module.id, section.id) ?? true` used in the section `.filter(...)` |
| `prefetchOnIntent(...)` on hover | prop `onModuleHover?.(module.id)` |
| `userPreviewState`, dashboard-avatar legacy branch (ModuleButton) | remove (TKA-only; not part of the generic tree) |
| `NotificationBadge` import path | `../NotificationBadge.svelte` |
| `ModuleId` type on ids | `string` |
| `import type { ... } from '../domain/types'` | `import type { ModuleDefinition, Section } from '../types'` |

- [ ] **Step 1: Port `SectionButton.svelte`** (leaf). Props: `section, moduleId, isActive, isCollapsed, onClick, onContextMenu, badgeCount, translateSectionLabel`. Substitute per the table. Keep CSS verbatim.

- [ ] **Step 2: Port `SectionsList.svelte`.** Props: `module, moduleId, currentSection, isCollapsed, onSectionClick, onSectionContextMenu, getBadgeCount, translateSectionLabel`. Keep the `slide`/`fly`/`cubicOut` transitions; keep the `nav-expanded-${moduleId}` localStorage group-expansion logic (portable). Render `SectionButton` children.

- [ ] **Step 3: Port `ModuleButton.svelte`.** Props: `module, isActive, isExpanded, isCollapsed, onClick, onContextMenu, hasSections, insideGlassContainer, onModuleHover, translateLabel`. Substitute haptics + prefetch + i18n; drop `userPreviewState` and the legacy dashboard-avatar branch.

- [ ] **Step 4: Port `ModuleGroup.svelte`.** Props (keep the live signature): `module, currentModule, currentSection, isExpanded, isCollapsed, moduleColor, onModuleClick, onSectionClick, onModuleContextMenu, onSectionContextMenu, celebrateAppearance, forceActiveStyle` + pass-through `translateLabel, translateSectionLabel, getBadgeCount, filterSection, onModuleHover, renderIcon, onHaptic`. Apply the `filterSection` predicate where it currently filters sections. Render `ModuleButton` + `SectionsList`.

- [ ] **Step 5: Type-check the tree compiles.**

Run: `cd /e/shared-packages && pnpm --filter @austencloud/sidebar check`
Expected: no errors in the four tree files (Sidebar.svelte still errors until A9).

- [ ] **Step 6: Commit.**

```bash
git add packages/sidebar/src/sidebar/ModuleGroup.svelte packages/sidebar/src/sidebar/ModuleButton.svelte packages/sidebar/src/sidebar/SectionsList.svelte packages/sidebar/src/sidebar/SectionButton.svelte
git commit -m "feat(sidebar): port the no-layout-shift morphing nav tree, decoupled behind the DI seam" -- packages/sidebar/src/sidebar/ModuleGroup.svelte packages/sidebar/src/sidebar/ModuleButton.svelte packages/sidebar/src/sidebar/SectionsList.svelte packages/sidebar/src/sidebar/SectionButton.svelte
```

---

### Task A9: Sidebar orchestrator (the hover-expand state machine, generalized)

**Files:**
- Rewrite: `E:\shared-packages\packages\sidebar\src\Sidebar.svelte`
- Rewrite: `E:\shared-packages\packages\sidebar\src\sidebar\Sidebar.css`

- [ ] **Step 1: Rewrite `Sidebar.svelte`.** Port the state machine from `DesktopNavigationSidebar.svelte` (lines 110–249 + the `$effect`s + `onMount` matchMedia/ResizeObserver) verbatim in behavior, generalizing per the spec:
  - Replace `desktopSidebarState.isCollapsed` with local `pinned` (`$bindable`, seeded from `readPinState(pinStorageKey, pinned)`); `isCollapsed` becomes `!pinned` (rail = unpinned). `visuallyExpanded = pinned || hoverExpanded`.
  - Replace `hoverIntent = createHoverIntent({ openDelay: 50, ... })` with `createHoverIntent({ openDelay: hoverIntent.openDelay ?? 50, closeDelay: hoverIntent.closeDelay ?? 300, ... })`.
  - Replace `hasOpenDrawers()` guard with nothing (host concern; the drawer-stack coupling is TKA-only) — the pointer-enter guard becomes `if (!hoverCapable || pinned || disableHoverExpand) return;`.
  - `holdOpen` becomes `false` by default (the popover/context-menu hold-open is host-owned; expose an optional `holdOpen` prop later if a host needs it — not in v1 scope).
  - `handleToggleCollapse` → `handleTogglePin`: `const pinning = !pinned; pinned = pinning; writePinState(pinStorageKey, pinned); hoverIntent.cancel(); hoverExpanded = pinning ? false : pointerInside;`
  - Emit reserved width: `const reservedWidth = $derived(pinned ? expandedWidth : railWidth);` set it as a CSS var on the `<nav>` (`style="--sidebar-reserved-width: {reservedWidth}px; ..."`) and `$effect(() => onReservedWidthChange?.(reservedWidth));`.
  - Replace `SidebarHeader` with `SidebarBrand` (pass `mode`, `onToggleCollapse={handleTogglePin}`, `homeHref`, `brandLead`, `brandRest`, `brand`).
  - Replace the settings branch with a `{#if beforeTree}{@render beforeTree(visuallyExpanded)}{/if}` slot above the tree (the settings back-button lives in the host now). Remove `isInSettings`, `SETTINGS_TABS`, `filteredSettingsSections`, `CollapsedTabButton`, the settings markup.
  - Replace `SidebarFooter` with `{#if footer}{@render footer(visuallyExpanded)}{/if}` and render `{#if account}{@render account(visuallyExpanded)}{/if}` above it.
  - Module context menu: keep `handleModuleContextMenu`/`handleTabContextMenu` but drop `featureFlagService.isAdmin` guard and instead forward to props: `onModuleContextMenu?.(moduleId, e)` / `onSectionContextMenu?.(moduleId, section.id, e)`. Remove the local `contextMenuState`/`SidebarContextMenu`/`AccountPopover` renders (host-owned).
  - `getFilteredSections` uses `filterSection?.(module.id, s.id) ?? true`.
  - Keep `expandedModules`, `handleModuleTap`, `handleSectionTap` exactly (they are generic), swapping `hapticService?.trigger('selection')` → `onHaptic?.()` and `ModuleId` casts → plain strings.

  The `$props` block is exactly the `SidebarProps` from A4.

- [ ] **Step 2: Rewrite `src/sidebar/Sidebar.css`** with the shell styles from `DesktopNavigationSidebar.svelte`'s `<style>` (the `.desktop-navigation-sidebar` → rename base class `.ac-sidebar`; `.collapsed`, `.hover-expanded`, `.navigation-content(.tabs-mode)`, reduced-motion, high-contrast). Change the fixed `width: 220px` / `.collapsed { width: 64px }` to `width: var(--sidebar-reserved-width, 220px)` and, in hover-expanded rail mode, `width: var(--sidebar-expanded-width, 220px)` (set `--sidebar-expanded-width` inline from `expandedWidth`). Drop the settings/back-button CSS (moved to host). Keep the `view-transition-name` handling.

- [ ] **Step 3: Write the orchestrator component test** `Sidebar.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Sidebar from './Sidebar.svelte';
import type { ModuleDefinition } from './types';

const modules: ModuleDefinition[] = [
  { id: 'a', label: 'Alpha', icon: '<i></i>', isMain: true, sections: [
    { id: 'a1', label: 'A One', icon: '<i></i>' },
    { id: 'a2', label: 'A Two', icon: '<i></i>' },
  ]},
];

describe('Sidebar orchestrator', () => {
  it('reserves railWidth when unpinned and expandedWidth when pinned', async () => {
    const onReservedWidthChange = vi.fn();
    render(Sidebar, { modules, currentModule: 'a', currentSection: 'a1',
      railWidth: 64, expandedWidth: 220, onReservedWidthChange });
    expect(onReservedWidthChange).toHaveBeenLastCalledWith(64);
  });

  it('filterSection hides a gated section from the tree', async () => {
    const screen = render(Sidebar, { modules, currentModule: 'a', currentSection: 'a1',
      pinned: true, filterSection: (_m, s) => s !== 'a2' });
    await expect.element(screen.getByText('A One')).toBeInTheDocument();
    await expect.element(screen.getByText('A Two')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run tests + type-check, verify pass.**

Run: `cd /e/shared-packages && pnpm --filter @austencloud/sidebar test && pnpm --filter @austencloud/sidebar check`
Expected: all tests PASS; `check` clean.

- [ ] **Step 5: Commit.**

```bash
git add packages/sidebar/src/Sidebar.svelte packages/sidebar/src/sidebar/Sidebar.css packages/sidebar/src/Sidebar.svelte.test.ts
git commit -m "feat(sidebar): rebuild orchestrator with hover-expand overlay + reserved-width contract + slot seam" -- packages/sidebar/src/Sidebar.svelte packages/sidebar/src/sidebar/Sidebar.css packages/sidebar/src/Sidebar.svelte.test.ts
```

---

### Task A10: Public barrel + build gates

**Files:**
- Rewrite: `E:\shared-packages\packages\sidebar\src\index.ts`

- [ ] **Step 1: Rewrite `src/index.ts`.**

```ts
export { default as Sidebar } from './Sidebar.svelte';
export { default as SidebarAccount } from './SidebarAccount.svelte';
export { default as NotificationBadge } from './NotificationBadge.svelte';
export { createHoverIntent } from './services/hover-intent.js';
export type { HoverIntentOptions, HoverIntentController } from './services/hover-intent.js';
export { readPinState, writePinState } from './sidebar/pin-state.js';
export type { Section, SectionGroup, ModuleDefinition, SidebarProps } from './types.js';
```

- [ ] **Step 2: Build the package.**

Run: `cd /e/shared-packages && pnpm --filter @austencloud/sidebar build`
Expected: PASS; `dist/` contains `index.js`, `index.d.ts`, `Sidebar.svelte` (source shipped via the `svelte` export), `SidebarAccount.svelte`, etc.

- [ ] **Step 3: Run publint + are-the-types-wrong.**

Run: `cd /e/shared-packages && pnpm check:publish && pnpm check:types`
Expected: PASS for `@austencloud/sidebar` (fix any export-map complaints inline).

- [ ] **Step 4: Commit.**

```bash
git add packages/sidebar/src/index.ts
git commit -m "feat(sidebar): public barrel — Sidebar, SidebarAccount, NotificationBadge, hover-intent, pin-state, types" -- packages/sidebar/src/index.ts
```

---

### Task A11: Dev harness smoke render

**Files:**
- Create: `E:\shared-packages\packages\sidebar\dev\Harness.svelte`

- [ ] **Step 1: Create `dev/Harness.svelte`** rendering `<Sidebar>` with sample modules, `brandLead="TKA"`, `brandRest=" Composer"`, `homeHref="/"`, an `account` snippet using `<SidebarAccount>`, and a `renderIcon` snippet. Import `../css/sidebar-tokens.css`. (This harness is for local visual verification; it is not published — `files` already restricts the package to `dist`/`src`/`css`.)

- [ ] **Step 2: Verify it renders in a browser test (smoke).** Add `dev/Harness.svelte.test.ts` that renders the harness and asserts the sidebar `nav` + brand text exist:

```ts
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Harness from './Harness.svelte';

describe('dev harness', () => {
  it('mounts the sidebar with brand + a module', async () => {
    const screen = render(Harness);
    await expect.element(screen.getByText('TKA')).toBeInTheDocument();
    await expect.element(screen.getByLabelText('Main navigation')).toBeInTheDocument();
  });
});
```

Run: `cd /e/shared-packages && pnpm --filter @austencloud/sidebar test -- Harness`
Expected: PASS.

- [ ] **Step 3: Commit — Phase A complete.**

```bash
git add packages/sidebar/dev/Harness.svelte packages/sidebar/dev/Harness.svelte.test.ts
git commit -m "chore(sidebar): dev harness + smoke render; Phase A (package rebuild) complete" -- packages/sidebar/dev/Harness.svelte packages/sidebar/dev/Harness.svelte.test.ts
```

**Phase A exit criteria:** `pnpm --filter @austencloud/sidebar build && test && check && ../../ check:publish` all green; harness renders the hover-expand sidebar. The package now carries the full live-TKA behavior behind the DI seam.

---

## Phase B — Migrate TKA (own plan doc, authored after Phase A builds)

Deliverable: `DesktopNavigationSidebar.svelte` becomes a thin wrapper over `@austencloud/sidebar` (via `file:../shared-packages/packages/sidebar`), with zero visual/behavioral regression against the current polish. Task list:

- **B1.** Add `"@austencloud/sidebar": "file:../shared-packages/packages/sidebar"` to `E:\tka-platform\package.json`; `pnpm install`; build the package once so `dist` exists.
- **B2.** Write the adapter functions in the wrapper: `translateLabel = (id) => t(moduleById(id).labelKey)`, `translateSectionLabel`, `onHaptic = () => getHapticFeedback().trigger('selection')`, `filterSection = (m, s) => featureFlagService.canAccessTab(m, s) && isTabAccessible(m, s, accessTier)`, `getBadgeCount` = inbox adapter, `onModuleHover = (id) => prefetchOnIntent(id)`.
- **B3.** Move the settings sub-nav (back button + settings header) into a `beforeTree` snippet; host swaps `modules` to `SETTINGS_TABS` when `isInSettings`.
- **B4.** Render the TKA footer (`SidebarFooter` contents) via the `footer` snippet; render `<SidebarAccount>` in the `account` snippet with `RobustAvatar` + `authState` + the `authDrawerState.show('signup')` guest path; keep `AccountPopover` + `SidebarContextMenu` host-rendered, wired via `onModuleContextMenu`/`onSectionContextMenu`.
- **B5.** Replace `desktopSidebarState` reserved-width usage in `MainInterface.svelte` with `--sidebar-reserved-width` (bind `pinned`/`pinStorageKey="tka-desktop-sidebar-collapsed"` for persistence parity).
- **B6.** Delete the now-dead TKA sidebar internals (`SidebarHeader.svelte`, the tree components, `hover-intent.ts`, `desktop-sidebar-state` collapse bits) ONLY after parity is confirmed.
- **B7.** Add `tests/unit/sidebar-shell-contract.test.ts` (mirrors `sequence-viewer-shell-contract.test.ts`): assert the wrapper imports `Sidebar` from `@austencloud/sidebar` and does not re-declare local chrome.
- **B8.** Verify: `npm run check`; visual parity pass (hover float, pin, brand slide-reveal, account morph, footer no-shift, stuck-open heal) via DevTools/screenshots or hand to Austen.

## Phase C — Migrate cirque + publish (own plan doc)

- **C1.** In `E:\cirque-aflame\ringmaster`, point `@austencloud/sidebar` at the local `file:` build; adopt the overlay: drop the chevron-toggle + `collapsed` reflow; bind `pinned` + `pinStorageKey="ringmaster-sidebar-collapsed"`.
- **C2.** Brand via the `brand` override snippet (gradient "CA" badge + "Ringmaster"), `homeHref="/"`; `account` snippet → `<SidebarAccount>` + cirque `RobustAvatar` + `signOut`.
- **C3.** `+layout.svelte`: content offset `margin-left: var(--sidebar-width)` → `var(--sidebar-reserved-width)`; add the four `--duration-*` tokens (or rely on fallbacks).
- **C4.** Verify cirque UX on the overlay interaction.
- **C5.** Changesets: `pnpm changeset` (major → `1.0.0`, note the breaking `collapsed`→`pinned` + interaction change); merge the Version Packages PR → `changeset publish`.
- **C6.** Swap both apps off `file:` to `"@austencloud/sidebar": "^1.0.0"`; `pnpm add`; final build both apps green.

---

## Self-review (Phase A vs spec)

- Spec §3 (API seam) → A4 (`SidebarProps`) + A9 (orchestrator consumes it). ✓
- Spec §4 (interaction + reserved-width) → A2 (hover-intent), A9 (state machine, `--sidebar-reserved-width`, `onReservedWidthChange`). ✓
- Spec §5 (component tree) → A5 (SidebarBrand), A6 (SidebarAccount), A7 (NotificationBadge), A8 (tree), A9 (orchestrator), A10 (barrel). Stale files deleted in A3/A9. ✓
- Spec §6 (tokens) → A1 (`sidebar-tokens.css`), A9 (Sidebar.css on `--theme-*/--duration-*`). ✓
- Spec §7/§8 (migrations) → Phase B / Phase C task lists (own docs). ✓
- Spec §9 (publish/verify) → A10 (publint/attw), B7 (contract test), C5/C6 (changeset publish). ✓
- Judgment calls A (brand structured + snippet, pin always package-owned) → A5. B (settings via `beforeTree`) → A9 + B3. C (1.0.0) → C5. ✓
- No placeholders: every code step carries real content; ports specify exact substitution tables. Type names consistent (`pinned`, `readPinState`/`writePinState`, `filterSection`, `ModuleDefinition`, `SidebarProps`) across A4/A9/A10. ✓
