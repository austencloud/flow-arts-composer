import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { TunnelComposition } from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
import { DEFAULT_CONFIG } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import { createLegacyTunnelStage } from "#lib/shared/sequence-viewer/tunnel/tunnel-stage.js";
import {
  TUNNEL_CREATOR_DRAFT_VERSION,
  type TunnelCreatorDraft,
} from "../domain/tunnel-creator-draft";
import {
  createTunnelCreatorState,
  type TunnelCreatorDependencies,
} from "./tunnel-creator-state.svelte";
import type { TunnelPresentationState } from "./tunnel-presentation-state.svelte";
import type { TunnelSnapshot } from "#lib/shared/sequence-viewer/tunnel/tunnel-snapshot.js";
import type { ShapeMatrixTunnelSourceProvenance } from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
import { resolveTunnelLayerPlans } from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
import type { CollectedTunnel } from "#lib/features/tunnel-collection/domain/tunnel-collection-types.js";
import { collectedTunnelComposition } from "#lib/features/tunnel-collection/domain/collected-tunnel-source.js";
import { tunnelRevisionPayload } from "#lib/features/tunnel-collection/domain/tunnel-revision.js";

const sequence = {
  id: "sequence-lead",
  name: "Lead sequence",
  word: "LEAD",
  steps: [{ id: "step-1" }],
} as unknown as SequenceData;

const presentationSnapshot = {
  version: 1,
  tunnel: {
    config: DEFAULT_CONFIG,
    gridVisible: true,
    colors: {
      mode: "hands",
      custom: { left: "#2e8bf0", right: "#ed1c24" },
    },
    section: "effects",
  },
  effects: { activeEffect: "none" },
  effort: "linear",
  paths: {
    pathShape: "arc",
    motionAwarePaths: false,
    leftPathLines: false,
    rightPathLines: false,
  },
  playback: { bpm: 108, playbackMode: "step" },
  props: {
    leftPropType: "staff",
    rightPropType: "staff",
    leftBuugengFlipped: false,
    rightBuugengFlipped: true,
  },
  trailRender: { mode: "trail" },
} as unknown as TunnelSnapshot;

const presentation = {
  capture: vi.fn(() => presentationSnapshot),
} as unknown as TunnelPresentationState;

function createState(
  dependencies: Omit<TunnelCreatorDependencies, "presentation">
) {
  return createTunnelCreatorState({ ...dependencies, presentation });
}

function composition(): TunnelComposition {
  const formation = { ...DEFAULT_CONFIG, fold: 3, speedOverrides: {} };
  return {
    version: 1,
    id: "composition-1",
    name: "Saved choreography",
    performers: [
      {
        id: "lead",
        label: "Lead",
        source: {
          kind: "independent",
          sequence,
          sourceSequenceId: sequence.id,
        },
        timing: { stepOffset: 0, speed: 1 },
      },
      {
        id: "partner",
        label: "Partner",
        source: {
          kind: "derived",
          performerId: "lead",
          transforms: [{ kind: "rotate", amount: 3 }, { kind: "mirror" }],
        },
        timing: { stepOffset: 2, speed: 0.75 },
      },
      {
        id: "third",
        label: "Performer 3",
        source: { kind: "derived", performerId: "lead", transforms: [] },
        timing: { stepOffset: 0, speed: 1 },
      },
    ],
    // A v1 composition predates authored stages, so the stage this fixture
    // carries is the generated one the loader reconstructs for it — one
    // instance per rendered arm, performers cycling. An explicit three-slot
    // stage would be a different (and newer) kind of composition.
    stage: createLegacyTunnelStage(["lead", "partner", "third"], formation),
    formation,
    createdAt: 100,
    updatedAt: 200,
  };
}

/**
 * Re-derive the generated stage after a test rewrites the fixture's cast or
 * formation. For a v1 composition the stage is a pure function of those two,
 * which is exactly what the loader reconstructs when it meets one.
 */
function restage(value: TunnelComposition): TunnelComposition {
  value.stage = createLegacyTunnelStage(
    value.performers.map((performer) => performer.id),
    value.formation
  );
  return value;
}

