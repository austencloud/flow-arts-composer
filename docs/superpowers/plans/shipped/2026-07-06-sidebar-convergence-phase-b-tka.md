# Sidebar Convergence — Phase B: Migrate TKA

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make TKA's `DesktopNavigationSidebar.svelte` a thin wrapper over `@austencloud/sidebar` (linked via `file:`), with zero visual/behavioral regression against the current polish. Reparent TKA's footer/account/context-menu into the package's slots; move content offset onto the reserved-width contract.

**Depends on:** Phase A (package built + `file:`-linked into TKA — done).

**Spec:** `docs/superpowers/specs/2026-07-06-sidebar-package-convergence-design.md` §7.

## Principle

The package owns the shell (hover-expand, tree, brand, pin, reserved width). TKA keeps its domain components (`SidebarFooter`, `AccountRow`/`AccountPopover`, `SidebarContextMenu`) and *reparents* them into the package's `footer` / `account` / `beforeTree` slots + context-menu callbacks. Adapters bridge TKA services (`t`, haptics, auth, flags, inbox) to the seam. Nothing is re-implemented.

## Files

- Modify: `src/lib/shared/navigation/components/DesktopNavigationSidebar.svelte` → thin wrapper
- Modify: `src/lib/shared/MainInterface.svelte` → content offset via `--sidebar-reserved-width`
- Modify (settings host branch): reuse `SETTINGS_TABS` + the existing settings back-button markup inside a `beforeTree` snippet
- Create: `tests/unit/sidebar-shell-contract.test.ts`
- Delete (only after parity confirmed): `desktop-sidebar/SidebarHeader.svelte`, `desktop-sidebar/ModuleGroup.svelte`, `desktop-sidebar/ModuleButton.svelte`, `desktop-sidebar/SectionsList.svelte`, `desktop-sidebar/SectionButton.svelte`, `desktop-sidebar/CollapsedTabButton.svelte`, `navigation/services/hover-intent.ts`, and the collapse bits of `layout/desktop-sidebar-state.svelte.ts`. Keep `SidebarFooter.svelte`, `account/*`, `SidebarContextMenu.svelte`, `NotificationBadge.svelte` (still used by the footer/host), `navigation-state`, `config/*`.

## Tasks

### B1: Dependency (done)
- [x] `"@austencloud/sidebar": "file:../shared-packages/packages/sidebar"` in `package.json`; `pnpm install` → `+ @austencloud/sidebar 0.1.0`.

### B2: Adapters in the wrapper
- [ ] In `DesktopNavigationSidebar.svelte`, keep the existing TKA imports needed as adapters (`t`, `getReactiveLocale`, `getHapticFeedback`, `authState`, `featureFlagService`, `resolveAccessTier`, `isTabAccessible`, `isPremiumOrAbove`, `inboxState`, `navigationState`, `SETTINGS_TABS`, `prefetchOnIntent`, `RobustAvatar`, `AccountPopover`, `SidebarContextMenu`, `SidebarFooter`).
- [ ] Write adapter fns:
  - `translateLabel = (id) => t(moduleById(id)?.labelKey ?? id)` (map module id → its `labelKey`).
  - `translateSectionLabel = (mid, sid, fallback) => { const k = sectionByIds(mid, sid)?.labelKey; return k ? t(k) : fallback; }`.
  - `onHaptic = () => getHapticFeedback()?.trigger('selection')`.
  - `filterSection = (mid, sid) => featureFlagService.canAccessTab(mid, sid) && isTabAccessible(mid, sid, accessTier)` (reuse the existing `accessTier` derived).
  - `getBadgeCount = (mid, sid) => { if (mid === 'inbox') return sid ? inboxSectionCount(sid) : inboxState.totalUnreadCount; if (mid === 'dashboard' && !sid) return inboxState.unreadNotificationCount; return 0; }`.
  - `onModuleHover = (id) => prefetchOnIntent(id)`.
