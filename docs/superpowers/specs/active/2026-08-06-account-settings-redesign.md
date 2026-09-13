---
status: active
value: 2
effort: XS
remaining: "Shipped in 6a818f9f2 except one acceptance item: criterion 18 wants a provider-named visible action (Connect Google / Connect Facebook / Connect Instagram) but ConnectedAccounts.svelte:295 renders a bare 'Connect' and puts the provider name only in actionAriaLabel:296. That is the whole code task. Unrecorded beyond it: criteria 12-16 are geometry claims (no nested ProfileTab scroller at 1440x900 through 3840x2160, no horizontal overflow at 375x667 and 960x412, DOM/focus order, contrast and 44x44 targets, no clipping at 1280x800 with the sidebar pinned) plus the second-pass measurements, all browser-only. The spec's own Automated list also names four tests that were never written: editor read/edit transitions with focus return, the provider state matrix, the Advanced disclosure, and the relocated storage actions. Do NOT rebuild the Account destination."
depends_on: ""
plan_path: ""
tags: [settings, account, accessibility, verification-gap]
last_triaged: 2026-09-13
---

# Account Settings Redesign

**Status:** Implemented; one acceptance item is genuinely unmet and the
geometry gates are unrecorded. Header corrected 2026-09-13 during spec
reconciliation -- it read "Implemented and verified" while criterion 18's
provider-named action was never built.

**Reconciliation evidence (2026-09-13):** the whole redesign landed in
`6a818f9f2` (_feat(settings): redesign account management_, 35 files,
+3359/-2214). Proven present: the destination is labelled "Account" in
`tab-definitions.ts:435` and in all eleven locales; the setup prompt shows only
unresolved tasks and is gated on `!accountSetupState.isComplete`; storage moved
to Preferences > Advanced behind a `bits-ui` Collapsible, not a hand-rolled
disclosure; every editor announces errors through `role="alert"`; the three
social providers render component brand assets with no icon-font class; rows are
static with explicit actions and last-provider protection intact; the tab id
stays `profile`. Two named files were deleted **by** the implementing commit, as
this document intended. `connected-account-providers.test.ts` and
`account-setup-navigation-contract.test.ts` pass.

**Unmet:** criterion 18 asks for an explicit provider action such as **Connect
Google**. The visible label is only "Connect"
(`ConnectedAccounts.svelte:295`); the provider name appears solely in
`actionAriaLabel` at `:296`. Sighted users get no provider-named affordance.

**Date:** 2026-08-06

**Surface:** Settings module tab with internal id `profile`; user-facing deep link `/settings/profile`

## Outcome

Turn the current profile screen into a focused Account destination that answers three questions in order:

1. Who am I signed in as?
2. What personal information is attached to this account?
3. How do I manage sign-in and account security?

The default completed-account state must fit within a 1440 x 900 desktop viewport and every larger verification viewport without page scrolling. Mobile and short landscape viewports may scroll naturally. The screen must feel composed for 4K instead of presenting a narrow phone layout inside unused rails.

This is an information architecture redesign, not a spacing pass.

## Second Visual Pass

The first implementation satisfied the content and no-scroll requirements but
still read as a settings dashboard stretched across a large canvas. The
identity banner was mostly empty, Personal details became an oversized list,
provider actions competed with provider identity, and the composition ended in
the upper third of a tall display.

Replace that presentation with one account workspace:

- Use a single opaque, theme-aware surface divided into three connected zones:
  identity, personal details, and access/security.
- Give identity a bounded vertical column with the photo, account name,
  username, pronouns, email, photo affordance, and Sign out action together.
- Keep Personal details as one scan-friendly list. Labels, values, and Edit
  actions stay visually connected instead of stretching across the page.
- Show sign-in methods as status rows by default. A bounded Manage control may
  reveal Connect and Disconnect actions in their reserved action slots without
  making the entire row interactive.
