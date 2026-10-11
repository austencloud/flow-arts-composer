import { describe, expect, it } from "vitest";
import {
  buildEarthRootObservatoryPlanForGrid,
  buildNominalEarthRootObservatoryPlan,
  earthRootObservatoryFloorSightlineMargin,
  earthRootObservatoryMaximumGrade,
  earthRootObservatoryMinimumRouteSeparation,
  earthRootObservatoryRouteLength,
  earthRootObservatoryViewingSamples,
  isEarthRootObservatorySightlineBlocked,
  isInsideEarthRootObservatoryFinalFrame,
} from "#lib/features/museum/data/earth-root-observatory-plan.js";
import { buildVulcanCaveFloorPlan } from "#lib/features/museum/data/vulcan-cave-floor-plan.js";

describe("Earth Root Observatory Gate 1 plan", () => {
  const nominal = buildNominalEarthRootObservatoryPlan();

  it("uses the compiled Earth shell and its real Fire and Air doors", () => {
    const cave = buildVulcanCaveFloorPlan();
    const plan = buildEarthRootObservatoryPlanForGrid(cave.grid);

    expect(plan).not.toBeNull();
    expect(plan!.room.maxX - plan!.room.minX).toBe(34);
    expect(plan!.room.maxZ - plan!.room.minZ).toBe(24);
    expect(plan!.westDoor.max - plan!.westDoor.min).toBe(2);
    expect(plan!.southDoor.max - plan!.southDoor.min).toBe(2);
    expect(plan!.walkPath[0]).toEqual(
      expect.objectContaining({
        x: plan!.room.minX,
        z: (plan!.westDoor.min + plan!.westDoor.max) / 2,
      })
    );
    expect(plan!.walkPath.at(-1)).toEqual(
      expect.objectContaining({
        x: (plan!.southDoor.min + plan!.southDoor.max) / 2,
        z: plan!.room.maxZ,
      })
    );
  });

  it("locks the Earth room to the exact G, H, and I museum performers", () => {
    expect(
      nominal.performers.map(({ id, performerId, sequenceId }) => ({
        id,
        performerId,
        sequenceId,
      }))
    ).toEqual([
      {
        id: "g",
        performerId: "cave-earth-automaton-g",
        sequenceId: "cave-earth-seq-g",
      },
      {
        id: "h",
        performerId: "cave-earth-automaton-h",
        sequenceId: "cave-earth-seq-h",
      },
      {
        id: "i",
        performerId: "cave-earth-automaton-i",
        sequenceId: "cave-earth-seq-i",
      },
    ]);
  });

  it("keeps the complete visitor route inside the room at a gentle grade", () => {
    for (const point of nominal.walkPath) {
      expect(point.x).toBeGreaterThanOrEqual(nominal.room.minX);
      expect(point.x).toBeLessThanOrEqual(nominal.room.maxX);
      expect(point.z).toBeGreaterThanOrEqual(nominal.room.minZ);
      expect(point.z).toBeLessThanOrEqual(nominal.room.maxZ);
    }

    expect(earthRootObservatoryRouteLength(nominal)).toBeGreaterThan(65);
    expect(earthRootObservatoryMaximumGrade(nominal)).toBeLessThanOrEqual(
      1 / 16
    );
    expect(nominal.routeWidth).toBeGreaterThanOrEqual(2.4);
  });

  it("gives G, H, and I one isolated close read before the ensemble view", () => {
    const stopByPerformer = {
      g: nominal.stops.find((stop) => stop.id === "performer-g")!,
      h: nominal.stops.find((stop) => stop.id === "performer-h")!,
      i: nominal.stops.find((stop) => stop.id === "performer-i")!,
    };

    for (const performer of nominal.performers) {
      const stop = stopByPerformer[performer.id];
      for (const target of nominal.performers) {
        expect(
          isEarthRootObservatorySightlineBlocked(nominal, stop, target.centre)
        ).toBe(target.id !== performer.id);
      }
    }
  });

  it("keeps H and I clear of the route lip while the visitor is moving", () => {
    const h = nominal.performers.find((performer) => performer.id === "h")!;
    const i = nominal.performers.find((performer) => performer.id === "i")!;

    expect(h.centre).toEqual({ x: 15, z: 6.5 });
    expect(i.centre).toEqual({ x: 25.5, z: 11.5 });

    for (const performer of nominal.performers) {
      const samples = earthRootObservatoryViewingSamples(nominal, performer);
      expect(samples).toHaveLength(7);
      for (const sample of samples) {
        expect(
          isEarthRootObservatorySightlineBlocked(
            nominal,
            sample,
            performer.centre
          )
        ).toBe(false);
      }

      const minimumFloorMargin = Math.min(
        ...samples.map((sample) =>
          earthRootObservatoryFloorSightlineMargin(
            nominal,
            sample,
            performer
          )
        )
      );
      expect(minimumFloorMargin).toBeGreaterThanOrEqual(
        performer.id === "g" ? 0.2 : 0.3
      );
    }

    for (const performer of [h, i]) {
      const clearGap =
        earthRootObservatoryMinimumRouteSeparation(
          nominal,
          performer.centre
        ) -
        nominal.routeWidth / 2 -
        performer.habitatRadius;
      expect(clearGap).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("reserves measured habitat mass instead of an empty basin", () => {
    expect(nominal.habitatMasses).toHaveLength(5);
    const massArea = nominal.habitatMasses.reduce(
      (total, mass) => total + Math.PI * mass.radiusX * mass.radiusZ,
      0
    );
    expect(massArea).toBeGreaterThan(65);

    for (const mass of nominal.habitatMasses) {
      expect(mass.centre.x - mass.radiusX).toBeGreaterThanOrEqual(
        nominal.room.minX
      );
      expect(mass.centre.x + mass.radiusX).toBeLessThanOrEqual(
        nominal.room.maxX
      );
      expect(mass.centre.z - mass.radiusZ).toBeGreaterThanOrEqual(
        nominal.room.minZ
      );
      expect(mass.centre.z + mass.radiusZ).toBeLessThanOrEqual(
        nominal.room.maxZ
      );
      expect(mass.maximumElevation).toBeLessThanOrEqual(-1.25);
    }
  });

  it("keeps the tree as the first hero and fits the complete ensemble in the final frame", () => {
    const reveal = nominal.stops.find((stop) => stop.id === "tree-reveal")!;
    expect(
      isEarthRootObservatorySightlineBlocked(
        nominal,
        reveal,
        nominal.tree.centre,
        false
      )
    ).toBe(false);

    for (const performer of nominal.performers) {
      expect(
        isEarthRootObservatorySightlineBlocked(
          nominal,
          nominal.finalCamera.position,
          performer.centre
        )
      ).toBe(false);
      expect(
        isInsideEarthRootObservatoryFinalFrame(nominal, performer.centre)
      ).toBe(true);
    }
    expect(
      isInsideEarthRootObservatoryFinalFrame(nominal, nominal.tree.centre)
    ).toBe(true);
  });
});
