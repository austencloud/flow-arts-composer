# Creator Profile — Readability + Density Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the creator profile page (`/browse/creators/[id]`) readable and dense by putting all content on one frosted glass sheet, collapsing empty-state sprawl, and hiding admin controls behind a disclosure — without touching the April layout structure or any data model.

**Architecture:** Pure Svelte 5 / CSS changes across five existing components. One new frosted `.profile-sheet` wrapper in `UserProfilePanel` reusing the app's modal-surface token (`--theme-panel-bg`). `PanelState` gains a backward-compatible `compact` prop. Connection + admin sections shed their card chrome (become dividered blocks inside the sheet); admin body collapses behind a header disclosure. No tests added — this is a presentational pass; verification is screenshot + `npm run check` (per `component-test-discipline`: don't add browser tests for presentational/low-traffic components).

**Tech Stack:** Svelte 5 (`$state`, `$derived`, `$props`), CSS container queries, `backdrop-filter`, existing design tokens (`--theme-panel-bg`, `--theme-stroke`, `--semantic-error`, `--min-touch-target`).

**Spec:** `docs/superpowers/specs/active/2026-06-30-creator-profile-readability-density-design.md`

**Commit rule:** every commit uses an explicit pathspec (`git commit -m "..." -- <files>`) per `.claude/rules/commit-only-your-own-changes.md`. The shared index may hold other agents' work.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/shared/components/panel/PanelState.svelte` | Loading/empty/error state block | Add `compact` prop (smaller padding/icon/title). Backward compatible. |
| `src/lib/features/browse/creators/components/UserProfilePanel.svelte` | Profile orchestrator | Wrap section stack in a frosted `.profile-sheet`; single max-width. |
| `src/lib/features/browse/creators/components/profile/ProfileTabs.svelte` | Sequence gallery + empty | Compact empty state; drop 300px min-height. |
| `src/lib/features/browse/creators/components/profile/ProfileConnectionSection.svelte` | "Your Connection" | De-card → divider block; compact empty; keep notes. |
| `src/lib/features/browse/creators/components/profile/ProfileAdminSection.svelte` | Admin controls | De-card → divider block; collapsed disclosure; red → header tint. |

Task order respects dependencies: `PanelState.compact` (Task 1) lands before its consumers (Tasks 3, 4). Sheet (Task 2) is structural and independent.

---

### Task 1: PanelState gains a `compact` prop

**Files:**
- Modify: `src/lib/shared/components/panel/PanelState.svelte`

- [ ] **Step 1: Add `compact` to the Props interface**

Replace this hunk (lines ~12-25):

```svelte
  interface Props {
    /** Type of state to display */
    type: StateType;
    /** Optional title */
    title?: string;
    /** Optional message */
    message?: string;
    /** Optional icon override (FontAwesome class) */
    icon?: string;
    /** Optional retry callback for error state */
    onretry?: () => void;
  }

  let { type, title, message, icon, onretry }: Props = $props();
```

with:

```svelte
  interface Props {
    /** Type of state to display */
    type: StateType;
    /** Optional title */
    title?: string;
    /** Optional message */
    message?: string;
    /** Optional icon override (FontAwesome class) */
    icon?: string;
    /** Optional retry callback for error state */
    onretry?: () => void;
    /** Dense variant: smaller padding/icon/title for inline empty states */
    compact?: boolean;
  }

  let { type, title, message, icon, onretry, compact = false }: Props = $props();
```

- [ ] **Step 2: Apply the compact class in markup**

Replace this hunk (lines ~45-49):

```svelte
<div
  class="panel-state"
  class:panel-state--error={type === "error"}
  role={type === "error" ? "alert" : undefined}
>
```

with:

```svelte
<div
  class="panel-state"
  class:panel-state--error={type === "error"}
  class:panel-state--compact={compact}
  role={type === "error" ? "alert" : undefined}
>
```

- [ ] **Step 3: Add compact CSS**

Insert immediately after the `.panel-state` rule closes (after line ~78, the block that ends with `text-align: center; }`):

```css
  .panel-state--compact {
    padding: 20px 16px;
    gap: 8px;
  }

  .panel-state--compact .panel-state__icon {
    font-size: var(--font-size-xl);
  }

  .panel-state--compact .panel-state__title {
    font-size: var(--font-size-base);
  }

  .panel-state--compact .panel-state__message {
    font-size: var(--font-size-compact);
  }
```

- [ ] **Step 4: Verify no type errors in this file**

