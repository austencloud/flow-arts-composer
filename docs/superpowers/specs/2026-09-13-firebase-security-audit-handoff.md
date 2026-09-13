# Firebase Rules Security Audit — Handoff (2026-09-13)

**Branch:** `claude/firebase-security-audit-03y1e7` (pushed) · **Audit work ends at
`db61e6a4`**; the branch tip is this handoff's own commit (`git log -1`).
**Base:** `c4be16199e390e8bdab766051a0042c7827b8d30` (fresh `origin/main`)
**Full findings report:** `docs/reports/opus-batch-2026-09-12/security-rules-audit.md`

## Mission

A read-only authorization audit of `firestore.rules`, `storage.rules`, the 29
`src/routes/api/**/+server.ts` handlers and the 40 `onCall` declarations under
`firebase-functions/src/`, looking for cross-user reads/writes, ownership
takeover, private→public visibility leaks, client-supplied privileged fields,
and input validation gaps. Audit-only: no production file, rule, or existing
test was changed, and no fix was applied.

It produced six ranked findings plus seven lower-severity notes. **The one thing
this session could not do was run them live** — see "Loose ends #1". That is the
entire reason this handoff exists.

Related prior spec (context, not a dependency):
`docs/superpowers/specs/backlog/2026-05-23-security-hardening-design.md`.

## Done — verified

All on `claude/firebase-security-audit-03y1e7`.

1. **Audit scaffolding** — commit `5dc7dfc3`. Five new files under
   `tests/opus-security-audit/`, isolated from `tests/integration/firestore-rules/`
   (own vitest config, own harness). Nothing shipped was touched.
   Evidence: `git show --stat 5dc7dfc3`.

2. **37 offline probes, green** — commit `bd369430` (the 37th was added there).
   `rules-source.audit.test.ts` asserts, for each finding, that the guard is
   ABSENT from the clause under test and PRESENT on the sibling clause that
   already does it right — plus one unit probe running the shipped
   `validateCardScanIngestRequest`.
   Evidence:

   ```
   $ npx vitest run --config tests/opus-security-audit/vitest.audit.config.ts rules-source
   ✓ tests/opus-security-audit/rules-source.audit.test.ts (37 tests) 25ms
     Test Files  1 passed (1)
          Tests  37 passed (37)
   ```

3. **Type-check clean over all four new TS files.** Ran `npx tsc --noEmit` with
   a temp tsconfig extending the project's, `include`-ing
   `tests/opus-security-audit/**/*.ts`, `typeRoots` pointed at the repo's
   `node_modules/@types` (needed because the temp config lives outside the repo).
   Evidence: zero output, exit 0.

4. **Prettier clean** on `tests/opus-security-audit` and
   `docs/reports/opus-batch-2026-09-12` after one `--write` pass; the 37 probes
   were re-run green afterwards.
   Evidence: `npx prettier --check …` → "All matched files use Prettier code style!"
   ESLint does not apply — `tests/` is in the global `ignores` of
   `eslint.config.js:29`.

5. **The two emulator probe files load and collect cleanly**, failing only on the
   absent listener. This is what proves they are runnable on your machine.
   Evidence:

   ```
   firestore-authz.audit.test.ts   31 collected · connect ECONNREFUSED 127.0.0.1:8080
   storage-authz.audit.test.ts     19 collected · connect ECONNREFUSED 127.0.0.1:8080
   ```

6. **Findings report** — commit `bd369430`, SHAs filled in by `db61e6a4`.

## Believed done — unverified

**Every runtime allow/deny outcome.** The six findings are labeled in the report
as MEASURED (source), MEASURED (unit), PREPARED (runtime, not executed), or
INFERRED. The rule-text and unit facts are measured. **No live allow/deny was
observed in this session.** The 50 prepared probes are precisely the verification
still owed — that is loose end #1.

Two claims lean hardest on inference and deserve your eye first:

- **F4 (scan-count inflation).** Measured: the validator accepts any well-formed
  UUID, and both the rate-limit key and the dedup document id derive from that
  client value. Inferred: the ~100 events/min/IP inflation rate and the
  idempotency bypass. Confirming it needs a running server plus a service
  account, which this audit was not authorized to use.
- **F1 (video collaborator re-share).** Measured: the rule text and the live
  feature wiring. The end-to-end "stranger can then read it" step is a PREPARED
  probe, not yet run.

Also unverified: rules-engine semantics were not re-measured for this emulator
version (that `update` merges into `request.resource.data`, that `{path=**}`
matches zero-or-more under `rules_version 2`, that an error in one `||` operand
denies). All three are documented behavior and match this repo's own comments.