- Combine sign-in methods and Security in the access column. Password and
  deletion remain available, but destructive styling appears only on the
  deletion control and its revealed confirmation.
- Center the completed account workspace vertically when free height exists.
  Let the normal settings scroll owner handle shorter layouts.
- Use a three-column composition at large container widths, a two-column
  intermediate composition for wide short screens, and the same source-ordered
  stack on narrow screens.
- Increase opacity behind text so animated scenery remains atmosphere rather
  than competing content.

The default completed state must use the available height at 1920 x 1080,
2560 x 1440, and 3840 x 2160. It must not leave a full-width identity void or a
large abandoned lower field.

### Second-pass verification

- The completed 3840 x 2160 composition renders as a 3567 x 1248 workspace
  with three columns, a 24px local base type size, a 144px avatar, and a 54px
  account name. The document and Settings scroll heights both equal 2160.
- The completed default state also fits without vertical scrolling at
  1440 x 900, 1920 x 1080, and 2560 x 1440. The 1280 x 800 composition stays
  inside the Settings module with no clipping.
- Tablet, phone, and 960 x 412 landscape checks retain source order, avoid
  horizontal overflow, and use natural vertical scrolling when the workspace
  is taller than the viewport.
- Entering sign-in management mode leaves the 2560 x 1440 workspace, sign-in
  section, and all three provider rows at identical dimensions. The revealed
  provider actions measure 131 x 46 CSS pixels.
- A cold reload that initially rendered before Firebase authentication finished
  now hydrates username and pronouns into the identity summary when the account
  arrives.

## Current Failures This Replaces

The existing screen gives every feature similar visual weight:

- A completed setup checklist remains visible after it has served its purpose.
- Storage and offline-cache controls occupy a primary card even though they are maintenance tools.
- Personal details look like disabled black text inputs when they are not being edited.
- Connected-provider rows are long, ambiguous surfaces with missing or ineffective brand recognition.
- Small helper text is repeated across the page, creating noise without a clear reading order.
- Account deletion spans nearly the full page width and becomes more prominent than routine account tasks.
- The baseline content band is too narrow, while the current work in progress uses a viewport-relative `92vw` band inside a sidebar-inset module and can still create clipping or arbitrary rails.

The redesign removes those causes rather than compressing the existing dashboard.

## Information Architecture

### Stable destinations

Settings navigation must represent the same destinations at every viewport. Desktop width changes the composition within a destination, not which destination owns a setting.

For this project:

- Rename **Profile** to **Account** because the destination includes identity, sign-in methods, password management, and deletion. Change only the visible label, description, and translation keys. Keep the internal tab id `profile` and the `/settings/profile` deep link so account-setup destinations and saved links remain valid.
- Keep **Props**, **Theme**, and **Notifications** as separate destinations. They are substantial workflows, not compact preferences.
- Keep **Preferences** and **Language** as separate destinations in this scope. A future General-settings consolidation may combine them, but it must do so consistently at every viewport.
- Move offline and local-data tools from Account to **Preferences > Advanced**.

Do not create one combined desktop settings page that becomes several navigation targets on mobile. That pattern makes location, deep links, browser history, and learned navigation depend on screen size.

### Account page structure

The signed-in Account page contains these regions:

1. Identity header
2. Optional incomplete-setup prompt
3. Personal details
4. Sign-in methods
5. Security

There is no Storage card, completed setup checklist, or separate full-width Danger Zone.

## Region Specifications

### 1. Identity header

The header establishes the signed-in account without behaving like another settings card.

Content:

- Profile photo with the existing photo-change affordance
- Display name as the primary heading
- Username when present
- Email address as secondary account context
- Pronouns only when present
- A bounded **Sign out** button aligned away from identity text

Behavior:

- Keep the existing sign-out action and loading/error behavior.
- Keep profile-photo editing discoverable without making the entire identity area clickable.
- Do not repeat field descriptions that belong in Personal details.

