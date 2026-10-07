---
status: backlog
value: 3
effort: L
remaining: Phase 1 shipped (requireBearerAuth in mcp-server, tests/http-auth.test.ts). Phase 0 reconciliation, Phase 2 Firestore bridge, Phase 3 act tools not started.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: in-progress
---

# Choreo — MCP Act Surface: authorization, consolidation, act tools (design)

**Triage evidence (2026-10-07):** `mcp-server/src/http/create-http-app.ts` mounts `requireBearerAuth` for `/mcp`, establishing the auth implementation. Phase 0 audit and the act-tool phases still need separate acceptance evidence.

**Date:** 2026-07-27
**Status:** Phase 1 auth implementation landed; Phase 0 verification and Phases 2–3 remain open. Phases 0–1 were specced to implementation depth; Phases 2–3 sketched for separate specs.
**Supersedes the fork left open by:** `docs/superpowers/specs/2026-07-26-choreo-mcp-and-performance-variants-handoff.md` (Part 1, "The fork that has to be decided first")
**Prerequisite already landed:** note/cue addressing moved to absolute step indices (`67d4ca3103`), so annotations no longer depend on layout. Everything below assumes that.

---

## Why this exists

The 07-26 handoff wanted an MCP surface where an agent can do to an act anything a
human can do in the UI. Investigating how to get there turned up two facts that
change the shape of the work, both verified in the code rather than assumed.

### 1. The MCP server's HTTP transport is unauthenticated

`mcp-server/index.ts` runs two transports. Stdio (≈70–73) is a local pipe used by
Claude Code — fine. The HTTP branch (≈76–142) serves `/mcp` with
`Access-Control-Allow-Origin: *` and **no authorization check of any kind**; any
POST without a session id allocates a new session and gets a live MCP server.

Today that is low-consequence: every tool is read-only domain knowledge and
pictograph rendering. There is no user data behind it and nothing to write.

It stops being low-consequence the moment act tools exist, because acts live in
Firestore under `users/{uid}`. Reaching them requires Firebase Admin credentials
in the MCP process, and an unauthenticated endpoint holding admin credentials is
a read/write path into the whole database for anyone who can reach the port.
`MCP_HTTP_PORT` defaults to `0` (off), but the deployed NSSM service sets it to
3333 precisely so claude.ai can reach it — see `reference_flow_arts_mcp_deploy`.

**So authorization is not a nice-to-have alongside act tools. It is the gate.**

### 2. There are two MCP server codebases, and they have already drifted

| | `mcp-server/` | `mcp-server-pkg/` |
|---|---|---|
| Package | `flow-arts-knowledge-mcp` 3.0.0 | `@austencloud/tka-domain-mcp` 2.3.0 |
| Last commit | `c795328af1`, 2026-07-27 | `b45281a6bb`, 2026-07-18 |
| Shape | plain source, workspace-integrated | `bin` + `files` + esbuild bundle — publishable |
| Runtime deps | full `@tka/*` workspace + `canvas` | SDK, resvg, zod only — everything else bundled |
| Transports | **stdio + HTTP** | **stdio only** |
| Launched by | the NSSM service | `.mcp.json` → `tka-domain-local` |

**These are two divergent implementations, not a source and its copy.** Verified
by content diff, not filenames:

- 8 of 9 files in `src/tools/` differ in content (only `preference-tools.ts` matches).
- Each tree has modules the other lacks. `mcp-server` alone has `beta-offset.ts`,
  `dash-location.ts`, `grid-coordinates.ts`, `prop-placement.ts`,
  `orientation-calculator.ts`, `engine-generation-adapter.ts`,
  `sequence-builder-adapter.ts`, `MCPVariationProvider.ts`, `vtg-tools.ts`.
  `mcp-server-pkg` alone has `core/loop/`, `core/constraints/`, and
  `sequence-builder.ts`.
- The architectures differ by intent: `mcp-server` delegates to the shared
  monorepo packages; `mcp-server-pkg` carries self-contained implementations so
  esbuild can bundle it into a single publishable file with three runtime deps.

