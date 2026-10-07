---
status: active
value: 5
effort: L
remaining: "Verify 2D Fish Character System Design against the current 2D Fish Character System Design runtime and acceptance criteria before resuming implementation. Prior recorded remainder: implementation and visual sign-off"
depends_on: ""
plan_path: ""
tags:
  - ocean
  - animation
  - character
last_triaged: 2026-10-07
work_state: unverified
---

# 2D Fish Character System Design

**Date:** 2026-08-13  
**Status:** Approved  
**Direction:** Classic+
**Phase II:** Biomechanical Motion approved 2026-08-13
**Phase III:** Observable Agency approved 2026-08-13
**Phase IV:** Perceptible Character approved 2026-08-13

## Outcome

Keep the familiar procedural fish and the motion work already invested in them, then give a small foreground cast enough perception, memory, and readable intent to feel alive. The surrounding school remains ambient. The foreground fish become recurring individuals whose reactions depend on what they see, what just happened, and who they know.

The target is not photorealism. It is believable character: a fast cursor startles; a harmless still cursor becomes familiar; a curious fish investigates from a safe distance; a shy fish stays wary; familiar fish regroup; an alarm can ripple through nearby fish without turning the whole scene into chaos.

## Product Principles

1. **Recognition before novelty.** Preserve the current silhouettes, palettes, depth grading, spine gait, and overall density.
2. **Events cause behavior.** A visible action should have a visible cause. Random choices remain background texture, not the main personality system.
3. **Commitment beats twitching.** Attention and intent have dwell times, cooldowns, and exit conditions. Fish do not reconsider every frame.
4. **Individuals persist.** Personality is stable for a fish's lifetime. Habituation and relationships accumulate gradually.
5. **Restraint reads as life.** Most frames should be calm. Startles, greetings, and investigations stand out because they are sparse.
6. **Classic remains measurable.** Visual character polish can be disabled through the ocean tuning preset so the historical rendering remains an exact comparison control.

## Scope

### In scope

- A perception pass that evaluates cursor motion, field of view, nearby fish, and displacement from home.
- Stable attention, intent, habituation, alarm, and social affinity state on each fish.
- Contextual intent selection for flee, investigate, socialize, rest, return-home, and cruise.
- Intent-aware movement implemented through the existing movement controller.
- Local alarm propagation and relationship memory through the existing interaction system.
- Four to six `resident` fish at high quality, proportionally fewer at lower qualities. Other fish remain lightweight ambient schoolers.
- Subtle eye gaze and species-sensitive tail presentation for residents, gated by the Classic+ visual tuning amount.
- Deterministic seed control for fish creation and decision randomness so lab traces can be replayed.
- Ocean Lab telemetry for identity, intent, attention, familiarity, alarm, and known-fish count.
- Focused unit tests, long deterministic simulation tests, and dedicated character and motion benchmark sweeps.

### Out of scope

- Raster sprites, 3D fish, photorealistic anatomy, feeding UI, names, dialogue, achievements, or save-file persistence.
- Replacing the spine-chain renderer, flocking owner, hunting owner, mood owner, or movement controller.
- Increasing fish count as a substitute for better behavior.
- Whole-application deterministic rendering. The replay boundary is the fish subsystem.

## Architecture

```text
pointer + nearby fish + home zone
              |
              v
       FishPerceptionSystem
              |
      attention + stimulus
              |
              v
       existing mood owner
              |
              v
     existing decision maker
              |
        committed intent
              |
              v
   existing movement controller
              |
              v
 spine / flocking / renderer owners
```

`FishPerceptionSystem` is the only new behavior owner. It observes the world and updates perception state; it does not move fish. `FishDecisionMaker` remains the action-selection owner. `FishMovementController` remains the movement owner. `FishMoodManager`, `FishFlockingCalculator`, `FishInteractionHandler`, and `FishRenderer` retain their existing responsibilities.

## Domain Model

Each fish gains:

- `resident`: whether the fish receives the richest foreground behavior and visual cues.
- `identitySeed`: stable per-lifetime seed used for reproducible variation.
- `intent`: `cruise`, `investigate`, `socialize`, `rest`, `return-home`, or `flee`.
- `attention`: target kind, position, optional fish ID, salience, and remaining dwell time.
- `perception`: normalized cursor threat, cursor interest, cursor speed, social opportunity, and home displacement.
- `memory`: cursor familiarity, cursor alarm, last threat time, and social affinity by fish ID.