describe("tunnel creator edit state", () => {
  it("reopens the exact cast, relationship, identity, and formation", async () => {
    const openComposition = vi.fn();
    const initial = composition();
    const state = createState({
      openComposition,
      initialComposition: initial,
      editingTunnel: { id: "tunnel-1", name: "My tunnel" },
      now: () => 300,
    });

    expect(state.ready).toBe(true);
    expect(state.mode).toBe("linked");
    expect(state.relationship).toMatchObject({
      rotationSteps: 3,
      reflect: "mirror",
    });
    expect(state.initialFormation.fold).toBe(3);

    await state.openInViewer(initial.formation);

    const reopened = openComposition.mock.calls[0]?.[0] as TunnelComposition;
    expect(reopened.id).toBe("composition-1");
    expect(reopened.createdAt).toBe(100);
    expect(reopened.name).toBe("Saved choreography");
    expect(reopened.performers.map((performer) => performer.id)).toEqual([
      "lead",
      "partner",
      "third",
    ]);
    expect(reopened.performers[1]?.source).toEqual(
      initial.performers[1]?.source
    );
    expect(reopened.performers[1]?.timing).toEqual(
      initial.performers[1]?.timing
    );
    expect(openComposition.mock.calls[0]?.[1]).toEqual(presentationSnapshot);
  });

  it("exposes one card per authored performer while formation copies stay generated", () => {
    const initial = composition();
    initial.performers.push({
      id: "fourth",
      label: "Performer 4",
      source: { kind: "derived", performerId: "third", transforms: [] },
      timing: { stepOffset: 0, speed: 1 },
    });
    initial.formation = { ...DEFAULT_CONFIG, fold: 8, speedOverrides: {} };
    restage(initial);

    const state = createState({
      openComposition: vi.fn(),
      initialComposition: initial,
    });
    const reopened = state.previewCompositionWithFormation(initial.formation)!;
    const layers = resolveTunnelLayerPlans(reopened, initial.formation);

    expect(state.performerSlots.map((slot) => slot.id)).toEqual([
      "lead",
      "partner",
      "third",
      "fourth",
    ]);
    expect(layers).toHaveLength(8);
    expect(
      Object.fromEntries(
        reopened.performers.map((performer) => [
          performer.id,
          layers.filter((layer) => layer.performerId === performer.id).length,
        ])
      )
    ).toEqual({ lead: 2, partner: 2, third: 2, fourth: 2 });
  });

  it("turns a legacy duplicate into a newly authored performer before growing the stage", () => {
    const initial = composition();
    initial.formation = { ...DEFAULT_CONFIG, fold: 4, speedOverrides: {} };
    restage(initial);
    const state = createState({
      openComposition: vi.fn(),
      initialComposition: initial,
      createId: () => "fourth",
    });

    expect(
      state.stageInstances.map((instance) => instance.performerId)
    ).toEqual(["lead", "partner", "third", "lead"]);
    expect(state.setPerformerCount(4)).toBe(true);
    const fourthId = state.performerIdAt(3)!;

    expect(state.renderedInstanceCount).toBe(4);
    expect(
      state.stageInstances.map((instance) => instance.performerId)
    ).toEqual(["lead", "partner", "third", fourthId]);
    expect(state.initialFormation.fold).toBe(4);
  });

  it("keeps normal authoring to four stable performer cards", () => {
    const state = createState({
      openComposition: vi.fn(),
      initialFormation: { ...DEFAULT_CONFIG, fold: 8, speedOverrides: {} },
      createId: (() => {
        let id = 0;
        return () => `roster-${++id}`;
      })(),
    });
    const initialIds = state.performerSlots.map((slot) => slot.id);

    while (state.canAddPerformer) expect(state.addPerformer()).not.toBeNull();

    expect(state.performerSlots).toHaveLength(4);
    expect(state.performerSlots.slice(0, 2).map((slot) => slot.id)).toEqual(
      initialIds
    );
    expect(new Set(state.performerSlots.map((slot) => slot.id)).size).toBe(4);
    expect(state.addPerformer()).toBeNull();
    expect(state.addPerformerBlockedReason).toContain("four");

    const restored = createState({
      openComposition: vi.fn(),
      initialDraft: state.draftSnapshot(),
    });
    expect(restored.performerSlots.map((slot) => slot.id)).toEqual(
      state.performerSlots.map((slot) => slot.id)
    );
  });

  it("preserves legacy casts above the four-performer authoring ceiling", () => {
    const initial = composition();
    for (let index = 4; index <= 6; index += 1) {
      initial.performers.push({
        id: `legacy-${index}`,
        label: `Performer ${index}`,
        source: {
          kind: "derived",
          performerId: "lead",
          transforms: [],
        },
        timing: { stepOffset: index - 1, speed: 1 },
      });
    }
    initial.formation = { ...DEFAULT_CONFIG, fold: 8, speedOverrides: {} };
    restage(initial);

    const state = createState({
      openComposition: vi.fn(),
      initialComposition: initial,
    });

    expect(state.performerSlots).toHaveLength(6);
    expect(
      state.previewCompositionWithFormation(initial.formation)?.performers
    ).toHaveLength(6);
    expect(state.canAddPerformer).toBe(false);
    expect(state.addPerformerBlockedReason).toContain("preserved");
  });

  it("builds a seeded canon as real linked performers with distributed offsets", () => {
    const state = createState({
      openComposition: vi.fn(),
      initialFormation: { ...DEFAULT_CONFIG, fold: 4, speedOverrides: {} },
      createId: (() => {
        let id = 0;
        return () => `canon-${++id}`;
      })(),
    });
    const leadId = state.performerIdAt(0)!;
    state.setPerformerSequence(leadId, {
      ...sequence,
      steps: Array.from({ length: 16 }, (_, index) => ({
        id: `step-${index}`,
      })),
    } as unknown as SequenceData);

    state.setWorkflow("seeded");
    expect(state.setPerformerCount(4)).toBe(true);

    const performers = state.previewCompositionWithFormation({
      ...DEFAULT_CONFIG,
      fold: 4,
      speedOverrides: {},
    })!.performers;
    expect(performers).toHaveLength(4);
    expect(performers.slice(1).map((performer) => performer.source)).toEqual([
      { kind: "derived", performerId: leadId, transforms: [] },
      { kind: "derived", performerId: leadId, transforms: [] },
      { kind: "derived", performerId: leadId, transforms: [] },
    ]);
    expect(performers.map((performer) => performer.timing.stepOffset)).toEqual([
      0, 4, 8, 12,
    ]);
  });

  it("puts each newly authored performer on stage exactly once", () => {
    const state = createState({
      openComposition: vi.fn(),
      initialFormation: { ...DEFAULT_CONFIG, fold: 4, speedOverrides: {} },
      createId: (() => {
        let id = 0;
        return () => `exact-${++id}`;
      })(),
    });
    const firstId = state.performerIdAt(0)!;
    const secondId = state.performerIdAt(1)!;
    state.setPerformerSequence(firstId, sequence);
    state.setPerformerSequence(secondId, { ...sequence, id: "second" });
    const thirdId = state.addPerformer()!;
    state.setPerformerSequence(thirdId, { ...sequence, id: "third" });

    const composition = state.compositionWithFormation(state.initialFormation)!;
    const layers = resolveTunnelLayerPlans(composition);

    expect(state.authoredPerformerCount).toBe(3);
    expect(state.renderedInstanceCount).toBe(3);
    expect(layers.map((layer) => layer.performerId)).toEqual([
      firstId,
      secondId,
      thirdId,
    ]);
    expect(layers.map((layer) => layer.arm)).toEqual([0, 1, 3]);
  });

  it("makes repeated stage appearances explicit without losing cast coverage", () => {
    const state = createState({
      openComposition: vi.fn(),
      initialFormation: { ...DEFAULT_CONFIG, fold: 4, speedOverrides: {} },
      createId: (() => {
        let id = 0;
        return () => `appearance-${++id}`;
      })(),
    });
    const firstId = state.performerIdAt(0)!;
    const secondId = state.performerIdAt(1)!;
    state.setPerformerSequence(firstId, sequence);
    state.setPerformerSequence(secondId, { ...sequence, id: "second" });

    expect(state.addStageInstance(firstId)).toBe(true);
    expect(state.renderedInstanceCount).toBe(3);
    const duplicate = state.stageInstances.at(-1)!;
    expect(state.setStageInstancePerformer(duplicate.id, secondId)).toBe(true);
    expect(
      state.stageInstances.filter(
        (instance) => instance.performerId === secondId
      )
    ).toHaveLength(2);
    expect(state.removeStageInstance(duplicate.id)).toBe(true);
    expect(state.stageInstances).toHaveLength(2);
    expect(state.canRemoveStageInstance(state.stageInstances[0]!.id)).toBe(
      false
    );
    expect(state.removeStageInstance(state.stageInstances[0]!.id)).toBe(false);
  });

  it("keeps derived lineage valid while reordering and removing cards", () => {
    const state = createState({
      openComposition: vi.fn(),
      initialFormation: { ...DEFAULT_CONFIG, fold: 8, speedOverrides: {} },
      createId: (() => {
        let id = 0;
        return () => `lineage-${++id}`;
      })(),
    });
    const leadId = state.performerIdAt(0)!;
    const partnerId = state.performerIdAt(1)!;
    state.setPerformerSequence(leadId, sequence);
    const thirdId = state.addPerformer()!;
    state.setPerformerSequence(thirdId, { ...sequence, id: "third-source" });
    const fourthId = state.addPerformer()!;
    state.setPerformerSequence(fourthId, { ...sequence, id: "fourth-source" });
    expect(state.setPerformerSource(fourthId, thirdId)).toBe(true);

    expect(state.canMovePerformer(fourthId, -1)).toBe(false);
    expect(state.canMovePerformer(leadId, 1)).toBe(false);
    expect(state.removePerformer(thirdId)).toBe(false);
    expect(state.dependantLabels(thirdId)).toEqual(["Performer 4"]);
    expect(state.removePerformer(fourthId)).toBe(true);
    expect(state.movePerformer(thirdId, -1)).toBe(true);
    expect(state.performerSlots.map((slot) => slot.id)).toEqual([
      leadId,
      thirdId,
      partnerId,
    ]);
  });

  it("round-trips a later performer's source relationship and timing by stable id", () => {
    const state = createState({
      openComposition: vi.fn(),
      initialFormation: { ...DEFAULT_CONFIG, fold: 8, speedOverrides: {} },
      createId: (() => {
        let id = 0;
        return () => `relationship-${++id}`;
      })(),
    });
    const leadId = state.performerIdAt(0)!;
    state.setPerformerSequence(leadId, sequence);
    const thirdId = state.addPerformer()!;
    state.setPerformerSequence(thirdId, { ...sequence, id: "third-source" });
    expect(state.openPairingPanel(thirdId)).toBe(true);
    expect(state.setPerformerSource(thirdId, leadId)).toBe(true);
    state.setRelationship({ rotationSteps: 3, reflect: "mirror" });
    state.setPerformerTiming(thirdId, { stepOffset: 4, speed: 0.5 });

    const restored = createState({
      openComposition: vi.fn(),
      initialDraft: state.draftSnapshot(),
    });
    const performer = restored.performerSlots.find(
      (slot) => slot.id === thirdId
    )?.performer;

    expect(performer?.source).toEqual({
      kind: "derived",
      performerId: leadId,
      transforms: [{ kind: "rotate", amount: 3 }, { kind: "mirror" }],
    });
    expect(performer?.timing).toEqual({ stepOffset: 4, speed: 0.5 });
  });

  // A tunnel saved before the creator existed reopens as a solo cast: one
  // sequence, and a formation that spread it across the arms. The creator shows
  // two slots, so without synthesizing the partner the second slot stayed empty
  // and "Preview changes" was permanently disabled.
  it("keeps a synthetic legacy partner out of persistence until it is edited", () => {
    const initial = composition();
    initial.performers = [initial.performers[0]!];

    const state = createState({
      openComposition: vi.fn(),
      initialComposition: initial,
      editingTunnel: { id: "tunnel-1", name: "PΛ" },
      now: () => 300,
    });

    expect(state.mode).toBe("linked");
    expect(state.ready).toBe(true);
    expect(state.partnerIsFormationCopy).toBe(true);
    expect(state.partner?.source).toMatchObject({
      kind: "derived",
      performerId: state.lead!.id,
    });
    // The partner is the creator's own linked copy under the default rule, not
    // a relationship recovered from a record that never held one.
    expect(state.relationship).toEqual({
      rotationSteps: 0,
      reflect: "none",
      invert: false,
      rewind: false,
    });

    expect(
      state.compositionWithFormation(initial.formation)?.performers
    ).toEqual([state.lead]);

    state.setRelationship({ reflect: "mirror" });

    expect(state.partnerIsFormationCopy).toBe(false);

    const edited = state.compositionWithFormation(initial.formation);
    expect(edited?.performers).toHaveLength(2);
    expect(edited?.performers[1]?.source).toEqual({
      kind: "derived",
      performerId: state.lead!.id,
      transforms: [{ kind: "mirror" }],
    });
  });

  it("restores and snapshots an in-progress tunnel across HMR", () => {
    const performerOne = composition().performers[0];
    const draft: TunnelCreatorDraft = {
      version: TUNNEL_CREATOR_DRAFT_VERSION,
      workflow: "custom",
      mode: "separate",
      composition: {
        ...composition(),
        performers: performerOne ? [performerOne] : [],
        formation: { ...DEFAULT_CONFIG, fold: 4, speedOverrides: {} },
      },
      relationship: {
        rotationSteps: 5,
        reflect: "flip",
        invert: false,
        rewind: true,
      },
      sourceStates: [],
      workspace: {
        activePanel: "generation",
        generationTargetId: "lead",
      },
      editingTunnel: { id: "tunnel-1", name: "My tunnel" },
      presentation: presentationSnapshot,
    };
    const state = createState({
      openComposition: vi.fn(),
      initialDraft: draft,
      now: () => 400,
    });

    expect(state.mode).toBe("separate");
    expect(state.lead?.label).toBe("Performer 1");
    expect(state.partner).toBeNull();
    expect(state.relationship).toEqual(draft.relationship);
    expect(state.initialFormation.fold).toBe(4);
    expect(state.editingTunnel).toEqual(draft.editingTunnel);
    expect(state.activePanel).toBe("generation");
    expect(state.generationTargetId).toBe("lead");

    state.setFormation({ ...DEFAULT_CONFIG, fold: 6, speedOverrides: {} });
    const snapshot = state.draftSnapshot();

    expect(snapshot.composition?.formation.fold).toBe(6);
    expect(snapshot.composition?.performers).toHaveLength(1);
    expect(snapshot.composition?.performers[0]?.label).toBe("Performer 1");
    expect(snapshot.workspace).toEqual(draft.workspace);
    expect(snapshot.editingTunnel).toEqual(draft.editingTunnel);
    expect(snapshot.presentation).toEqual(presentationSnapshot);
  });

  it("keeps independent sources and Previous history while modes change", () => {
    const first = { ...sequence, id: "first", name: "First" };
    const second = { ...sequence, id: "second", name: "Second" };
    const third = { ...sequence, id: "third", name: "Third" };
    const state = createState({
      openComposition: vi.fn(),
      createId: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    });
    const performerOneId = state.performerIdAt(0);
    const performerTwoId = state.performerIdAt(1);

    expect(performerOneId).not.toBeNull();
    expect(performerTwoId).not.toBeNull();
    if (!performerOneId || !performerTwoId) return;

    state.setPerformerSequence(performerOneId, first, "generated");
    state.setPerformerSequence(performerOneId, second, "generated");
    state.setPerformerSequence(performerTwoId, third, "picked");
    state.setMode("linked");

    expect(state.partner?.source.kind).toBe("derived");

    state.setMode("separate");

    expect(state.partnerSequence?.id).toBe("third");
    expect(state.previousCount(performerOneId)).toBe(1);
    expect(state.restorePreviousSequence(performerOneId)).toBe(true);
    expect(state.leadSequence?.id).toBe("first");
  });

  it("persists generated source history across an HMR draft round trip", () => {
    const state = createState({
      openComposition: vi.fn(),
      createId: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    });
    const performerId = state.performerIdAt(0);
    if (!performerId) return;

    state.setPerformerSequence(
      performerId,
      { ...sequence, id: "generated-1" },
      "generated"
    );
    state.setPerformerSequence(
      performerId,
      { ...sequence, id: "generated-2" },
      "generated"
    );

    const restored = createState({
      openComposition: vi.fn(),
      initialDraft: state.draftSnapshot(),
    });
    const restoredId = restored.performerIdAt(0);

    expect(restoredId).toBe(performerId);
    expect(restoredId && restored.previousCount(restoredId)).toBe(1);
    expect(restoredId && restored.sourceOrigin(restoredId)).toBe("generated");
    expect(restoredId && restored.restorePreviousSequence(restoredId)).toBe(
      true
    );
    expect(restored.leadSequence?.id).toBe("generated-1");
  });

  it("keeps an exact Shape Matrix source through save, gallery reopen, edit, and save", () => {
    const provenance: ShapeMatrixTunnelSourceProvenance = {
      kind: "shape-matrix-realization",
      version: 1,
      baseSequenceId: "l1-tnd-AAAA",
      mode: "SS",
      leftFlower: {
        style: "pro",
        turns: 1,
        ori: "in",
        grid: "diamond",
        petals: 2,
      },
      rightFlower: {
        style: "anti",
        turns: 2,
        ori: "out",
        grid: "diamond",
        petals: 6,
      },
    };
    const realization = {
      ...sequence,
      id: "shape-matrix:l1-tnd-AAAA:SS:pro-1-in-diamond:anti-2-out-diamond",
      steps: [{ id: "realized-step", turn: 2 }],
      metadata: { realizationMarker: "exact" },
    } as unknown as SequenceData;
    const partner = { ...sequence, id: "partner-source" };
    const state = createState({
      openComposition: vi.fn(),
      createId: (() => {
        let id = 0;
        return () => `matrix-${++id}`;
      })(),
      now: () => 1000,
    });
    const leadId = state.performerIdAt(0);
    const partnerId = state.performerIdAt(1);
    if (!leadId || !partnerId) return;

    state.setPerformerSequence(leadId, realization, "picked", {
      sourceSequenceId: provenance.baseSequenceId,
      provenance,
    });
    state.setPerformerSequence(partnerId, partner, "picked");
    const firstComposition = state.compositionWithFormation(DEFAULT_CONFIG)!;
    const firstSave = {
      id: "saved-tunnel",
      name: "Saved matrix tunnel",
      steps: [...realization.steps],
      snapshot: presentationSnapshot,
      poster: "data:image/webp;base64,AA",
      createdAt: 1000,
      composition: firstComposition,
    } as unknown as CollectedTunnel;

    const reopened = createState({
      openComposition: vi.fn(),
      initialComposition: collectedTunnelComposition(firstSave),
      editingTunnel: { id: firstSave.id, name: firstSave.name },
      now: () => 2000,
    });
    const secondComposition =
      reopened.compositionWithFormation(DEFAULT_CONFIG)!;
    const secondSave = {
      ...firstSave,
      composition: secondComposition,
    };
    const leadSource = secondComposition.performers[0]!.source;

    expect(leadSource.kind).toBe("independent");
    if (leadSource.kind !== "independent") return;
    expect(leadSource.sequence).toEqual(realization);
    expect(leadSource.sequence.id).toBe(realization.id);
    expect(leadSource.sourceSequenceId).toBe(provenance.baseSequenceId);
    expect(leadSource.provenance).toEqual(provenance);
    expect(tunnelRevisionPayload(secondSave).composition).toEqual(
      secondComposition
    );
  });

  it("persists the active generation workspace and its performer target", () => {
    const state = createState({
      openComposition: vi.fn(),
      createId: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    });
    const performerId = state.performerIdAt(1);
    if (!performerId) return;

    expect(state.openGenerationPanel(performerId)).toBe(true);

    const restored = createState({
      openComposition: vi.fn(),
      initialDraft: state.draftSnapshot(),
    });

    expect(restored.activePanel).toBe("generation");
    expect(restored.generationTargetId).toBe(performerId);
    expect(restored.selectedPerformerId).toBe(performerId);
  });

  it("keeps the active performer selected when its tab is pressed again", () => {
    const state = createState({
      openComposition: vi.fn(),
      createId: () => "selected-performer",
    });
    const performerId = state.performerIdAt(0);
    if (!performerId) return;

    expect(state.selectPerformer(performerId)).toBe(true);
    expect(state.selectPerformer(performerId)).toBe(true);
    expect(state.selectedPerformerId).toBe(performerId);
  });

  it("targets direct generation without opening the generation workspace", () => {
    const state = createState({
      openComposition: vi.fn(),
      createId: () => "direct-generate",
    });
    const performerId = state.performerIdAt(0);
    if (!performerId) return;

    expect(state.selectGenerationTarget(performerId)).toBe(true);
    expect(state.generationTargetId).toBe(performerId);
    expect(state.selectedPerformerId).toBe(performerId);
    expect(state.activePanel).toBeNull();
    expect(state.selectGenerationTarget("missing-performer")).toBe(false);
  });
});
