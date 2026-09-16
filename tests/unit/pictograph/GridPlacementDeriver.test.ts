import { beforeEach, describe, expect, it } from "vitest";
import {
  GridLocation,
  GridPlacement,
} from "../../../src/lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  getGridLocationsFromPlacement,
  getGridPlacementFromLocations,
} from "$lib/shared/pictograph/grid/services/grid-placement-deriver";

describe("GridPlacementDeriver", () => {
  // The class collapsed into standalone functions. Bind them to an object so
  // the existing `service.*` call sites are unchanged.
  let service: {
    getGridLocationsFromPlacement: typeof getGridLocationsFromPlacement;
    getGridPlacementFromLocations: typeof getGridPlacementFromLocations;
  };

  beforeEach(() => {
    service = { getGridLocationsFromPlacement, getGridPlacementFromLocations };
  });

  describe("Alpha Placements - Bidirectional Mapping", () => {
    it("should map ALPHA1: SOUTH,NORTH ↔ alpha1", () => {
      // Placement → Locations
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ALPHA1
      );
      expect(left).toBe(GridLocation.SOUTH);
      expect(right).toBe(GridLocation.NORTH);

      // Locations → Placement
      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTH,
        GridLocation.NORTH
      );
      expect(placement).toBe(GridPlacement.ALPHA1);
    });

    it("should map ALPHA2: SOUTHWEST,NORTHEAST ↔ alpha2", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ALPHA2
      );
      expect(left).toBe(GridLocation.SOUTHWEST);
      expect(right).toBe(GridLocation.NORTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHWEST,
        GridLocation.NORTHEAST
      );
      expect(placement).toBe(GridPlacement.ALPHA2);
    });

    it("should map ALPHA3: WEST,EAST ↔ alpha3", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ALPHA3
      );
      expect(left).toBe(GridLocation.WEST);
      expect(right).toBe(GridLocation.EAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.WEST,
        GridLocation.EAST
      );
      expect(placement).toBe(GridPlacement.ALPHA3);
    });

    it("should map ALPHA4: NORTHWEST,SOUTHEAST ↔ alpha4", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ALPHA4
      );
      expect(left).toBe(GridLocation.NORTHWEST);
      expect(right).toBe(GridLocation.SOUTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHWEST,
        GridLocation.SOUTHEAST
      );
      expect(placement).toBe(GridPlacement.ALPHA4);
    });

    it("should map ALPHA5: NORTH,SOUTH ↔ alpha5", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ALPHA5
      );
      expect(left).toBe(GridLocation.NORTH);
      expect(right).toBe(GridLocation.SOUTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTH,
        GridLocation.SOUTH
      );
      expect(placement).toBe(GridPlacement.ALPHA5);
    });

    it("should map ALPHA6: NORTHEAST,SOUTHWEST ↔ alpha6", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ALPHA6
      );
      expect(left).toBe(GridLocation.NORTHEAST);
      expect(right).toBe(GridLocation.SOUTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHEAST,
        GridLocation.SOUTHWEST
      );
      expect(placement).toBe(GridPlacement.ALPHA6);
    });

    it("should map ALPHA7: EAST,WEST ↔ alpha7", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ALPHA7
      );
      expect(left).toBe(GridLocation.EAST);
      expect(right).toBe(GridLocation.WEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.EAST,
        GridLocation.WEST
      );
      expect(placement).toBe(GridPlacement.ALPHA7);
    });

    it("should map ALPHA8: SOUTHEAST,NORTHWEST ↔ alpha8", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ALPHA8
      );
      expect(left).toBe(GridLocation.SOUTHEAST);
      expect(right).toBe(GridLocation.NORTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHEAST,
        GridLocation.NORTHWEST
      );
      expect(placement).toBe(GridPlacement.ALPHA8);
    });
  });

  describe("Beta Placements - Bidirectional Mapping", () => {
    it("should map BETA1: NORTH,NORTH ↔ beta1", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.BETA1
      );
      expect(left).toBe(GridLocation.NORTH);
      expect(right).toBe(GridLocation.NORTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTH,
        GridLocation.NORTH
      );
      expect(placement).toBe(GridPlacement.BETA1);
    });

    it("should map BETA2: NORTHEAST,NORTHEAST ↔ beta2", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.BETA2
      );
      expect(left).toBe(GridLocation.NORTHEAST);
      expect(right).toBe(GridLocation.NORTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHEAST,
        GridLocation.NORTHEAST
      );
      expect(placement).toBe(GridPlacement.BETA2);
    });

    it("should map BETA3: EAST,EAST ↔ beta3", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.BETA3
      );
      expect(left).toBe(GridLocation.EAST);
      expect(right).toBe(GridLocation.EAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.EAST,
        GridLocation.EAST
      );
      expect(placement).toBe(GridPlacement.BETA3);
    });

    it("should map BETA4: SOUTHEAST,SOUTHEAST ↔ beta4", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.BETA4
      );
      expect(left).toBe(GridLocation.SOUTHEAST);
      expect(right).toBe(GridLocation.SOUTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHEAST,
        GridLocation.SOUTHEAST
      );
      expect(placement).toBe(GridPlacement.BETA4);
    });

    it("should map BETA5: SOUTH,SOUTH ↔ beta5", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.BETA5
      );
      expect(left).toBe(GridLocation.SOUTH);
      expect(right).toBe(GridLocation.SOUTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTH,
        GridLocation.SOUTH
      );
      expect(placement).toBe(GridPlacement.BETA5);
    });

    it("should map BETA6: SOUTHWEST,SOUTHWEST ↔ beta6", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.BETA6
      );
      expect(left).toBe(GridLocation.SOUTHWEST);
      expect(right).toBe(GridLocation.SOUTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHWEST,
        GridLocation.SOUTHWEST
      );
      expect(placement).toBe(GridPlacement.BETA6);
    });

    it("should map BETA7: WEST,WEST ↔ beta7", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.BETA7
      );
      expect(left).toBe(GridLocation.WEST);
      expect(right).toBe(GridLocation.WEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.WEST,
        GridLocation.WEST
      );
      expect(placement).toBe(GridPlacement.BETA7);
    });

    it("should map BETA8: NORTHWEST,NORTHWEST ↔ beta8", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.BETA8
      );
      expect(left).toBe(GridLocation.NORTHWEST);
      expect(right).toBe(GridLocation.NORTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHWEST,
        GridLocation.NORTHWEST
      );
      expect(placement).toBe(GridPlacement.BETA8);
    });
  });

  describe("Gamma Placements (1-8) - Bidirectional Mapping", () => {
    it("should map GAMMA1: WEST,NORTH ↔ gamma1", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA1
      );
      expect(left).toBe(GridLocation.WEST);
      expect(right).toBe(GridLocation.NORTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.WEST,
        GridLocation.NORTH
      );
      expect(placement).toBe(GridPlacement.GAMMA1);
    });

    it("should map GAMMA2: NORTHWEST,NORTHEAST ↔ gamma2", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA2
      );
      expect(left).toBe(GridLocation.NORTHWEST);
      expect(right).toBe(GridLocation.NORTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHWEST,
        GridLocation.NORTHEAST
      );
      expect(placement).toBe(GridPlacement.GAMMA2);
    });

    it("should map GAMMA3: NORTH,EAST ↔ gamma3", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA3
      );
      expect(left).toBe(GridLocation.NORTH);
      expect(right).toBe(GridLocation.EAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTH,
        GridLocation.EAST
      );
      expect(placement).toBe(GridPlacement.GAMMA3);
    });

    it("should map GAMMA4: NORTHEAST,SOUTHEAST ↔ gamma4", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA4
      );
      expect(left).toBe(GridLocation.NORTHEAST);
      expect(right).toBe(GridLocation.SOUTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHEAST,
        GridLocation.SOUTHEAST
      );
      expect(placement).toBe(GridPlacement.GAMMA4);
    });

    it("should map GAMMA5: EAST,SOUTH ↔ gamma5", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA5
      );
      expect(left).toBe(GridLocation.EAST);
      expect(right).toBe(GridLocation.SOUTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.EAST,
        GridLocation.SOUTH
      );
      expect(placement).toBe(GridPlacement.GAMMA5);
    });

    it("should map GAMMA6: SOUTHEAST,SOUTHWEST ↔ gamma6", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA6
      );
      expect(left).toBe(GridLocation.SOUTHEAST);
      expect(right).toBe(GridLocation.SOUTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHEAST,
        GridLocation.SOUTHWEST
      );
      expect(placement).toBe(GridPlacement.GAMMA6);
    });

    it("should map GAMMA7: SOUTH,WEST ↔ gamma7", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA7
      );
      expect(left).toBe(GridLocation.SOUTH);
      expect(right).toBe(GridLocation.WEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTH,
        GridLocation.WEST
      );
      expect(placement).toBe(GridPlacement.GAMMA7);
    });

    it("should map GAMMA8: SOUTHWEST,NORTHWEST ↔ gamma8", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA8
      );
      expect(left).toBe(GridLocation.SOUTHWEST);
      expect(right).toBe(GridLocation.NORTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHWEST,
        GridLocation.NORTHWEST
      );
      expect(placement).toBe(GridPlacement.GAMMA8);
    });
  });

  describe("Gamma Placements (9-16) - Bidirectional Mapping", () => {
    it("should map GAMMA9: EAST,NORTH ↔ gamma9", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA9
      );
      expect(left).toBe(GridLocation.EAST);
      expect(right).toBe(GridLocation.NORTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.EAST,
        GridLocation.NORTH
      );
      expect(placement).toBe(GridPlacement.GAMMA9);
    });

    it("should map GAMMA10: SOUTHEAST,NORTHEAST ↔ gamma10", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA10
      );
      expect(left).toBe(GridLocation.SOUTHEAST);
      expect(right).toBe(GridLocation.NORTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHEAST,
        GridLocation.NORTHEAST
      );
      expect(placement).toBe(GridPlacement.GAMMA10);
    });

    it("should map GAMMA11: SOUTH,EAST ↔ gamma11", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA11
      );
      expect(left).toBe(GridLocation.SOUTH);
      expect(right).toBe(GridLocation.EAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTH,
        GridLocation.EAST
      );
      expect(placement).toBe(GridPlacement.GAMMA11);
    });

    it("should map GAMMA12: SOUTHWEST,SOUTHEAST ↔ gamma12", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA12
      );
      expect(left).toBe(GridLocation.SOUTHWEST);
      expect(right).toBe(GridLocation.SOUTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHWEST,
        GridLocation.SOUTHEAST
      );
      expect(placement).toBe(GridPlacement.GAMMA12);
    });

    it("should map GAMMA13: WEST,SOUTH ↔ gamma13", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA13
      );
      expect(left).toBe(GridLocation.WEST);
      expect(right).toBe(GridLocation.SOUTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.WEST,
        GridLocation.SOUTH
      );
      expect(placement).toBe(GridPlacement.GAMMA13);
    });

    it("should map GAMMA14: NORTHWEST,SOUTHWEST ↔ gamma14", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA14
      );
      expect(left).toBe(GridLocation.NORTHWEST);
      expect(right).toBe(GridLocation.SOUTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHWEST,
        GridLocation.SOUTHWEST
      );
      expect(placement).toBe(GridPlacement.GAMMA14);
    });

    it("should map GAMMA15: NORTH,WEST ↔ gamma15", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA15
      );
      expect(left).toBe(GridLocation.NORTH);
      expect(right).toBe(GridLocation.WEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTH,
        GridLocation.WEST
      );
      expect(placement).toBe(GridPlacement.GAMMA15);
    });

    it("should map GAMMA16: NORTHEAST,NORTHWEST ↔ gamma16", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.GAMMA16
      );
      expect(left).toBe(GridLocation.NORTHEAST);
      expect(right).toBe(GridLocation.NORTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHEAST,
        GridLocation.NORTHWEST
      );
      expect(placement).toBe(GridPlacement.GAMMA16);
    });
  });

  describe("Zeta Placements (1-8) - 135° CCW offset", () => {
    it("should map ZETA1: SOUTHWEST,NORTH ↔ zeta1", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA1
      );
      expect(left).toBe(GridLocation.SOUTHWEST);
      expect(right).toBe(GridLocation.NORTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHWEST,
        GridLocation.NORTH
      );
      expect(placement).toBe(GridPlacement.ZETA1);
    });

    it("should map ZETA2: WEST,NORTHEAST ↔ zeta2", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA2
      );
      expect(left).toBe(GridLocation.WEST);
      expect(right).toBe(GridLocation.NORTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.WEST,
        GridLocation.NORTHEAST
      );
      expect(placement).toBe(GridPlacement.ZETA2);
    });

    it("should map ZETA3: NORTHWEST,EAST ↔ zeta3", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA3
      );
      expect(left).toBe(GridLocation.NORTHWEST);
      expect(right).toBe(GridLocation.EAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHWEST,
        GridLocation.EAST
      );
      expect(placement).toBe(GridPlacement.ZETA3);
    });

    it("should map ZETA4: NORTH,SOUTHEAST ↔ zeta4", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA4
      );
      expect(left).toBe(GridLocation.NORTH);
      expect(right).toBe(GridLocation.SOUTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTH,
        GridLocation.SOUTHEAST
      );
      expect(placement).toBe(GridPlacement.ZETA4);
    });

    it("should map ZETA5: NORTHEAST,SOUTH ↔ zeta5", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA5
      );
      expect(left).toBe(GridLocation.NORTHEAST);
      expect(right).toBe(GridLocation.SOUTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHEAST,
        GridLocation.SOUTH
      );
      expect(placement).toBe(GridPlacement.ZETA5);
    });

    it("should map ZETA6: EAST,SOUTHWEST ↔ zeta6", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA6
      );
      expect(left).toBe(GridLocation.EAST);
      expect(right).toBe(GridLocation.SOUTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.EAST,
        GridLocation.SOUTHWEST
      );
      expect(placement).toBe(GridPlacement.ZETA6);
    });

    it("should map ZETA7: SOUTHEAST,WEST ↔ zeta7", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA7
      );
      expect(left).toBe(GridLocation.SOUTHEAST);
      expect(right).toBe(GridLocation.WEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHEAST,
        GridLocation.WEST
      );
      expect(placement).toBe(GridPlacement.ZETA7);
    });

    it("should map ZETA8: SOUTH,NORTHWEST ↔ zeta8", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA8
      );
      expect(left).toBe(GridLocation.SOUTH);
      expect(right).toBe(GridLocation.NORTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTH,
        GridLocation.NORTHWEST
      );
      expect(placement).toBe(GridPlacement.ZETA8);
    });
  });

  describe("Zeta Placements (9-16) - 135° CW offset", () => {
    it("should map ZETA9: SOUTHEAST,NORTH ↔ zeta9", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA9
      );
      expect(left).toBe(GridLocation.SOUTHEAST);
      expect(right).toBe(GridLocation.NORTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHEAST,
        GridLocation.NORTH
      );
      expect(placement).toBe(GridPlacement.ZETA9);
    });

    it("should map ZETA10: SOUTH,NORTHEAST ↔ zeta10", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA10
      );
      expect(left).toBe(GridLocation.SOUTH);
      expect(right).toBe(GridLocation.NORTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTH,
        GridLocation.NORTHEAST
      );
      expect(placement).toBe(GridPlacement.ZETA10);
    });

    it("should map ZETA11: SOUTHWEST,EAST ↔ zeta11", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA11
      );
      expect(left).toBe(GridLocation.SOUTHWEST);
      expect(right).toBe(GridLocation.EAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHWEST,
        GridLocation.EAST
      );
      expect(placement).toBe(GridPlacement.ZETA11);
    });

    it("should map ZETA12: WEST,SOUTHEAST ↔ zeta12", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA12
      );
      expect(left).toBe(GridLocation.WEST);
      expect(right).toBe(GridLocation.SOUTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.WEST,
        GridLocation.SOUTHEAST
      );
      expect(placement).toBe(GridPlacement.ZETA12);
    });

    it("should map ZETA13: NORTHWEST,SOUTH ↔ zeta13", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA13
      );
      expect(left).toBe(GridLocation.NORTHWEST);
      expect(right).toBe(GridLocation.SOUTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHWEST,
        GridLocation.SOUTH
      );
      expect(placement).toBe(GridPlacement.ZETA13);
    });

    it("should map ZETA14: NORTH,SOUTHWEST ↔ zeta14", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA14
      );
      expect(left).toBe(GridLocation.NORTH);
      expect(right).toBe(GridLocation.SOUTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTH,
        GridLocation.SOUTHWEST
      );
      expect(placement).toBe(GridPlacement.ZETA14);
    });

    it("should map ZETA15: NORTHEAST,WEST ↔ zeta15", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA15
      );
      expect(left).toBe(GridLocation.NORTHEAST);
      expect(right).toBe(GridLocation.WEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHEAST,
        GridLocation.WEST
      );
      expect(placement).toBe(GridPlacement.ZETA15);
    });

    it("should map ZETA16: EAST,NORTHWEST ↔ zeta16", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ZETA16
      );
      expect(left).toBe(GridLocation.EAST);
      expect(right).toBe(GridLocation.NORTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.EAST,
        GridLocation.NORTHWEST
      );
      expect(placement).toBe(GridPlacement.ZETA16);
    });
  });

  describe("Eta Placements (1-8) - 45° CCW offset", () => {
    it("should map ETA1: NORTHWEST,NORTH ↔ eta1", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA1
      );
      expect(left).toBe(GridLocation.NORTHWEST);
      expect(right).toBe(GridLocation.NORTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHWEST,
        GridLocation.NORTH
      );
      expect(placement).toBe(GridPlacement.ETA1);
    });

    it("should map ETA2: NORTH,NORTHEAST ↔ eta2", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA2
      );
      expect(left).toBe(GridLocation.NORTH);
      expect(right).toBe(GridLocation.NORTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTH,
        GridLocation.NORTHEAST
      );
      expect(placement).toBe(GridPlacement.ETA2);
    });

    it("should map ETA3: NORTHEAST,EAST ↔ eta3", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA3
      );
      expect(left).toBe(GridLocation.NORTHEAST);
      expect(right).toBe(GridLocation.EAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHEAST,
        GridLocation.EAST
      );
      expect(placement).toBe(GridPlacement.ETA3);
    });

    it("should map ETA4: EAST,SOUTHEAST ↔ eta4", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA4
      );
      expect(left).toBe(GridLocation.EAST);
      expect(right).toBe(GridLocation.SOUTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.EAST,
        GridLocation.SOUTHEAST
      );
      expect(placement).toBe(GridPlacement.ETA4);
    });

    it("should map ETA5: SOUTHEAST,SOUTH ↔ eta5", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA5
      );
      expect(left).toBe(GridLocation.SOUTHEAST);
      expect(right).toBe(GridLocation.SOUTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHEAST,
        GridLocation.SOUTH
      );
      expect(placement).toBe(GridPlacement.ETA5);
    });

    it("should map ETA6: SOUTH,SOUTHWEST ↔ eta6", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA6
      );
      expect(left).toBe(GridLocation.SOUTH);
      expect(right).toBe(GridLocation.SOUTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTH,
        GridLocation.SOUTHWEST
      );
      expect(placement).toBe(GridPlacement.ETA6);
    });

    it("should map ETA7: SOUTHWEST,WEST ↔ eta7", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA7
      );
      expect(left).toBe(GridLocation.SOUTHWEST);
      expect(right).toBe(GridLocation.WEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHWEST,
        GridLocation.WEST
      );
      expect(placement).toBe(GridPlacement.ETA7);
    });

    it("should map ETA8: WEST,NORTHWEST ↔ eta8", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA8
      );
      expect(left).toBe(GridLocation.WEST);
      expect(right).toBe(GridLocation.NORTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.WEST,
        GridLocation.NORTHWEST
      );
      expect(placement).toBe(GridPlacement.ETA8);
    });
  });

  describe("Eta Placements (9-16) - 45° CW offset", () => {
    it("should map ETA9: NORTHEAST,NORTH ↔ eta9", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA9
      );
      expect(left).toBe(GridLocation.NORTHEAST);
      expect(right).toBe(GridLocation.NORTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHEAST,
        GridLocation.NORTH
      );
      expect(placement).toBe(GridPlacement.ETA9);
    });

    it("should map ETA10: EAST,NORTHEAST ↔ eta10", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA10
      );
      expect(left).toBe(GridLocation.EAST);
      expect(right).toBe(GridLocation.NORTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.EAST,
        GridLocation.NORTHEAST
      );
      expect(placement).toBe(GridPlacement.ETA10);
    });

    it("should map ETA11: SOUTHEAST,EAST ↔ eta11", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA11
      );
      expect(left).toBe(GridLocation.SOUTHEAST);
      expect(right).toBe(GridLocation.EAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHEAST,
        GridLocation.EAST
      );
      expect(placement).toBe(GridPlacement.ETA11);
    });

    it("should map ETA12: SOUTH,SOUTHEAST ↔ eta12", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA12
      );
      expect(left).toBe(GridLocation.SOUTH);
      expect(right).toBe(GridLocation.SOUTHEAST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTH,
        GridLocation.SOUTHEAST
      );
      expect(placement).toBe(GridPlacement.ETA12);
    });

    it("should map ETA13: SOUTHWEST,SOUTH ↔ eta13", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA13
      );
      expect(left).toBe(GridLocation.SOUTHWEST);
      expect(right).toBe(GridLocation.SOUTH);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.SOUTHWEST,
        GridLocation.SOUTH
      );
      expect(placement).toBe(GridPlacement.ETA13);
    });

    it("should map ETA14: WEST,SOUTHWEST ↔ eta14", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA14
      );
      expect(left).toBe(GridLocation.WEST);
      expect(right).toBe(GridLocation.SOUTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.WEST,
        GridLocation.SOUTHWEST
      );
      expect(placement).toBe(GridPlacement.ETA14);
    });

    it("should map ETA15: NORTHWEST,WEST ↔ eta15", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA15
      );
      expect(left).toBe(GridLocation.NORTHWEST);
      expect(right).toBe(GridLocation.WEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTHWEST,
        GridLocation.WEST
      );
      expect(placement).toBe(GridPlacement.ETA15);
    });

    it("should map ETA16: NORTH,NORTHWEST ↔ eta16", () => {
      const [left, right] = service.getGridLocationsFromPlacement(
        GridPlacement.ETA16
      );
      expect(left).toBe(GridLocation.NORTH);
      expect(right).toBe(GridLocation.NORTHWEST);

      const placement = service.getGridPlacementFromLocations(
        GridLocation.NORTH,
        GridLocation.NORTHWEST
      );
      expect(placement).toBe(GridPlacement.ETA16);
    });
  });

  describe("Error Handling", () => {
    it("should throw error for invalid placement in getGridLocationsFromPlacement", () => {
      const invalidPosition = "invalid_position" as GridPlacement;

      expect(() =>
        service.getGridLocationsFromPlacement(invalidPosition)
      ).toThrow("No location pair found for placement: invalid_position");
    });

    it("should verify that previously unmapped pairs now map correctly", () => {
      // With zeta and eta placements, these are now valid:
      // (NORTH, NORTHEAST) = ETA2
      expect(
        service.getGridPlacementFromLocations(
          GridLocation.NORTH,
          GridLocation.NORTHEAST
        )
      ).toBe(GridPlacement.ETA2);

      // (SOUTH, NORTHEAST) = ZETA10
      expect(
        service.getGridPlacementFromLocations(
          GridLocation.SOUTH,
          GridLocation.NORTHEAST
        )
      ).toBe(GridPlacement.ZETA10);
    });
  });

  describe("Complete Placement Coverage", () => {
    it("should have exactly 64 total placements mapped", () => {
      const allPositions = [
        // Alpha (8)
        GridPlacement.ALPHA1,
        GridPlacement.ALPHA2,
        GridPlacement.ALPHA3,
        GridPlacement.ALPHA4,
        GridPlacement.ALPHA5,
        GridPlacement.ALPHA6,
        GridPlacement.ALPHA7,
        GridPlacement.ALPHA8,
        // Beta (8)
        GridPlacement.BETA1,
        GridPlacement.BETA2,
        GridPlacement.BETA3,
        GridPlacement.BETA4,
        GridPlacement.BETA5,
        GridPlacement.BETA6,
        GridPlacement.BETA7,
        GridPlacement.BETA8,
        // Gamma (16)
        GridPlacement.GAMMA1,
        GridPlacement.GAMMA2,
        GridPlacement.GAMMA3,
        GridPlacement.GAMMA4,
        GridPlacement.GAMMA5,
        GridPlacement.GAMMA6,
        GridPlacement.GAMMA7,
        GridPlacement.GAMMA8,
        GridPlacement.GAMMA9,
        GridPlacement.GAMMA10,
        GridPlacement.GAMMA11,
        GridPlacement.GAMMA12,
        GridPlacement.GAMMA13,
        GridPlacement.GAMMA14,
        GridPlacement.GAMMA15,
        GridPlacement.GAMMA16,
        // Zeta (16)
        GridPlacement.ZETA1,
        GridPlacement.ZETA2,
        GridPlacement.ZETA3,
        GridPlacement.ZETA4,
        GridPlacement.ZETA5,
        GridPlacement.ZETA6,
        GridPlacement.ZETA7,
        GridPlacement.ZETA8,
        GridPlacement.ZETA9,
        GridPlacement.ZETA10,
        GridPlacement.ZETA11,
        GridPlacement.ZETA12,
        GridPlacement.ZETA13,
        GridPlacement.ZETA14,
        GridPlacement.ZETA15,
        GridPlacement.ZETA16,
        // Eta (16)
        GridPlacement.ETA1,
        GridPlacement.ETA2,
        GridPlacement.ETA3,
        GridPlacement.ETA4,
        GridPlacement.ETA5,
        GridPlacement.ETA6,
        GridPlacement.ETA7,
        GridPlacement.ETA8,
        GridPlacement.ETA9,
        GridPlacement.ETA10,
        GridPlacement.ETA11,
        GridPlacement.ETA12,
        GridPlacement.ETA13,
        GridPlacement.ETA14,
        GridPlacement.ETA15,
        GridPlacement.ETA16,
      ];

      // Verify all placements can be converted to locations and back
      allPositions.forEach((placement) => {
        const [left, right] = service.getGridLocationsFromPlacement(placement);
        const derivedPosition = service.getGridPlacementFromLocations(left, right);
        expect(derivedPosition).toBe(placement);
      });

      expect(allPositions.length).toBe(64);
    });

    it("should maintain bidirectional consistency for all placements", () => {
      // Test that every placement → locations → placement round-trip works
      // Filter out tau and terra placements which use CENTER location and aren't in the perimeter map
      const placements = Object.values(GridPlacement).filter(
        (p) => !p.startsWith("tau") && !p.startsWith("terra")
      );

      placements.forEach((placement) => {
        const [left, right] = service.getGridLocationsFromPlacement(placement);
        const roundTrip = service.getGridPlacementFromLocations(left, right);
        expect(roundTrip).toBe(placement);
      });
    });
  });
});
