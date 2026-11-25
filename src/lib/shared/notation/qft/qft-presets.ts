/**
 * The moves the One Surface app offers by name: the guide's eight, with the
 * pendulum as it is really swung, and the extendulum.
 *
 * A pendulum and an extendulum share one pattern of prop steps. The hand tells
 * them apart: a pendulum's swings along the bottom and back, an extendulum's
 * goes all the way round (Austen, 2026-11-23).
 */
import { GUIDE_MOVES } from "./qft-guide";
import {
  createExtendulumTrajectory,
  createPendulumTrajectory,
  type QftTrajectory,
} from "@tka/shape-domain";

export interface QftPreset {
  id: string;
  title: string;
  trajectory: QftTrajectory;
}

/**
 * "Statically moving really wouldn't work. Even just a hair of movement would
 * be necessary" (Austen, 2026-11-22).
 */
export const PENDULUM_HAND_RADIUS = 0.1;

export const QFT_PRESETS: QftPreset[] = GUIDE_MOVES.flatMap((move) =>
  move.id === "pendulum"
    ? [
        {
          id: move.id,
          title: move.title,
          trajectory: createPendulumTrajectory(PENDULUM_HAND_RADIUS),
        },
        {
          id: "extendulum",
          title: "Extendulum",
          trajectory: createExtendulumTrajectory(),
        },
      ]
    : [{ id: move.id, title: move.title, trajectory: move.trajectory }]
);