So `mcp-server-pkg` is a real second distribution — standalone and
npm-publishable — whose domain code has fallen behind `mcp-server`'s. That is
still a problem worth fixing, but it is a **reconciliation of two
implementations**, not a delete. An earlier draft of this design called it a
hand-copied snapshot and planned to delete `mcp-server-pkg/src/`; that was wrong
and would have destroyed the loop and constraints modules.

**Consequence for sequencing: the HTTP transport exists only in `mcp-server`, so
the authorization work is entirely independent of this reconciliation.** Phase 1
does not wait on Phase 0.

---

## Decisions

| Decision | Who / when | Rationale |
|---|---|---|
| Full capability: compose, edit, render/export, and variants groundwork | Austen, 2026-07-27 ("All of this") | No narrowing to one verb; the design covers the whole surface and sequences it |
| Approach **C** — authenticate `/mcp` first, then full remote Firestore-backed tools | Austen, 2026-07-27 | Most capable end state. Chosen over stdio-only gating (A) and Firestore-now (B) with the "auth before feature" cost stated and accepted |
| Delegate to a **managed authorization server** via the SDK's `proxyProvider` | Austen, 2026-07-27 (took the recommendation) | We write zero token-issuing code. The alternative — implementing our own AS — is the hand-rolled option and was declined |
| One source, one build, zero copies — as the *target*, reached by reconciliation rather than deletion | Austen, 2026-07-27 ("give me the 10-year plan"); premise corrected 2026-07-27 during planning | Structural fix rather than a tactical pick. The route there changed once the two trees turned out to be divergent implementations; see Phase 0 |
| Phase 1 specced deep, Phases 2–3 sketched | Austen, 2026-07-27 | One executable plan at a time; later phases depend on decisions only makeable once auth is real |
| Robustness over speed | Austen, 2026-07-27 | Phase 1 delivers no user-visible act capability and that is accepted |

### On "are we hand-rolling something our other servers already solved?"

Asked during the brainstorm, answered with evidence, recorded here because it
will be asked again:

- **No in-house precedent exists.** Our server is registered over stdio
  (`.mcp.json`), which needs no authorization. Nothing we have built does MCP
  auth today.
- **The `authenticate` / `complete_authentication` tools visible on the Flow Arts
  Knowledge connector are not ours.** No such tool is defined anywhere in our
  source. They are claude.ai's connector-layer OAuth affordance — the same pair
  appears on Stripe, Cloudflare-observability, and Ahrefs.
- **Third-party servers do implement this properly**, but we consume them as a
  client. They are not a precedent we are deviating from.
- The chosen path (delegate verification to a managed AS) is the
  *non*-hand-rolled option, per `never-hand-roll.md`.

---

## What the MCP spec actually requires

From the 2025-11-25 specification, `basic/authorization`:

- A protected MCP server is an **OAuth 2.1 resource server**. It handles
  resource requests bearing access tokens.
- It **MUST implement OAuth 2.0 Protected Resource Metadata** (RFC 9728) to
  advertise where its authorization server lives. The document must carry an
  `authorization_servers` field with at least one entry.
- The **authorization server is a separate role** and its implementation is
  explicitly outside the scope of the specification.

That last point is what makes this tractable: we are building a resource server,
not an authorization server.

Firebase Auth cannot fill the AS role directly. It issues ID tokens to its own
SDK clients; it does not expose an OAuth authorize endpoint a third-party client
such as claude.ai could drive. Firebase remains the *user identity* (Phase 2),
reached through the AS rather than instead of it.

---

## Phase 0 — Reconcile the two servers (independent, not a prerequisite)

**Status: not plannable to step level yet.** The content diff above shows two
divergent implementations. Which one is canonical *per module* is an open
question that needs answering with evidence before any convergence is designed,
and a plan that guessed would delete working code.