The existing `behavior` remains the physical state-machine state used by animation. Intent is the reason; behavior is the current physical expression of it.

## Perception and Memory

### Cursor

- A forward-biased field of view makes attention readable through the eye and body heading.
- Cursor threat combines personal-space intrusion, pointer speed, and approach toward the fish.
- A stationary or slowly moving cursor raises familiarity while nearby and harmless.
- Familiarity suppresses repeat alarms but never fully suppresses a very close fast approach.
- Curious, bold residents may attend to a low-threat cursor and investigate to a species-scaled standoff distance.
- Attention drops when the cursor leaves, passes behind the fish, or becomes threatening.

### Fish

- Residents prefer same-species or already familiar neighbors as social targets.
- Greetings and sustained close social attention raise mutual affinity.
- A startled fish shares a weaker alarm signal only with nearby visible neighbors. Propagated alarm cannot recursively amplify in the same frame.
- Social memory is bounded to prevent unbounded growth.

### Home

- The existing home zone becomes an actionable cue when displacement is large and no urgent stimulus is present.
- Return-home movement corrects vertical displacement smoothly. Horizontal screen traversal remains continuous; fish do not reverse merely to chase an old x coordinate.

## Action Selection

The decision maker evaluates hard overrides first, then contextual utility, then the existing weighted ambient choices:

1. Active hunting or being hunted.
2. A fresh strong cursor or propagated-threat event: `flee` expressed as one committed escape maneuver.
3. Low energy: `rest`.
4. Safe cursor interest with adequate curiosity and boldness: `investigate`.
5. A visible familiar or compatible neighbor with adequate sociability: `socialize`.
6. Strong home displacement: `return-home`.
7. Existing cruise, turn, pass, depth, and schooling choices.

Intent has a minimum commitment window. A stronger safety event may interrupt any intent; lower-priority opportunities wait until the current commitment ends. This is the main anti-twitch invariant.

## Movement

- `investigating` advances at a controlled pace and steers vertically toward the attention target. It slows at standoff distance and never snaps direction when the target passes behind.
- `socializing` uses the same smooth pursuit shape with a wider standoff distance and lower speed.
- `resting` reduces target speed, bob, and body flex while allowing the mood owner to restore energy.
- `returning` preserves forward travel and eases vertically toward the home zone.
- `flee` uses the Phase II escape trajectory described below. A threat can interrupt another intent, but a held threat cannot restart an escape already in progress.

All movement remains frame-rate independent. No new behavior may write a large raw position delta, teleport a spine head, or sample per-frame noise for velocity.

## Visual Direction

Classic+ is a restrained layer over the current art:

- Pupils track the stable attention point within a small anatomical limit.
- Resident fins and tails receive species-sensitive silhouettes: broader tropical fan, efficient sleek fork, softer deep rounded tail, compact schooling fork.
- Detail is depth-aware and fades out on distant fish.
- `BASELINE_TUNING.characterDetail` is `0`; `GRADED_TUNING.characterDetail` is `1`. The A/B harness can therefore render the same simulation as exact Classic and Classic+.

No visual cue should make the background compete with the primary app UI.

## Phase II: Biomechanical Motion

### Regression protections

Phase II changes the locomotor grammar, not the cast or art direction. The following remain protected:

- procedural silhouettes, palettes, eye construction, gills, scale patterns, and species-sensitive tails;
- resident identity, personality, attention, gaze, cursor familiarity, alarm, social affinity, and home behavior;
- hunting, local schooling, depth grading, deterministic replay, and the existing quality tiers;
- the legacy renderer as a comparison path, even though the spine renderer receives the fullest escape pose.

No raster replacement or photorealistic treatment is introduced. Recognition and cuteness remain part of the acceptance bar.

The Classic/Classic+ A/B remains a visual rendering harness for scale, depth fade, tint, blur, and character-detail tuning. It is not Phase II motion evidence and must not be cited as proof of locomotion realism.

### Ownership

Search terms: `dart`, `startle`, `flee`, `panic`, `burst`, `escape`, `C-start`, `behaviorTimer`, `targetSpeed`, and `bodyFlexAmount`.

Closest owners:

- `FishPerceptionSystem` owns threat detection, habituation, and the one-frame threat event.
- `FishDecisionMaker` owns intent selection and ambient behavior choice.
- `FishMovementController` owns translation and behavior completion.
- `FishSpineController` owns body posture.
- `FishCursorAvoidance` remains the adapter that turns a fresh perceived threat into an escape event; it no longer refreshes movement every frame.

