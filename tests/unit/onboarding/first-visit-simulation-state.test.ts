import { describe, expect, it } from "vitest";
import { createFirstVisitSimulationState } from "../../../src/routes/test/onboarding-first-visit/simulation-state.svelte";

describe("first-visit onboarding simulator", () => {
  it("moves through the first-session timeline without a guide offer", async () => {
    const simulation = createFirstVisitSimulationState();
    await simulation.initialize();

    expect(simulation.scene).toBe("arrival");
    expect(simulation.currentStep).toBe(1);

    simulation.chooseStart();
    expect(simulation.scene).toBe("compose");
    expect(simulation.currentStep).toBe(2);

    simulation.addFirstMove();
    expect(simulation.scene).toBe("reminder");
    expect(simulation.currentStep).toBe(3);

    simulation.openProfile();
    expect(simulation.scene).toBe("profile");
    expect(simulation.currentStep).toBe(4);
  });

  it("opens each sandbox destination before its task can complete", async () => {
    const simulation = createFirstVisitSimulationState();
    await simulation.initialize();

    for (const taskId of [
      "display-name",
      "profile-photo",
      "props",
      "theme",
    ] as const) {
      const completedBefore = simulation.accountSetup.completedCount;
      simulation.openSetupDestination(taskId);

      expect(simulation.activeSetupTask).toBe(taskId);
      expect(simulation.accountSetup.completedCount).toBe(completedBefore);

      await simulation.finishSetupDestination();
      expect(simulation.activeSetupTask).toBeNull();
      expect(simulation.accountSetup.completedCount).toBe(completedBefore + 1);
    }

    expect(simulation.displayName).toBe("Sky");
    expect(simulation.hasProfilePhoto).toBe(true);
    expect(simulation.hasProps).toBe(true);
    expect(simulation.accountSetup.completedCount).toBe(4);
    expect(simulation.accountSetup.isComplete).toBe(true);
  });

  it("restores the untouched fake account on restart", async () => {
    const simulation = createFirstVisitSimulationState();
    await simulation.initialize();
    simulation.openSetupDestination("display-name");
    await simulation.finishSetupDestination();
    simulation.openSetupDestination("theme");
    await simulation.finishSetupDestination();
    simulation.openProfile();

    await simulation.reset();

    expect(simulation.scene).toBe("arrival");
    expect(simulation.displayName).toBeNull();
    expect(simulation.accountSetup.completedCount).toBe(0);
    expect(simulation.stepsLeft).toBe(4);
  });
});
