# Flow Fest embodiment source revision

This note covers the current source changes. The [README](README.md) still links the earlier verified living-world package. [VERIFICATION.md](VERIFICATION.md) records that package's evidence. This revision has passed its editor build and focused tests. A later source staff-clearance correction still needs native capture/import and a new Windows package.

## Behavior and ownership

| Area | Source files | Change |
| --- | --- | --- |
| Attendee intentions | `Source/FlowFest/FlowFestCrowd.h`, `FlowFestCrowd.cpp`, `FlowFestCrowdTests.cpp` | The existing 38 named agents retain their routes and identities. Each has bounded needs, preferences, a home, and equipment. Goals include food, camp rest, practice, watching, paired social stops, and reserved fire turns. Routes, action time, partners, and reservations are included in the crowd state string. |
| Festival world | `Source/FlowFest/FlowFestWorld.h`, `FlowFestWorld.cpp` | A reachable food stop sits near the workshop. The world places attendees at their goals, runs captured routines during practice and performance, shows nearby intent, and exposes the crowd state to saves. |
| Player and save | `Source/FlowFest/FlowFestCharacter.h`, `FlowFestCharacter.cpp`, `FlowFestSaveGame.h`, `FlowFestHUD.cpp` | During festival night, E starts or ends food and camp rest; movement can end a break. H greets an available nearby attendee. Hunger, energy, active break, and serialized crowd state are saved with the journey. Version 3 still reads older save versions. |
| Native avatar and equipment | `../Shared/FlowArtsRuntime/Source/FlowArtsRuntime/Private/FlowFestPropComponent.cpp` and its public headers | The shared runtime remains responsible for authored bodies, prop attachment, and synchronized performance playback. The 16 deployed character rigs and 41 prop families with 71 variants remain the catalog. |

An attendee's equipment identity persists even when a prop is out of their hands. Props are visible in hand for practice or performance and hidden during other activities. There is no visible holster. Food, rest, and social stops have a place, duration, and facing, but use the existing idle locomotion clips; they have no eating, sitting, or talking animation. A greeting briefly faces the player and then resumes the attendee's current intention.

The food stop review showed a canopy, benches, two arriving attendees, and the player's E food/water prompt. Close walk captures showed closed hands attached to handles through a stride. The existing arm swing still carries a staff across the torso; there is no separate carry arm pose.

## Controls in this source revision

- **E** near the workshop food stop: get food and water. **E** at camp: rest. **E** again or movement ends the current break.
- **H** near an available attendee: greet them and hear their name and current purpose. Travelers, gate staff on duty, and performers do not stop for greetings.
- **F5 / F9**: save and load the player needs, active break, and attendee state with the existing native journey. An older save without crowd state starts the crowd from its deterministic initial state.

## Verification status

| Check | Status |
| --- | --- |
| Unreal editor compile after the social-pair fix | Passed: `Saved/EmbodimentEvidence/editor-pair-fix-build.log` |
| `FlowFest.Crowd` goals, social pairs, reservation fairness, and save/restore tests | Passed: all six in `Saved/EmbodimentEvidence/crowd-pair-final.log` |
| Native journey and activity smoke | Passed: food, rest, save/load, and cancellation by starting flow, alongside the journey checks, in `Saved/EmbodimentEvidence/player-activities-final-smoke.log` |
| Full native family motion test on the current imported captures | Passed: 1,312 profiles across 656 rig-family pairs in `Saved/EmbodimentEvidence/grip-all-families.log`; maximum captured grip deviation 0.37 cm and anchor deviation 0.20 cm. This does not verify the later source correction in native assets. |
| Close transition and idle visual checks | Reviewed: fire-staff hand transitions and attached handles, plus ybot fan and xbot buugeng idle renders. Curled hands were visible. |
| Food stop and walk-carry visual checks | Reviewed: `food-stop.png` showed the canopy, benches, two attendee arrivals, and E food/water prompt; `walk-grip.png` and frame 004 showed attached hands through the stride. Staff still crosses the torso with the existing arm swing. |
| Source staff-clearance correction | Committed as `3c3c324116`: worst measured staff depth step fell from 35.1 cm to 10.5 cm, with no new direct no-body contacts across 90 of 480 checked frames. This is source evidence, not a native import result. |
| Corrected food/walk captures and native import | Pending final result |
| Cooked Windows package and delivery-path verification | Pending; README links still target the prior verified package |

The crowd model is finite and deterministic. It does not add a behavior framework or generated dialogue. Its replies use short authored templates.
