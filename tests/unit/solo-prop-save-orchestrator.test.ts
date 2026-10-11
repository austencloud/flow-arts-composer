import { describe, expect, it, vi } from "vitest";
import { SoloPropSaveOrchestrator } from "#lib/features/library/services/solo-prop-save-orchestrator.js";
import { createSoloProp } from "#lib/shared/foundation/services/solo-prop-factory.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

function makeSoloProp() {
  return createSoloProp(
    [
      {
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        turns: 1,
        duration: 1,
      },
    ],
    GridLocation.NORTH,
    Orientation.IN
  );
}

describe("SoloPropSaveOrchestrator", () => {
  it("persists authored-hand metadata on the solo prop and its hand path", async () => {
    const soloProp = makeSoloProp();
    const soloRepository = {
      getByHash: vi.fn(async () => null),
      save: vi.fn(async () => undefined),
    };
    const handPathRepository = {
      getByHash: vi.fn(async () => null),
      save: vi.fn(async () => undefined),
    };
    const orchestrator = new SoloPropSaveOrchestrator(
      soloRepository as never,
      handPathRepository as never
    );

    const result = await orchestrator.save(soloProp, {
      name: "Orbit",
      notes: "Slow and continuous",
      authoredHand: "right",
      ownerId: "owner-1",
      ownerDisplayName: "Austen",
    });

    expect(result).toEqual({
      soloPropId: soloProp.id,
      reusedExisting: false,
    });
    expect(soloRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: soloProp.id,
        name: "Orbit",
        notes: "Slow and continuous",
        authoredHand: "right",
        ownerId: "owner-1",
        ownerDisplayName: "Austen",
      }),
      expect.objectContaining({ isOriginal: true })
    );
    expect(handPathRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Orbit",
        notes: "Slow and continuous",
        ownerId: "owner-1",
        ownerDisplayName: "Austen",
      }),
      expect.objectContaining({ isOriginal: true })
    );
  });

  it("updates the content-addressed artifact instead of duplicating it", async () => {
    const incoming = makeSoloProp();
    const existing = {
      ...incoming,
      id: "existing-solo",
      handPath: { ...incoming.handPath, id: "existing-path" },
      name: "Old title",
      notes: "Keep this note",
      authoredHand: "right" as const,
    };
    const soloRepository = {
      getByHash: vi.fn(async () => existing),
      save: vi.fn(async () => undefined),
    };
    const handPathRepository = {
      getByHash: vi.fn(async () => existing.handPath),
      save: vi.fn(async () => undefined),
    };
    const orchestrator = new SoloPropSaveOrchestrator(
      soloRepository as never,
      handPathRepository as never
    );

    const result = await orchestrator.save(incoming, {
      name: "New title",
      notes: "",
      authoredHand: "left",
    });

    expect(result).toEqual({
      soloPropId: "existing-solo",
      reusedExisting: true,
    });
    expect(soloRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "existing-solo",
        name: "Old title",
        notes: "Keep this note",
        authoredHand: "right",
        handPath: expect.objectContaining({
          id: "existing-path",
          name: "Old title",
          notes: "Keep this note",
        }),
      }),
      expect.anything()
    );
  });
});
