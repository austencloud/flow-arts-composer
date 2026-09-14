# Epic Funding Request Source Map

## Locked prompt

**Portal range question:** What funding range are you requesting for this
project? (US Dollars)

**Available range:** $50,000-$100,000

**Proposed exact request:** $75,000

**Portal narrative question:** How do you plan to use the funds for the project?
Please include a high level budget (i.e., $x funding for developer training,
hiring UE engineers, etc)

**Narrative limit:** 15,000 characters

## Epic's current guidance

Epic recommends a realistic budget with key dollar buckets and says an award
may be lower than the request. Funds should directly support project development
or hiring. Hardware purchases or rentals may be approved case by case when the
hardware contributes meaningfully to the project.

Source: https://www.unrealengine.com/megagrants

## Current interview

Austen's August 30, 2026 answer is preserved in
`EPIC-00-interview-source-ledger.md` under “Funding scale and outside help.” It
establishes that:

- $30,000 of paid development time would materially change his ability to do
  the work;
- the capture request should be Rokoko-based unless a more expensive system is
  supported by a real quote and a better project case;
- he would welcome outside technical help even though he had expected to use AI
  tools to bridge some gaps;
- he is concerned about overpromising and wants the funded work to remain
  achievable.

## Previously approved project milestone

The approved full-project-details response promises a three-room playable Unreal
prototype. Each room contains one interactive exhibit and a moving avatar. The
central interaction lets the player inspect a performing avatar and match a
four-beat notation sequence. At least one encounter uses capture-based
double-staff movement.

The budget funds this milestone. It does not promise the complete museum, a
general animation model, or a finished motion library for every prop.

## Reviewed high-level budget

| Bucket | Amount | What it covers |
|---|---:|---|
| Austen's development time | $30,000 | Dedicated implementation of the Unreal prototype and connection to the existing notation system |
| Unreal animation specialist checkpoints | $9,000 | Three bounded engagements: Pose Search and Motion Matching setup review, a Control Rig contact-correction pass, and retargeting validation across avatar proportions |
| Body, hand, and tracked-prop capture equipment | $10,000 | A Rokoko-based body and finger setup with global hand positioning, lightweight staff tracking, useful textile sizes, calibration needs, and capture accessories |
| Performers, studio time, and capture sessions | $8,000 | Paid performers, rehearsal and recording sessions, and suitable capture space |
| Capture-side cleanup and labeling | $6,000 | Filtering, clip preparation, contact labeling, and export before the motion enters Unreal |
| Software, storage, testing, and sample publication | $5,000 | Unreal-adjacent tools, data storage and backup, playtesting, the documented motion format, and representative sample clips |
| Production reserve | $7,000 | Retakes, additional textile sizes, replacement equipment, or one additional bounded specialist checkpoint if capture exposes a problem within the approved milestone |
| **Total** | **$75,000** | |

## Why this scale is credible

- The request is large enough to fund focused development time and specialist
  help instead of treating the grant as an equipment purchase.
- Capture hardware is $10,000, about thirteen percent of the request. This fits
  Epic's case-by-case hardware guidance better than a hardware-dominated budget.
- $30,000 compensates Austen for building the milestone rather than assuming a
  solo developer can work unpaid while administering performers and contractors.
- Contracted Unreal work is limited to three checkpoints with separate finish
  conditions. It is not an open-ended $15,000 hiring obligation.
- Capture-side cleanup ends before engine integration, removing the earlier
  overlap between retargeting, contact correction, and clip preparation.
- The reserve is under ten percent of the request and has named production uses
  inside the approved milestone.
- The milestone remains the approved three-room prototype, not the completed
  game.

## External review

A Claude Fable 5 medium review found the $75,000 total credible but identified
delivery risk and double counting in the earlier $15,000 technical-art line and
$7,000 cleanup-and-retargeting line. It recommended three approximately $3,000
engine-side checkpoints, a strictly capture-side cleanup allocation, and a
named production reserve. Austen then investigated the finger and prop-capture
requirements and returned to the portal section with the instruction to fill
out the funding response.

## Claim boundaries

- Do not name Xsens or budget for it without a current written quote.
- Do not say the amount of hardware purchased rises automatically with the size
  of the award.
- Do not claim contractors have been selected or hired.
- Do not describe the specialist allocation as an open-ended block of hours.
- Keep engine-side contact correction and retargeting out of the capture-side
  cleanup line.
- Do not frame AI as replacing animation expertise. It is part of Austen's
  existing workflow, not a substitute for budgeted production capacity.
- Do not call the budget final vendor pricing. The portal asks for a high-level
  plan, and individual allocations may be refined after quotes.

## Proposed angle

Open with the exact $75,000 request and the concrete three-room Unreal milestone.
Then present the seven allocations in descending order. Define the specialist
work by its three finish conditions, separate capture cleanup from engine work,
and name the limited uses of the reserve. Explain the Rokoko-based body, finger,
and staff-tracking equipment as one part of the production plan. Close by
stating that the grant replaces hand-tuned approximation with captured evidence
and produces a playable proof connecting written choreography to believable
performance.

The response should sound like a production plan, not a shopping list or a plea.
It should not apologize for paying Austen or promise that every technical risk
is already solved.

## Gate status

Interview, source mapping, external review, and authorship review are complete.
Austen approved the exact 218-word, 1,531-character response on August 30, 2026.
It is saved in `EPIC-11-use-of-funds.md` and was entered in the portal with an
exact text match. The funding range is $50,000-$100,000, and the narrative
states an exact $75,000 request. Submit remains under Austen's control.