## In flight

**Nothing.** Working tree is clean, all three commits are pushed. No worktree was
created (read-only audit ran in the cloud checkout). Port 5173 was never touched;
no server of any kind was started.

## Loose ends (ranked)

### 1. Run the 50 prepared probes locally — START HERE

This converts every PREPARED label in the report into a MEASURED one, before
anyone changes a rule.

```powershell
git fetch origin claude/firebase-security-audit-03y1e7
git checkout claude/firebase-security-audit-03y1e7
pnpm install --frozen-lockfile

# Pass 1 — controls green, current behavior documented.
firebase emulators:exec --only firestore,storage --project the-kinetic-alphabet `
  "npx vitest run --config tests/opus-security-audit/vitest.audit.config.ts"

# Pass 2 — the red repros for the six open findings.
$env:AUDIT_RUN_REPROS="1"
firebase emulators:exec --only firestore,storage --project the-kinetic-alphabet `
  "npx vitest run --config tests/opus-security-audit/vitest.audit.config.ts"
Remove-Item Env:\AUDIT_RUN_REPROS
```

**What each pass should show.**

Pass 1 (no env var): everything green. The `controls:` blocks prove the harness
can observe a deny; the `MEASURED:` tests assert the CURRENT (vulnerable)
behavior, so they pass today and will go red the day a finding is fixed — that is
deliberate, they are the regression tripwire.

Pass 2 (`AUDIT_RUN_REPROS=1`): the `repro(...)` tests activate. Each asserts the
SAFE behavior, so **they are expected to FAIL while the findings are open.**
A red repro here is the proof; a green one means the finding does not reproduce
and the report needs correcting. Expect roughly:

| File              | repro                                                 | Expected while open                            |
| ----------------- | ----------------------------------------------------- | ---------------------------------------------- |
| `firestore-authz` | publicSoloProps / publicHandPaths non-owner overwrite | RED                                            |
| `firestore-authz` | shop_waitlist document shape should be allowlisted    | RED                                            |
| `firestore-authz` | errorTelemetry rewritable by a stranger               | RED                                            |
| `firestore-authz` | video roster changes should be creator-only           | RED                                            |
| `firestore-authz` | usernames should need get, not list                   | RED                                            |
| `firestore-authz` | publicSoloProps delete is guarded (asymmetry probe)   | GREEN — delete already checks the stored owner |
| `storage-authz`   | pictograph-cells existing cell not replaceable        | RED                                            |
| `storage-authz`   | thumbnails published image not replaceable            | RED                                            |

If a repro comes back GREEN, that finding is wrong — say so and fix the report
rather than the rule.

Notes on the run:

- `resource-budget.md` gate: this starts an emulator, so check available memory
  first and don't run it alongside a `svelte-check`.
- `firebase emulators:exec` downloads `cloud-firestore-emulator-v1.22.0.jar` on
  first run (~60 MB) from `storage.googleapis.com`. On your machine that is fine.
- The suite uses `fileParallelism: false` + `maxWorkers: 1` so the two files
  never hit the shared emulator concurrently — see Gotchas.

### 2. Triage the six findings (all fixes are in the report, none applied)

Ranked by risk in `docs/reports/opus-batch-2026-09-12/security-rules-audit.md` §4.
Each carries the minimal request, the affected path, the impact bound, and a safe
fix with an in-repo precedent cited.

- **F1** `videos` — a collaborator or pending invitee can add any stranger to
  `collaboratorIds` (which is what grants read) and evict the other
  collaborators. Fix: constrain the roster delta to `request.auth.uid` with
  `removeAll(...).hasOnly([request.auth.uid])` in both directions.
- **F2** `pictograph-cells` + both `thumbnails` layouts — `update` is granted to
  any session including anonymous, so an EXISTING world-readable object is
  replaceable. Open create is deliberate; open overwrite is the gap. Fix: split
  create from update with `resource == null`, exactly as `prepared-qrs` already
  does in the same file.
- **F3** `errorTelemetry` — `update` has no auth predicate at all. Fix: constrain
  it to the counter-bump shape, mirroring `appMetrics`.
- **F4** `physical-cards/scan` — actor key is a client-chosen UUID. Needs a
  product call: server-attested device token, or a per-`shortCode` ceiling.
- **F5** `publicHandPaths` / `publicSoloProps` — `update` checks only the
  incoming `ownerId`, and nothing binds the doc id to its payload. Latent (no
  reader found). The strict fix changes convergence semantics — product call.
- **F6** `shop_waitlist` — unauthenticated create with no `hasOnly`. Fix: add the
  allowlist, or route through the rate-limited API like `software_submissions`.

