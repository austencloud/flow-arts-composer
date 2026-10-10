import { beforeEach, describe, expect, it } from "vitest";
import type { CollectedTunnel } from "#lib/features/tunnel-collection/domain/tunnel-collection-types.js";
import { DEFAULT_CONFIG } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  createIndependentTunnelPerformer,
  createTunnelComposition,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import {
  consumeTunnelCreatorHandoff,
  createTunnelCreatorHandoff,
  saveTunnelCreatorHandoff,
} from "#lib/features/create/tunnel/services/tunnel-creator-handoff.js";

const STORAGE_KEY = "tka:tunnel-creator-handoff";

const steps = [
  { stepNumber: 1, letter: "A" },
  { stepNumber: 2, letter: "B" },
] as unknown as StepData[];

const formation = { ...DEFAULT_CONFIG, fold: 4 };
const snapshot = {
  version: 1,
  tunnel: {
    config: formation,
    gridVisible: true,
    spectrum: false,
    section: "props",
  },
  effects: { activeEffect: "fire", intensity: 0.7 },
  effort: "punch",
  paths: {
    pathShape: "concave",
    motionAwarePaths: true,
    leftPathLines: true,
    rightPathLines: false,
  },
  playback: { bpm: 132, playbackMode: "step" },
  props: {
    leftPropType: "buugeng",
    rightPropType: "buugeng",
    leftBuugengFlipped: true,
    rightBuugengFlipped: false,
  },
  trailRender: { mode: "trail", tailLength: 48 },
};
const migratedSnapshot = {
  ...snapshot,
  version: 3,
  tunnel: {
    config: snapshot.tunnel.config,
    gridVisible: snapshot.tunnel.gridVisible,
    section: snapshot.tunnel.section,
    presetRecipe: null,
  },
};

function savedTunnel(
  overrides: Partial<CollectedTunnel> = {}
): CollectedTunnel {
  return {
    id: "tunnel-42",
    name: "Four-person weave",
    steps,
    poster: "data:image/webp;base64,AA",
    createdAt: 123,
    snapshot,
    ...overrides,
  } as unknown as CollectedTunnel;
}

describe("tunnel creator handoff", () => {
  beforeEach(() => sessionStorage.clear());

  it("carries the saved tunnel identity, poster, and cast exactly once", () => {
    const composition = createTunnelComposition(
      [
        createIndependentTunnelPerformer(
          createSequenceData({ id: "s1", name: "Lead", word: "AB", steps }),
          0
        ),
      ],
      { formation }
    );
    saveTunnelCreatorHandoff(savedTunnel({ composition }));

    expect(consumeTunnelCreatorHandoff()).toMatchObject({
      tunnelId: "tunnel-42",
      tunnelName: "Four-person weave",
      poster: "data:image/webp;base64,AA",
      composition: { performers: composition.performers },
      snapshot: migratedSnapshot,
      formation,
    });
    expect(consumeTunnelCreatorHandoff()).toBeNull();
  });

  it("uses the same migrated editor input without a module handoff", () => {
    const input = createTunnelCreatorHandoff(savedTunnel(), () => 456);

    expect(input).toMatchObject({
      tunnelId: "tunnel-42",
      tunnelName: "Four-person weave",
      snapshot: migratedSnapshot,
      formation,
      presetRecipe: null,
      createdAt: 456,
    });
    expect(input.composition.performers).toHaveLength(1);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("carries explicit recipe provenance but leaves legacy provenance unknown", () => {
    saveTunnelCreatorHandoff(
      savedTunnel({
        snapshot: {
          ...snapshot,
          version: 2,
          tunnel: {
            ...snapshot.tunnel,
            config: formation,
            presetRecipe: {
              kind: "built-in",
              id: "radial",
              name: "Radial",
              config: formation,
            },
          },
        } as CollectedTunnel["snapshot"],
      })
    );
    expect(consumeTunnelCreatorHandoff()?.presetRecipe?.id).toBe("radial");

    saveTunnelCreatorHandoff(savedTunnel());
    expect(consumeTunnelCreatorHandoff()?.presetRecipe).toBeNull();
  });

  // The bug this contract exists for: a tunnel saved before the creator existed
  // has no composition, and used to reach the creator as an empty picker under
  // an "Edit tunnel" title.
  it("reconstructs a cast for a tunnel saved without one", () => {
    saveTunnelCreatorHandoff(savedTunnel());

    const handoff = consumeTunnelCreatorHandoff();
    expect(handoff?.composition.performers.length).toBeGreaterThan(0);

    const lead = handoff!.composition.performers[0]!;
    expect(lead.source.kind).toBe("independent");
    if (lead.source.kind === "independent") {
      expect(lead.source.sequence.steps).toHaveLength(2);
    }
  });

  it("rejects an incomplete persisted handoff", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tunnelId: "tunnel-42", tunnelName: "Broken" })
    );

    expect(consumeTunnelCreatorHandoff()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("accepts a legacy handoff without a snapshot", () => {
    const composition = createTunnelComposition(
      [
        createIndependentTunnelPerformer(
          createSequenceData({ id: "s1", name: "Lead", word: "AB", steps }),
          0
        ),
      ],
      { formation }
    );
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tunnelId: "legacy-tunnel",
        tunnelName: "Legacy",
        composition,
        formation,
        createdAt: 5,
      })
    );

    expect(consumeTunnelCreatorHandoff()).toMatchObject({
      tunnelId: "legacy-tunnel",
      snapshot: null,
      formation,
    });
  });

  it("rejects a persisted handoff whose cast is empty", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tunnelId: "tunnel-42",
        tunnelName: "Empty cast",
        composition: { performers: [] },
        formation,
      })
    );

    expect(consumeTunnelCreatorHandoff()).toBeNull();
  });
});
