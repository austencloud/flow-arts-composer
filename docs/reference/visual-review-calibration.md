# Visual Review Calibration

Calibration makes recurring review judgments inspectable without treating a past reaction as a universal visual ban.

- Status: **NOT CALIBRATED** (2026-09-21).
- Current rubric: **VR-1**, defined in the [review contract](../architecture/visual-review.md).
- Reproducible labeled frames: **0**. Held-out evaluations: **0**.
- The historical case below is context, not an evaluated calibration example.

Even a labeled corpus does not establish reliability until the reviewer has
been tested on independent examples. Record the scope and uncertainty of any
later result; never claim universal accuracy.

## Labels and hypotheses

Record Austen's actual wording or explicit approval/rejection as an **owner label**. An agent's analysis is an **agent hypothesis**. Never promote a hypothesis to an owner preference, and never infer broad rules from one case.

Known text-only historical case, 2026-09-21:

- **Owner label:** an About-page result was rejected: “this whole thing looks like it was AI generated ... immediately judge it.”
- **Observed description, not a benchmark frame:** purpose/scope/creator/next-step blocks repeated uppercase eyebrows, large serif headings, gray paragraphs, huge gaps, and creator links stranded right on a starfield.
- **Interpretation boundary:** individual diagnoses are agent hypotheses only; this does not ban uppercase eyebrows, serif headings, gray paragraphs, spacing, starfields, purple, or any font in general.

The visual artifact is absent from persistent authorized storage. Refer to this case as historical text-only; do not copy a screenshot from Temp, and do not use it as a held-out benchmark.

## Reproducible reference records

Every future reference record uses these fields:

| Field       | Record                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------- |
| Identity    | id, date, route, revision                                                                           |
| Observation | viewport, state, artifact, persistent authorized path                                               |
| Judgment    | owner label/judgment, source of that label, who recorded it, reason, rubric dimension(s), confounds |
| Use         | role (`calibration`, `held-out`, or `control`), accepted/rejected status                            |

Add both accepted and rejected cases after they are explicitly labeled, plus conventionally accepted controls once labeled. A persistent artifact path must be authorized; absence remains an evidence limit.

## Evaluation discipline

Freeze the rubric before evaluation. Hold out examples before criteria edits; do not tune against the held-out set. For each frozen run, report raw per-case disagreements, false accepts, false rejects, sample size, and denominator (for example, `false accepts: 1/8`). Do not average away disagreement and do not report reliability before the corpus supports it.

Give the reviewer the brief and frames without owner labels, prior agent
diagnoses, authorship claims, or the builder's defense. Keep human labels in a
separate answer key for comparison afterward. Record rubric revision, evaluator
runtime/model, instructions, observed artifacts, and any repeat runs. A change
to these can invalidate comparisons; model names are run metadata, not policy.

Use owner-rejected cases as the denominator for false accepts and owner-accepted
cases for false rejects. List `unassessed` outcomes separately and report
coverage as decided cases / all cases. Missing examples are not successes or
zero error rates. Repeat a subset to expose unstable judgments and preserve
disagreement between people rather than treating all taste as one ground truth.

Do not cherry-pick spectacular failures. Include ordinary good interfaces and
conventional accepted controls, different viewport/state types, and relevant
product surfaces. These labels measure agreement with the named people, not
human authorship, objective beauty, or actual task success. Newcomer usability
tests answer a separate question and require their own authorized scope.

When a rubric change is justified, record the reason, freeze the new version, and reserve newly labeled examples before evaluating it. Calibration improves review consistency; it does not override owner autonomy or the hard gates in the visual-review contract.
