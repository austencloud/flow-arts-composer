# Create development startup

Create now loads its method chooser before the workspace editor. The editor is
requested when a method opens; direct method links start the request alongside
workspace initialization. Saved-work restoration and the existing component
bindings remain in CreateModule. A loading indicator covers the first editor
download, with an error and retry action on failure.

The application shell also defers account, support, legal, and feedback dialogs
until requested. The collection host defers its picker UI. These reuse LazyMount,
whose retained instances preserve close animations and form state. The inbox
continues mounting at startup because it owns pending message delivery recovery.

This addresses Vite development loading. The earlier
[vendor chunk change](2026-10-07-vendor-chunk-split.md) affects production builds.

## Evidence

Compared the same three source files before and after on one HTTPS Vite server
from the task worktree at port 5198. Each run used a fresh isolated Chromium
context, a 1280 x 900 viewport, and the bare `/create` route. External requests and
all non-GET/HEAD requests were blocked. No signed-in account was used.

After one discarded cold-server warmup, order was before, after, after, before.
The machine was under substantial concurrent load. Two samples per variant are
useful directional evidence, not a stable benchmark or a promised speedup.

| Metric | Before, two runs | After, two runs |
| --- | --- | --- |
| Method chooser appears | 13.25 s, 9.53 s | 9.94 s, 6.97 s |
| Splash checkpoints 84 to 88, “Resolving services…” | 3.97 s, 4.68 s | 5.48 s, 3.38 s |
| JavaScript page exceptions | 0, 0 | 0, 0 |

The chooser appeared earlier overall. **The services checkpoint did not show a
consistent improvement.** Its large shared module graph and machine contention
remain follow-up targets. The discarded cold warmup took 93.58 seconds; it is
not a valid baseline against the warm after runs.

The existing source-graph diagnostic counted 664 files / 5,758 KiB reachable
through CreateModule's static imports before, and 371 files / 3,243 KiB after.
Those are source-graph sizes, not transfer bytes or production bundle sizes.
Browser checks also confirmed that the workspace, auth sheet, support dialog,
quick feedback, feedback detail, and collection picker were not requested while
the chooser was idle. LegalSheet is still reachable through other shared owners.

## Verification

- 23 focused import-boundary tests pass, including three new guards against
  reintroducing the editor and closed dialogs into eager dependency graphs.
- Isolated browser checks pass for first Construct selection, direct Construct
  reload, feedback shortcut and draft retention across reopening, support
  reopening, guest account dialog, and URL-driven auth and legal sheets.
- No page exceptions in those interaction checks. They do not verify real
  authentication, remote feedback writes, or messaging delivery.
- A deliberately failed workspace download displays the error banner. Retry
  reloads the document and successfully loads the editor; re-importing alone
  cannot recover a failed entry cached in the browser's module map.

Local raw measurements, screenshots, and scripts are under
`E:/tmp/codex-create-speed-20261007/`. The comparison script restores the changed
files in a `finally` block after alternating only the three task-owned files.
