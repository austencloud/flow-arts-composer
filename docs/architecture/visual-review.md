# Visual Review Contract

`/ui-bust` and `$ui-bust` provide a shared, evidence-grounded visual companion to implementation. They do not replace the [visual design canon](visual-design-canon.md) or [visual verification contract](../../.claude/rules/visual-verification-mandatory.md).

## Scope and evidence

Review is read-only by default. A local visual fix gets a focused pass; a new surface or substantial restyle follows the verification contract's full responsive pass. Do not mandate the seven-viewports matrix for a tiny local fix.

Actual browser observation is required for aesthetic acceptance. Screenshots are the evidence record: a reviewer may describe a supplied frame, but may not infer interactions, unshown states, or other viewport sizes from it. Capture or persist an artifact only when the task authorizes it; do not upload externally, use AI detectors, or communicate externally.

A frame may be cropped or scrolled. Establish its visible coverage before
claiming that a page lacks a hero, product artifact, explanation, or action.
“Not visible in this frame” is not “absent from the page.” Inspect remaining
content before recommending an addition that may already exist; if unavailable,
make the recommendation conditional and mark the page-level question unassessed.

Separate findings into:

1. **Hard gates** — functional, accessibility, and canon requirements. Record the applicable requirement and evidence.
2. **Aesthetic concerns** — evidence-grounded concerns against the rubric below.
3. **Owner preferences** — a stated owner judgment, quoted or faithfully attributed; never recast it as a general rule.

Do not guess provenance, assign human/AI percentages, or use blanket bans on purple, fonts, or other stylistic tokens. The question is whether this product surface works, not who made it.

## Review and planning workflow

Rubric revision: **VR-1 (2026-09-21)**. State the audience, main task, real
content, explicit owner constraints, and success criteria before designing or
reviewing. Resolve these from the request and repository first. Ask only when a
material choice remains. Record the evidence ledger date and calibration status.

For new surfaces or substantial restyles, compare at least two genuinely
different compositions with the same real content before coding. Compact
wireframes may suffice: vary hierarchy or the relationship between the task,
artifact, and controls, not just fonts or palettes. Recommend a direction with
its tradeoff. This step grants no new authority; continue an already authorized
implementation without introducing a routine approval gate. A standalone plan
or review stays read-only. Local fixes do not require alternatives or a redesign.

On rendered output, make a brief first-impression pass before studying details:
what appears to be the subject and primary action? Then inspect the complete
relevant surface and task, not only the hero. Check whether the evidence changes
that initial judgment. This is an agent observation, not a timed human study.

Use two diagnostic questions without turning them into automatic failures:

- If the name changed, which major content and composition decisions would
  still identify this project? Familiar controls need not be unique.
- What relationship does each repeated block or large gap express? Repetition
  can aid scanning; asymmetry and novelty are not goals by themselves.

Evaluate each rubric dimension as `supported`, `concern`, or `unassessed` — never average them into a grade:

| Dimension                   | What to inspect                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Project specificity         | Artifact-first Flow Arts Composer character and task fit, not a generic template.   |
| Hierarchy                   | Clear location, primary decision, and visual emphasis.                              |
| Grouping and spacing        | Meaningful relationships, alignment, and intentional empty space.                   |
| Real evidence and artifacts | Real product content or accurate workflow representation where it informs a choice. |
| Craft                       | Legibility, containment, action affordance, stable geometry, and finishing detail.  |
| Product continuity          | Shared grammar, primitives, responsive capability, and canon continuity.            |

For each observed dimension, retain: region, screenshot/artifact reference,
viewport, state, observation, and consequence. Propose a bounded correction for
a concern; do not invent a correction for a supported decision. Mark unknown
viewport or state metadata as unknown rather than estimating it from an image.
`Unassessed` means required evidence was unavailable, not that the result passed.

For substantial designs, give a separate reviewer the brief and frames/route before the builder's rationale when runtime permits. If unavailable, use an explicit `self-review — less independent` label. This is a single independent pass, not an open-ended multi-agent loop.

Keep the criteria fixed through at most two aesthetic correction rounds. If a
material design tradeoff remains, return it to the owner rather than silently
expanding the task. Stop earlier when the scoped criteria pass. A new criterion
needs an explicit reason, not a rewritten standard that makes the output pass.
Hard requirements still follow the normal implementation/verification contract.

## Output template

```md
Mode: review | plan | refresh
Independence: separate reviewer | self-review — less independent
Brief: audience; task; success criteria; owner constraints
Rubric: VR-1; research checked: [date]; calibration: [status]
Evidence observed: route/revision; viewport(s); state(s); artifact reference(s)

Hard gates

- [pass | concern | unassessed] Requirement — evidence / limit

Aesthetic rubric
| Dimension | Status | Region + frame | Viewport/state | Observation → consequence | Bounded correction |
| --- | --- | --- | --- | --- | --- |

Owner preferences

- [stated preference or none] — source; do not generalize

Design readiness: ready | not ready | unassessed — reason and exact scope
Validation limits: [unobserved viewports/states, missing artifact, or none]
Next step: [one bounded action, or material tradeoff after round 2]
```

Use `ready` only for the named scope when its applicable hard gates are met,
required dimensions have supporting evidence, and no material concern remains.
Missing required evidence means `unassessed`; an observed material failure means
`not ready`. Screenshot-only reviews can report concerns but cannot certify a
complete surface or interaction. A plan recommends a direction; it does not
claim rendered acceptance. Never imply owner approval from an agent's review.

Report validation limits and owner preferences separately. An uncalibrated
reviewer may provide a scoped professional judgment, but cannot claim proven
reliability. Aesthetic readiness does not establish newcomer comprehension or
task usability; those require observations of actual users when claimed.

## Evidence refresh

Check [visual-design-evidence.md](../reference/visual-design-evidence.md) at the
start of substantial design/review work and for `refresh`. Follow its scoped
procedure when due. Do not hardcode model versions, repeat research for ordinary
CSS edits, or duplicate ledger research in this contract.