Relationship: **extend** the existing perception, movement, and spine owners. The kinematic curve is a pure `fish-motion` module consumed by those owners. It is not another behavior service or renderer.

### Escape contract

One threshold crossing creates one maneuver with a locked source point and escape vector:

```text
detect -> commit vector -> C-bend -> counterstroke -> coast -> stabilize
```

- Threat entry and exit use hysteresis. A held cursor does not retrigger the event. The fish must observe a safe exit before a later entry can re-arm it.
- The initial bend lasts 30-50 ms and turns the posture toward the committed escape vector.
- The counterstroke lasts 40-70 ms, reverses body curvature, and contains the speed peak.
- Coast and stabilization return speed and curvature toward cruise without a reset pose or target-speed step.
- Translation is integrated in body-length-aware units from the sampled trajectory. Cursor avoidance no longer adds a separate vertical shove.
- The spine receives a staged midline pose. The legacy body-flex renderer receives the same signed curvature cue.
- Speed, acceleration, jerk, curvature, clearance, phase, and event count remain inspectable in Ocean Lab.

Fast-start measurements are intentionally time-dilated enough to read at 60 fps. The phase ordering and force shape follow the measured motion; the background does not attempt literal maximum escape velocity.

### Purposeful burst-and-coast

Unprovoked weighted `darting` is removed. The same ambient probability becomes `bursting`, a low-amplitude locomotor bout that keeps the current heading, produces one short propulsive pulse, and coasts back to cruise. It does not set `flee`, alert mood, alarm, or the startled wobble.

This distinction is load-bearing:

- `darting` means an observed threat caused an escape;
- `bursting` means the fish chose a normal locomotor pulse;
- `passing` remains a longer, deliberate traversal;
- predator pursuit and prey flight remain sustained hunting behaviors.

### Measurement contract

Automated scenarios run across deterministic seeds and 30/60/120 fps. They record center position, velocity, acceleration, jerk, heading, curvature, phase timing, source clearance, and state-entry count.

Acceptance gates:

- one fresh threat event produces exactly one escape entry;
- the phase clock is monotonic and cannot be refreshed by a held threat;
- speed peaks before coast, then never rises during recovery;
- source distance stops decreasing by the end of the initial bend and the fish does not pass through the source;
- total displacement differs by no more than 2% across 30/60/120 fps;
- a 10,000 fish-minute no-stimulus run produces zero `darting` entries;
- slow repeated approaches habituate while emergency intrusion remains effective;
- the same seed and event script reproduce the same trajectory and metrics.

The baseline measurement that approved this phase found a 1.38% frame-rate spread, but also found recovery accelerating, a held threat pinning the phase at 16.7 ms, and approximately 6.3 unexplained darts per minute in a 26-fish population. The frame-rate result is retained; the temporal and causal failures are release blockers.

### Motion benchmark

`/test/ocean-motion-benchmark` is the Phase II runtime surface. It stages two trials on the same production fish:

- a cursor threat enters through `FishPerceptionSystem` and `FishCursorAvoidance`;
- a voluntary burst enters through `FishMovementController.beginPurposefulBurst`.

The page records trajectory, body-length speed, acceleration, jerk, heading, curvature, clearance, phase order, source locking, and event count. Escape and burst traces remain visible together so the causal and kinematic distinction is inspectable. The page does not change ocean visual tuning and does not compare foreground/background blur.

## Phase III: Observable Agency

Phase III makes the existing personality and memory system readable over time. It does not add another decision engine. `FishPerceptionSystem` remains the owner of attention, familiarity, alarm, and social target selection. `FishDecisionMaker` still chooses intent. `FishMovementController` still performs the committed bout.

### Episodic attention

An investigation or social visit has a beginning and an end. When a bout finishes, perception records a short target-specific refractory period:

- a held harmless cursor cannot trigger an endless inspect, cruise, inspect loop;
- a recently visited partner remains familiar but is temporarily excluded from social target selection;
- high curiosity and sociability shorten the interval without removing it;
- familiarity lengthens the cursor interval because an already inspected object carries less novelty.

Attention commitment does not make a target omnipresent. A cursor behind the fish, a neighbor outside the social range, or a missing neighbor is released immediately even when dwell time remains. A fresh threat can still interrupt any bout.