### 2. Incomplete-setup prompt

Completed setup is invisible on this page.

If required account setup remains incomplete, show one compact prompt immediately below the identity header:

- Heading: **Finish your account**
- A short completion summary, such as **2 items left**
- Only the unresolved tasks
- Direct actions using the existing setup state and handlers

The prompt must not reproduce the four-card completed checklist. It disappears as soon as all required items are complete.

Actions for display name, profile photo, prop, and theme keep the existing account-setup destination and edit-request behavior. Replacing the checklist presentation must not break the path that opens a specific editor.

### 3. Personal details

Fields:

- Display name
- Username
- Instagram username
- Pronouns

Read state:

- Present each item as a label, its current value or a clear **Not set** value, and a bounded **Edit** button.
- Values are plain text on the surface. They must not sit inside input-shaped black rectangles.
- The row itself is not clickable. Only the Edit button enters edit mode.
- Permanent helper copy is limited to information needed to interpret the value.

Removing whole-row click behavior is intentional. The current rows expose an invisible hover-only edit affordance, which conflicts with the project's clickable-control rules. Account-setup edit requests still open their target editor programmatically.

Edit state:

- Replace the value area with the existing field editor in place.
- Use a visibly distinct input surface with an obvious border, readable foreground, and focus indicator.
- Preserve current validation, normalization, save, cancel, error, and asynchronous state behavior.
- Display-name visibility guidance may appear while that field is being edited instead of occupying the read state.
- Saving returns focus to the row's Edit button. Canceling restores the prior value and focus.

No new cross-editor unsaved-change coordinator is required. Each editor keeps its existing save and cancel semantics; the redesign changes presentation and focus return without inventing a discard-confirmation rule.

### 4. Sign-in methods

Each provider is a compact status row, not a full-width pseudo-button.

Row anatomy:

- Recognizable provider icon
- Provider name
- Connected identity or status
- A compact, explicit action at the trailing edge

Provider treatment:

- Google uses the existing Google brand icon component.
- Facebook uses the existing Facebook brand icon component.
- Instagram uses a reusable component asset added through the established auth-icon location. It must not depend on a Font Awesome class string.
- Email uses the existing mail icon language.
- Linked providers show **Connected** or the associated identifier and a **Disconnect** button when unlinking is allowed.
- Available providers show an explicit provider action such as **Connect Google**, **Connect Facebook**, or **Connect Instagram**.
- A provider that cannot be unlinked explains why in nearby text or an accessible description. It does not present a disabled mystery icon.

Behavior:

- Preserve the existing linking, unlinking, confirmation, last-provider protection, loading, and error logic.
- Preserve the existing provider feature flags and native-shell restrictions. A provider hidden by those rules remains hidden.
- Preserve Instagram's separate link-state refresh and its propagation through `connectedProviderIds` to deletion reauthentication.
- Only the explicit action is interactive. The provider row itself remains static.
- Loading belongs to the action being performed and must not make unrelated providers appear busy.

### 5. Security

Security is a compact section adjacent to Sign-in methods on wide screens.

Rows:

- **Password**, with a **Change password** action using the existing flow
- **Delete account**, with a restrained destructive action

Account deletion:

- Reuse the existing DangerZone confirmation and reauthentication behavior. The current component already reveals details on demand; the primary visual fix is removing its full-width danger-card GlassCard wrapper and host styling.
- Keep the destructive action visually bounded to its content.
- Reveal explanatory and confirmation UI only after the user chooses **Delete account**.
- Do not wrap the section in a full-width red strip or use red as a page-level background.

## Storage and Offline Data Relocation

Remove Storage from Account without removing its capabilities.

Relocate the existing storage status, offline download, and local reset controls to a collapsed **Advanced** disclosure at the end of Preferences. Within it, use the subsection title **Offline and local data**. Split the operational content from `StorageSection.svelte`'s current GlassCard shell so the Preferences section does not contain a card titled Storage inside another disclosure.

