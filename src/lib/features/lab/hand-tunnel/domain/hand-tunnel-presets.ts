/**
 * Starting formations for the Hand Tunnel Lab.
 *
 * Authored against the fixed transform order (flip, mirror, rotate, phase).
 * The two Ryan presets are the formations he dictated on 2026-09-11; the
 * waypoints they produce are pinned by tests so a canonical-card edit that
 * moved them would be caught.
 */

import type { Performer, Segment, Tnd } from "./hand-tunnel-types";

export interface HandTunnelPreset {
  id: string;
  name: string;
  description: string;
  performers: Performer[];
}

const LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

function segment(
  tnd: Tnd,
  overrides: Partial<Omit<Segment, "tnd" | "fromBeat">> = {}
): Segment {
  return {
    fromBeat: 0,
    tnd,
    rotation: 0,
    mirror: false,
    flip: false,
    phase: 0,
    ...overrides,
  };
}

function lineup(segments: Segment[]): Performer[] {
  return segments.map((seg, index) => ({
    id: `p${index + 1}`,
    label: LABELS[index] ?? `P${index + 1}`,
    segments: [seg],
  }));
}

export const HAND_TUNNEL_PRESETS: readonly HandTunnelPreset[] = [
  {
    id: "ryan-trio",
    name: "Ryan's trio",
    description:
      "Front performer in tog-opp from the south beta. Two back performers in split-opp from the side betas, mirrored, right hand over the top on the west side.",
    performers: lineup([
      segment("to"),
      segment("so", { flip: true }),
      segment("so", { flip: true, mirror: true }),
    ]),
  },
  {
    id: "ryan-quad",
    name: "Ryan's quad",
    description:
      "Tog-opp betas at north and south, split-opp betas at west and east. Every pair mirrors across the center.",
    performers: lineup([
      segment("to", { rotation: 2 }),
      segment("to"),
      segment("so"),
      segment("so", { mirror: true }),
    ]),
  },
  {
    id: "stacked-ts",
    name: "Stacked tog-same",
    description: "Four tog-same loops, one per quarter turn.",
    performers: lineup([
      segment("ts"),
      segment("ts", { rotation: 1 }),
      segment("ts", { rotation: 2 }),
      segment("ts", { rotation: 3 }),
    ]),
  },
  {
    id: "solo",
    name: "One performer",
    description: "A single tog-opp loop to build from.",
    performers: lineup([segment("to")]),
  },
];

export function presetById(id: string): HandTunnelPreset {
  const preset = HAND_TUNNEL_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown hand tunnel preset: ${id}`);
  return preset;
}

/** Deep copy so the lab can mutate a lineup without touching the preset. */
export function clonePerformers(performers: readonly Performer[]): Performer[] {
  return performers.map((performer) => ({
    ...performer,
    segments: performer.segments.map((seg) => ({ ...seg })),
  }));
}
