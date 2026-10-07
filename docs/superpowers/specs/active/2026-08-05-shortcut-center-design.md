---
status: active
value: null
effort: null
remaining: "Verify Ctrl+K and footer launch, binding display, history validation, and visual interaction in the current Shortcut Center before implementing gaps."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Shortcut Center

**Status:** approved 2026-08-05

## Outcome

Keyboard shortcuts remain a power feature, but they stop living as a Settings
destination. One Shortcut Center becomes the only place that explains, edits,
disables, and resets bindings.

The center opens over the current workflow from `?` or the command palette. It
uses the active module to put relevant commands first. Users no longer leave
their work, hunt through Settings, or receive different answers from separate
help and customization surfaces.

## Current failures this replaces

- The Settings panel has a hard-coded context list. It omits `choreo`, which
  hides 23 registered commands.
- `ShortcutsHelp.svelte` reads registered defaults instead of effective
  bindings. It shows stale keys after customization and still shows disabled
  commands.
- Search ignores key combinations and contexts, then leaves matching groups
  collapsed.
- Conflict detection blocks a binding, but the existing Replace and Swap
  callbacks are not connected.
- The desktop editor has nested interactive semantics and incomplete focus
  behavior.
- The panel is capped at 1000px and never recomposes for large displays.
- Saved bindings are parsed from local storage without validating their shape.
- The registry is a snapshot. A command registered while the surface is open
  does not appear until the component remounts.

## Product references

- Figma keeps shortcut discovery attached to the current canvas, groups by
  category, reflects keyboard layout, and can highlight shortcuts as they are
  used.
- Linear opens searchable shortcut help from `?`.
- VS Code searches by command or key, filters changed bindings, and exposes
  conflict inspection and reset actions.
- Premiere treats shortcut assignment as a professional editing surface with
  clear conflict handling and hardware-layout awareness.

TKA needs the discovery speed of the first group and the trustworthy editing
behavior of the second. It does not need two competing surfaces.

## Entry points

1. `?` opens the Shortcut Center without changing modules.
2. Command Palette > Show Keyboard Shortcuts opens the same center.
3. Settings > Preferences includes a visible Keyboard shortcuts launcher.
4. The desktop sidebar footer includes a quiet `Jump to` button in Support's
   former utility slot. The button does not carry a permanent shortcut badge or
   selected-state accent. Its tooltip and `aria-keyshortcuts` expose `Ctrl+K` or
   `⌘K`, and the open surface repeats the binding where it is useful. Support
   remains in the account popover.
5. Existing feature actions that call `keyboardShortcutState.openHelp()` open
   the same center.
6. The old Settings > Keyboard tab is removed.
7. A stale Settings `keyboard` tab value falls back to Profile and opens the
   center once, preserving old local navigation state without keeping the tab.

## Jump to

The former Command Palette becomes `Jump to`: a quick navigator with a small
action layer, not a second sidebar and not a second shortcut editor. It keeps
the shared `BaseModal`, `ModalHeader`, `PanelSearch`, and
`KeyboardKeyDisplay` primitives.

Footer and keyboard launches open the same centered surface. Launch method
never changes its size or position. Compact phone layouts use the full-height
modal treatment, while short landscape layouts reduce header and row height
without clipping the result list.

An empty query never dumps every module. It shows up to five recently visited
destinations, then up to three often-used destinations that are not already in
Recent. The current destination is excluded. Frequency uses recency decay and
does not appear until a destination has enough visits to be meaningful. A
small `Actions here` group holds context-relevant actions such as Keyboard
shortcuts. With no history, the surface asks the user to search instead of
padding the list with duplicate navigation.

Typing searches every accessible destination as a breadcrumb, for example
`Create › Assemble`, `Browse › Library`, or `Settings › Account`. Actions are
grouped separately. Modules with tabs contribute their accessible tabs rather
than a redundant module-only result; single-surface modules contribute one
destination. Hidden, disabled, role-gated, and guest-gated destinations never
appear.

Ordinary successful navigation records device-local visits whether the user
clicked the sidebar, used browser history, followed a deep link, or launched a
destination from Jump to. The palette does not treat its own execution history
as navigation history. Stable deeper locations may opt into the same destination
contract when they have a label and a deterministic way to reopen; ephemeral
drawers, modals, and unsaved state are excluded.

Destination registration follows the reactive navigation list after
authentication and feature flags settle. Hidden destinations are removed and
newly available destinations appear without another page load. Keyboard
shortcuts remains an action that opens the canonical Shortcut Center.

### Visit persistence

Visit history uses a versioned local payload scoped to the current Firebase
identity, including anonymous identities. Each destination stores its visit
count and last successful visit time. Rapid duplicate records are collapsed so
HMR, redirects, and repeated history synchronization do not inflate frequency.

Malformed payloads reset without blocking navigation. Reads validate the
schema, permission checks run again before display, and stale destination IDs
are ignored. History is never queried from PostHog or synchronized to Firestore.

## Surface

The center uses the shared native-dialog `BaseModal` with `ModalHeader`. It is a
large work surface, not a stack of glass cards.

The header says what the surface does. The control row contains:

- Search commands or keys
- `This area`, `All`, and `Changed` views via `SegmentedControl`
- A visible changed count and `Reset changes` action when needed

`This area` includes global commands plus commands active in the module that
was open when the center launched. `All` contains every registered command.
`Changed` contains reassigned and disabled commands.

Search indexes:

- label
- description
- command id
- every context label
- effective key combination
- default key combination

Matching sections open automatically. Context groups are derived from registry
data and use readable fallbacks for unknown future contexts, so adding a context
cannot silently hide its commands.

## Command row

Each row shows the command name, one-line explanation, every context where it
works, and the effective binding. Changed and Disabled are explicit states.

