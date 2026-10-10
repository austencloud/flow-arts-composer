import { describe, expect, it } from "vitest";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import {
  createIndependentTunnelPerformer,
  createTunnelComposition,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
import { DEFAULT_CONFIG } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import type { TunnelSnapshot } from "#lib/shared/sequence-viewer/tunnel/tunnel-snapshot.js";
import {
  TUNNEL_CREATOR_DRAFT_VERSION,
  type TunnelCreatorDraft,
} from "./tunnel-creator-draft";
import {
  tunnelEditorContentKey,
  tunnelEditorSessionStatus,
} from "./tunnel-editor-session";
import type { TunnelCreatorHandoff } from "../services/tunnel-creator-handoff";

const steps = [{ stepNumber: 1, letter: "A" }] as unknown as StepData[];
const sequence = createSequenceData({
  id: "sequence-1",
  name: "A",
  word: "A",
  steps,
});
const performer = {
  ...createIndependentTunnelPerformer(sequence, 0),
  source: {
    kind: "independent" as const,
    sequence,
    sourceSequenceId: "library-sequence-1",
  },
};
const composition = createTunnelComposition([performer], {
  id: "tunnel-1",
  name: "Saved tunnel",
  formation: DEFAULT_CONFIG,
  now: 10,
});
const snapshot = {
  version: 2,
  tunnel: {
    config: DEFAULT_CONFIG,
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
    leftPropType: "staff",
    rightPropType: "staff",
    leftBuugengFlipped: false,
    rightBuugengFlipped: false,
  },
  trailRender: { mode: "off" },
} as unknown as TunnelSnapshot;

function opened(): TunnelCreatorHandoff {
  return {
    tunnelId: "tunnel-1",
    tunnelName: "Saved tunnel",
    composition,
    snapshot,
    formation: DEFAULT_CONFIG,
    presetRecipe: null,
    createdAt: 20,
  };
}

function draft(
  overrides: Partial<TunnelCreatorDraft> = {}
): TunnelCreatorDraft {
  return {
    version: TUNNEL_CREATOR_DRAFT_VERSION,
    workflow: "custom",
    mode: "linked",
    composition: { ...composition, updatedAt: 999 },
    relationship: {
      rotationSteps: 0,
      reflect: "none",
      invert: false,
      rewind: false,
    },
    sourceStates: [],
    workspace: { activePanel: null, generationTargetId: null },
    editingTunnel: { id: "tunnel-1", name: "Saved tunnel" },
    presentation: snapshot,
    ...overrides,
  };
}

describe("Tunnel editor session replacement status", () => {
  it("ignores volatile composition timestamps for an unchanged saved tunnel", () => {
    expect(tunnelEditorSessionStatus(draft(), opened())).toMatchObject({
      editingTunnelId: "tunnel-1",
      hasContent: true,
      dirty: false,
    });
  });

  it("protects a performed presentation change", () => {
    const changed = draft({
      presentation: {
        ...snapshot,
        playback: { ...snapshot.playback, bpm: 132 },
      },
    });

    expect(tunnelEditorSessionStatus(changed, opened()).dirty).toBe(true);
  });

  it("reads a missing prop version as Version 1", () => {
    // The creator always captures a version, but a tunnel saved before
    // versions has none, and opening it must not look like an edit.
    const captured = draft({
      presentation: {
        ...snapshot,
        props: { ...snapshot.props, propLook: "pictograph" },
      },
    });

    expect(tunnelEditorSessionStatus(captured, opened()).dirty).toBe(false);
  });

  it("protects a prop version change", () => {
    const changed = draft({
      presentation: {
        ...snapshot,
        props: { ...snapshot.props, propLook: "model" },
      },
    });

    expect(tunnelEditorSessionStatus(changed, opened()).dirty).toBe(true);
  });

  it("protects source identity and provenance changes", () => {
    const changedComposition = {
      ...composition,
      performers: [
        {
          ...composition.performers[0]!,
          source: {
            ...composition.performers[0]!.source,
            sourceSequenceId: "library-sequence-2",
          },
        },
      ],
    };

    expect(tunnelEditorContentKey(changedComposition, snapshot)).not.toBe(
      tunnelEditorContentKey(composition, snapshot)
    );
  });

  it("protects any non-empty restored draft without claiming a saved baseline", () => {
    expect(tunnelEditorSessionStatus(draft(), null).dirty).toBe(true);
  });

  it("allows an empty new workspace to be replaced immediately", () => {
    expect(
      tunnelEditorSessionStatus(
        draft({
          composition: null,
          editingTunnel: null,
          presentation: null,
        }),
        null
      )
    ).toMatchObject({ hasContent: false, dirty: false });
  });

  it("accepts an exact save acknowledgement as the new baseline", () => {
    const baseline = tunnelEditorContentKey(composition, snapshot);

    expect(tunnelEditorSessionStatus(draft(), null).dirty).toBe(true);
    expect(tunnelEditorSessionStatus(draft(), null, baseline).dirty).toBe(
      false
    );
  });
});