Requirements:

- Reuse the current cache statistics and offline-download behavior.
- Rename **Clear Cache** to **Reset local app data** if the action continues to clear IndexedDB, local storage, cookies, and the active session. The label must describe the real impact.
- State before confirmation that resetting local app data signs the user out and does not delete cloud data.
- Preserve the existing confirmation and error behavior.
- Adopt the project's existing `bits-ui` Collapsible usage demonstrated in `src/lib/features/create/construct/option-picker/swipe-layout/components/OptionViewerSwipeLayout.svelte`, or extract a shared wrapper if the styling contract warrants it. This is a new use in Settings, not an existing Preferences primitive. Do not hand-roll disclosure interaction.
- Keep Advanced collapsed by default so maintenance controls do not compete with everyday preferences.

Moving offline download closer to Browse may be evaluated separately. It is not part of this redesign because the capability and its application-wide consequences require their own product decision.

## Visual Composition

### Hierarchy

- Identity is the page's strongest visual anchor.
- Section headings are the second level.
- Field values and provider names are the primary working text.
- Status and helper text are secondary, but remain comfortably readable.
- Routine actions use neutral or accent treatment. Destructive color is reserved for the Delete account action and its revealed confirmation.

Avoid a dashboard of equal GlassCards. Use one coherent account surface with section boundaries created by spacing, subtle dividers, and deliberate alignment.

### Color and controls

- Read-only values must not use the same dark fill and border treatment as editable inputs.
- Actual form controls need stronger contrast from the containing surface than the current black-on-dark-gray treatment.
- Clickable elements must look clickable before hover.
- Buttons size to their labels and icon. Short actions must not stretch across a card or grid track.
- Provider icons must remain legible at every tested scale and may not depend on an icon font class that can silently fail to render.

### Wide and 4K layout

Use an uncapped, container-relative content band inside the settings module. Do not use the viewport-relative `--shell-w` value here. Its 2600px ceiling would leave about 31 percent dead rail inside a 3776px-wide module at a 3840px viewport, and using `92vw` inside a narrower sidebar-inset module can exceed the module's width and be clipped by `overflow: hidden`.

- Below the desktop composition breakpoint, sections stack in source order.
- At the desktop composition, Personal details occupies the larger left column. Sign-in methods and Security share a smaller right column.
- Base composition changes on the `profile-tab` container, not viewport width. Keep container queries responsible for stacked and two-column layout changes.
- Retain the existing local 1680px to 3840px viewport type ramp because the authenticated app shell does not receive the marketing root ramp. Keep the ramp responsible only for type and proportional spacing, not column changes.
- Use `width: 100%`, no hard maximum, and a container-relative inline gutter such as the Creators precedent `clamp(1rem, 2.2cqi, 3.5rem)`. At 2600px and above, add a tier only if visual verification proves a recomposition is needed.
- Express scalable dimensions in `rem`. Reserve pixels for hairlines, touch-target floors, and resolution-capped media.
- The default completed-account state must fit without vertical scrolling at 1440 x 900, 1920 x 1080, 2560 x 1440, and 3840 x 2160.

The layout may retain quiet space, but that space must frame an intentional composition rather than result from a hard narrow cap.

### Tablet and mobile

- Preserve the same section order and navigation destination.
- Stack Identity, setup prompt when present, Personal details, Sign-in methods, and Security.
- Provider and field rows may wrap their value before the action. Actions must remain at least 44 by 44 CSS pixels.
- At 960 x 412, keep the identity header compact enough that routine account controls are reachable with natural scrolling.
- At 375 x 667, prevent horizontal overflow and allow long email addresses and provider identities to wrap or truncate with an accessible full value.

## Accessibility

