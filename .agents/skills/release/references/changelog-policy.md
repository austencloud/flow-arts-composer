# User-Facing Changelog Policy

## Audience

Write for a person opening the app today. Assume little knowledge of the
repository, app structure, Kinetic Alphabet, or flow-arts terminology. State
what changed in the app and what the reader can now do or what problem no
longer happens.

## Availability Audit

Read these canonical registries:

- `src/lib/shared/environment/environment-features.ts`
- `src/lib/shared/auth/domain/guest-access-config.ts`
- `src/lib/shared/navigation/config/tab-definitions.ts`

For every candidate, trace the real route, tab, button, or automatic flow that
exposes it. `PRODUCTION_MODULES: true` is not enough. Sign-in, roles, capability
flags, and sub-tab access can still narrow availability.

Classify each candidate:

| Classification                              | Changelog rule                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Guest-visible                               | May be described without an access qualifier                                                    |
| Sign-in required                            | Include only when the text plainly says "after signing in," "signed-in accounts," or equivalent |
| Disabled, role-only, tester-only, or broken | Exclude                                                                                         |
| Availability unresolved                     | Investigate until resolved; never include on assumption                                         |

Record the decision before writing final copy:

| Candidate | Source commits/feedback | Real entry point | Availability | Include? |
| --------- | ----------------------- | ---------------- | ------------ | -------- |

The release script's commit audit supplies leads. This evidence table is the
final decision record.

## Prior-Release Check

Before calling anything new, first, official, or newly available, search all
published GitHub release bodies for the capability and its plain-language
synonyms. `gh release list` only supplies the tags; inspect the matching release
bodies with `gh release view` or `gh api`.

If the capability was announced before, describe the current work as a rebuild,
redesign, expansion, or fix only when the code and runtime evidence support that
wording.

## Writing Rules

1. Remove developer jargon. Avoid persistence, endpoints, state, components,
   services, auth, cache, and API. Prefer sign in, save, load, export, share,
   edit, create, and view.
2. Explain unfamiliar features. "Fuse combines two saved sequences" is
   meaningful. "Fuse tab rehauled" assumes prior knowledge.
3. State the observable change, not the implementation.
4. Qualify account-only behavior. Never make it sound available to guests.
5. Exclude broken behavior even when its implementation is committed.
6. Do not re-announce an existing capability as new.
7. Skip infrastructure and other work users cannot notice.
8. Make every item a specific, standalone sentence.
9. Lead with the change. Highlights must land before word ten. Keep other
   entries under 16 words when possible.
10. Remove promotional filler and feature-list slogans.
11. Link every new feature and improvement to its live production URL
    (`https://tkaflowarts.com/...`) as an inline markdown link on the
    destination word. Bug fixes only need a link when the fixed surface has a
    stable URL worth visiting.
12. **A link lands on the thing it names, not on the room that contains it.**
    `/{module}/{tab}` is the floor, not the answer. When the entry names a
    specific background, prop, sequence, scene, or preset, find the deep-link
    parameter that selects it and use it. Verify the parameter in the router or
    the component that reads it — do not guess a query string. Worked example:
    `Blossom background` links to `/settings/theme?theme=blossom`, because
    `SettingsModule.svelte` reads `?theme=` through `getShowroomThemeFromId`
    and hands it to `ThemeShowroom` as `initialPreview`. Linking that entry to
    bare `/settings/theme` drops the reader on a tab of ten themes and makes
    them hunt for the one the note is about.
13. When no deep link exists, link the nearest real surface and leave it there.
    Never invent a parameter the app does not read, and never link a `test/`
    route — those are not user-facing. A shallow-but-true link beats a precise
    lie.

### Examples

| Raw source                          | User-facing result                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `Fixed service worker registration` | Exclude                                                                       |
| `Fixed legacy auth callbacks`       | `Fixed occasional sign-in errors.`                                            |
| `Toggle cards don't register taps`  | `Toggle buttons respond better to taps.`                                      |
| `Fuse tab redesign`                 | `Fuse rebuilt: mix and reshape sequences after signing in.`                    |
| `Durable LibrarySaveService`        | `Sequences imported from printed cards now stay in your Library.`             |

Always exclude Lab and Learn work, CLI tooling, invisible sign-in
infrastructure, contributor docs, tester-only work, and anything currently
broken.

## Manifest Schema

Every final entry contains:

- `category`: `fixed`, `added`, or `improved`
- `text`: the public sentence
- `audience`: `guest` or `account` (authoring-only; stripped on publish)
- `surface`: `global` or `{ "module": "...", "tab": "..." }` (published; the
  app's "Show me" button navigates to it, so a tab beats a bare module)

Optional, on an entry the release leads with:

- `highlight`: `true` marks a headline note; a highlight is an entry, not a
  separate list of text
- `anchor`: a `data-release-anchor` value that exists under `src/`; the app
  scrolls to it and pulses it on arrival. The script refuses an anchor that
  matches nothing.
- `callout`: one plain sentence shown on arrival when there is no anchor, or
  the anchor is gone. Same jargon rules as `text`.

Use `global` only after tracing a real global control or flow. For modules that
mix guest and account-only tabs, name the exact tab.

The release script validates module state against `PRODUCTION_MODULES`, guest
tab access against `GUEST_MODULE_ACCESS`, and tab ids against the navigation
registry. It rejects disabled modules, unknown tabs, missing metadata, audience
mismatches, and account-only copy that does not plainly mention sign-in or an
account. Audit metadata is removed before publication.
