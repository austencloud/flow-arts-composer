---
status: backlog
value: 4
effort: S
remaining: Get Austen's verdict on the rules table and worktree contradiction before a scoped modernization sweep.
depends_on: 'external: Austen verdict on modernization table and worktree contradiction'
plan_path: ''
tags:
- meta
- rules
- tokens
- fable5
last_triaged: '2026-10-07'
work_state: blocked
---

# Rules Modernization for the Claude 5 Era — Design

**Date:** 2026-08-01
**Status:** Proposal, awaiting Austen review
**Author:** Claude (Fable 5)

> **Policy update, 2026-08-07:** The `never-hand-roll` portion of this proposal
> is superseded by Austen's approved "one concept, one owner" rule. Do not
> restore percentage thresholds or require external package research for every
> feature component. New components and creative work are allowed; parallel
> behavior owners are not.

## Why

Anthropic's official [Prompting Claude Fable 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5) guide says, verbatim:

> "Skills developed for prior models are often too prescriptive for Claude Fable 5 and can degrade output quality. Review and consider removing older instructions if default performance is better."

> "Instruction-following is improved enough that you can steer most behaviors with a brief instruction rather than enumerating each behavior by name."

> "A short brevity instruction is as effective as listing each pattern."

> "Capability improvements at this level are also a good prompt to re-evaluate which instructions, tools, and guardrails are still needed."

Our `.claude/rules/` corpus is 32 files, **18,116 words (~24k tokens)**, loaded into every session. With project CLAUDE.md (1,062 words), global CLAUDE.md (945), and the memory index, every session starts ~28-30k tokens deep in standing instructions before the first user message. Across 8 parallel sessions this is a real cost multiplier, and per the official guidance, parts of it now actively work against the model they run on.

## The double-charge finding

The Claude Code harness system prompt now ships, natively, near-verbatim versions of the exact behaviors several rules were written to force:

| Harness now ships | Rule that duplicates it |
|---|---|
| "You are operating autonomously... asking 'Want me to?' will block the work... End your turn only when the task is complete or you are blocked on input only the user can provide" | `autonomy-and-completeness.md` (781 words) |
| "Report outcomes faithfully: if tests fail, say so with the output... when something is done and verified, state it plainly" | large parts of `no-fabrication.md`, `no-assumption-without-evidence.md` |
| "Before running a command that changes system state, check that the evidence actually supports that specific action" | `no-assumption-without-evidence.md` core |
| "When the user is describing a problem... the deliverable is your assessment. Report your findings and stop" | boundary sections across several rules |

These rules were right when written. For Fable sessions they are now paid twice, and the second copy is the Opus-4.x-rhetoric version (all-caps, threats, forbidden-pattern tables) that the official guide says can degrade output.

## What must NOT be lost

Three categories survive intact because they are not model babysitting:

1. **Project knowledge (K):** facts no model knows innately. The 4K viewport table and 1680 seam, chip-primitive routing, the viewer-shell contract, the Blender pipeline, TKA domain guardrails, resource-budget numbers, dev-server ownership. This is documentation, not steering.
2. **Multi-agent operational safety (O):** shared-index scoped commits, one-svelte-check-machine-wide, don't-kill-other-sessions. Driven by the environment (8 parallel agents), not by any model's weaknesses.
3. **Recent, model-independent incidents:** visual-verification-mandatory earned its place on 2026-07-26 in the current era. Compress its narrative, keep its teeth.

Subagent caveat: Sonnet/Haiku executors inherit these rules too and regress more than Fable. The mitigation is format, not deletion: keep every hard constraint as a compressed imperative (which weaker models also follow when specific), drop the rhetorical escalation, incident retellings, and enumerated forbidden tables (which is what degrades Fable).

## Per-file verdicts

Verdicts: **K** keep (trim prose) · **C** compress to a short steer · **M** merge · **R** reconcile contradiction. Targets are approximate.

