# Composition study record

Date: 2026-09-21. Content revision: `about-composition-content-v1`.
Status: ready for local composition review; not production-approved.
Owner preference: not recorded.

This follows the six-site reference board. Austen said, “they all seem AI
generated now that I read them.” That is a reaction to the set in this
conversation, not six binary rejection labels and not an authorship finding.
The new task explicitly authorizes three versions of a single section with
unchanged words and assets. It does not authorize changing the live About page.

## Fixed input

The exact strings, URLs, image dimensions, and alt text are in
[content.json](content.json). The audience, alternatives, criteria, and known
confounds are in [brief.md](brief.md). Palette and type family are held constant.
Arrangement, visual order, relative image size, and text measure may vary.

Existing source assets, not generated replacements:

| Asset                                                     | SHA-256                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `static/images/austen-fire.webp`                          | `D5D19EB21C2ED709BA9A08F3E7D93DE57E4DC7559CBC43976B03D875FFE62C76` |
| `static/guide/level-1/images/16-count-sequences/EΔQY.png` | `89E6A8908292F8629C0A19244A6BEF62611BFE105832AB8E6352D25E6E752B17` |

The study uses the existing dev server's root asset URLs. The source hashes
identify which versions were inspected; later asset changes need a new content
revision and renewed inspection. Both assets are already in the repository.
The photograph is not evidence of someone performing the displayed sequence.

## Evaluation boundary

This is a design comparison for discussion, not a detector evaluation or a
scientific isolation of all variables. A, B, and C are identifiers, not scores.
The first view is a starting point, not owner approval or a preselected rating.
No human labels are submitted, stored, or inferred by the page.

The brief's recommendation is an agent hypothesis. Keep owner reactions separate
from that recommendation. Do not count these variants as independent held-out
examples: they were deliberately created for this comparison.

## Review record

Rubric: VR-1. Evidence ledger checked 2026-09-21. Calibration: **NOT CALIBRATED**.
One construction correction round; no second aesthetic correction requested.

The builder and separate reviewer were dispatched as `gpt-5.6-terra`, medium
reasoning, in Codex desktop. Main-agent review was separate from construction
but not blinded to the plan. The independent reviewer received a neutral task
brief and only the six final desktop frames, without owner labels, the builder's
rationale, or this brief's recommendation. No repeat evaluation was run.

| VR-1 dimension       | Separate review observation                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Project specificity  | The real sequence and creator photograph identify the actual subject.                                        |
| Hierarchy            | A supports the newcomer notation task; B gives the performer the strongest emphasis.                         |
| Grouping and spacing | A pairs artifact and explanation; C groups explanation and action above the images.                          |
| Real artifacts       | Both complete source images are present; top-frame cutoffs are normal viewport edges.                        |
| Craft                | Type, image boundaries, and the Composer link are readable in the inspected desktop frames.                  |
| Product continuity   | Dark canvas and artifact emphasis fit the canon visually; production component integration was not assessed. |

The reviewer recommended A for the stated task and identified B's stronger
performer-portfolio reading as a major task-fit concern. B is retained as an
intentional comparison candidate, not endorsed as the production direction.
C remains a text-led alternative. These are agent judgments, not owner labels,
proof of task success, or measurements of human authorship.

## Verification record

Direct browser inspection used the task-owned in-app browser tab and existing
HTTPS dev server. No server was started or restarted. Production routes were
not edited.

- All seven content strings, two image sources/alts, and three destinations
  match across A/B/C and the three sections in Show all.
- Show all contains three uniquely labelled sections, six loaded images, no
  duplicate IDs, and exactly one pressed view control. Single views contain
  two loaded images and exactly one pressed control.
- Native desktop (1280×720 CSS, DPR 1.5) top and bottom frames were inspected
  for all three compositions. The 375×667 phone opening was inspected for each.
- DOM containment checks covered A/B/C/Show all at 375×667, 960×412, 820×1180,
  1440×900, 1920×1080, 2560×1440, and 3840×2160. All 28 states had zero
  horizontal overflow, no text outside the viewport, no failed images, and
  view-button heights of at least 44px. These are geometry checks, not visual
  acceptance of uninspected frames.
- Keyboard Tab exposed a visible focus outline; Space switched the focused B
  control and its pressed state. Controls start disabled until rendering
  succeeds. Blocking only this study's `content.json` produced a visible live
  error with disabled controls; unblocking and reloading restored the study.
- Canvas contrast: primary text 16.26:1, secondary text and control outlines
  10.24:1. Decorative image/section strokes are not used as control boundaries.
- JavaScript and JSON parse checks, Prettier, and scoped diff whitespace checks
  passed. Source image hashes still match the fixed input above. The page
  fetches only its content file and contains no answer persistence or submission.

Evidence is in [evidence/](evidence/): `a/b/c-desktop.webp` show the openings;
`a/b/c-desktop-lower.webp` show the settled lower views; `a/b/c-phone.webp` show
phone openings; `keyboard-focus.webp`, `load-error.webp`, and `show-all.webp`
record those states. `a/b/c-initial.webp` are explicitly pre-correction frames,
not final acceptance evidence. Desktop captures are 1920×1080 physical pixels;
phone captures are 563×1001. Native lower-view scroll offsets were approximately
77px for A, 291px for B, and 280px for C.

### Remaining gate limits

The full seven-viewport visual matrix and actual 200% browser zoom are **not
verified**. This in-app browser's previously observed large-emulation capture
limitation repeats/crops pixels beyond its native render surface; changing
viewport metrics alone is not equivalent to a valid screenshot or browser zoom.
The phone capture required matching the host's DPR 1.5. No wide-frame or zoom
pass is inferred from the successful DOM measurements.

The task therefore stays on its review branch/worktree and is not integrated
into the primary checkout. This is a usable local prototype and a recorded
comparison, not a production acceptance report. Owner preference and future
production direction remain open.
