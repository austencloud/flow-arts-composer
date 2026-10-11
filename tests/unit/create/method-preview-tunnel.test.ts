/**
 * The Create front door's Tunnel preview: the Tunnel's own Radial formation,
 * the sequence its performer takes when the dice is pressed, and the beats.
 * When no draw came, the sequence turns an eighth, because a quarter turn
 * maps a four-fold ring onto itself and the tunnel would look the same. The
 * beats leave the new performer, and then its bloomed ring, time to play.
 */
import { describe, expect, it } from "vitest";
import { rotateSequenceGeometry } from "#lib/shared/create/services/sequence-derived-fields.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { getPreset } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import { TUNNEL_REVEAL_DURATION } from "#lib/shared/sequence-viewer/tunnel/tunnel-layer-reveal.js";
import { builtInTunnelPresetRecipe } from "#lib/shared/sequence-viewer/tunnel/tunnel-preset-recipe.js";
import { METHOD_PREVIEW_TIMING } from "#lib/features/create/shared/state/method-preview-turns.svelte.js";
import { DEMO_SEQUENCE } from "#lib/features/create/shared/components/method-previews/method-preview-demo.js";
import { SCENE_TAP } from "#lib/features/create/shared/components/method-previews/method-preview-run.js";
import {
  TUNNEL_PREVIEW_PRESET,
  TUNNEL_PREVIEW_TIMING,
  nextTunnelSequence,
} from "#lib/features/create/shared/components/method-previews/method-preview-tunnel.js";

/** The attract ghost's shortest glide (attract-ghost.svelte.ts). */
const SHORTEST_GLIDE_MS = 300;

/** A four-step draw cut from the demo sequence, standing in for a fresh one. */
const fresh: SequenceData = {
  ...DEMO_SEQUENCE,
  steps: DEMO_SEQUENCE.steps.slice(4, 8),
};

describe("Tunnel preview formation", () => {
  it("is the Tunnel's own Radial preset: four performers", () => {
    expect(getPreset(TUNNEL_PREVIEW_PRESET)?.config.fold).toBe(4);
    expect(builtInTunnelPresetRecipe(TUNNEL_PREVIEW_PRESET)).not.toBeNull();
  });
});

describe("the performer's next sequence", () => {
  it("is a fresh draw when one came", () => {
    expect(nextTunnelSequence(DEMO_SEQUENCE, fresh)).toBe(fresh);
  });

  it("turns the current sequence an eighth when no draw came", () => {
    const turned = nextTunnelSequence(DEMO_SEQUENCE, null);
    expect(turned).toEqual(rotateSequenceGeometry(DEMO_SEQUENCE, 1));
    // The demo's first blue motion starts at west; an eighth clockwise is northwest.
    expect(turned.steps[0]?.motions[HandSide.LEFT]?.startLocation).toBe("nw");
    expect(turned.gridMode).toBe("box");
  });

  it("turns the current sequence when the draw came back empty", () => {
    const empty: SequenceData = { ...DEMO_SEQUENCE, steps: [] };
    expect(nextTunnelSequence(DEMO_SEQUENCE, empty)).toEqual(
      rotateSequenceGeometry(DEMO_SEQUENCE, 1)
    );
  });
});

describe("Tunnel preview beats", () => {
  const timing = TUNNEL_PREVIEW_TIMING;
  const tap = SHORTEST_GLIDE_MS + SCENE_TAP.considerMs + SCENE_TAP.pressMs;
  /** From the turn's start until the new performer is back. */
  const back =
    timing.leadMs + tap + timing.foldMs + timing.fadeOutMs + timing.fadeInMs;

  it("leaves the new performer at least a second of the turn", () => {
    expect(back).toBeLessThanOrEqual(METHOD_PREVIEW_TIMING.turnMs - 1000);
  });

  it("blooms its copies with the viewer's own bloom", () => {
    expect(timing.bloomMs).toBe(TUNNEL_REVEAL_DURATION);
  });

  it("leaves the bloomed ring at least half a second of the turn", () => {
    expect(back + timing.bloomMs).toBeLessThanOrEqual(
      METHOD_PREVIEW_TIMING.turnMs - 500
    );
  });
});
