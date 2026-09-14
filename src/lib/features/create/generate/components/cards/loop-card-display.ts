/**
 * loop-card-display.ts — turns the collapsed LOOP card's config into exactly
 * what LOOPIconStrip needs, and nothing else.
 *
 * The card has enough conditionals to obscure the component if they live
 * inline: period gating, reflection-axis normalization, inversion interval
 * type conversion, and overlay grouping. They are pure, so they live here and
 * get tested directly.
 *
 * Deliberately NOT loop-display-resolver.ts — that resolver reads generated
 * sequence data. This card only ever holds a config.
 */

import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import {
  LOOPType,
  Period,
} from "$lib/shared/foundation/domain/models/generation/circular-models";
import {
  parseLoopComponents,
  resolveLoopConfig,
} from "$lib/shared/create/services/loop-type-utils";
import type { ReflectionAxis } from "@tka/sequence-engine/loop";
import type { HandRelationship } from "$lib/shared/create/domain/hand-relationship";

export interface LoopCardDisplayInput {
  loopEnabled: boolean;
  loopType: LOOPType | string;
  /** Requested rotation period. Gated to halved for non-rotation LOOPs. */
  period?: Period | string;
  inversionInterval?: 2 | 4;
  inversionMode?: "expand" | "overlay";
  reflectionAxis?: ReflectionAxis;
  /** Mirrored and Flipped hands coerce quartered rotation and diagonal axes. */
  handRelationship?: HandRelationship;
}

export interface LoopCardDisplay {
  /**
   * Raw parsed components. Drives the LOOP drawer's selection grid, so it
   * stays un-normalized — a mirrored LOOP on an east-west axis must still
   * reopen with MIRRORED selected plus that axis, not as FLIPPED.
   */
  selectedComponents: Set<LOOPComponent>;
  /**
   * Legacy-component-normalized inputs for the icon strip. The exact
   * reflection axis travels separately in effectiveAxis.
   */
  iconComponents: Set<LOOPComponent>;
  /** Inversion rendered after the strip's separator dot, in overlay mode only. */
  overlayComponents: Set<LOOPComponent>;
  /** Effective rotation period, undefined when nothing rotates. */
  rotationPeriod: Period | undefined;
  /** Effective inversion period, undefined when nothing inverts. */
  inversionPeriod: Period | undefined;
  /** The reflection axis actually in force, or null when nothing reflects. */
  effectiveAxis: ReflectionAxis | null;
}

const EMPTY: ReadonlySet<LOOPComponent> = new Set<LOOPComponent>();

/**
 * The axis in force for a component set: an explicit config axis wins, and a
 * legacy FLIPPED type falls back to east-west the same way resolveLoopConfig
 * and buildLoopSpec do.
 */
export function resolveEffectiveAxis(
  components: ReadonlySet<LOOPComponent>,
  reflectionAxis: ReflectionAxis | undefined
): ReflectionAxis | null {
  const reflects =
    components.has(LOOPComponent.MIRRORED) ||
    components.has(LOOPComponent.FLIPPED);
  if (!reflects) return null;
  if (reflectionAxis) return reflectionAxis;
  return components.has(LOOPComponent.FLIPPED) ? "east-west" : "north-south";
}

/**
 * Preserve the legacy component whose default axis matches cardinal
 * reflections. Diagonal axes keep the parsed component because the shared
 * icon strip rotates its Reflection glyph from effectiveAxis.
 *
 * Without this, a legacy mirrored LOOP retargeted to east-west shows the
 * left-right icon under the word "Flipped".
 */
function normalizeReflectionForIcons(
  components: ReadonlySet<LOOPComponent>,
  axis: ReflectionAxis | null
): Set<LOOPComponent> {
  const next = new Set(components);
  if (axis !== "east-west" && axis !== "north-south") return next;

  const wanted =
    axis === "east-west" ? LOOPComponent.FLIPPED : LOOPComponent.MIRRORED;
  const unwanted =
    axis === "east-west" ? LOOPComponent.MIRRORED : LOOPComponent.FLIPPED;

  if (next.has(unwanted) || next.has(wanted)) {
    next.delete(unwanted);
    next.add(wanted);
  }
  return next;
}

/**
 * Build the collapsed LOOP card's display model.
 *
 * `loopEnabled: false` yields an entirely empty model — the config keeps its
 * last loopType (there is no "none" LOOPType), and a stale value must not
 * light up an icon.
 */
export function buildLoopCardDisplay(
  input: LoopCardDisplayInput
): LoopCardDisplay {
  if (!input.loopEnabled) {
    return {
      selectedComponents: new Set<LOOPComponent>(),
      iconComponents: new Set<LOOPComponent>(),
      overlayComponents: new Set<LOOPComponent>(),
      rotationPeriod: undefined,
      inversionPeriod: undefined,
      effectiveAxis: null,
    };
  }

  const selectedComponents = parseLoopComponents(input.loopType);

  // resolveLoopConfig is the period gate: a persisted quartered value on a
  // LOOP without rotation comes back halved, so the card can't show the
  // 90° spin glyph for a 180° loop.
  const resolved = resolveLoopConfig(input.loopType, input.period as string | undefined, {
    inversionInterval: input.inversionInterval,
    inversionMode: input.inversionMode,
    reflectionAxis: input.reflectionAxis,
    handRelationship: input.handRelationship,
  });

  const effectiveAxis = resolveEffectiveAxis(
    selectedComponents,
    resolved.loopRhythm.reflectionAxis
  );

  const rotates = selectedComponents.has(LOOPComponent.ROTATED);
  const inverts = selectedComponents.has(LOOPComponent.INVERTED);

  // Period and inversionInterval are different types by design (an enum vs a
  // 2 | 4 literal). Convert explicitly rather than letting one leak.
  const inversionPeriod = inverts
    ? resolved.loopRhythm.inversionInterval === 4
      ? Period.QUARTERED
      : Period.HALVED
    : undefined;

  return {
    selectedComponents,
    iconComponents: normalizeReflectionForIcons(selectedComponents, effectiveAxis),
    overlayComponents:
      inverts && resolved.loopRhythm.inversionMode === "overlay"
        ? new Set([LOOPComponent.INVERTED])
        : new Set(EMPTY),
    rotationPeriod: rotates
      ? resolved.period === "quartered"
        ? Period.QUARTERED
        : Period.HALVED
      : undefined,
    inversionPeriod,
    effectiveAxis,
  };
}

/**
 * The rhythm detail a screen reader would otherwise lose: the icon strip is
 * hidden from the accessibility tree (the button owns the name), so quartered
 * rotation, quartered inversion, and overlay mode have to be spoken here.
 */
export function describeLoopRhythm(display: LoopCardDisplay): string {
  const parts: string[] = [];
  if (display.rotationPeriod === Period.QUARTERED) parts.push("quartered rotation");
  else if (display.rotationPeriod === Period.HALVED) parts.push("halved rotation");
  if (display.inversionPeriod === Period.QUARTERED) parts.push("quartered inversion");
  if (display.overlayComponents.has(LOOPComponent.INVERTED)) {
    parts.push("overlay inversion");
  }
  return parts.join(", ");
}
