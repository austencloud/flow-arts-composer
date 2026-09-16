import { describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  createIndependentTunnelPerformer,
  createTunnelComposition,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-composition";
import {
  parseTunnelCreatorDraft,
  TUNNEL_CREATOR_DRAFT_VERSION,
  type TunnelCreatorDraft,
} from "./tunnel-creator-draft";
import { DEFAULT_CONFIG } from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
import type { TunnelSnapshot } from "$lib/shared/sequence-viewer/tunnel/tunnel-snapshot";

const sequence = {
  id: "sequence-1",
  name: "AAAA",
  word: "AAAA",
  steps: [{ id: "step-1" }],
} as unknown as SequenceData;

const presentation = {
  version: 3,
  tunnel: {
    config: DEFAULT_CONFIG,
    gridVisible: true,
    colors: {
      mode: "hands",
      custom: { left: "#2e8bf0", right: "#ed1c24" },
    },
    section: "props",
    presetRecipe: null,
  },
  effects: { activeEffect: "none" },
  effort: "linear",
  paths: {
    pathShape: "arc",
    motionAwarePaths: false,
    leftPathLines: false,
    rightPathLines: false,
  },
  playback: { bpm: 96, playbackMode: "step" },
  props: {
    leftPropType: "buugeng",
    rightPropType: "buugeng",
    leftBuugengFlipped: true,
    rightBuugengFlipped: false,
  },
  trailRender: { mode: "trail" },
} as unknown as TunnelSnapshot;

describe("tunnel creator draft", () => {
  it("round-trips a partial separate-mode draft", () => {
    const draft: TunnelCreatorDraft = {
      version: TUNNEL_CREATOR_DRAFT_VERSION,
      workflow: "custom",
      mode: "separate",
      composition: createTunnelComposition([
        createIndependentTunnelPerformer(sequence, 0, "Performer 1"),
      ]),
      relationship: {
        rotationSteps: 3,
        reflect: "mirror",
        invert: true,
        rewind: false,
      },
      sourceStates: [],
      workspace: {
        activePanel: "generation",
        generationTargetId: "performer-1",
      },
      editingTunnel: { id: "tunnel-1", name: "Saved tunnel" },
      presentation,
    };

    expect(parseTunnelCreatorDraft(JSON.parse(JSON.stringify(draft)))).toEqual(
      draft
    );
  });

  it("round-trips Shape Matrix source lineage in performer history", () => {
    const provenance = {
      kind: "shape-matrix-realization" as const,
      version: 1 as const,
      baseSequenceId: "base-sequence",
      mode: "QO" as const,
      propMode: "SS" as const,
      leftFlower: {
        style: "float" as const,
        turns: "fl" as const,
        ori: "clock" as const,
        grid: "diamond" as const,
        petals: 0 as const,
      },
      rightFlower: {
        style: "pro" as const,
        turns: -0.25,
        ori: "out" as const,
        grid: "box" as const,
        petals: 1,
      },
    };
    const draft: TunnelCreatorDraft = {
      version: TUNNEL_CREATOR_DRAFT_VERSION,
      workflow: "seeded",
      mode: "linked",
      composition: null,
      relationship: {
        rotationSteps: 0,
        reflect: "none",
        invert: false,
        rewind: false,
      },
      sourceStates: [
        {
          performerId: "performer-1",
          label: "Performer 1",
          independentSequence: sequence,
          origin: "picked",
          sourceSequenceId: provenance.baseSequenceId,
          provenance,
          previous: [
            {
              sequence,
              origin: "picked",
              sourceSequenceId: provenance.baseSequenceId,
              provenance,
            },
          ],
        },
      ],
      workspace: { activePanel: null, generationTargetId: null },
      editingTunnel: null,
      presentation,
    };

    expect(parseTunnelCreatorDraft(JSON.parse(JSON.stringify(draft)))).toEqual(
      draft
    );
  });

  it("migrates a version-one draft without losing its composition", () => {
    const legacy = {
      version: 1,
      mode: "linked",
      composition: createTunnelComposition([
        createIndependentTunnelPerformer(sequence, 0, "Performer 1"),
      ]),
      relationship: {
        rotationSteps: 0,
        reflect: "none",
        invert: false,
        rewind: false,
      },
      editingTunnel: null,
    };

    const migrated = parseTunnelCreatorDraft(legacy);

    expect(migrated?.version).toBe(TUNNEL_CREATOR_DRAFT_VERSION);
    expect(migrated?.composition).toEqual(legacy.composition);
    expect(migrated?.sourceStates).toEqual([]);
    expect(migrated?.workspace).toEqual({
      activePanel: null,
      generationTargetId: null,
    });
    expect(migrated?.presentation).toBeNull();
  });

  it("migrates a version-two draft with a closed workspace", () => {
    const legacy = {
      version: 2,
      mode: "separate",
      composition: null,
      relationship: {
        rotationSteps: 0,
        reflect: "none",
        invert: false,
        rewind: false,
      },
      sourceStates: [],
      editingTunnel: null,
    };

    expect(parseTunnelCreatorDraft(legacy)?.workspace).toEqual({
      activePanel: null,
      generationTargetId: null,
    });
    expect(parseTunnelCreatorDraft(legacy)?.presentation).toBeNull();
  });

  it("migrates a version-three draft without inventing presentation state", () => {
    const legacy = {
      version: 3,
      mode: "linked",
      composition: null,
      relationship: {
        rotationSteps: 0,
        reflect: "none",
        invert: false,
        rewind: false,
      },
      sourceStates: [],
      workspace: { activePanel: "settings", generationTargetId: null },
      editingTunnel: null,
    };

    const migrated = parseTunnelCreatorDraft(legacy);
    expect(migrated?.version).toBe(TUNNEL_CREATOR_DRAFT_VERSION);
    expect(migrated?.workspace).toEqual(legacy.workspace);
    expect(migrated?.presentation).toBeNull();
  });

  it("migrates a version-four draft and derives workflow without rewriting its cast", () => {
    const composition = createTunnelComposition([
      createIndependentTunnelPerformer(sequence, 0, "Performer 1"),
    ]);
    const legacy = {
      version: 4,
      mode: "linked",
      composition,
      relationship: {
        rotationSteps: 0,
        reflect: "none",
        invert: false,
        rewind: false,
      },
      sourceStates: [],
      workspace: { activePanel: null, generationTargetId: null },
      editingTunnel: null,
      presentation,
    };

    const migrated = parseTunnelCreatorDraft(legacy);

    expect(migrated?.version).toBe(TUNNEL_CREATOR_DRAFT_VERSION);
    expect(migrated?.workflow).toBe("seeded");
    expect(migrated?.composition).toEqual(composition);
    expect(migrated?.presentation).toEqual(presentation);
  });

  it("migrates a version-five draft by materializing its visible stage", () => {
    const composition = createTunnelComposition([
      createIndependentTunnelPerformer(sequence, 0, "Performer 1"),
    ]);
    const { stage: _stage, ...legacyComposition } = composition;
    const legacy = {
      version: 5,
      workflow: "seeded",
      mode: "linked",
      composition: { ...legacyComposition, version: 1 },
      relationship: {
        rotationSteps: 0,
        reflect: "none",
        invert: false,
        rewind: false,
      },
      sourceStates: [],
      workspace: { activePanel: null, generationTargetId: null },
      editingTunnel: null,
      presentation,
    };

    const migrated = parseTunnelCreatorDraft(legacy);

    expect(migrated?.version).toBe(TUNNEL_CREATOR_DRAFT_VERSION);
    expect(migrated?.composition?.version).toBe(2);
    expect(migrated?.composition?.stage.instances).toHaveLength(2);
    expect(
      migrated?.composition?.stage.instances.map(
        (instance) => instance.performerId
      )
    ).toEqual([composition.performers[0]!.id, composition.performers[0]!.id]);
  });

  it("round-trips generated and library source provenance without approximating it", () => {
    const generated = {
      kind: "generator-recipe" as const,
      version: 1 as const,
      setup: {
        config: {
          length: 12,
          level: 3,
          gridMode: "box",
          loopEnabled: true,
          loopType: "mirrored",
        },
        startEndOptions: { endPlacements: ["alpha1", "beta3"] },
      },
    };
    const library = {
      kind: "library-sequence" as const,
      version: 1 as const,
      sequenceId: "public-sequence-9",
      scope: "public" as const,
    };
    const draft: TunnelCreatorDraft = {
      version: TUNNEL_CREATOR_DRAFT_VERSION,
      workflow: "custom",
      mode: "separate",
      composition: null,
      relationship: {
        rotationSteps: 0,
        reflect: "none",
        invert: false,
        rewind: false,
      },
      sourceStates: [
        {
          performerId: "performer-1",
          label: "Performer 1",
          independentSequence: sequence,
          origin: "generated",
          sourceSequenceId: sequence.id,
          provenance: generated,
          previous: [
            {
              sequence,
              origin: "picked",
              sourceSequenceId: library.sequenceId,
              provenance: library,
            },
          ],
        },
      ],
      workspace: { activePanel: null, generationTargetId: null },
      editingTunnel: null,
      presentation,
    };

    expect(parseTunnelCreatorDraft(JSON.parse(JSON.stringify(draft)))).toEqual(
      draft
    );
  });

  it("rejects malformed drafts instead of partially restoring them", () => {
    expect(
      parseTunnelCreatorDraft({
        version: TUNNEL_CREATOR_DRAFT_VERSION,
        workflow: "seeded",
        mode: "linked",
        composition: { performers: [] },
        relationship: {},
        editingTunnel: null,
      })
    ).toBeNull();
  });
});