| File | Words | Verdict | Target | Notes |
|---|---|---|---|---|
| visual-verification-mandatory | 1661 | K | ~800 | Absorb `verification-protocol.md`; keep viewport table, tool table, look-for list; cut the 07-26 narrative to two lines |
| fable-routing | 1079 | K | ~800 | Current-era; compress the Creators-run stories to bullets |
| never-hand-roll | 1066 | K | ~500 | Preserve the approved one-concept/one-owner policy, semantic internal search, and reuse/extend/compose/create decision. External research applies to shared infrastructure, not every component. |
| tka-domain | 885 | K | ~800 | Domain knowledge; light trim only |
| 4k-native-layout | 844 | K | ~550 | Keep viewports/mechanisms/rules; cut the glossary story |
| crossfade-primitive | 785 | K | ~450 | Keep routing + first-time-failure checklist |
| autonomy-and-completeness | 781 | C | ~120 | Harness ships it; keep the 4 physical blockers + slurp-context permission |
| fast-iteration-loop | 760 | K | ~450 | Keep capture-once, the table, where-time-goes verdicts |
| no-fabrication | 718 | C | ~250 | Keep biographical-facts ban + 4 evidence buckets as one-liners |
| commit-only-your-own-changes | 700 | K | ~300 | Environment-driven; keep pathspec pattern + pre-commit check |
| chip-primitives | 682 | K | ~400 | Primitive table + routing + keep-separate are knowledge |
| resource-budget | 622 | K | ~350 | Gates + numbers survive |
| expert-routing | 619 | K | ~350 | Routing tables stay; audit story goes |
| sequence-viewer-shell | 608 | K | ~350 | Contract + prop seam |
| no-layout-shift | 583 | K | ~350 | The 6 techniques are knowledge |
| blender-first-3d-scenes | 541 | K | ~450 | Pipeline facts |
| component-test-discipline | 455 | C | ~120 | Test-on-fix; CI stays non-blocking; no coverage chasing |
| visualization-routing | 434 | C | ~150 | Routing table + companion-retired line |
| mcp-ground-truth | 404 | M | ~260 | Absorb `verify-at-canonical-source` (328); keep claim-type table compressed. Real risk is unchanged: TKA truth is not in training data |
| effects-earn-their-slot | 379 | K | ~200 | Uniqueness bar + registry pointer |
| simplified-word-display | 361 | C | ~120 | One invariant + utility path |
| research-before-building | 352 | M | — | Into `reuse-first.md` |
| verification-protocol | 343 | M | — | Into visual-verification-mandatory |
| no-assumption-without-evidence | 335 | C | ~80 | Keep backgroundType-vs-3D permanent distinction; harness covers the rest |
| verify-at-canonical-source | 328 | M | — | Into mcp-ground-truth |
| clickables-look-like-buttons | 310 | C | ~120 | |
| worktree-workflow | 276 | R | ~200 | See contradiction below |
| clickable-links | 259 | K | ~150 | |
| brainstorming-gate | 224 | K | ~120 | Austen's explicit workflow gate; keep as a short imperative |
| no-checkboxes | 217 | C | ~80 | |
| sequence-generation | 120 | K | 120 | Already lean |

**Result: 32 files → 27 files, ~18.1k → ~9.0k words (~24k → ~12k tokens). ~12k tokens saved per session, every session.**

## The contradiction Austen must adjudicate

Global `~/.claude/CLAUDE.md` says worktrees are **the DEFAULT** for any branch or parallel work (policy hardened 2026-07-14). Project `worktree-workflow.md` + `resource-budget.md` say **work on main, never create a worktree unless explicitly requested in the current conversation** (post-2026-07-17 incident). Both claim to be the law. The project rule appears newer; if it is the intended policy, the global CLAUDE.md worktree section should be rewritten to say "per-project rules govern; tka-platform works on main." If not, the project rule needs the update. One of them is lying to every session.

## Sample rewrites (the shape of the whole sweep)

**`autonomy-and-completeness.md` (781 → ~120 words):**

> # Autonomy — ENFORCED
> Finish the task in this turn. The only legitimate blockers: a secret only Austen has, a broken external dependency, directly contradictory instructions, or a permission-gated destructive op. "This is getting complex" is not a blocker.
> Standing permission to slurp context: read 20 files, run 15 greps, spawn parallel subagents. One tool call costs pennies; one question that a grep could have answered costs Austen an hour. Prefer the tool call, then either decide or present one informed recommendation.
> Multi-pronged work defaults to parallel subagents (`fable-routing.md` for tiers).

**`no-assumption-without-evidence.md` (335 → ~80 words):**

> # Runtime Claims Need Runtime Evidence — ENFORCED
> State runtime facts only with tool output from this turn proving them (DOM query, console log, test run, screenshot). Correlation from adjacent signals is not evidence.
> Permanent distinction: `backgroundType: "ocean"` in localStorage is the 2D CSS theme. The 3D ocean scene is a Threlte environment inside Viewer3DCanvas that only loads with the 3D pane open. Fully independent systems; one never implies the other.

**Superseded sample. Use the current `never-hand-roll.md` instead:**

> # One Concept, One Owner
> New feature components may compose or present existing capabilities. Before
> creating shared behavior, search by meaning, identify its owner, then reuse,
> extend, compose, or establish a new owner. Do not create a parallel behavior
> owner because the desired presentation looks different.

## Rollout

1. Austen reviews this table, vetoes any verdict, and rules on the worktree contradiction.
2. One Sonnet executor session performs the sweep from this table, one commit per rule file (scoped pathspec), with the merged files created and their sources deleted in the same commit.
3. Incident histories are not deleted: each trimmed rule keeps a one-line `(incident: YYYY-MM-DD, <commit/anecdote>)` pointer. Anyone who needs the full story has git history.
4. Fable session reviews the final diff against this table before push.
5. Global CLAUDE.md worktree section updated per Austen's ruling (his file, his call, one edit).

## Classifier-hygiene audit (bundled, free)

Per the official guide, instructions that tell the model to echo or transcribe its reasoning can trigger `reasoning_extraction` refusals and silently fall back to Opus 4.8. Sweep the rules/skills for "show your thinking / explain your reasoning in the response" phrasing during the same pass. (Initial read: our rules ask for *evidence*, not reasoning transcripts, which is fine. Worth the grep anyway.)
