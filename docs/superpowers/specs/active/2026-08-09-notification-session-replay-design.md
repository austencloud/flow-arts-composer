---
status: active
value: null
effort: null
remaining: "Verify notification session replay tests, exact user/session routing, and current delivery evidence."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: verification
---
# Notification Session Replay

- **Date:** 2026-08-09
- **Status:** Implemented and locally verified; live playback awaits a scoped
  PostHog personal API key
- **Entry point:** `admin-user-returned` inbox notifications
- **Playback owner:** PostHog Session Replay

## Outcome

Clicking a notification that says a person is back in the app opens that
person's existing admin detail modal, selects Activity, opens the exact session
that produced the notification, and starts its PostHog replay inside TKA.

The existing event timeline remains beside the replay as the searchable,
text-based account of the session. The external PostHog action remains as a
fallback for debugging and features that are not available in the embedded
player.

## Why this target

The notification currently stores only the returning user's ID. The admin can
reach the Users module but cannot know which of that person's sessions caused
the notification. PostHog already records the browser session and owns replay
rendering, controls, buffering, and event synchronization. TKA should carry the
exact PostHog session ID through the notification and embed PostHog's supported
shared replay player. It should not create a second rrweb player.

## User flow

1. A signed-in user starts or refreshes an authenticated TKA session.
2. The client writes its current PostHog session ID to the user's private
   profile before updating the public last-activity timestamp.
3. The returning-user trigger accepts that session ID only when its private
   timestamp closely matches the activity update that fired the trigger.
4. The admin notification stores both `returnedUserId` and
   `postHogSessionId`.
5. Clicking the notification opens `/admin/users` with a reload-safe user and
   session target in the URL.
6. The existing user detail modal opens on Activity. The existing session
   inspector selects the matching session once and requests replay access.
7. The admin sees the embedded replay above the event trail.

If an older notification has no session ID, it still opens the correct user's
Activity tab and shows the available sessions.

## Ownership

| Responsibility                                         | Owner                                       |
| ------------------------------------------------------ | ------------------------------------------- |
| Capture the active replay session ID                   | Existing PostHog analytics module           |
| Store private per-user session context                 | Existing user document manager              |
| Validate session freshness and create the notification | Existing Pulse return trigger               |
| Route the notification                                 | Existing inbox notification item            |
| Restore user and session selection                     | Existing admin users panel and detail modal |
| Fetch PostHog replay access                            | Existing admin PostHog analytics service    |
| Render playback states                                 | Feature-local session replay panel          |
| Play the recording                                     | Official PostHog embedded replay player     |

URL query parameters are the handoff between the inbox and the admin module.
No new global selection store is introduced.

## Replay access and security

The browser never receives a PostHog personal API key. An admin-only server
endpoint validates the session ID, checks the Firebase admin claim, applies the
existing admin rate limit, and requests PostHog's supported recording sharing
configuration. It returns only the capability-scoped embed URL.

The endpoint accepts only the configured PostHog project and host. It does not
accept a host, project ID, or arbitrary URL from the browser. Raw PostHog error
bodies and credentials are not returned to the client or written to admin audit
metadata.

The configured personal API key needs these PostHog scopes:

- `session_recording:read`
- `sharing_configuration:read`
- `sharing_configuration:write`

TKA's content security policy permits embedded frames only from the configured
PostHog application origin in addition to its existing frame sources.

## Privacy contract

Session replay stays enabled only for authenticated app behavior that the
current PostHog setup already records. All form input values are masked before
new recordings are sent. Existing `ph-no-capture` blocks remain blocked. The
privacy policy states that signed-in usage and session recordings can be linked
to an account and that form input is masked.

Replay access remains admin-only inside TKA. A shared PostHog replay URL is a
capability URL, so the server creates it only after an authenticated admin opens
a specific session. It is never stored in Firestore or added to a notification.

## Playback states

| State          | Presentation                                                  |
| -------------- | ------------------------------------------------------------- |
| Loading        | Stable replay frame with a progress indicator and status text |
| Ready          | PostHog iframe with its native playback controls              |
| Processing     | Recording is still being assembled, with a Retry action       |
| No recording   | Clear message that this session has no replay                 |
| Not configured | Admin-facing configuration message with the required scopes   |
| Request failed | Retry action plus the existing external PostHog fallback      |

Changing sessions aborts the prior request. Returning to the session list does
not reopen the notification target. Reloading the deep link does open it again.

## Expected code scope

- `src/lib/shared/analytics/services/posthog.ts`
- `src/lib/shared/auth/services/user-document-manager.ts`
- `firestore.rules`
- `firebase-functions/src/pulse/pulseTriggers.ts`
- notification models and schemas
- `InboxNotificationItem.svelte`
- `ActiveUsersPanel.svelte`
- `UserDetailModal.svelte`
- `UserActivityAnalytics.svelte`
- `UserSessionInspector.svelte`
- the existing admin PostHog analytics service and its types
- one admin replay access endpoint
- `src/hooks.server.ts`
- the public privacy page
- focused unit, component, and Firestore rule tests

## Non-goals

- No custom rrweb playback engine.
- No live co-browsing or control of a person's active browser.
- No replay URL in Firestore, analytics events, logs, or notification data.
- No replay access for non-admin users.
- No broad redesign of the Notifications drawer or User Detail modal.
- No promise that sessions recorded before this change contain masked form
  values.

## Verification

1. Focused tests prove stale private session context cannot be attached to a
   new return notification.
2. Notification routing tests prove exact user/session encoding and the legacy
   user-only fallback.
3. Inspector tests prove the target opens once, session changes cancel stale
   replay requests, and Back to sessions does not reopen it.
4. Endpoint tests prove admin enforcement, input validation, safe PostHog error
   mapping, and support for PostHog's documented response field names.
5. Firestore rule tests prove owners can write only the new private session
   fields and cannot expand that write to unrelated data.
6. The focused type and unit suites pass.
7. A browser harness verifies loading, ready, processing, no-recording,
   configuration, and failure layouts at 1920 by 1080, 2560 by 1440, 3840 by
   2160, 1440 by 900, 820 by 1180, 960 by 412, and 375 by 667.
8. A real admin notification opens the exact user and session, and the embedded
   player loads through the configured PostHog scopes.

## Verification evidence

- 12 focused URL, response-mapping, authorization, validation, rate-limit, and
  embed-boundary unit tests pass.
- 11 Chromium component tests pass, including the exact notification target,
  one-time target consumption, and the path where PostHog has not indexed the
  session summary yet.
- 6 return-session freshness tests pass in the Firebase Functions package.
- The Firebase Functions TypeScript build passes with no output.
- All 84 core Firestore rule tests pass, including the new private replay
  context write boundary.
- Loading, ready, processing, unavailable, configuration, and error states were
  inspected in the browser. The responsive sweep at 1920 by 1080, 2560 by 1440,
  3840 by 2160, 1440 by 900, 820 by 1180, 960 by 412, and 375 by 667 showed no
  horizontal overflow.
- The repository-wide fast check remains red on pre-existing errors in other
  dirty-worktree features. It reported no errors in the files changed by this
  feature.
- A live PostHog request confirmed that the currently configured personal API
  key lacks `session_recording:read`. The UI intentionally reports the three
  required scopes until that server-side key is replaced.