**The 10-year target is unchanged:** one implementation, one build, zero
hand-synced copies. `mcp-server-pkg` should end up as packaging only —
`package.json`, `build.mjs`, `LICENSE`, `assets/`, `data/` — with its esbuild
step bundling the single source. That is this repo's own anti-drift doctrine
(*"agree by construction, not by inspection"*, per the 07-26 handoff and
`sequence-viewer-shell.md`) applied one directory over.

**What has to be established first, in order:**

1. Is `mcp-server`'s tool surface a behavioural **superset** of
   `mcp-server-pkg`'s? Same tool names is not the same answer — the two have
   different generation internals (`sequence-builder-adapter.ts` delegating to
   `@tka/sequence-engine` vs `pkg`'s own `sequence-builder.ts` + `core/loop/` +
   `core/constraints/`). Compare outputs for the same inputs, not source.
2. Do `pkg`'s `core/loop/` and `core/constraints/` have equivalents in the
   `@tka/*` packages `mcp-server` uses, or is that logic unique to `pkg`?
   `project_dual_loop_executor_sets` and
   `reference_dual_loop_executor_sets` in memory record a known app-vs-engine
   LOOP executor split — check whether this is the same split before assuming
   duplication.
3. Can `mcp-server` even be bundled standalone? It depends on `canvas`, a native
   module, which is plausibly *why* `pkg` was written self-contained. If it
   cannot, the packaging strategy — not the source — is what needs rethinking.

Only once those are answered can convergence be planned. **Do not delete
`mcp-server-pkg/src/` before then.**

**Licensing note:** both declare `Elastic-2.0`, so convergence does not change
what ships under which license. One confirmation pass with the `license` skill
afterwards, since the published bundle would then be generated from a source
tree it did not previously read.

---

## Phase 1 — `/mcp` becomes an OAuth 2.1 resource server

**Goal:** the HTTP transport rejects unauthenticated callers, fail-closed, using
the SDK's own machinery. No act capability lands here. This closes the hole and
unblocks everything after it.

### Transport migration (forced, not stylistic)

The SDK's `requireBearerAuth` is typed as an Express `RequestHandler`
(`@modelcontextprotocol/sdk@1.25.2`,
`dist/esm/server/auth/middleware/bearerAuth.d.ts`). The HTTP branch currently
uses raw `node:http` `createServer`. Using the SDK's auth therefore requires
hosting the HTTP transport on Express.

We take the SDK's path rather than reimplementing verification against the raw
server: token verification is security-critical code and the SDK ships it.

**Stdio is untouched.** It stays unauthenticated because it is a local pipe with
no network surface, and it is how Claude Code talks to the server. Any design
that authenticates stdio breaks the local workflow for no security gain.

### The pieces

| Concern | Mechanism |
|---|---|
| Discovery | `/.well-known/oauth-protected-resource` (RFC 9728) with an `authorization_servers` entry |
| Verification | `requireBearerAuth({ verifier, resourceMetadataUrl })` mounted on `/mcp` |
| Verifier | SDK `proxyProvider`, delegating to the managed AS |
| Challenge | 401 + `WWW-Authenticate` referencing the metadata URL — the SDK emits this when `resourceMetadataUrl` is supplied |

### Invariants (these are the spec, not preferences)

1. **Fail closed.** No token, bad token, or unreachable AS ⇒ 401. There is no
   "allow when no AS is configured" fallback. Such a fallback recreates today's
   open port the first time an env var is missing in deployment, which is
   precisely the failure being fixed.
2. **Auth runs before session allocation.** Sessions are keyed by
   `mcp-session-id` and created by any POST lacking one (`index.ts` ≈99–137). If
   auth ran after, an unauthenticated caller could still allocate sessions and
   exhaust memory. The middleware must sit in front of the session branch.
3. **Auth is scoped to `/mcp`.** The metadata document itself must stay publicly
   readable — clients fetch it precisely because they are unauthenticated yet.
4. **CORS stops being `*`.** An origin allowlist replaces the wildcard. A
   wildcard with credentials is the combination that turns any visited web page
   into a client.
5. **Stdio behaviour is unchanged.** Verified by test, not by reading.

### Testing