### 3. Two product calls that block F4 and F5

F4 (device attestation vs. rate ceiling) and F5 (content-addressed convergence:
should a second publisher of an identical shape still re-stamp `ownerId`?) are
yours to decide before either rule lands. Everything else is mechanical.

### 4. Non-security incidental — `tests/config/vitest.rules.config.ts`

It sets `forks: { singleFork: true }` as a top-level key. **vitest 4.0.18 does
not recognize it** (`InlineConfig` has no `forks`), so `singleFork` is inert and
the shipped rules suite is not actually serialized. That file's own comments say
the shared emulator gets wedged by concurrent write streams, so this may explain
flakes you've seen. Not changed — not that assignment's file.
Evidence: type-checking that file under the same isolated tsconfig produces
`error TS2769: … 'forks' does not exist in type 'InlineConfig'`.

## Decisions already made

- **Assignment scope (Austen, 2026-09-12 batch brief):** "Read-only production-code
  authorization audit… No runtime/rules edits this assignment." Honored — zero
  production changes. Do not treat the fixes in the report as applied.
- **Same brief:** "Own only new isolated emulator tests under
  `tests/opus-security-audit` and your report." Honored — nothing else was touched,
  including `tests/config/` (hence loose end #4 being reported, not fixed).
- **Same brief:** "quarantine red repro tests." Implemented as the
  `AUDIT_RUN_REPROS=1` gate rather than `it.skip`, so a default run is green and
  CI-safe while the evidence stays one env var away.
- **Same brief:** "distinguish intentional guest access policy from bypass."
  Honored throughout — e.g. F2 explicitly separates the documented open-create
  policy from the undocumented open-overwrite gap. Do not re-report intentional
  guest access as a finding.
- **Same brief:** guest local retry/upgrade belongs to another agent — excluded.
- **Prior spec, still open by Austen's call:** `qr-video` PUT auth and
  `tika/sequence` auth are awaiting a product decision on guest access
  (`2026-05-23-security-hardening-design.md`, F1 and F5). Confirmed unchanged in
  current code; deliberately NOT re-reported as new findings.

## Gotchas

- **Why the cloud session couldn't run the emulator.** Egress policy answered
  **403 to CONNECT** for `storage.googleapis.com`, `dl.google.com`,
  `www.gstatic.com`, `firebasestorage.googleapis.com` and
  `firebase-public.firebaseio.com`. The Firestore emulator JAR could not be
  downloaded and was not cached in the image (`~/.cache/firebase/emulators/`
  empty). **The Storage emulator's rules runtime uses the same JAR**, so
  `--only storage` does not help either. Per the proxy README, a policy denial was
  reported rather than routed around — no mirroring or side-loading was attempted.
  None of this applies on your machine.

- **`poolOptions` does not type-check here either.** vitest 4.0.18's exported
  `InlineConfig` rejects both `forks` and `poolOptions` under the project
  tsconfig, even though the runtime accepts `poolOptions`. That is why the audit
  config uses `fileParallelism: false` + `maxWorkers: 1` — same effect
  (serialized files, one emulator client at a time), and it type-checks. Don't
  "fix" it back to `poolOptions`.

- **Long polling is load-bearing, not a style choice.** `SDK_SETTINGS` sets
  `experimentalForceLongPolling: true`, copied deliberately from the shipped
  suite. Without it the emulator write stream corrupts and writes in LATER test
  files silently fail to land. Leave it.

- **The `MEASURED:` tests are inverted on purpose.** They assert the vulnerable
  behavior so the suite is green today. When you fix a finding, its `MEASURED:`
  test goes red and its `repro` goes green — that swap is the signal the fix
  landed. Don't delete the `MEASURED:` test; flip it.

- **Type-checking the new files needs an explicit `typeRoots`.** A temp tsconfig
  outside the repo can't resolve `node_modules/@types` on its own — you'll get
  `TS2688: Cannot find type definition file for 'node'` without it.

- **Dead end already tried:** looking for a cached or vendored emulator JAR
  anywhere on the image (`find / -name 'cloud-firestore-emulator*.jar'`) — nothing.
  Don't repeat it.

- **A grep bounds F5's severity.** No reader of `publicHandPaths` /
  `publicSoloProps` exists in `src/`, `scripts/`, `firebase-functions/`, or
  `packages/` — only the writer (`public-index-syncer.ts`) and a migration
  script. If you add a consumer, F5 stops being latent.

- **Deployed rules were never inspected.** Everything is against the files at
  `c4be1619`. If production runs an older or hand-edited deployment, the live
  picture differs.
