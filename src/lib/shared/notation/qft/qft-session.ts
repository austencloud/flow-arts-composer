/** Session persistence and migration for the QfT One Surface app. */

import { normalizeLayers, type QftLayers } from "./qft-layers";
import { GUIDE_MOVES } from "./qft-guide";
import {
  createPendulumTrajectory,
  trajectoryFromKnobs,
  type QftTrajectory,
} from "./qft-trajectory";
import type { Spin } from "./qft-model";
import {
  MODE_ORDER,
  type VtgMode,
} from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";
import { normalizeLegacyHandPair } from "@tka/tka-types";

export const QFT_SESSION_KEY = "qft:session:v3";
export const QFT_LEGACY_SESSION_KEY = "qft:session:v2";

const AXIS_LENGTH = 12;
const MAX_RADIUS = 1.5;
const MAX_RATE = 8;
const GUIDE_IDS = new Set(GUIDE_MOVES.map(({ id }) => id));

export type QftHandCount = "one" | "two";

export type QftHandSource =
  | { kind: "flower"; index: number }
  | { kind: "preset"; id: string }
  | { kind: "custom"; trajectory: QftTrajectory };

export interface QftSessionHand {
  source: QftHandSource;
  radius: number;
}

export interface QftSession {
  entered: boolean;
  handCount: QftHandCount;
  left: QftSessionHand;
  right: QftSessionHand;
  /** Whole-app rotation in compass eighths. */
  originPhase: number;
  vtgMode: VtgMode;
  /** Continuous position in the eight-step cycle. */
  cursor: number;
  playing: boolean;
  layers: QftLayers;
}

const DEFAULT_LEFT: QftSessionHand = {
  source: { kind: "flower", index: 6 },
  radius: 1,
};

const DEFAULT_RIGHT: QftSessionHand = {
  source: { kind: "flower", index: 7 },
  radius: 1,
};

const num = (
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max
    ? value
    : fallback;

const normalizedPhase = (value: unknown, fallback = 0): number => {
  const phase = Math.round(num(value, -64, 64, fallback));
  return ((phase % 8) + 8) % 8;
};

function readTrajectory(value: unknown): QftTrajectory | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.propRate) || raw.propRate.length !== 8) return null;

  const propRate = raw.propRate.map((rate) =>
    num(rate, -MAX_RATE, MAX_RATE, Number.NaN)
  );
  if (propRate.some((rate) => Number.isNaN(rate))) return null;
  if (raw.handDirection !== 1 && raw.handDirection !== -1) return null;
  // The length-8 check above proves this is a full tuple; map() cannot carry
  // that proof through, so the destructure asserts it.
  const [rate0, rate1, rate2, rate3, rate4, rate5, rate6, rate7] = propRate as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  return {
    radius: num(raw.radius, 0, MAX_RADIUS, 1),
    handPhase: normalizedPhase(raw.handPhase),
    handDirection: raw.handDirection,
    propRate: [rate0, rate1, rate2, rate3, rate4, rate5, rate6, rate7],
    propPhase: normalizedPhase(raw.propPhase),
  };
}

function readSource(value: unknown, fallback: QftHandSource): QftHandSource {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;

  if (raw.kind === "flower") {
    return {
      kind: "flower",
      index: Math.floor(num(raw.index, 0, AXIS_LENGTH - 1, 0)),
    };
  }

  if (raw.kind === "preset" && GUIDE_IDS.has(String(raw.id))) {
    return { kind: "preset", id: String(raw.id) };
  }

  if (raw.kind === "custom") {
    const trajectory = readTrajectory(raw.trajectory);
    if (trajectory) return { kind: "custom", trajectory };
  }

  return fallback;
}

function readHand(value: unknown, fallback: QftSessionHand): QftSessionHand {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  return {
    source: readSource(raw.source, fallback.source),
    radius: num(raw.radius, 0, MAX_RADIUS, fallback.radius),
  };
}

function readV3(raw: unknown): QftSession | null {
  if (!raw || typeof raw !== "object") return null;
  const session = raw as Record<string, unknown>;
  const handPair = normalizeLegacyHandPair(session);

  return {
    entered: session.entered === true,
    handCount: session.handCount === "one" ? "one" : "two",
    left: readHand(handPair.left, DEFAULT_LEFT),
    right: readHand(handPair.right, DEFAULT_RIGHT),
    originPhase: normalizedPhase(session.originPhase),
    vtgMode: MODE_ORDER.includes(session.vtgMode as VtgMode)
      ? (session.vtgMode as VtgMode)
      : "SS",
    cursor: num(session.cursor, 0, 8, 0),
    playing: session.playing !== false,
    layers: normalizeLayers(session.layers),
  };
}

function legacyInstrumentSource(
  session: Record<string, unknown>
): QftHandSource {
  const spins: Spin[] = ["inspin", "antispin"];
  const radius = num(session.radius, 0, MAX_RADIUS, 1);
  if (session.pendulum === true) {
    return { kind: "custom", trajectory: createPendulumTrajectory(radius) };
  }

  const spin = spins.includes(session.spin as Spin)
    ? (session.spin as Spin)
    : "antispin";
  return {
    kind: "custom",
    trajectory: trajectoryFromKnobs({
      radius,
      downbeats: Math.floor(num(session.downbeats, 1, MAX_RATE, 3)),
      spin,
      phase: normalizedPhase(session.phase),
    }),
  };
}

function readV2(raw: unknown): QftSession | null {
  if (!raw || typeof raw !== "object") return null;
  const session = raw as Record<string, unknown>;
  const appMode = session.appMode;
  const moveIndex = Math.floor(
    num(session.moveIndex, 0, GUIDE_MOVES.length - 1, 0)
  );
  const move = GUIDE_MOVES[moveIndex] ?? GUIDE_MOVES[0]!;
  const radius = num(session.radius, 0, MAX_RADIUS, 1);

  const leftSource: QftHandSource =
    appMode === "guide"
      ? { kind: "preset", id: move.id }
      : appMode === "instrument"
        ? legacyInstrumentSource(session)
        : {
            kind: "flower",
            index: Math.floor(
              num(session.leftIndex ?? session.blueIndex, 0, AXIS_LENGTH - 1, 6)
            ),
          };

  return {
    entered: session.entered === undefined ? true : session.entered === true,
    handCount: appMode === "matrix" ? "two" : "one",
    left: { source: leftSource, radius },
    right: {
      source: {
        kind: "flower",
        index: Math.floor(
          num(session.rightIndex ?? session.redIndex, 0, AXIS_LENGTH - 1, 7)
        ),
      },
      radius: 1,
    },
    originPhase: 0,
    vtgMode: MODE_ORDER.includes(session.vtgMode as VtgMode)
      ? (session.vtgMode as VtgMode)
      : "SS",
    cursor: num(session.cursor, 0, 8, 0),
    playing: session.playing !== false,
    layers: normalizeLayers(session.layers),
  };
}

function readStored(key: string): unknown | null {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/** Restore a validated v3 session, or migrate the previous route payload. */
export function loadQftSession(): QftSession | null {
  if (typeof localStorage === "undefined") return null;
  return (
    readV3(readStored(QFT_SESSION_KEY)) ??
    readV2(readStored(QFT_LEGACY_SESSION_KEY))
  );
}

export function saveQftSession(session: QftSession): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(QFT_SESSION_KEY, JSON.stringify(session));
    localStorage.removeItem(QFT_LEGACY_SESSION_KEY);
  } catch {
    // Persistence is a convenience. The app remains usable when storage is blocked.
  }
}
