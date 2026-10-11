import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createFlowFestProgress } from "#lib/features/flow-fest-sim/state/flow-fest-progress.js";
import {
  FLOW_FEST_GATE4_MOBILITY_SESSION_KEY,
  FLOW_FEST_GATE4_SESSION_KEY,
  FLOW_FEST_GATE5_JOURNEY_SESSION_KEY,
  FLOW_FEST_GATE5_MOBILITY_SESSION_KEY,
  FLOW_FEST_GATE5_SESSION_KEY,
  FLOW_FEST_SESSION_KEY,
  FLOW_FEST_SESSION_STORAGE_KEYS,
  clearFlowFestSessionStorage,
  flowFestUrlWithoutRestart,
  parseFlowFestRestartRequest,
} from "../../src/routes/test/flow-fest-sim/flow-fest-restart-link";

const ROUTE_SOURCE_PATH = resolve(
  process.cwd(),
  "src/routes/test/flow-fest-sim/+page.svelte"
);

/**
 * The session Austen was actually stuck in when he asked for this: parked, out
 * of the car, walking the festival. Copied from `localStorage` on the running
 * sim, trimmed to the fields the restart has to clear.
 */
const PARKED_IN_THE_FESTIVAL = JSON.stringify({
  version: 5,
  contractFingerprint: "b0f0a5b7c8d94e1f",
  masterSeed: 20240905,
  phase: "afternoon-free-roam",
  moment: "afternoon",
  branch: "lower-tent",
  fireJamState: "not-started",
  completed: ["drive-in", "park"],
  loadout: { carModelId: "lifted-85-pickup", paintIndex: 2 },
  energyPercent: 74,
});

const PARKED_CAR = JSON.stringify({
  car: { modelId: "lifted-85-pickup", paintIndex: 2 },
});

function fakeStorage(seed: Record<string, string>) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe("flow fest restart link", () => {
  describe("parseFlowFestRestartRequest", () => {
    it("honours the flag the shared link carries", () => {
      expect(
        parseFlowFestRestartRequest(new URLSearchParams("?restart=1"))
      ).toBe(true);
    });

    it("honours a bare flag someone trimmed the URL down to", () => {
      expect(parseFlowFestRestartRequest(new URLSearchParams("?restart"))).toBe(
        true
      );
    });

    it("leaves an ordinary visit alone so a saved session resumes", () => {
      expect(parseFlowFestRestartRequest(new URLSearchParams(""))).toBe(false);
      expect(
        parseFlowFestRestartRequest(
          new URLSearchParams("?cam=-463.0,29.5,50.5&fov=65")
        )
      ).toBe(false);
    });

    it("lets a link switch the flag off explicitly", () => {
      expect(
        parseFlowFestRestartRequest(new URLSearchParams("?restart=0"))
      ).toBe(false);
      expect(
        parseFlowFestRestartRequest(new URLSearchParams("?restart=false"))
      ).toBe(false);
    });
  });

  describe("clearFlowFestSessionStorage", () => {
    it("forgets a session that is parked in the festival", () => {
      const storage = fakeStorage({
        [FLOW_FEST_GATE5_SESSION_KEY]: PARKED_IN_THE_FESTIVAL,
        [FLOW_FEST_GATE5_MOBILITY_SESSION_KEY]: PARKED_CAR,
        [FLOW_FEST_GATE5_JOURNEY_SESSION_KEY]: JSON.stringify({
          beats: ["arrived"],
        }),
      });

      clearFlowFestSessionStorage(storage);

      expect(storage.map.size).toBe(0);
    });

    it("leaves every other key in the browser alone", () => {
      const storage = fakeStorage({
        [FLOW_FEST_GATE5_SESSION_KEY]: PARKED_IN_THE_FESTIVAL,
        "tka:theme": "dark",
        "flow-arts:last-sequence": "ABCD",
      });

      clearFlowFestSessionStorage(storage);

      expect([...storage.map.keys()]).toEqual([
        "tka:theme",
        "flow-arts:last-sequence",
      ]);
    });

    it("survives a storage that refuses to forget", () => {
      const hostile = {
        removeItem: () => {
          throw new DOMException("denied", "SecurityError");
        },
      };

      expect(() => clearFlowFestSessionStorage(hostile)).not.toThrow();
    });

    it("lands the next load on the loadout with no car packed", () => {
      const fresh = createFlowFestProgress("b0f0a5b7c8d94e1f");

      expect(fresh.phase).toBe("loadout");
      expect(fresh.loadout).toBeNull();
      expect(fresh.completed).toEqual([]);
      expect(fresh.branch).toBeNull();
    });
  });

  describe("flowFestUrlWithoutRestart", () => {
    it("takes the flag back out so a refresh cannot wipe the new session", () => {
      const stripped = flowFestUrlWithoutRestart(
        new URL("https://localhost:5173/test/flow-fest-sim?restart=1")
      );

      expect(stripped.searchParams.has("restart")).toBe(false);
      expect(stripped.pathname).toBe("/test/flow-fest-sim");
    });

    it("keeps every other parameter the link was carrying", () => {
      const stripped = flowFestUrlWithoutRestart(
        new URL(
          "https://localhost:5173/test/flow-fest-sim?restart=1&gate6=1&cam=-463.0,29.5,50.5&fov=65"
        )
      );

      expect(stripped.searchParams.get("gate6")).toBe("1");
      expect(stripped.searchParams.get("cam")).toBe("-463.0,29.5,50.5");
      expect(stripped.searchParams.get("fov")).toBe("65");
      expect(stripped.searchParams.has("restart")).toBe(false);
    });
  });

  describe("one owner for the session keys", () => {
    it("lists every key the sim stores Thursday state under", () => {
      expect([...FLOW_FEST_SESSION_STORAGE_KEYS]).toEqual([
        FLOW_FEST_SESSION_KEY,
        FLOW_FEST_GATE4_SESSION_KEY,
        FLOW_FEST_GATE4_MOBILITY_SESSION_KEY,
        FLOW_FEST_GATE5_SESSION_KEY,
        FLOW_FEST_GATE5_MOBILITY_SESSION_KEY,
        FLOW_FEST_GATE5_JOURNEY_SESSION_KEY,
      ]);
    });

    /**
     * A restart that clears five of six keys is worse than none, because the
     * survivor resurrects the old run. The route may not mint its own key.
     */
    it("leaves the route with no session key literal of its own", () => {
      const source = readFileSync(ROUTE_SOURCE_PATH, "utf8");
      const literals = source.match(/["']flow-fest-sim:[^"']+["']/g) ?? [];

      expect(literals).toEqual([]);
    });
  });
});
