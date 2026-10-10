/**
 * HandPathFactory Tests
 *
 * These tests cover derived field computation. Bugs here are silent —
 * a wrong impliedGridMode or missed bigram wouldn't throw, it would
 * just quietly produce wrong query data stored in Firestore.
 */

import { describe, it, expect } from "vitest";
import { createHandPath } from "#lib/shared/foundation/services/hand-path-factory.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

describe("HandPathFactory", () => {

  describe("impliedGridMode", () => {
    it("derives DIAMOND from all cardinal locations", () => {
      const path = createHandPath([
        GridLocation.NORTH,
        GridLocation.EAST,
        GridLocation.SOUTH,
        GridLocation.WEST,
      ]);
      expect(path.impliedGridMode).toBe(GridMode.DIAMOND);
    });

    it("derives BOX from all intercardinal locations", () => {
      const path = createHandPath([
        GridLocation.NORTHEAST,
        GridLocation.SOUTHEAST,
      ]);
      expect(path.impliedGridMode).toBe(GridMode.BOX);
    });

    it("derives SKEWED from mixed cardinal and intercardinal locations", () => {
      const path = createHandPath([
        GridLocation.NORTH,
        GridLocation.SOUTHEAST,
      ]);
      expect(path.impliedGridMode).toBe(GridMode.SKEWED);
    });

    it("derives CENTRIC when CENTER is present", () => {
      const path = createHandPath([
        GridLocation.NORTH,
        GridLocation.CENTER,
        GridLocation.SOUTH,
      ]);
      expect(path.impliedGridMode).toBe(GridMode.CENTRIC);
    });

    it("derives CENTRIC for CENTER-only path", () => {
      const path = createHandPath([GridLocation.CENTER]);
      expect(path.impliedGridMode).toBe(GridMode.CENTRIC);
    });
  });

  describe("bigrams", () => {
    it("produces one bigram per consecutive pair", () => {
      const path = createHandPath([
        GridLocation.NORTH,
        GridLocation.EAST,
        GridLocation.SOUTH,
      ]);
      expect(path.bigrams).toEqual(["n_e", "e_s"]);
    });

    it("produces empty bigrams for a single-location path", () => {
      const path = createHandPath([GridLocation.NORTH]);
      expect(path.bigrams).toEqual([]);
    });

    it("produces one bigram for a two-location path", () => {
      const path = createHandPath([GridLocation.WEST, GridLocation.EAST]);
      expect(path.bigrams).toEqual(["w_e"]);
    });
  });

  describe("isClosed", () => {
    it("detects a closed path when first and last location match", () => {
      const path = createHandPath([
        GridLocation.NORTH,
        GridLocation.EAST,
        GridLocation.NORTH,
      ]);
      expect(path.isClosed).toBe(true);
    });

    it("detects an open path when first and last location differ", () => {
      const path = createHandPath([GridLocation.NORTH, GridLocation.EAST]);
      expect(path.isClosed).toBe(false);
    });

    it("treats a single location as closed (degenerate case)", () => {
      const path = createHandPath([GridLocation.NORTH]);
      expect(path.isClosed).toBe(true);
    });
  });

  describe("derived location fields", () => {
    it("sets startLocation to first location", () => {
      const path = createHandPath([GridLocation.SOUTH, GridLocation.EAST]);
      expect(path.startLocation).toBe(GridLocation.SOUTH);
    });

    it("sets endLocation to last location", () => {
      const path = createHandPath([GridLocation.SOUTH, GridLocation.EAST]);
      expect(path.endLocation).toBe(GridLocation.EAST);
    });

    it("sets length to the number of beats (locations minus one)", () => {
      const path = createHandPath([
        GridLocation.NORTH,
        GridLocation.EAST,
        GridLocation.SOUTH,
      ]);
      // 3 locations = 2 beats (each consecutive pair defines one step)
      expect(path.length).toBe(2);
    });

    it("deduplicates uniqueLocations while preserving order", () => {
      const path = createHandPath([
        GridLocation.NORTH,
        GridLocation.EAST,
        GridLocation.NORTH,
        GridLocation.SOUTH,
      ]);
      expect(path.uniqueLocations).toEqual([
        GridLocation.NORTH,
        GridLocation.EAST,
        GridLocation.SOUTH,
      ]);
    });
  });

  describe("contentHash", () => {
    it("produces the same hash for identical location sequences", () => {
      const path1 = createHandPath([GridLocation.NORTH, GridLocation.EAST]);
      const path2 = createHandPath([GridLocation.NORTH, GridLocation.EAST]);
      expect(path1.contentHash).toBe(path2.contentHash);
    });

    it("produces different hashes for different location sequences", () => {
      const path1 = createHandPath([GridLocation.NORTH, GridLocation.EAST]);
      const path2 = createHandPath([GridLocation.EAST, GridLocation.NORTH]);
      expect(path1.contentHash).not.toBe(path2.contentHash);
    });
  });

  describe("metadata passthrough", () => {
    it("includes provided metadata on the created path", () => {
      const path = createHandPath([GridLocation.NORTH, GridLocation.EAST], {
        name: "test path",
        author: "austen",
        notes: "for testing",
      });
      expect(path.name).toBe("test path");
      expect(path.author).toBe("austen");
      expect(path.notes).toBe("for testing");
    });

    it("leaves metadata fields undefined when not provided", () => {
      const path = createHandPath([GridLocation.NORTH, GridLocation.EAST]);
      expect(path.name).toBeUndefined();
      expect(path.author).toBeUndefined();
      expect(path.notes).toBeUndefined();
    });
  });

  describe("identity", () => {
    it("produces a unique id for each created path", () => {
      const path1 = createHandPath([GridLocation.NORTH]);
      const path2 = createHandPath([GridLocation.NORTH]);
      expect(path1.id).not.toBe(path2.id);
    });
  });
});