- Keep DOM order identical to the visual reading order at every breakpoint.
- Every icon-only affordance needs an accessible name and visible focus treatment.
- Use buttons for actions and links only for navigation.
- Provider status must not rely on color or icon shape alone.
- Show save, link, unlink, password, sign-out, reset, and deletion failures in a visible inline `role="alert"` adjacent to the action that failed. A toast may supplement that message but may not be the only feedback.
- Add visible announced failure feedback to display-name saving. The current implementation logs that failure only, so this is a defect fix rather than preserved behavior.
- Preserve logical focus when editors open and close, confirmations reveal, or asynchronous actions complete.
- Respect reduced-motion preferences for any disclosure or state transition.
- Meet WCAG 2.2 AA contrast for text, controls, borders needed to identify inputs, and focus indicators.

## Preview and Signed-Out States

The existing preview surface keeps the same visual language but remains noninteractive.

- Preview may show representative identity, personal-detail, sign-in-method, and security rows.
- Preview must not expose functioning sign-out, unlink, password, reset, or delete actions.
- Storage and local-data tools do not return to Account in preview mode.
- The provider-row presentation must accept both the preview provider shape and Firebase `providerData` without weakening either type.

If `/settings/profile` is reached without an authenticated user outside preview mode, preserve the current authentication guard and error/loading behavior.

## Reuse Decision

Use existing behavior and primitives wherever they already solve the problem:

- Existing display-name, username, Instagram, pronouns, password, provider-linking, provider-unlinking, and deletion logic
- Existing `GoogleIcon.svelte` and `FacebookIcon.svelte`
- Existing confirmation dialog and alert patterns
- Existing `bits-ui` Collapsible behavior as the reference for Preferences > Advanced
- Existing shared button primitive where its sizing and intent fit the action

Refactor the current profile editors so their read presentation becomes a shared settings-row treatment. Do not duplicate their data or validation logic in a second component tree.

No suitable shared primitive currently provides the full label/value/edit-row behavior. A small profile-settings presentation component is justified after the existing primitive searches, but it must remain presentation-only and compose the established editors.

## Proposed Code Scope

Primary files and systems:

- `src/lib/shared/settings/components/tabs/ProfileTab.svelte`
- `src/lib/shared/settings/components/tabs/profile/ProfileHeroSection.svelte`
- `src/lib/shared/settings/components/tabs/profile/GlassCard.svelte`, limited to removing obsolete Account wrappers rather than changing all consumers
- `src/lib/shared/navigation/components/profile-settings/AccountSettingsSection.svelte`
- The four existing personal-detail editor components under `profile-settings`
- `src/lib/shared/navigation/components/profile-settings/ConnectedAccounts.svelte`
- `src/lib/shared/navigation/components/profile-settings/ConnectedAccountsPreview.svelte`
- `src/lib/shared/navigation/components/profile-settings/connected-accounts.providers.ts`
- `src/lib/shared/navigation/components/profile-settings/DangerZone.svelte`
- `src/lib/shared/settings/components/tabs/profile/StorageSection.svelte`
- `src/lib/shared/settings/components/tabs/PreferencesTab.svelte`
- `src/lib/shared/onboarding/components/account-setup/AccountSetupChecklist.svelte` or a focused incomplete-state presentation using the same state
- `src/lib/shared/navigation/config/tab-definitions.ts` and locale messages needed to rename Profile to Account without changing its id
- `src/lib/shared/auth/components/EmailLinkingDrawer.svelte` only if the row refactor requires prop or focus integration at that existing seam
- `tests/unit/onboarding/account-setup-navigation-contract.test.ts`
- Focused component tests for the behavior changed by this redesign

The repository currently contains an unapproved visual work-in-progress in several profile files. Implementation begins by reconciling and replacing that work against this spec. Unrelated changes in `SettingsModule.svelte` belong to another session and must be preserved.

## Non-Goals

- Combining every settings destination into one desktop page
- Redesigning Props, Theme, or Notifications
- Deciding a permanent Browse placement for offline download
- Changing authentication providers or backend account semantics
- Rewriting validation, account deletion, or storage services
- Removing any currently supported account-management capability

