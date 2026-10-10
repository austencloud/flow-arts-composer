import { EFFECT_LABELS } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { getPropTypeDisplayInfo } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
import {
  configsEqual,
  imageCount,
  propCount,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import type { CollectedTunnel } from "./tunnel-collection-types";

export type TunnelDiscoverySort =
  | "recent"
  | "name"
  | "performers"
  | "instances";

export interface TunnelDiscoverySummary {
  readonly authoredCount: number;
  readonly renderedCount: number;
  readonly propCount: number;
  readonly propsLabel: string;
  readonly recipeLabel: string;
  readonly formationLabel: string;
  readonly effectLabel: string;
  readonly bpm: number;
  readonly searchText: string;
}

function propLabel(value: string): string {
  return getPropTypeDisplayInfo(value as PropType).label;
}

function sentenceCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formationParts(tunnel: CollectedTunnel): string[] {
  const config = tunnel.snapshot.tunnel.config;
  const parts = [`${config.fold}-fold rotation`];
  if (config.mirror) parts.push("Mirror");
  if (config.flip) parts.push("Flip");
  if (config.invert) parts.push("Invert alternating copies");
  if (config.echo) parts.push("Rewind alternating copies");
  if (config.staggerSteps > 0) {
    parts.push(`${config.staggerSteps}-step stagger`);
  }
  if (Object.keys(config.speedOverrides ?? {}).length > 0) {
    parts.push("Mixed speeds");
  }
  return parts;
}

/**
 * The compact discovery projection for a tunnel card. Everything here is
 * derived from the canonical artifact; no denormalized label can drift from
 * the choreography, formation, props, playback, or effects it describes.
 */
export function describeTunnelForDiscovery(
  tunnel: CollectedTunnel
): TunnelDiscoverySummary {
  const config = tunnel.snapshot.tunnel.config;
  const leftProp = propLabel(tunnel.snapshot.props.leftPropType);
  const rightProp = propLabel(tunnel.snapshot.props.rightPropType);
  const propsLabel =
    leftProp === rightProp
      ? `${leftProp} · both hands`
      : `Left ${leftProp} · Right ${rightProp}`;
  const recipe = tunnel.snapshot.tunnel.presetRecipe ?? null;
  const recipeLabel = recipe
    ? `${recipe.name}${configsEqual(recipe.config, config) ? "" : " · modified"}`
    : "Custom formation";
  const formationLabel = formationParts(tunnel).join(" · ");
  const activeEffect = tunnel.snapshot.effects?.activeEffect ?? "none";
  const effectLabel =
    activeEffect === "none"
      ? "No effect"
      : (EFFECT_LABELS[activeEffect] ?? sentenceCase(activeEffect));
  const authoredCount = tunnel.composition?.performers.length ?? 1;
  const renderedCount = imageCount(config);
  const renderedPropCount = propCount(config);
  const bpm = tunnel.snapshot.playback.bpm;
  const searchText = [
    tunnel.name,
    leftProp,
    rightProp,
    recipeLabel,
    formationLabel,
    effectLabel,
    `${authoredCount} authored`,
    `${renderedCount} rendered`,
    `${renderedPropCount} props`,
    `${bpm} bpm`,
  ]
    .join(" ")
    .toLocaleLowerCase();

  return {
    authoredCount,
    renderedCount,
    propCount: renderedPropCount,
    propsLabel,
    recipeLabel,
    formationLabel,
    effectLabel,
    bpm,
    searchText,
  };
}

export function tunnelDiscoverySavedAt(tunnel: CollectedTunnel): number {
  return tunnel.currentRevisionCreatedAt ?? tunnel.createdAt;
}

export function matchesTunnelDiscoveryQuery(
  tunnel: CollectedTunnel,
  query: string
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return (
    !needle || describeTunnelForDiscovery(tunnel).searchText.includes(needle)
  );
}

export function sortTunnelDiscovery(
  items: readonly CollectedTunnel[],
  sort: TunnelDiscoverySort
): CollectedTunnel[] {
  return [...items].sort((a, b) => {
    const aSummary = describeTunnelForDiscovery(a);
    const bSummary = describeTunnelForDiscovery(b);
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      case "performers":
        return (
          bSummary.authoredCount - aSummary.authoredCount ||
          tunnelDiscoverySavedAt(b) - tunnelDiscoverySavedAt(a)
        );
      case "instances":
        return (
          bSummary.renderedCount - aSummary.renderedCount ||
          tunnelDiscoverySavedAt(b) - tunnelDiscoverySavedAt(a)
        );
      case "recent":
      default:
        return tunnelDiscoverySavedAt(b) - tunnelDiscoverySavedAt(a);
    }
  });
}
