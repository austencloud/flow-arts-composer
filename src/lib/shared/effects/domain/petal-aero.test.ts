import { describe, expect, it } from "vitest";
import {
  createPetalBody,
  petalBodyToWorld,
  resolvePetalShape,
  setPetalAxisAngle,
  stepPetalBody,
  type PetalBody,
} from "./petal-aero";
import type { PetalSpriteShape } from "./petal-palettes";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

const SETTINGS = { fallSpeed: 0.55, sway: 0.6, streak: 0.6 };

function petal(sprite: PetalSpriteShape, random: () => number): PetalBody {
  const body = createPetalBody(
    resolvePetalShape(sprite, 0.057, SETTINGS, random)
  );
  setPetalAxisAngle(
    body,
    random() - 0.5,
    random() - 0.5,
    random() - 0.5,
    random() * Math.PI * 2
  );
  body.vy = -0.3;
  return body;
}

describe("petal flight", () => {
  it("flies the same path at any frame rate", () => {
    const paths = [30, 60, 144].map((fps) => {
      const body = petal("blossom_petal", seeded(11));
      body.vx = 3;
      body.vy = 1;
      const samples: number[] = [];
      for (let frame = 1; frame <= fps * 3; frame++) {
        stepPetalBody(body, 0, 0, 0, 1 / fps);
        if (frame % (fps / 2) === 0) samples.push(body.x, body.y);
      }
      return samples;
    });
    // Tumbling is chaotic, so step-size rounding grows a little; within a
    // few centimetres over a metre of flight.
    for (const path of paths.slice(1))
      path.forEach((value, index) =>
        expect(Math.abs(value - paths[0]![index]!)).toBeLessThan(0.08)
      );
  });

  it("flutters and tumbles in still air with nothing telling it to", () => {
    const random = seeded(7);
    let swinging = 0;
    let fall = 0;
    const count = 30;
    for (let i = 0; i < count; i++) {
      const body = petal("blossom_petal", random);
      let turns = 0;
      let lastSide = 0;
      let startY = 0;
      for (let frame = 0; frame < 6 * 60; frame++) {
        stepPetalBody(body, 0, 0, 0, 1 / 60);
        if (frame === 60) startY = body.y;
        const side = Math.sign(body.vx);
        if (frame > 60 && side && lastSide && side !== lastSide) turns++;
        if (side) lastSide = side;
      }
      if (turns >= 4) swinging++;
      fall += (startY - body.y) / 5;
    }
    expect(swinging / count).toBeGreaterThan(0.7);
    // Fluttering keeps the average fall near the requested speed.
    expect(fall / count).toBeGreaterThan(0.45);
    expect(fall / count).toBeLessThan(0.85);
  });

  it("drops a whole flower steadily, nearly level", () => {
    const random = seeded(3);
    const out = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 10; i++) {
      const body = petal("blossom_flower", random);
      for (let frame = 0; frame < 4 * 60; frame++)
        stepPetalBody(body, 0, 0, 0, 1 / 60);
      petalBodyToWorld(body, 0, 0, 1, out);
      expect(Math.abs(out.y)).toBeGreaterThan(0.75);
      expect(Math.hypot(body.vx, body.vz)).toBeLessThan(0.2);
    }
  });

  it("stays finite for every kind, thrown hard and caught in gusts", () => {
    const random = seeded(5);
    const kinds: PetalSpriteShape[] = [
      "round",
      "elongated",
      "blossom_flower",
      "blossom_petal",
      "blossom_petal_curled",
      "maple",
      "palm",
      "fern",
      "ash_flake",
      "ash_cinder",
      "ginkgo",
    ];
    for (const kind of kinds) {
      const body = petal(kind, random);
      body.vx = 8;
      body.vy = 4;
      for (let frame = 0; frame < 5 * 60; frame++) {
        const gust = Math.sin(frame * 0.3) * 2;
        stepPetalBody(body, gust, 0, -gust, frame % 7 === 0 ? 0.1 : 1 / 60);
      }
      for (const value of Object.values(body))
        expect(Number.isFinite(value)).toBe(true);
      expect(Math.hypot(body.qx, body.qy, body.qz, body.qw)).toBeCloseTo(1, 6);
    }
  });

  it("is carried by moving air", () => {
    const body = petal("blossom_petal", seeded(2));
    for (let frame = 0; frame < 3 * 60; frame++)
      stepPetalBody(body, 1.2, 0, 0, 1 / 60);
    expect(body.x).toBeGreaterThan(1.5);
  });
});