## Risks and Mitigations

### Hidden functionality during relocation

Storage tools become less prominent by design, but they must remain discoverable through the clearly named Preferences > Advanced section. Existing behavior receives direct regression coverage.

### Responsive source-order drift

CSS grid areas can create a visual order that differs from keyboard and screen-reader order. Keep source order canonical and use only layouts that preserve it.

### Nested scrolling and clipping

The current Settings module owns an internal `.settings-module-body` scroller while ProfileTab also declares `overflow-y: auto`. Remove the nested ProfileTab scroller. Keep `.settings-module-body` as the single vertical scroll owner and constrain the Account content band to its container so `.settings-module` cannot clip viewport-relative width.

### Provider unlink regressions

The visual simplification must not bypass last-provider protection or confirmation. Keep existing service calls and cover allowed and disallowed unlink states.

### Shared-workspace overlap

Profile files already contain rejected work in progress, and `SettingsModule.svelte` contains unrelated changes. Apply path-scoped edits, inspect every diff before writing, and do not revert or overwrite another session's work.

## Acceptance Criteria

1. The signed-in destination is labeled Account in settings navigation and page semantics.
2. A completed account shows no setup checklist or setup-complete banner.
3. An incomplete account shows only unresolved setup tasks in one compact prompt.
4. The Account page contains no Storage card, cache statistics, offline-download control, or full-width Danger Zone.
5. Storage and offline controls remain available under Preferences > Advanced > Offline and local data.
6. Personal details appear as plain label/value rows until Edit is chosen.
7. Personal-detail validation and save/cancel behavior remain intact, and a failed save in every editor produces a visible announced error.
8. Every rendered Google, Facebook, and Instagram provider row uses a visible component brand asset rather than an icon-font class. Rows hidden by provider feature flags are out of scope for that runtime state.
9. Connected provider rows are static except for explicit Connect or Disconnect buttons.
10. Last-provider protection, confirmation, Instagram state refresh, and deletion reauthentication provider data remain intact.
11. Password management and account deletion remain available in Security.
12. ProfileTab no longer creates a nested vertical scroller. For a completed account with four personal-detail rows, every provider permitted by the current runtime flags, collapsed editors, and collapsed confirmations, `.settings-module-body` satisfies `scrollHeight <= clientHeight` at 1440 x 900, 1920 x 1080, 2560 x 1440, and 3840 x 2160.
13. The page has no horizontal overflow at 375 x 667 or 960 x 412.
14. DOM, focus, and visual order match at every layout tier.
15. Controls have readable contrast, visible focus, and 44 by 44 CSS pixel minimum targets where touch applies, including editor Save and Cancel controls and provider Disconnect controls that are currently smaller.
16. At 1280 x 800 with the settings sidebar pinned, Account content remains inside the module box with no clipping or horizontal overflow.
17. The internal tab id remains `profile`, `/settings/profile` still opens Account, and the account-setup navigation contract test continues to pass without a destination migration.

## Verification

### Automated

- Run focused tests for completed and incomplete setup visibility.
- Test personal-detail read/edit transitions, save, cancel, validation, and focus return.
- Test provider linked, available, feature-flag-hidden, native-hidden, busy, failure, unlinkable, and protected-last-provider states, including Instagram refresh propagation.
- Test Preferences > Advanced disclosure and relocated storage actions.
- Run the project check workflow after focused failures are resolved.

### Runtime and visual

Use the shared Chrome launcher and one task-owned DevTools tab. Measure control widths, page overflow, section bounds, and computed type sizes before evaluating screenshots.

Capture and inspect the Account page at:

- 1920 x 1080
- 2560 x 1440
- 3840 x 2160
- 1440 x 900
- 820 x 1180
- 960 x 412
- 375 x 667

