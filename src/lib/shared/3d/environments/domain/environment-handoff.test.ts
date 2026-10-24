import { describe, expect, it } from "vitest";
import {
  createEnvironmentHandoff,
  handoffWorlds,
  observeHandoff,
  requestHandoff,
  settleHandoff,
} from "./environment-handoff";

type World = "rainbow" | "winter" | "ocean";

const loading = { ready: false, failed: false };

describe("environment handoff", () => {
  it("keeps the shown world mounted while the requested one loads", () => {
    const state = requestHandoff(
      createEnvironmentHandoff<World>("rainbow"),
      "winter"
    );
    expect(state.shownKey).toBe("rainbow");
    expect(handoffWorlds(state)).toEqual(["rainbow", "winter"]);
    expect(observeHandoff(state, true)).toEqual({
      requestedKey: "winter",
      mountedKey: "rainbow",
      phase: "preparing",
      settled: false,
    });

    // Assets still arriving: nothing changes on screen.
    expect(settleHandoff(state, loading)).toBe(state);
  });

  it("cuts over only when the incoming world is ready", () => {
    const preparing = requestHandoff(
      createEnvironmentHandoff<World>("rainbow"),
      "winter"
    );
    const shown = settleHandoff(preparing, { ready: true, failed: false });
    expect(shown).toEqual({
      shownKey: "winter",
      requestedKey: "winter",
      preparingKey: null,
    });
    expect(handoffWorlds(shown)).toEqual(["winter"]);
    expect(observeHandoff(shown, true).settled).toBe(true);
  });

  it("leaves the shown world in place when the incoming one fails", () => {
    const preparing = requestHandoff(
      createEnvironmentHandoff<World>("rainbow"),
      "winter"
    );
    const failed = settleHandoff(preparing, { ready: false, failed: true });
    expect(handoffWorlds(failed)).toEqual(["rainbow"]);
    // Settled with the request unmet is how the picker learns of the failure.
    expect(observeHandoff(failed, true)).toMatchObject({
      requestedKey: "winter",
      mountedKey: "rainbow",
      settled: true,
    });
    // The picker then asks for the shown world again, which is a no-op.
    expect(requestHandoff(failed, "rainbow")).toEqual({
      shownKey: "rainbow",
      requestedKey: "rainbow",
      preparingKey: null,
    });
  });

  it("retargets a preparation and abandons it for the shown world", () => {
    let state = requestHandoff(
      createEnvironmentHandoff<World>("rainbow"),
      "winter"
    );
    state = requestHandoff(state, "ocean");
    expect(handoffWorlds(state)).toEqual(["rainbow", "ocean"]);

    state = requestHandoff(state, "rainbow");
    expect(handoffWorlds(state)).toEqual(["rainbow"]);
    expect(observeHandoff(state, true).settled).toBe(true);
  });

  it("treats a repeated request as no change", () => {
    const state = requestHandoff(
      createEnvironmentHandoff<World>("rainbow"),
      "winter"
    );
    expect(requestHandoff(state, "winter")).toBe(state);
  });
});
