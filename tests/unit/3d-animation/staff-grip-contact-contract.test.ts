import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(
  process.cwd(),
  "node_modules/@austencloud/scene-3d"
);

const staffSource = readFileSync(
  resolve(packageRoot, "src/lib/components/Staff3D.svelte"),
  "utf8"
);

const staffRuntime = readFileSync(
  resolve(packageRoot, "dist/lib/components/Staff3D.svelte"),
  "utf8"
);

const orbitControlsSource = readFileSync(
  resolve(process.cwd(), "src/lib/shared/3d/components/OrbitControls.svelte"),
  "utf8"
);

const gripTestPage = readFileSync(
  resolve(process.cwd(), "src/routes/test/staff-grip/+page.svelte"),
  "utf8"
);

const gripTestStage = readFileSync(
  resolve(process.cwd(), "src/routes/test/staff-grip/StaffGripStage.svelte"),
  "utf8"
);

// The lab was split into owners: the catalog says what can go on stage, the
// metrics module turns one rendered frame into numbers, and the scrub is the
// lab kit's shared transport. The page composes them, so the contract follows
// each claim to the file that now owns it.
const gripTestCatalog = readFileSync(
  resolve(process.cwd(), "src/routes/test/staff-grip/lab-catalog.ts"),
  "utf8"
);

const gripTestMetrics = readFileSync(
  resolve(process.cwd(), "src/routes/test/staff-grip/lab-metrics.ts"),
  "utf8"
);

const labTransport = readFileSync(
  resolve(process.cwd(), "src/routes/test/_lab-kit/LabTransport.svelte"),
  "utf8"
);

const performerStanceOwner = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/shared/3d/domain/performer-upper-body-stance.ts"
  ),
  "utf8"
);

const viewerScene = readFileSync(
  resolve(process.cwd(), "src/lib/shared/3d/components/Viewer3DScene.svelte"),
  "utf8"
);

const liveSequencePerformer = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/shared/3d/performers/LiveSequencePerformer3D.svelte"
  ),
  "utf8"
);