Run: `npx svelte-check --tsconfig ./tsconfig.json --output human 2>&1 | grep -i "PanelState.svelte" || echo "no PanelState errors"`
Expected: `no PanelState errors`

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/components/panel/PanelState.svelte
git commit -m "feat(panel): add compact variant to PanelState" -- src/lib/shared/components/panel/PanelState.svelte
```

---

### Task 2: Frosted profile sheet in UserProfilePanel

**Files:**
- Modify: `src/lib/features/browse/creators/components/UserProfilePanel.svelte`

The five profile sections currently sit as direct children of `.profile-content` (a transparent scroll container), so each floats on the ocean. Wrap them in a single frosted `.profile-sheet` so all content reads against one calm surface at one width.

- [ ] **Step 1: Wrap the section stack in `.profile-sheet`**

Replace this hunk (the `<div class="profile-content"> ... </div>` block, lines ~228-263):

```svelte
    <div class="profile-content">
      <ProfileHeroSection
        {userProfile}
        {currentUserId}
        {isOwnProfile}
        {followInProgress}
        onFollowToggle={handleFollowToggle}
        onFollowersClick={() => openFollowersModal("followers")}
        onFollowingClick={() => openFollowersModal("following")}
      />

      <ProfileShowcase
        pinnedItems={userProfile.pinnedItems ?? []}
        {isOwnProfile}
      />

      <ProfileTabs
        {userSequences}
        onSequenceClick={handleSequenceClick}
      />

      {#if currentUserId && !isOwnProfile}
        <ProfileConnectionSection
          targetUserId={userId}
          targetUserName={userProfile.displayName}
        />
      {/if}

      {#if isAdmin && !isOwnProfile}
        <ProfileAdminSection
          {userProfile}
          onUserUpdated={handleAdminUpdate}
          {onUserDeleted}
        />
      {/if}
    </div>
```

with:

```svelte
    <div class="profile-content">
      <div class="profile-sheet">
        <ProfileHeroSection
          {userProfile}
          {currentUserId}
          {isOwnProfile}
          {followInProgress}
          onFollowToggle={handleFollowToggle}
          onFollowersClick={() => openFollowersModal("followers")}
          onFollowingClick={() => openFollowersModal("following")}
        />

        <ProfileShowcase
          pinnedItems={userProfile.pinnedItems ?? []}
          {isOwnProfile}
        />

        <ProfileTabs
          {userSequences}
          onSequenceClick={handleSequenceClick}
        />

        {#if currentUserId && !isOwnProfile}
          <ProfileConnectionSection
            targetUserId={userId}
            targetUserName={userProfile.displayName}
          />
        {/if}

        {#if isAdmin && !isOwnProfile}
          <ProfileAdminSection
            {userProfile}
            onUserUpdated={handleAdminUpdate}
            {onUserDeleted}
          />
        {/if}
      </div>
    </div>
```

- [ ] **Step 2: Add sheet CSS + retarget the child-width rule**

Replace this hunk (lines ~298-313):

```css
  .profile-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;

    display: flex;
    flex-direction: column;
    align-items: center;
    padding: clamp(16px, 4cqi, 32px);
  }

  .profile-content > :global(*) {
    width: 100%;
    flex-shrink: 0;
  }
```

with:

```css
  .profile-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;

    display: flex;
    flex-direction: column;
    align-items: center;
    padding: clamp(16px, 4cqi, 32px);
  }

  /* Single frosted surface: all sections read against one calm panel instead
     of floating as transparent cards over the animated ocean background.
     Reuses the app's modal-surface token (--theme-panel-bg). */
  .profile-sheet {
    width: 100%;
    max-width: 920px;
    margin-inline: auto;
    padding: clamp(16px, 4cqi, 32px);
    background: color-mix(in srgb, var(--theme-panel-bg, rgba(18, 20, 30, 0.98)) 92%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--theme-stroke);
    border-radius: clamp(16px, 3cqi, 24px);
    box-shadow: var(--theme-shadow, 0 8px 32px rgba(0, 0, 0, 0.3));
  }

  .profile-sheet > :global(*) {
    width: 100%;
    flex-shrink: 0;
  }
```

- [ ] **Step 3: Verify no type errors in this file**

Run: `npx svelte-check --tsconfig ./tsconfig.json --output human 2>&1 | grep -i "UserProfilePanel.svelte" || echo "no UserProfilePanel errors"`
Expected: `no UserProfilePanel errors`

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/browse/creators/components/UserProfilePanel.svelte
git commit -m "feat(profile): frosted sheet surface for creator profile content" -- src/lib/features/browse/creators/components/UserProfilePanel.svelte
```

---

### Task 3: Compact empty gallery in ProfileTabs

**Files:**
- Modify: `src/lib/features/browse/creators/components/profile/ProfileTabs.svelte`

- [ ] **Step 1: Make the empty state compact**

Replace this hunk (lines ~108-114):

```svelte
  {#if filteredSequences().length === 0}
    <PanelState
      type="empty"
      icon="fa-list"
      title="No Sequences"
      message="This creator hasn't published any sequences yet."
    />
```

with:

```svelte
  {#if filteredSequences().length === 0}
    <PanelState
      type="empty"
      icon="fa-list"
      title="No sequences yet"
      message="This creator hasn't published any sequences yet."
      compact
    />
```

- [ ] **Step 2: Drop the 300px min-height void**

Replace this hunk (lines ~149-154):

```css
  .gallery-content {
    container-type: inline-size;
    container-name: gallery;
    min-height: 300px;
    width: 100%;
  }
```

with:

```css
  .gallery-content {
    container-type: inline-size;
    container-name: gallery;
    width: 100%;
  }
```

- [ ] **Step 3: Verify no type errors in this file**

Run: `npx svelte-check --tsconfig ./tsconfig.json --output human 2>&1 | grep -i "ProfileTabs.svelte" || echo "no ProfileTabs errors"`
Expected: `no ProfileTabs errors`

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/browse/creators/components/profile/ProfileTabs.svelte
git commit -m "feat(profile): compact empty gallery state, drop 300px void" -- src/lib/features/browse/creators/components/profile/ProfileTabs.svelte
```

---

### Task 4: De-card + compact-empty the connection section

**Files:**
- Modify: `src/lib/features/browse/creators/components/profile/ProfileConnectionSection.svelte`

Two changes: (1) it lives inside the sheet now, so drop its own card background/border → a hairline-dividered block; (2) when there is no follow relationship either way and zero shared sequences, hide the two status blocks and show one compact line — but always keep the notes editor.

- [ ] **Step 1: Add a `hasSignal` derived**

Insert after the `summaryText` derived block (after line ~90, the closing `});` of `summaryText`):

```svelte
  // Whether the connection has any status worth showing as full blocks.
  // When false, the mutual-status + shared-sequences blocks collapse to a
  // single compact line (notes are always shown).
  const hasSignal = $derived(
    !!connectionInfo &&
      (connectionInfo.mutualFollow.isMutual ||
        connectionInfo.mutualFollow.iFollowThem ||
        connectionInfo.mutualFollow.theyFollowMe ||
        connectionInfo.sharedSequenceCount > 0)
  );
