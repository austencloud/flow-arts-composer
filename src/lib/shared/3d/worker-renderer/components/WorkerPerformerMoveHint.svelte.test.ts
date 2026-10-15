import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import type { ProjectedWorkerStagePosition } from "../services/worker-performer-interaction";
import WorkerPerformerMoveHint from "./WorkerPerformerMoveHint.svelte";

describe("worker performer move hint projection", () => {
  it("waits for a camera projection and can show the hint when it arrives", async () => {
    let projection: ProjectedWorkerStagePosition | null = null;
    const { rerender } = render(WorkerPerformerMoveHint, {
      bridge: {
        takeMoveHint: () => true,
        projectStagePosition: () => projection,
      },
      position: { x: 0, z: 0 },
      groundY: 0,
      placing: false,
      projectionRevision: 0,
    });
    await expect
      .element(page.getByText("Drag to move"))
      .not.toBeInTheDocument();
    projection = { x: 123, y: 456, visible: true };
    await rerender({ projectionRevision: 1 });
    await expect.element(page.getByText("Drag to move")).toBeVisible();
    expect(
      document.querySelector(".move-hint")?.getAttribute("style")
    ).toContain("123px");
    await rerender({ placing: true });
    await expect
      .element(page.getByText("Drag to move"))
      .not.toBeInTheDocument();
  });
});
