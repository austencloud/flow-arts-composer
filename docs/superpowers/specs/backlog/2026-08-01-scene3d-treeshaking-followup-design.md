---
status: backlog
value: 3
effort: S
remaining: Verify the current @austencloud/scene-3d package exports and sideEffects metadata, then measure boot JS before deciding the follow-up.
depends_on: ''
plan_path: ''
tags:
- performance
- packages
- three
last_triaged: '2026-10-07'
work_state: unverified
---

# @austencloud/scene-3d Tree-Shaking Follow-Up — Design

**Origin:** recorded 2026-08-01 as the systemic remainder of the shipped
2026-06-16 performance audit (boot JS + landing LCP). The audit's three scoped
fixes shipped; this is the package-level work it deliberately deferred.

## Problem

Installed `@austencloud/scene-3d` 0.1.6 lacks `sideEffects` metadata and useful
deep exports, so three.js boot code welds into the app bundle instead of
tree-shaking. The package lives in the shared-packages checkout (see memory
`reference_backgrounds_package_repo` for the repo location pattern).

## Deliverables

1. `sideEffects: false` (or a scoped array) in the package's package.json,
   verified against any genuinely side-effectful modules.
2. Deep export paths for the subsystems the app actually imports, so unused
   scene code stays out of the bundle.
3. Version bump + release + app dependency update.
4. Before/after boot-JS measurement in the app (the audit's methodology).