```

- [ ] **Step 2: Branch the content on `hasSignal`**

Replace this hunk (lines ~138-164):

```svelte
    {:else if connectionInfo}
      <div class="content-grid">
        <!-- Mutual Status -->
        <div class="content-block">
          <ConnectionMutualStatus
            mutualFollow={connectionInfo.mutualFollow}
            theirName={targetUserName}
          />
        </div>

        <!-- Shared Sequences -->
        <div class="content-block">
          <ConnectionSharedSequences
            sharedSequences={connectionInfo.sharedSequences}
            theirName={targetUserName}
          />
        </div>

        <!-- Notes -->
        <div class="content-block notes-block">
          <ConnectionNotes
            {targetUserId}
            initialNotes={connectionInfo.notes}
          />
        </div>
      </div>
    {/if}
```

with:

```svelte
    {:else if connectionInfo}
      {#if hasSignal}
        <div class="content-grid">
          <!-- Mutual Status -->
          <div class="content-block">
            <ConnectionMutualStatus
              mutualFollow={connectionInfo.mutualFollow}
              theirName={targetUserName}
            />
          </div>

          <!-- Shared Sequences -->
          <div class="content-block">
            <ConnectionSharedSequences
              sharedSequences={connectionInfo.sharedSequences}
              theirName={targetUserName}
            />
          </div>

          <!-- Notes -->
          <div class="content-block notes-block">
            <ConnectionNotes
              {targetUserId}
              initialNotes={connectionInfo.notes}
            />
          </div>
        </div>
      {:else}
        <div class="content-grid empty-grid">
          <p class="empty-line">
            <i class="fas fa-link-slash" aria-hidden="true"></i>
            No connection yet — you don't follow each other and share no sequences.
          </p>
          <div class="content-block notes-block">
            <ConnectionNotes
              {targetUserId}
              initialNotes={connectionInfo.notes}
            />
          </div>
        </div>
      {/if}
    {/if}
```

- [ ] **Step 3: De-card the section and style the compact line**

Replace this hunk (lines ~169-178):

```css
  .connection-section {
    container-type: inline-size;
    container-name: connection;

    margin-top: 24px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    overflow: hidden;
  }
```

with:

```css
  .connection-section {
    container-type: inline-size;
    container-name: connection;

    margin-top: 24px;
    padding-top: 8px;
    background: transparent;
    border: none;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0;
    overflow: hidden;
  }

  .empty-grid {
    gap: 12px;
  }

  .empty-line {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  .empty-line i {
    opacity: 0.7;
  }
```

- [ ] **Step 4: Verify no type errors in this file**

Run: `npx svelte-check --tsconfig ./tsconfig.json --output human 2>&1 | grep -i "ProfileConnectionSection.svelte" || echo "no ProfileConnectionSection errors"`
Expected: `no ProfileConnectionSection errors`

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/browse/creators/components/profile/ProfileConnectionSection.svelte
git commit -m "feat(profile): de-card connection section, compact empty state" -- src/lib/features/browse/creators/components/profile/ProfileConnectionSection.svelte
```

---

### Task 5: Admin section → collapsed disclosure + de-card

**Files:**
- Modify: `src/lib/features/browse/creators/components/profile/ProfileAdminSection.svelte`

Collapse the admin body behind a header disclosure (collapsed by default), drop the red card fill (become a dividered block with a red-tinted header), so Delete User no longer shows on every profile visit.

- [ ] **Step 1: Add expand state + fade import**

Replace this hunk (line ~28):

```svelte
  import { onDestroy } from "svelte";
```

with:

```svelte
  import { onDestroy } from "svelte";
  import { fade } from "svelte/transition";
```

Then insert after the `let deleteConfirmText = $state("");` line (line ~43):

```svelte

  // Admin controls are collapsed by default so Delete User etc. don't appear
  // on every profile an admin visits. Expand on demand.
  let isExpanded = $state(false);
  let reducedMotion = $state(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
```

- [ ] **Step 2: Convert the static title into a disclosure header + wrap the body**

Replace this hunk (lines ~383-387):

```svelte
<section class="admin-section">
  <h3 class="section-title">
    <i class="fas fa-shield-halved" aria-hidden="true"></i>
    Admin Controls
  </h3>
```

with:

```svelte
<section class="admin-section" class:expanded={isExpanded}>
  <button
    class="section-header"
    onclick={() => (isExpanded = !isExpanded)}
    aria-expanded={isExpanded}
    aria-controls="admin-body"
  >
    <span class="section-title">
      <i class="fas fa-shield-halved" aria-hidden="true"></i>
      Admin Controls
    </span>
    <i
      class="fas fa-chevron-down expand-icon"
      class:rotated={isExpanded}
      aria-hidden="true"
    ></i>
  </button>

  {#if isExpanded}
    <div
      id="admin-body"
      transition:fade={{ duration: reducedMotion ? 0 : 150 }}
    >
```

- [ ] **Step 3: Close the wrapper div before the section closes**

Replace this hunk (lines ~541-542, the end of the account-actions group and the `</section>`):

```svelte
    </div>
  </div>
</section>
```

with:

```svelte
      </div>
    </div>
    </div>
  {/if}
</section>
```

> Note for the executor: this closes, in order, `.action-buttons`, `.control-group`, the new `#admin-body`, and the `{#if isExpanded}` block, then `</section>`. If the indentation from Step 2's added wrapper makes the exact whitespace of this hunk ambiguous, match on the three consecutive closing `</div>` lines followed by `</section>` at the end of the markup (right before the `<!-- Confirmation Modal -->` comment) and add one `</div>` + the `{/if}` as shown.

- [ ] **Step 4: Replace the red card style with a dividered block + header styles**

Replace this hunk (lines ~663-679):

```css
  .admin-section {
    margin-top: 24px;
    padding: 20px;
    background: color-mix(in srgb, var(--semantic-error) 5%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error) 20%, transparent);
    border-radius: 12px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 16px 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--semantic-error);
  }
```

with:

```css
  .admin-section {
    margin-top: 24px;
    padding-top: 8px;
    background: transparent;
    border: none;
    border-top: 1px solid var(--theme-stroke);
    border-radius: 0;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .section-header:hover .section-title,
  .section-header:hover .expand-icon {
    color: var(--semantic-error);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--semantic-error);
  }

  .expand-icon {
    font-size: 12px;
    color: var(--theme-text-dim);
    transition: transform var(--duration-normal, 200ms) ease;
  }

  .expand-icon.rotated {
    transform: rotate(180deg);
  }

  #admin-body {
    padding-top: 16px;
  }

  @media (prefers-reduced-motion: reduce) {
    .expand-icon {
      transition: none;
    }
  }
```

- [ ] **Step 5: Verify no type errors in this file**

Run: `npx svelte-check --tsconfig ./tsconfig.json --output human 2>&1 | grep -i "ProfileAdminSection.svelte" || echo "no ProfileAdminSection errors"`
Expected: `no ProfileAdminSection errors`

- [ ] **Step 6: Commit**

```bash
git add src/lib/features/browse/creators/components/profile/ProfileAdminSection.svelte
git commit -m "feat(profile): admin controls as collapsed disclosure, drop red card" -- src/lib/features/browse/creators/components/profile/ProfileAdminSection.svelte
```

---

### Task 6: Verification pass

**Files:** none (verification only; commit any fixes with explicit pathspec)

- [ ] **Step 1: Full typecheck (one cold run into a log, per `fast-iteration-loop`)**

Run: `npm run check > /tmp/profile-check.log 2>&1; grep -niE "error|profile" /tmp/profile-check.log | head -40 || echo "clean"`
Expected: no errors in the five touched files. Fix any that appear, then re-run.

- [ ] **Step 2: Confirm the empty-profile scroll no longer contains the 300px void or a red admin block**

Grep the touched files to prove the removals landed:

Run: `grep -rn "min-height: 300px" src/lib/features/browse/creators/components/profile/ProfileTabs.svelte || echo "void removed"`
Expected: `void removed`

Run: `grep -rn "semantic-error) 5%" src/lib/features/browse/creators/components/profile/ProfileAdminSection.svelte || echo "red card removed"`
Expected: `red card removed`

- [ ] **Step 3: Visual verification (requires the user or explicit browser permission)**

Per `.claude/rules/verification-protocol.md` and the browser-permission rule, do NOT drive Chrome DevTools without asking. Present the live route and request a visual check:

- Empty profile (e.g. "Dimples"): `https://localhost:5173/browse/creators/<dimples-id>`
- A populated profile: `https://localhost:5173/browse/creators/<populated-id>`

Ask the user to confirm at desktop (~1440px) and mobile (~390px) widths:
1. Body text is legible over the ocean (frosted sheet behind it).
2. No 300px empty void under the gallery for a creator with no sequences.
3. "Admin Controls" is collapsed by default; Delete User hidden until expanded; chevron rotates on expand.
4. All sections align to one column width; no scattered full-width vs narrow cards.

If the user grants browser permission in-conversation, capture before/after `take_screenshot`s instead and attach them.

- [ ] **Step 4: Commit any verification fixes**

```bash
git add -u src/lib/features/browse/creators/components/profile src/lib/shared/components/panel/PanelState.svelte
git commit -m "fix(profile): verification-pass adjustments" -- src/lib/features/browse/creators/components/profile src/lib/shared/components/panel/PanelState.svelte
```

(Skip if no fixes were needed.)

---

## Spec Coverage Verification

| Spec requirement | Task |
|---|---|
| A. Single frosted sheet (reuse `--theme-panel-bg`, `backdrop-filter`) | Task 2 |
| A. Inner sections shed card chrome → dividered blocks | Tasks 4, 5 |
| A. One max-width (920px) | Task 2 |
| B. `PanelState` gains `compact` (extend, backward compatible) | Task 1 |
| B. Compact empty gallery, drop 300px min-height | Task 3 |
| B. Connection compact empty, keep notes | Task 4 |
| C. Admin collapsed disclosure, default collapsed | Task 5 |
| C. Delete hidden until expanded; confirm modal unchanged | Task 5 |
| C. Red → header tint only | Task 5 |
| C. Header touch target ≥ 44px | Task 5 |
| D. One aligned width replacing hero/connection/admin divergence | Task 2 |
| Verify: screenshots empty + populated, desktop + mobile | Task 6 |
| No data-model / service / nav changes | All (none touch those) |
| No new `Collapsible` primitive (reuse in-family pattern) | Task 5 |
```
