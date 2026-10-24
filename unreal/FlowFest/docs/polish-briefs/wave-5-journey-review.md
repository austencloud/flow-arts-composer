# Wave 5: The journey walk-through, the performance pass, the quiet HUD

Three runs after waves 1 to 4 have merged. The coordinator writes the
final briefs from the merged state; this fixes their shape.

## Run M: Journey walk-through (review, then fixes)

Workstream `Journey`. Owns nothing until the review is in.

Play the Thursday end to end with `-Review gate -Explore` from 15:00 to
07:00 Friday at the player's pace, HUD on, and write
`docs/polish-journey-review.md`: a numbered list of everything that breaks
the picture in the order the player meets it, each with a screenshot in
`Saved/Polish/Journey/`, the sim time, the site position and a one-line
fix. Look for: floating or sunk objects, props through furniture, people
through tents or cars, lights popping, vegetation pops at cull distance,
texture seams, a sign facing the wrong way, a blocked path, the check-in
failing, the circle empty when it should be busy, the rope crossing a
chair, the sky wrong at any hour, tier pops in the crowd, and anything
ugly at eye height. Also a list of the twelve most beautiful moments with
screenshots for the showcase set. Then fix what the coordinator hands
back, each a small scoped commit.

## Run N: Performance pass

Workstream `Perf`. Owns `Config/DefaultEngine.ini` scalability and console
variables, the cull distances of every instance group the program added
(through their owning files, agreed with the coordinator), and the timing
output of `Tools/launch.ps1`.

Measure every program view at its hour (`fire` 22.5 and 20.5, `camp` 20.0
and 22.5, `gate` 16 and 7.0, `overview` 19.5, `woods` 15) three times
offscreen, median in `docs/polish-perf.md` against the baseline table.
Bring every view under 16.7 ms in this order of knobs: cull distances,
Niagara counts at distance, light radii and counts, the crowd's Tier A
cap, Lumen scene detail, TSR screen percentage last. Nothing visible may
change at the review cameras; attach before and after captures; say which
knob bought what.

## Run O: A quiet HUD and a photo mode

Workstream `Hud`. Source files `FlowFestHUD.cpp/.h` and the photo-mode
camera code in `FlowFestCharacter.cpp` only.

The three teal panels and the footer cover a sixth of the frame. Replace
with one small objective line top-left on a soft gradient, a single quiet
status line top-right, the control legend hidden after 8 s and shown while
`Tab` is held, a small chevron for direction, fading to 30 percent after
10 s idle. Photo mode on `P`: HUD hidden, slight depth of field, a 24 to
85 mm zoom on the wheel, `HighResShot` on `Enter` into `Saved/Photos/`.
Keep `-FlowFestNoHUD` working. Wardrobe panel: same restraint, same hit
boxes.

## Done when

The journey review and perf report exist; every view meets the budget or
says why not; every listed defect is fixed or deferred with a reason; the
HUD is under 6 percent of the frame at rest; the showcase set of twelve is
chosen.
