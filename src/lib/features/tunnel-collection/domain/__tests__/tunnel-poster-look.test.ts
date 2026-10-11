import { describe, expect, it } from "vitest";
import { SNAPSHOT_VERSION } from "#lib/shared/sequence-viewer/tunnel/tunnel-snapshot.js";
import { DEFAULT_CONFIG } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import {
  DEFAULT_TRAIL_SETTINGS,
  TAIL_LENGTH_MAX,
  TrailEffect,
  TrailMode,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type { CollectedTunnel } from "../tunnel-collection-types";
import {
  POSTER_NO_DECAY_FADE_MS,
  posterTrailSettings,
  tunnelForPoster,
} from "../tunnel-poster-look";

function tunnel(): CollectedTunnel {
  return {
    id: "tunnel-1",
    name: "BBBA Duo",
    steps: [],
    poster: "data:image/webp;base64,stored",
    createdAt: 1,
    snapshot: {
      version: SNAPSHOT_VERSION,
      tunnel: {
        config: { ...DEFAULT_CONFIG },
        gridVisible: true,
        colors: {
          mode: "spectrum",
          custom: { left: "#2e8bf0", right: "#ed1c24" },
        },
        section: "tunnel",
        presetRecipe: null,
      },
      effects: {
        ...DEFAULT_EFFECTS_CONFIG,
        tipEffectMap: { "*": { effect: "fire" } },
      },
      effort: "linear",
      paths: {
        pathShape: "arc",
        motionAwarePaths: false,
        leftPathLines: false,
        rightPathLines: false,
      },
      playback: { bpm: 60, playbackMode: "continuous" },
      props: { leftPropType: "staff", rightPropType: "staff" },
      trailRender: {
        ...DEFAULT_TRAIL_SETTINGS,
        lineWidth: 7,
        leftColor: "#1e90ff",
        rightColor: "#ff2d55",
        glowBlur: 18,
        effect: TrailEffect.GLOW,
        hideProps: false,
        previewMode: true,
      },
    },
  };
}

describe("posterTrailSettings", () => {
  it("draws the whole figure instead of a moving window", () => {
    const poster = posterTrailSettings(tunnel().snapshot.trailRender);
    expect(poster.mode).toBe(TrailMode.PERSISTENT);
    expect(poster.tailLength).toBe(TAIL_LENGTH_MAX);
    expect(poster.usePathCache).toBe(true);
  });

  it("stops the overlay decaying, which is what made two publishes differ", () => {
    const poster = posterTrailSettings(tunnel().snapshot.trailRender);
    // Zero would mean "fade instantly" to decayRateFor, not "never fade".
    expect(poster.fadeDurationMs).toBe(POSTER_NO_DECAY_FADE_MS);
    expect(poster.fadeDurationMs).toBeGreaterThan(0);
  });

  it("clears the instrument out of the portrait", () => {
    const poster = posterTrailSettings(tunnel().snapshot.trailRender);
    expect(poster.hideProps).toBe(true);
    expect(poster.previewMode).toBe(false);
  });

  it("keeps everything that is the tunnel's identity", () => {
    const source = tunnel().snapshot.trailRender;
    const poster = posterTrailSettings(source);
    expect(poster.lineWidth).toBe(source.lineWidth);
    expect(poster.leftColor).toBe(source.leftColor);
    expect(poster.rightColor).toBe(source.rightColor);
    expect(poster.glowBlur).toBe(source.glowBlur);
    expect(poster.effect).toBe(source.effect);
  });
});

describe("tunnelForPoster", () => {
  it("hides the grid a tunnel was built against", () => {
    expect(tunnelForPoster(tunnel()).snapshot.tunnel.gridVisible).toBe(false);
  });

  it("leaves the saved record untouched", () => {
    const original = tunnel();
    const forPoster = tunnelForPoster(original);
    expect(original.snapshot.tunnel.gridVisible).toBe(true);
    expect(original.snapshot.trailRender.hideProps).toBe(false);
    expect(original.snapshot.trailRender.mode).not.toBe(TrailMode.PERSISTENT);
    expect(forPoster).not.toBe(original);
    expect(forPoster.snapshot).not.toBe(original.snapshot);
  });

  it("carries the config, cast and effects through unchanged", () => {
    const original = tunnel();
    const forPoster = tunnelForPoster(original);
    expect(forPoster.id).toBe(original.id);
    expect(forPoster.name).toBe(original.name);
    expect(forPoster.snapshot.tunnel.config).toEqual(
      original.snapshot.tunnel.config
    );
    expect(forPoster.snapshot.tunnel.colors.mode).toBe("spectrum");
    expect(forPoster.snapshot.effects).toEqual(original.snapshot.effects);
    expect(forPoster.snapshot.props).toEqual(original.snapshot.props);
    expect(forPoster.snapshot.playback).toEqual(original.snapshot.playback);
  });
});