The edit action and reset action are siblings. No button contains another
button. Reset stays visible whenever a binding is changed, including keyboard
focus and touch input.

Selecting a row opens its editor inside the same Shortcut Center. The editor
shows current and default bindings, then listens for a new combination only
after the user selects `Record new keys`. While recording, the global shortcut
dispatcher is suppressed so the command being typed cannot execute behind the
editor.

## Conflicts

Warnings in non-overlapping contexts may be saved. Errors in overlapping
contexts offer:

- **Choose another:** record a different combination.
- **Replace:** assign the new combination and disable every overlapping command
  using it.
- **Swap:** exchange bindings when exactly one overlapping command is involved
  and the other side of the swap has no third conflict.

All replacement and swap mutations are written as one settings update. The UI
does not briefly persist an invalid intermediate keymap.

## Persistence

The existing `tka-keyboard-shortcuts-settings` key stays in place, so current
customizations survive the redesign.

The stored payload gains a schema version. The reader accepts the existing
unversioned shape, validates boolean preferences and binding records, discards
malformed entries, and writes the current version on the next change.

Bindings remain device-local by design. Keyboard hardware, operating system,
and layout can differ across devices. The center labels this as `Saved on this
device` instead of implying account sync.

## State and services

- `keyboardShortcutState` remains the owner of persisted shortcut preferences
  and open/closed UI state.
- A navigation visit persister owns versioned, identity-scoped destination
  history. Pure ranking functions select Recent and Often used entries.
- The command-palette service owns destination/action registration, fuzzy
  search, and presentation grouping. It does not own navigation history.
- `ShortcutRegistry` gains a subscription boundary and emits after add, remove,
  and clear operations.
- `ShortcutCustomizer` remains the binding authority. It gains full conflict
  queries plus atomic Replace and Swap operations.
- A pure shortcut-center catalog module owns search indexing, context labels,
  view filtering, grouping, and stable ordering.
- The center subscribes on mount and refreshes after every binding mutation.

## Reuse decision

Internal searches covered modal/dialog/overlay, search/filter/command, and
segmented/tab primitives. External research covered current Figma, Linear,
VS Code, and Premiere behavior.

- **Reuse** `BaseModal`, `ModalHeader`, `SegmentedControl`, `PanelSearch`,
  `PanelButton`, and `KeyboardKeyDisplay`.
- **Refactor** `ShortcutRow` and `ConflictWarning` because they already model
  the correct domain objects but expose incomplete interaction semantics.
- **Replace** `ShortcutsHelp`, `KeyboardShortcutsTab`,
  `ShortcutContextSection`, and `ShortcutKeyCapture`. Their responsibilities
  move into the single center and editor.
- **Create** `ShortcutCenter` and `ShortcutBindingEditor` because no existing
  component combines the live registry, contextual discovery, and binding
  mutation. They follow the shared modal and control primitives rather than
  creating another shell.

## Responsive behavior

- Compact widths use one scrollable command column. Selecting a command moves
  the editor above the list so the active task stays visible.
- Laptop and 4K-at-200% widths use a list plus a fixed editor rail.
- Wider 4K viewports increase the command grid to two columns while keeping the
  editor rail readable. The modal width grows with the viewport instead of
  stopping at 1000px.
- The surface stays available on hybrid touch devices. A coarse pointer does
  not prove that no hardware keyboard is attached.

## Accessibility

- Native dialog semantics, escape handling, focus containment, and focus return
  come from `BaseModal`.
- The title is connected with `aria-labelledby`.
- Search and view controls have explicit accessible names.
- Rows use real buttons with sibling actions.
- Conflict text uses `role="alert"`; save feedback uses `role="status"`.
- Recording instructions update through a live region.
- Every essential action is at least the shared 44px target floor.
- Motion is removed under `prefers-reduced-motion`.

## Error feedback

Service initialization failure blocks the surface and uses the shared error
handler with the `keyboard / shortcut-center / initialize` context. Failed
binding mutations keep the editor open, preserve the recorded keys, and show a
specific user-facing error.

An empty search is ordinary and receives an inline result message. It is not
reported as an application error.

## Verification

### Unit

- Versioned visit-history validation, malformed payload recovery, identity
  scoping, rapid duplicate collapse, and bounded storage
- Recent and recency-decayed frequency ranking, including current and duplicate
  exclusion
- Destination search by module, tab, description, and keyword
- Permission filtering for role, feature-flag, and guest access changes
- Legacy and malformed settings payload migration
- Search by name, key, context, and default binding
- This-area and Changed filtering
- Dynamic context grouping with no hard-coded allowlist
- Conflict enumeration, Replace, Swap, and third-party swap blocking
- Registry subscription notifications

### Runtime

- Navigate through ordinary sidebar tabs, reopen Jump to, and prove those exact
  destinations appear in Recent without having been launched from Jump to
- Revisit one destination enough times to prove it enters Often used without
  duplicating Recent or the current location
- Change identity or effective permissions and prove another identity's or a
  hidden destination's history never renders
- Open from the footer and `Ctrl+K` and prove both launches share the same box
  coordinates
- Registry ids and rendered command ids are equal, including all 23 Choreo ids
- Reassign a harmless command and prove old key stops while new key runs
- Disable, reload, and prove the command stays disabled
- Open the center again and prove every surface shows the effective binding
- Register a command while open and prove it appears without remounting

### Visual and interaction

Verify 1920x1080, 2560x1440, 3840x2160, 1440x900, 820x1180, 960x412, and
375x667. Inspect the quiet footer launcher, centered Jump to composition,
Recent/Often used grouping, search results, scroll ownership, focus order,
recording, conflicts, empty search, Changed view, and long destination labels.
