import { describe, expect, it } from "vitest";
import {
  SPARK_GRAVITY,
  SPARK_MATERIALS,
  SPARK_VISIBLE_HEAT,
  sampleSparkFork,
  sparkBurnTime,
  sparkCoolTime,
  sparkHeat,
  sparkLifetime,
  stepSparkVelocity,
  type SparkMaterial,
} from "#lib/shared/effects/domain/spark-physics.js";

function fly(material: SparkMaterial, diameter: number, speed: number, dt: number) {
  const v = { vx: speed, vy: 0, vz: 0 };
  const life = sparkLifetime(
    sparkBurnTime(material, diameter),
    sparkCoolTime(material, diameter)
  );
  let x = 0;
  let y = 0;
  let halfSpeedAt = -1;
  for (let t = 0; t < life; t += dt) {
    stepSparkVelocity(v, dt, diameter, material, 0, -SPARK_GRAVITY, 0);
    x += v.vx * dt;
    y += v.vy * dt;
    if (halfSpeedAt < 0 && Math.hypot(v.vx, v.vy) < speed / 2) halfSpeedAt = t;
  }
  return { x, y, halfSpeedAt };
}

function terminalFall(material: SparkMaterial, diameter: number): number {
  const v = { vx: 0, vy: 0, vz: 0 };
  for (let i = 0; i < 4000; i++) {
    stepSparkVelocity(v, 1 / 240, diameter, material, 0, -SPARK_GRAVITY, 0);
  }
  return -v.vy;
}

describe("spark physics", () => {
  const wool = SPARK_MATERIALS["steel-wool"];
  const ember = SPARK_MATERIALS["banked-ember"];

  it("throws a steel wool spark in a metres-long arc that bends down", () => {
    const flight = fly(wool, 0.0003, 9, 1 / 240);
    expect(flight.halfSpeedAt).toBeGreaterThan(0.1);
    expect(flight.halfSpeedAt).toBeLessThan(0.35);
    expect(flight.x).toBeGreaterThan(1.5);
    expect(flight.x).toBeLessThan(4);
    expect(flight.y).toBeLessThan(-0.5);
    expect(terminalFall(wool, 0.0003)).toBeGreaterThan(2.5);
    expect(terminalFall(wool, 0.0003)).toBeLessThan(5);
  });

  it("lets charcoal embers stop short and sink slowly", () => {
    const flight = fly(ember, 0.0012, 2, 1 / 240);
    expect(flight.x).toBeLessThan(0.3);
    expect(terminalFall(ember, 0.0012)).toBeLessThan(1.5);
  });

  it("flies the same path at 30 and 240 frames a second", () => {
    const coarse = fly(wool, 0.0003, 9, 1 / 30);
    const fine = fly(wool, 0.0003, 9, 1 / 240);
    expect(Math.abs(coarse.x - fine.x)).toBeLessThan(0.1 * fine.x);
    expect(Math.abs(coarse.y - fine.y)).toBeLessThan(0.1 * Math.abs(fine.y));
  });

  it("burns big droplets far longer than small ones (d-squared law)", () => {
    const small = sparkBurnTime(wool, 0.00015);
    const big = sparkBurnTime(wool, 0.0003);
    expect(big / small).toBeCloseTo(4, 6);
    expect(sparkBurnTime(wool, wool.diameterMax)).toBeGreaterThan(0.8);
    expect(sparkBurnTime(wool, wool.diameterMin)).toBeLessThan(0.12);
  });

  it("stays hot while burning and fades to the visible floor at its lifetime", () => {
    const burn = sparkBurnTime(wool, 0.0003);
    const cool = sparkCoolTime(wool, 0.0003);
    const life = sparkLifetime(burn, cool);
    expect(sparkHeat(burn * 0.5, burn, cool)).toBeGreaterThan(0.8);
    expect(sparkHeat(life, burn, cool)).toBeCloseTo(SPARK_VISIBLE_HEAT, 6);
    let previous = 1;
    for (let age = 0; age < life; age += life / 50) {
      const heat = sparkHeat(age, burn, cool);
      expect(heat).toBeLessThanOrEqual(previous);
      previous = heat;
    }
  });

  it("forks carbon steel sparks often and steel wool rarely", () => {
    let forge = 0;
    let steel = 0;
    for (let i = 0; i < 1000; i++) {
      const u = (i + 0.5) / 1000;
      if (sampleSparkFork(SPARK_MATERIALS["forge-burst"], 0.4, u, 0.5) > 0) forge++;
      if (sampleSparkFork(wool, 0.4, u, 0.5) > 0) steel++;
    }
    expect(forge).toBeGreaterThan(400);
    expect(steel).toBeLessThan(100);
    expect(sampleSparkFork(SPARK_MATERIALS["forge-burst"], 0.4, 0, 1)).toBeLessThan(0.4);
  });
});