describe("staff grip contact contract", () => {
  it.each([
    ["source", staffSource],
    ["runtime", staffRuntime],
  ])(
    "passes the canonical staff radius directly to the %s geometry",
    (_label, component) => {
      expect(component).toContain(
        "thickness ?? userProportionsState.dimensions.staffRadius"
      );
      expect(component).not.toContain(
        "userProportionsState.dimensions.staffRadius * 2"
      );
    }
  );

  it("keeps right-drag orbit as an explicit shared control action", () => {
    expect(orbitControlsSource).toContain(
      'rightDragAction === "rotate"\n        ? CameraControls.ACTION.ROTATE'
    );
    expect(gripTestPage).toContain('rightDragAction="rotate"');
  });

  it("plays checked-in sequence data through the shared live performer", () => {
    // The lab now picks among sequences, so the fixture list lives in the
    // catalog. It is still the checked-in fixture set the combination tests
    // enforce rather than anything the lab builds for itself, and the lab
    // still opens on the FALG fixture.
    expect(gripTestCatalog).toContain(
      'import { ALL_FIXTURE_LOOPS } from "$lib/shared/combination/domain/demo-fixtures"'
    );
    expect(gripTestCatalog).toContain(
      "export const LAB_FIXTURES: readonly LabSequenceOption[] = ALL_FIXTURE_LOOPS.map("
    );
    expect(gripTestCatalog).toContain(
      'export const DEFAULT_LAB_SEQUENCE_ID = "fx-falg";'
    );
    // A fixture on stage still declares itself as one, so a headless read can
    // tell a verified fixture from a library sequence.
    expect(gripTestPage).toContain('? "validated-production-fixture"');
    expect(gripTestStage).toContain("<LiveSequencePerformer3D");
    expect(gripTestStage).toContain("weldGrip={true}");
    expect(gripTestStage).toContain("enableLocomotion={false}");
    expect(gripTestStage).toContain("enableFootPlanting={false}");
    expect(gripTestStage).toContain("phaseOffsetSteps={phase}");
    expect(gripTestStage).toContain("active={false}");
    expect(gripTestStage).not.toContain("useTask");
    expect(gripTestStage).not.toContain("Math.sin");
  });

  it("freezes one shared sequence phase across four inspectable camera views", () => {
    // The shot vocabulary is owned by ./inspection-framing, which solves each
    // pane from the performer's proportions and the pane's own aspect ratio.
    // The page renders those views; it does not carry its own camera table and
    // must never re-aim a camera from the live pose.
    expect(gripTestPage).toContain('from "./inspection-framing"');
    expect(gripTestPage).toContain("INSPECTION_VIEWS");
    expect(gripTestPage).toContain("inspectionShotForView(view, aspectRatio)");
    // Quad renders the whole shot vocabulary and a solo view narrows it, so
    // the panes are keyed off a filter of the same table rather than a second
    // one the page keeps.
    expect(gripTestPage).toContain("? INSPECTION_VIEWS");
    expect(gripTestPage).toContain(
      ": INSPECTION_VIEWS.filter((view) => view.id === lab.view)"
    );
    expect(gripTestPage).toContain(
      "{#each activeViews as view, index (view.id)}"
    );
    expect(gripTestPage).not.toContain("updateFocus");
    // One clock, read by every pane, so all the cameras sit on the same frame.
    expect(gripTestPage).toContain("phase={lab.phase}");
    // The scrub is the lab kit's shared transport, driven by the same phase.
    expect(gripTestPage).toContain("<LabTransport");
    expect(labTransport).toContain('type="range"');
    expect(labTransport).toContain("value={lab.phase}");
    expect(gripTestPage).toContain('rightDragAction="rotate"');
  });

  it("publishes measured shaft-axis and palm-contact errors", () => {
    // The measurement itself moved to the lab's metrics owner; the page reads
    // it back out onto the DOM.
    expect(gripTestMetrics).toContain("gripDiagnostics.leftGripAxis");
    expect(gripTestMetrics).toContain("gripDiagnostics.rightGripAxis");
    expect(gripTestPage).toContain("collectFrameMetrics(");
    expect(gripTestPage).toContain("data-left-axis-error-deg");
    expect(gripTestPage).toContain("data-right-axis-error-deg");
    expect(gripTestPage).toContain("data-requested-yaw-deg");
    expect(gripTestPage).toContain("data-achieved-yaw-deg");
    expect(gripTestPage).toContain("data-collision-zones");
    expect(gripTestPage).toContain("data-deepest-collision-mm");
    expect(gripTestPage).toContain("data-audience-grip-separation-mm");
    expect(gripTestPage).toContain("data-rendered-step-number");
    // The rig's collision callback is also where the performer reads its own
    // skeleton measurements, so the binding is a wrapper. It must still forward
    // all three diagnostic arguments to the consumer unchanged.
    expect(liveSequencePerformer).toContain(
      "props.onCollisionEvents?.(events, diagnostics, gripDiagnostics)"
    );
    expect(liveSequencePerformer).toContain("captureReach(diagnostics)");
  });

  it("uses the same upper-body stance plan as the production viewer", () => {
    // The turn's shape is geometry and its timing is a score-time curve; both
    // consumers resolve them through the one shared owner rather than either
    // of them re-planning. The viewer is checked here too, because a lab that
    // agreed only with itself is what this contract exists to prevent.
    // The viewer now reaches the same two functions through
    // `performer-upper-body-stance`, which caches one track per performer for
    // both render backends. That is still the one owner: the module must call
    // them, and the viewer must not re-plan the stance itself.
    expect(liveSequencePerformer).toContain("resolveTrackedUpperBodyStance");
    expect(liveSequencePerformer).toContain("buildStanceYawTrackForSource");
    expect(performerStanceOwner).toContain("resolveTrackedUpperBodyStance");
    expect(performerStanceOwner).toContain("buildStanceYawTrackForSource");
    expect(viewerScene).toContain(
      'import { resolvePerformerUpperBodyStance } from "../domain/performer-upper-body-stance"'
    );
    expect(viewerScene).toContain("resolvePerformerUpperBodyStance(performer)");
    // An authored stance (the isolation study) may override the planned one,
    // so the render props read the resolved `renderedUpperBodyStance`, which
    // falls back to the shared owner's result.
    expect(liveSequencePerformer).toContain(
      "props.authoredUpperBodyStance ?? {"
    );
    expect(liveSequencePerformer).toContain(
      "stanceYaw={renderedUpperBodyStance.yawRad}"
    );
    expect(liveSequencePerformer).toContain(
      "stanceSegments={renderedUpperBodyStance.segments ?? null}"
    );
    expect(viewerScene).toContain("stanceSegments={upperBodyStance.segments}");
    expect(liveSequencePerformer).toContain(
      "spinePitchOffset={renderedUpperBodyStance.pitchRad ?? 0}"
    );
    expect(liveSequencePerformer).toContain(
      ": upperBodyStance.rightDepthOffsetM}"
    );
  });

  it("maps a live phase through the state owner's motion-step offset", () => {
    expect(liveSequencePerformer).toContain(
      "Math.floor(wrapped) + performerState.motionStepOffset"
    );
    expect(liveSequencePerformer).not.toContain("Math.floor(wrapped) + 1");
    // Ambient hosts pass no phase and keep the owner's default seek.
    expect(liveSequencePerformer).toContain("if (phase == null) {");
    expect(liveSequencePerformer).toContain("performerState.goToStep(0);");
  });

  it("maps sequence hands into the rig's blue and red prop inputs", () => {
    expect(liveSequencePerformer).toContain(
      "bluePropState={performerState.leftPropState}"
    );
    expect(liveSequencePerformer).toContain(
      "redPropState={performerState.rightPropState}"
    );
    expect(liveSequencePerformer).toContain(
      "bluePropType={toScenePropType(props.propType)}"
    );
    expect(liveSequencePerformer).toContain(
      "redPropType={toScenePropType(props.propType)}"
    );
    expect(liveSequencePerformer).toContain("groundOffset={rigGroundOffset}");
  });

  it("does not cover the test scene with explanatory copy", () => {
    expect(gripTestPage).not.toContain("scene-label");
    expect(gripTestPage).not.toContain("Production grip test");
    expect(gripTestPage).not.toContain("Two staffs. One real rig.");
  });
});