For each viewport, verify hierarchy, dead space, wrapping, input contrast, provider-icon visibility, bounded action widths, source-order fidelity, and the absence of unintended scrollbars. Record `.settings-module-body` `scrollHeight` and `clientHeight`, ProfileTab overflow values, and module/content bounding boxes. Exercise at least one editor, one provider action state, the Advanced disclosure, password change, and delete-account confirmation.

## Independent Review Resolution

Claude Code 2.1.220 reviewed the first draft with read-only repository access on 2026-08-06. The review did not modify the workspace.

| Finding                                                                                                       | Disposition                 | Spec revision                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The surface was described as if it were a standalone route.                                                   | Adjusted                    | The spec now names both the Settings tab contract and its valid `/settings/profile` deep link.                                                                                       |
| `--shell-w` recreates dead rail and can overflow the inset module.                                            | Accepted                    | The layout now follows the uncapped, container-relative Creators precedent and keeps container queries separate from the type ramp.                                                  |
| The no-scroll criterion did not name the real scroll owner.                                                   | Accepted                    | ProfileTab loses its nested scroller, `.settings-module-body` becomes the measured owner, and exact DOM measurements are required.                                                   |
| Instagram, provider feature gates, and native restrictions were missing.                                      | Accepted                    | Instagram assets and state propagation are explicit, and runtime-hidden providers are handled in behavior and acceptance criteria.                                                   |
| No disclosure precedent existed in source.                                                                    | Adjusted after verification | A `bits-ui` Collapsible precedent exists in `OptionViewerSwipeLayout.svelte`; the spec now cites it precisely and describes this as a new Settings adoption.                         |
| Display-name failure is silent and alert behavior is inconsistent.                                            | Accepted                    | All field failures now require adjacent visible `role="alert"` feedback, including a named display-name defect fix.                                                                  |
| Renaming Profile left the internal tab-id migration ambiguous.                                                | Accepted                    | The visible destination becomes Account while id `profile` and `/settings/profile` remain stable.                                                                                    |
| File scope omitted preview, icon, navigation-contract, and wrapper seams.                                     | Accepted                    | The code scope now names those seams and corrects the DangerZone and provider-data paths.                                                                                            |
| The unused `EmailChangeSection.svelte` should be added to implementation scope.                               | Declined after verification | No source file imports the component. Reviving an unused email-change flow is separate product work; Email connection continues through the active `EmailLinkingDrawer.svelte` seam. |
| Deletion was framed as a component rewrite even though the oversized treatment comes from its host GlassCard. | Accepted                    | The spec preserves DangerZone behavior and targets the wrapper and host styling.                                                                                                     |
| Storage relocation would nest its current Storage GlassCard inside Advanced.                                  | Accepted                    | Storage behavior must be separated from its card shell before embedding.                                                                                                             |
| One-active-editor behavior had no owner or existing dirty-state rule.                                         | Removed                     | The redesign preserves each editor's independent save and cancel contract rather than adding unrelated state coordination.                                                           |
| Existing small editor and unlink actions conflict with the touch-target criterion.                            | Accepted                    | Those controls are explicitly included in the 44 by 44 CSS pixel requirement.                                                                                                        |

## Standards Basis

- Apple Human Interface Guidelines, Settings: minimize settings and keep task-specific options near the task they affect. <https://developer.apple.com/design/human-interface-guidelines/settings>
- Android responsive navigation guidance: keep one navigation graph and adapt destination layout to window size. <https://developer.android.com/develop/ui/views/layout/build-responsive-navigation>
- W3C Technique C32: use responsive grid layout while keeping DOM order aligned with visual order. <https://www.w3.org/WAI/WCAG22/Techniques/css/C32>
- Project rules: `.claude/rules/4k-native-layout.md`, `.claude/rules/visual-verification-mandatory.md`, `.claude/rules/never-hand-roll.md`, and `.claude/rules/clickables-look-like-buttons.md`