- **Unit:** the protected-resource metadata document has the required shape and a
  non-empty `authorization_servers`.
- **Unit:** the verifier is constructed against the configured AS, and a
  malformed token is rejected rather than passed through.
- **Integration (the regression guard):** a POST to `/mcp` with no
  `Authorization` header returns 401 and allocates no session; the same POST with
  a valid token reaches the MCP server. This test *is* the proof the
  vulnerability is closed, and it is the one to write first.
- **Integration:** stdio still connects and lists tools with no token.

### Done when

`MCP_HTTP_PORT=3333` with no credentials returns 401, the same request with a
valid token succeeds, stdio is unaffected, and the integration tests above run in
CI.

---

## Phase 2 — Firestore bridge and identity (sketch)

Firebase Admin enters the MCP process. The access token verified in Phase 1
resolves to a **uid**, and that uid — not a configured constant — scopes every
read and write. That ordering matters: identity derived from the token means the
surface is correct for any user by construction, rather than hardcoded to
Austen's account and later retrofitted.

Existing precedent to respect: the server's current user data lives in a local
JSON file with atomic writes (`mcp-server/src/core/user-presets/storage.ts`).
Acts do **not** follow that pattern — they already live in Firestore and the app
is their other client.

Open, to settle in that spec: how Admin credentials are provisioned and stored;
whether reads are scoped by security rules or by admin bypass plus explicit uid
filtering (the latter is easy to get wrong and needs a single chokepoint).

## Phase 3 — The act tool surface (sketch)

Tools over the **shared pure functions**, never a reimplementation:
`planSheet` / `planBands` / `getSheetPageLayout` / `SHEET_CELL_VISIBILITY` /
`buildActSequence`. The 07-26 handoff is emphatic and correct: a third surface
that re-derives layout will drift from the preview and the PDF exactly the way
page chrome did.

Shape, from the 07-26 handoff and unchanged by this design:

- `create_act` / `get_act` / `list_acts` / `save_act`
- `act_add_sequences(ids[], atIndex?)` / `act_remove_sequence` / `act_reorder`
- `act_set_layout(patch)` — one partial-patch tool covering every toggle
- `act_set_header(patch)`, cue and note tools
- `export_act_pdf(actId)` — the real porting work; the exporter is browser-coupled
- `render_act_page(actId, pageIndex)` → PNG, so an agent can *look* at a sheet
- `animate_act(actId)` via `buildActSequence`

Then performance variants — **their own brainstorm first**, per
`brainstorming-gate.md`. Part 2 of the 07-26 handoff is a design sketch, not a
spec.

---

## Risks

| Risk | Handling |
|---|---|
| Express migration regresses the working HTTP transport | Integration test asserts a valid-token request still reaches the server; the stdio test proves the local path is untouched |
| Managed-AS vendor choice not yet made | Phase 1 depends on the *role*, not the vendor. `proxyProvider` isolates the choice to configuration; picking the vendor is the plan's first task |
| Consolidation loses work unique to `mcp-server-pkg/src/` | **This risk already fired during planning.** A content diff showed two divergent implementations, not a copy; Phase 0 was rewritten from "delete pkg/src" to an evidence-gathering phase and is no longer a prerequisite for anything |
| Phase 1 ships no visible capability | Stated and accepted. Robustness over speed |

## Explicitly out of scope

- Performance variants (own brainstorm, own spec).
- Making the MCP server an authorization server. Declined as hand-rolled.
- Authenticating stdio.
- Any act tool before Phase 1 lands — the ordering is the point of the design.

## Related

- `docs/superpowers/specs/2026-07-26-choreo-mcp-and-performance-variants-handoff.md`
- `.claude/rules/never-hand-roll.md`, `.claude/rules/research-before-building.md`
- `.claude/rules/brainstorming-gate.md`, `.claude/rules/verification-protocol.md`
- MCP specification 2025-11-25 → `basic/authorization`
- Memory: `reference_flow_arts_mcp_deploy`, `reference_flow_arts_mcp_host`