### Personality signatures

Personality biases behavior instead of prescribing a fixed script. Replaying the same harmless event should produce measurable differences:

- curiosity changes cursor interest and inspection dwell;
- boldness changes perceived threat and escape likelihood outside the emergency radius;
- sociability changes partner attraction and revisit timing;
- activity changes the balance of routine locomotor bouts.

The cast must retain within-individual variation. Two fish with similar traits should not become synchronized clones.

### Social memory and alarm

Affinity affects choices only while candidates are close enough to compare. At equal distance and species, a familiar fish should win over an unfamiliar fish. Completing that visit temporarily opens the choice to another valid neighbor instead of locking a pair together.

Alarm remains event-driven and local. A direct threat may startle nearby fish once. A relayed alarm cannot become a new source in the same update, and a fish outside the original source radius does not react through a chain.

### Agency measurement contract

Automated and runtime assays use deterministic fish identities and identical event scripts. They record attention target, dwell, intent entries, familiarity, alarm, affinity, target switches, revisit latency, and distance to the attended target.

Acceptance gates:

- a high-curiosity resident attends a harmless forward cursor that a matched low-curiosity resident ignores;
- a completed inspection cannot reacquire the cursor until its refractory time expires;
- a target behind the fish or outside social range is released within one perception update;
- a familiar neighbor wins an equal-distance choice, then its cooldown allows another valid neighbor to be selected;
- a direct alarm reaches a nearby fish but never cascades to a second hop in the same update;
- emergency intrusion still produces a threat after full cursor habituation;
- deterministic replay reproduces identities, target choices, intent entries, and memory values.

`/test/ocean-character-lab` is the Phase III runtime surface. It presents controlled curiosity, habituation, social-choice, and alarm trials beside the production ocean. The general Ocean Lab remains the freeform tuning surface.

### Research basis

