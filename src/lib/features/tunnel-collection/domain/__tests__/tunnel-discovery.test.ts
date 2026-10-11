import { describe, expect, it } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { DEFAULT_CONFIG } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  createIndependentTunnelPerformer,
  createTunnelComposition,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
import type { CollectedTunnel } from "../tunnel-collection-types";
import {
  describeTunnelForDiscovery,
  matchesTunnelDiscoveryQuery,
  sortTunnelDiscovery,
} from "../tunnel-discovery";

function tunnel(
  id: string,
  name: string,
  createdAt: number,
  patch: Partial<CollectedTunnel> = {}
): CollectedTunnel {
  return {
    id,
    name,
    steps: [],
    poster: "data:image/webp;base64,AA",
    createdAt,
    snapshot: {
      version: 2,
      tunnel: {
        config: { ...DEFAULT_CONFIG, speedOverrides: {} },
        gridVisible: false,
        colors: {
          mode: "hands",
          custom: { left: "#2e8bf0", right: "#ed1c24" },
        },
        section: "tunnel",
        presetRecipe: null,
      },
      effects: { activeEffect: "none" },
      effort: "continuous",
      paths: {
        pathShape: "arc",
        motionAwarePaths: false,
        leftPathLines: true,
        rightPathLines: true,
      },
      playback: { bpm: 60, playbackMode: "continuous" },
      props: {
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
      },
      trailRender: { mode: "off" },
    },
    ...patch,
  } as CollectedTunnel;
}

describe("tunnel discovery metadata", () => {
  it("describes props, authored performers, generated copies, and transforms", () => {
    const item = tunnel("orbit", "Orbit", 10);
    item.snapshot.props = {
      leftPropType: PropType.FAN,
      rightPropType: PropType.CLUB,
    };
    item.snapshot.tunnel.config = {
      ...DEFAULT_CONFIG,
      fold: 4,
      mirror: true,
      invert: true,
      staggerSteps: 2,
      speedOverrides: { 1: 2 },
    };
    item.snapshot.effects = {
      activeEffect: "bloom",
    } as typeof item.snapshot.effects;
    item.composition = createTunnelComposition(
      Array.from({ length: 3 }, (_, index) =>
        createIndependentTunnelPerformer(
          createSequenceData({ id: `s${index}`, name: "A", word: "A" }),
          index
        )
      ),
      {
        id: "composition",
        name: "Orbit",
        formation: item.snapshot.tunnel.config,
        now: 1,
      }
    );

    expect(describeTunnelForDiscovery(item)).toMatchObject({
      authoredCount: 3,
      renderedCount: 8,
      propCount: 16,
      propsLabel: "Left Fan · Right Club",
      recipeLabel: "Custom formation",
      formationLabel:
        "4-fold rotation · Mirror · Invert alternating copies · 2-step stagger · Mixed speeds",
      effectLabel: "Bloom",
    });
  });

  it("searches the rendered artifact details rather than only the title", () => {
    const item = tunnel("orbit", "Orbit", 10);
    item.snapshot.props = {
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
    };
    item.snapshot.tunnel.config = {
      ...DEFAULT_CONFIG,
      fold: 4,
      mirror: true,
      speedOverrides: {},
    };

    expect(matchesTunnelDiscoveryQuery(item, "fan")).toBe(true);
    expect(matchesTunnelDiscoveryQuery(item, "mirror")).toBe(true);
    expect(matchesTunnelDiscoveryQuery(item, "club")).toBe(false);
  });

  it("sorts by recency, name, authored performers, or rendered instances", () => {
    const older = tunnel("old", "Zulu", 10);
    const newer = tunnel("new", "Alpha", 20);
    const many = tunnel("many", "Many", 15);
    many.snapshot.tunnel.config = {
      ...DEFAULT_CONFIG,
      fold: 8,
      speedOverrides: {},
    };
    many.composition = createTunnelComposition(
      Array.from({ length: 4 }, (_, index) =>
        createIndependentTunnelPerformer(
          createSequenceData({ id: `s${index}`, name: "A", word: "A" }),
          index
        )
      ),
      {
        id: "many-composition",
        name: "Many",
        formation: many.snapshot.tunnel.config,
        now: 1,
      }
    );

    expect(
      sortTunnelDiscovery([older, newer, many], "recent").map((x) => x.id)
    ).toEqual(["new", "many", "old"]);
    expect(
      sortTunnelDiscovery([older, newer, many], "name").map((x) => x.id)
    ).toEqual(["new", "many", "old"]);
    expect(sortTunnelDiscovery([older, newer, many], "performers")[0]?.id).toBe(
      "many"
    );
    expect(sortTunnelDiscovery([older, newer, many], "instances")[0]?.id).toBe(
      "many"
    );
  });
});
