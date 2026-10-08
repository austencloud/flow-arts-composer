---
status: active
value: null
effort: null
work_state: unverified
remaining: Verify Chrome taskbar identity scripts with AST parsing and disposable shortcut installation before rollout.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Chrome Taskbar Identities

## Problem

Austen's pinned Chrome, everyday Chrome windows, and the shared DevTools Chrome
used the same visible icon while carrying mismatched or ambiguous Windows app
identities. The taskbar could show several indistinguishable Chrome entries.

## Decision

Keep Chrome Stable for both uses. Give the shared debugging browser a dedicated
non-default Chrome shell profile named `Agent DevTools`, with a violet
code-window fallback icon, while Austen's shortcut targets the real `Default`
profile and its native profile image.
Edge and a second Chrome release channel are not part of this design.

The existing `scripts/launch-chrome-debug.ps1` remains the sole owner of agent
browser startup. A companion installer,
`launchers/install-chrome-profile-shortcuts.ps1`, owns the Windows shortcut
metadata. This extends the existing launcher instead of adding another browser
startup path.

## Identity mapping

| Use | Chrome arguments | AppUserModelID | Icon |
| --- | --- | --- | --- |
| Austen | `--profile-directory="Default"` | `Chrome.UserData.Default` | Native `Default\Google Profile.ico` |
| Agent DevTools | `--user-data-dir="%USERPROFILE%\.claude\chrome-profile" --profile-directory="Profile 1"` | `Chrome.chromeprofile.Profile1` | Violet fallback; profile badge while running |

Chromium derives the custom-profile portion of its Windows identity from the
sanitized user-data and profile directory basenames. The shortcut must carry
the same ID as the resulting browser window or Windows will split it again.
Chrome's generic shortcut has AppUserModelID `Chrome`; its profile-picker window
uses `Chrome.UserData.SystemProfile`. Neither matches Austen's live `Default`
profile, so neither is a valid daily pin.

## Profile migration

The previous agent data under the custom user-data directory's `Default`
folder moves to `Profile 1`. Cookies, local storage, and authentication remain
inside the same user-data directory. `Local State` records the visible name
`Agent DevTools`, the violet theme, and the dragon avatar. The launcher rejects
a process on the debug port if either the user-data directory or internal
profile directory differs from the expected values.

## User experience

The installer creates two desktop shortcuts without restarting Explorer or
altering the current taskbar. Austen performs the only foreground step: unpin
stale Chrome entries, then pin `Austen - Chrome` and
`Agent DevTools - Chrome`. The agent entry remains visually distinct even when
both Chrome sessions are open.

## Verification

- Parse both PowerShell scripts with the PowerShell AST parser.
- Run the shortcut installer against a disposable desktop directory, then read
  its target, arguments, AppUserModelID, relaunch command, and icon resource.
- Inspect the generated ICO frames at taskbar sizes.
- Launch or reuse the debug browser twice and prove that the listener PID is
  stable and its command line contains both expected profile arguments.
- Confirm the Chrome debug endpoint responds on port 9222.

## Rollback

Unpin the two shortcuts, pin the standard Chrome shortcut again, and restore
the backed-up agent `Local State` plus the original profile directory name.
No everyday Chrome data is stored in the agent user-data directory.