- [ ] Depend on locale reactivity: keep a `getReactiveLocale()` read so adapters re-run on locale change (the tree re-renders when the passed callbacks' outputs change — pass fresh label via `renderIcon`? No: labels come from `translateLabel`, called during render; ensure the wrapper re-renders on locale by reading `getReactiveLocale()` in a `$derived` the markup depends on, e.g. a `localeTick`).

### B3: Render the wrapper
- [ ] Replace the whole `<nav>…</nav>` body with:
```svelte
<Sidebar
  modules={hostModules}
  {currentModule}
  {currentSection}
  bind:pinned
  pinStorageKey="tka-desktop-sidebar-collapsed"
  homeHref="/"
  brandLead="TKA"
  brandRest=" Composer"
  onModuleChange={onModuleChange}
  onSectionChange={onSectionChange}
  onModuleContextMenu={featureFlagService.isAdmin ? openModuleContextMenu : undefined}
  onSectionContextMenu={featureFlagService.isAdmin ? openSectionContextMenu : undefined}
  onModuleHover={onModuleHover}
  {onHaptic}
  {translateLabel}
  {translateSectionLabel}
  {filterSection}
  {getBadgeCount}
  holdOpen={contextMenuState.mode !== 'closed' || accountPopoverOpen}
  onReservedWidthChange={(px) => (reservedWidth = px)}
>
  {#snippet beforeTree(expanded)}
    {#if isInSettings}
      <!-- reuse the existing settings header + back button markup -->
    {/if}
  {/snippet}
  {#snippet account(expanded)}
    <SidebarAccount
      variant={expanded ? 'expanded' : 'collapsed'}
      isAuthenticated={authState.isFullAccount}
      displayName={authState.user?.displayName || authState.user?.email || 'Account'}
      onclick={toggleAccountPopover}
      {onHaptic}
    >
      {#snippet avatar()}
        <RobustAvatar src={authState.user?.photoURL ?? null} name={displayName} customSize={32} />
      {/snippet}
    </SidebarAccount>
  {/snippet}
  {#snippet footer(expanded)}
    <SidebarFooter isCollapsed={!expanded} {isInSettings} onSettingsClick={handleSettingsTap} onAccountClick={toggleAccountPopover} bind:accountSectionElement={accountSectionEl} />
  {/snippet}
</Sidebar>

<SidebarContextMenu menuState={contextMenuState} onClose={closeContextMenu} />
<AccountPopover isOpen={accountPopoverOpen} onClose={closeAccountPopover} anchorElement={accountSectionEl} />
```
- [ ] `hostModules`: when `isInSettings`, pass `SETTINGS_TABS`-derived modules; else the normal `modules`. (Settings back button lives in `beforeTree`.)
- [ ] Keep `openModuleContextMenu(id, e)` / `openSectionContextMenu(id, sid, e)` mapping to the existing `contextMenuState` shape.
- [ ] Note: `SidebarFooter` may double-render the account row (it currently contains `AccountRow`). Decide: either the package `account` slot OR the footer's account row — not both. Simplest: drop `AccountRow` from `SidebarFooter` and use the package `account` slot; or keep `SidebarFooter`'s account row and skip the `account` slot. Pick one; grep-verify no double account row.

### B4: MainInterface reserved width
- [ ] Read `src/lib/shared/MainInterface.svelte`. Where it offsets content by the sidebar's reserved width (currently via `desktopSidebarState`), switch to `--sidebar-reserved-width` (set by the package on its `<nav>`, or thread `reservedWidth` from the wrapper up via a callback/prop). Confirm the content column's `margin-inline-start` / grid track uses it.

### B5: Contract test
- [ ] `tests/unit/sidebar-shell-contract.test.ts` (mirror `tests/unit/sequence-viewer-shell-contract.test.ts`): read `DesktopNavigationSidebar.svelte` source; assert it imports `Sidebar` from `@austencloud/sidebar` and does NOT import the deleted local chrome (`./desktop-sidebar/SidebarHeader`, `./desktop-sidebar/ModuleGroup`, etc.).

### B6: Verify
- [ ] `npm run check` → 0 errors (fix any adapter/type mismatches).
- [ ] Delete the dead internals (task list above) ONLY after check is green and parity confirmed; re-run `npm run check`.
- [ ] Visual parity pass (Austen or DevTools with permission): rail 64px, hover float to 220 overlay (no content reflow), pin locks + persists, brand "TKA"→"TKA Composer" slide-reveal + home link, account circle↔row morph, footer no-shift, stuck-open heal, settings back-button, admin right-click menu. This is the sign-off gate — the package's visual behavior cannot be proven without a host.

## Rollback
`file:` link + wrapper are reversible: revert `DesktopNavigationSidebar.svelte` + `MainInterface.svelte`, drop the dep, `pnpm install`. The deleted internals are recoverable from git until the delete commit; keep the delete as its own commit AFTER parity.
