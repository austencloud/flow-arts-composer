# Epic Unique Features Source Map

## Locked prompt

**Portal question:** Please tell us about some of the unique features of your
project.

**Portal limit:** 32,000 characters

**Required:** Yes

**Reviewer task:** Understand what differentiates the project from another
museum game, animation tool, or educational product without rereading the full
project description.

## Current interview

Austen's August 30, 2026 answer is preserved in
`EPIC-00-interview-source-ledger.md` under “What makes The Kinetic Archive
unique.” Its strongest phrases and ideas are:

- “a curiosity enhancing machine”;
- a practitioner discovering that a movement has relatives and surrounding
  possibilities rather than encountering isolated tricks;
- seeing movement from every angle until it can be understood and represented
  digitally;
- a bounded notation space whose available states expand by level;
- preserving physical discoveries made by practitioners who “come and go”;
- reading something done with the body from a sheet of paper in the way a
  musician reads sheet music;
- Flow Arts Composer as the bridge between theory, application, and people in a
  shared web system.

## Previously approved material to avoid repeating

The approved full-project-details response already explains:

- the museum's fictional history and collapsed bureaucracy;
- the current browser-based 3D viewer;
- the anatomical limits of idealized inverse kinematics;
- the proposed body, hand, and prop capture pipeline;
- Unreal Motion Matching, Pose Search, Control Rig, and IK Retargeting;
- the three-room prototype and four-beat matching interaction;
- publishing representative sample clips while licensing the full cleaned
  capture library separately.

The unique-features response should not repeat this implementation plan or
budget justification. It should describe what the shared system lets a player
or practitioner experience.

## Verified domain facts

The Flow Arts Knowledge MCP confirms:

- the Kinetic Alphabet records hand paths and prop rotations on a defined grid;
- its level system expands a bounded motion space by adding turn values,
  orientations, grid locations, center paths, conjoined grids, and 3D planes;
- each defined level has a finite set of expressible single-hand motion states;
- the system distinguishes motion families and position relationships rather
  than storing choreography as undifferentiated video.

These facts support describing the notation as a structured, explorable motion
language. They do not prove that every anatomically valid transition, grip, or
flow-arts technique has been enumerated.

## Verified repository facts

- Flow Arts Composer already stores sequences as structured step data.
- Its Write system assembles sequences into choreographic sheets, supports a
  reading view, and exports the same planned pages to PDF.
- Its 3D viewer converts sequence data into avatar movement and supports camera
  inspection and adjustable playback.
- The repository contains a video-to-notation proof of concept with beat-level
  notation and a structured comparison against ground truth.
- The museum story bible specifies an interactive four-beat sequence-matching
  exhibit and a narrative contrast between an absurd institutional archive and
  a real notation system.

The Unreal museum implementation and accurate mocap-informed prop handling are
funded targets, not current shipped behavior.

## Claim boundaries

- Do not claim this is literally the first 3D rendering of flow arts in the
  world without external proof.
- Do not claim the project has mapped every bodily transition or every possible
  grip.
- Do not broaden the funded capture scope from double staff to fans, triads,
  and every prop. Other props may be described as future domains that require
  their own captured hand mechanics.
- Do not imply that the Unreal game or complete motion corpus already exists.
- Do not call the Kinetic Alphabet notation for all dance or all flow arts. Its
  current foundation is dual-wielded, rigid, gripped props.

## Proposed angle

Center the response on one memorable claim: **The project turns physical
movement into something a person can read, inspect, and explore.**

1. Start with the sheet-music comparison in Austen's own words. The Kinetic
   Alphabet makes dual-prop movement readable as a sequence rather than leaving
   it trapped in demonstration video.
2. Explain the unusual shared-data loop. The same sequence can become a printed
   choreographic sheet, a controllable 3D performance in Flow Arts Composer,
   and an interactive encounter in The Kinetic Archive.
3. Use “curiosity-enhancing machine” as the experiential payoff. Because the
   notation space is structured and bounded at each level, a discovery can lead
   to related movements, alternate transitions, and nearby possibilities rather
   than ending as an isolated trick.
4. Close with preservation. The project gives physical discoveries a form that
   can be inspected, compared, taught, and eventually reused in other 3D work.

Keep the answer compact despite the portal's large limit. It should add one
clear differentiator to the application rather than provide another project
overview.

## Gate status

Interview, source mapping, and angle approval are complete. Claude Fable 5
reviewed the first draft at medium effort and returned a minor-revision verdict.
The final draft corrects future tense for the unbuilt museum, removes an
unsupported social-attribution capability, scopes the notation to one handheld
prop in each hand, and replaces three vague connective sentences with concrete
behavior. Austen approved the final wording on August 30, 2026. The saved
response is `EPIC-09-unique-features.md`. Final application submission remains
under Austen's control.