- Repeated assays find moderate, not absolute, repeatability in fish sociability, exploration, novelty response, and boldness. Personality therefore biases probabilities and latencies rather than fixing behavior: [Effect of Warming on Personality of Mosquitofish and Medaka Fish](https://pmc.ncbi.nlm.nih.gov/articles/PMC11273402/).
- Zebrafish attention is well described by engaged and disengaged states with measurable dwell distributions: [Attentional switching in larval zebrafish](https://pmc.ncbi.nlm.nih.gov/articles/PMC12494005/).
- Familiarity preference is measurable when alternatives are close enough to compare, supporting a bounded social-choice radius: [Familiarity preferences in zebrafish depend on shoal proximity](https://pmc.ncbi.nlm.nih.gov/articles/PMC12536045/).
- Closed-loop virtual-fish experiments support measuring responses to stimuli instead of relying on a purely decorative animation script: [Controlling Fish Schools via Reinforcement Learning of Virtual Fish Movement](https://arxiv.org/abs/2603.16384).

## Phase IV: Perceptible Character

Phase IV closes the gap between a correct internal state and an action a person can actually read. It does not add another behavior engine or replace the procedural fish. It stages a persistent foreground cast, strengthens the body language already owned by the movement and rendering systems, and tests recognition without diagnostic labels.

### Persistent resident cast

- High and medium quality keep three to six recognizable residents in the near or readable mid-water layer. Lower quality keeps two.
- Resident selection prefers the largest non-schooling candidates at readable depth. Identity, personality, familiarity, affinity, palette, and species persist when a resident crosses a screen edge.
- Residents begin inside the visible composition on staggered lanes and timers. They are not synchronized and do not all enter from the same edge.
- Ambient fish continue to enter, leave, school, hunt, and respawn through the existing lifecycle.

### Readable body language

- Investigation reads as approach, deceleration at a species-scaled standoff, a short curious hover, visible gaze, then release or retreat.
- Social interest reads as alignment and a brief paired glide or peel-off. A social shimmer supports the event but cannot replace the movement cue.
- Resting and shy responses reduce translation and open the pectoral-fin pose. Shy fish may pause or withdraw; they do not twitch between contradictory states.
- Bold fish recover from a safe startle sooner than shy fish, while emergency intrusion still overrides every personality.
- Routine swimming keeps tail amplitude restrained and carries speed changes primarily through stroke frequency. Escape remains the larger staged C-bend.
- Only one lead interaction is staged in a local screen region at a time. Nearby ambient activity stays quiet enough for the cause and response to remain legible.

### Perception contract

Automated measurements and the character reel must satisfy all of the following:

- the target number of residents remains stable through repeated edge crossings;
- at least three residents are visible for 75% of an ordinary high-quality sample window;
- a lead resident renders at least 48 CSS pixels from snout to tail during a character event;
- the first attributable character event begins within eight seconds;
- two lead character events do not overlap in the same screen region;
- an unlabeled clip is classified as investigate, recognize/habituate, socialize, or local alarm with at least 80% agreement before the diagnostic reveal;
- Classic rendering remains exact when `characterDetail` is `0`;
- no event creates a one-frame position spike, refreshes an escape, or suppresses an emergency response.

`/test/ocean-character-lab` is the Phase IV recognition surface. It starts as a blind character reel: the scenario name, intent label, target ring, and telemetry remain hidden while the motion plays. The viewer records what the fish appeared to do, then reveals the intended action and measurements. A separate evidence mode retains the deterministic four-trial suite for regression work.

### Research basis

- Individual boldness and shyness produce distinct response styles, including more freezing in shy zebrafish, so pause and recovery timing belong in the visible signature: [Context-dependent relationship between boldness and sociability in zebrafish](https://www.nature.com/articles/s41598-025-00423-6).
- Fish escape responses contain repeatable individual variation, supporting stable reaction and recovery biases without deterministic scripts: [Consistent individual differences in zebrafish escape responses](https://www.nature.com/articles/s42003-025-07669-w).
- Faster steady swimming is expressed more strongly through tail-beat frequency than unlimited lateral amplitude, supporting a restrained cruise silhouette and a visibly larger escape bend: [Kinematics and hydrodynamics of fish-like swimming](https://pmc.ncbi.nlm.nih.gov/articles/PMC8634626/).
- Burst-and-coast locomotion is a distinct propulsive strategy, supporting the existing separation between voluntary locomotor pulses and threat-driven escape: [Energetic advantages of burst-and-coast swimming](https://www.nature.com/articles/s42003-020-01521-z).

## Deterministic Replay

The fish subsystem receives one resettable random source. Fish creation, personality, action selection, interactions, and rare behavior consume it instead of calling `Math.random` directly. Production starts from a session seed; Ocean Lab can set an explicit seed and recreate the ocean.

Determinism is verified by comparing two same-seed simulations and one different-seed simulation over a fixed event script.

## Ocean Lab

The existing selected-fish panel gains:

- resident/ambient identity
- current intent
- attention target and salience
- cursor familiarity and alarm
- known-fish count
- deterministic seed input and reset action

Debug rendering may draw the selected fish's attention ray and standoff point. It remains opt-in.

## Performance Budget

- Perception is linear in fish count plus the existing nearby-fish work. It must not add another unconstrained all-pairs pass.
- Rich social target selection runs only for residents and reuses a bounded nearby list.
- Maps and attention objects are mutated in place; no per-frame array allocation inside the per-fish hot path beyond arrays already created by the animator.
- No new canvas or offscreen buffer per fish.

## Verification

### Automated

- Perception: looming pointer triggers threat; stationary pointer habituates; behind-target does not attract; familiarity cannot suppress an emergency intrusion.
- Action selection: threat overrides curiosity; rest overrides ambient randomness; committed intent does not thrash; hunting remains authoritative.
- Social memory: repeated greeting raises bounded mutual affinity; alarm propagation is local and attenuated.
- Movement: investigation respects standoff; return-home is continuous; no one-frame position spike; frame-rate variants remain within tolerance.
- Replay: identical seed and event script produce identical identity, decisions, and positions.
- Existing fish cursor, hunting, spine, and motion tests stay green.

### Runtime and visual

- Exercise the Ocean Lab with a stationary pointer, slow approach, fast approach, exit, and re-entry.
- Run threat escape and voluntary burst on the same fish in the dedicated motion benchmark; inspect the overlaid traces and all live gates.
- Inspect 1920x1080, 2560x1440, 3840x2160, 1440x900, 820x1180, 960x412, and 375x667.
- Confirm the benchmark identifies the tracked fish without changing its render scale or depth treatment, no diagnostic UI clips, and no new console errors appear.

Classic/Classic+ comparison remains the Phase I visual-tuning verification path only.

## Rollback

Behavior can be disabled by turning off the cognition debug flag, which leaves the existing animation path intact. Visual changes can be reduced to exact Classic with `characterDetail: 0`. The feature does not require migration or persisted data cleanup.
