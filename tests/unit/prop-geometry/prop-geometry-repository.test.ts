import { describe, it, expect, vi, beforeEach } from "vitest";
import { PropGeometryAdjustmentRepository } from "#lib/shared/pictograph/arrow/positioning/prop-geometry/services/prop-geometry-adjustment-repository.js";
import type {
  PropGeometryAdjustmentInput,
  PropGeometryKey,
} from "#lib/shared/pictograph/arrow/positioning/prop-geometry/domain/prop-geometry-adjustment.js";
import type { PropGeometryAdjustment } from "#lib/shared/pictograph/arrow/positioning/prop-geometry/domain/prop-geometry-adjustment.js";

// Force admin so the guard passes.
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: { user: { email: "austencloud@gmail.com" } },
}));

function makePersister() {
  return {
    loadAll: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(() => {}),
  };
}

const input: PropGeometryAdjustmentInput = {
  placementFrame: "canonical",
  propType: "staff",
  otherPropType: "staff",
  positionType: "beta",
  endOrientation: "in",
  otherEndOrientation: "in",
  motionType: "static",
  turns: "0",
  arrowColor: "left",
  adjustmentX: 12,
  adjustmentY: -8,
};

const key: PropGeometryKey = {
  placementFrame: "canonical",
  propType: "staff",
  otherPropType: "staff",
  positionType: "beta",
  endOrientation: "in",
  otherEndOrientation: "in",
  motionType: "static",
  turns: "0",
  arrowColor: "left",
};

describe("PropGeometryAdjustmentRepository edit parity", () => {
  let persister: ReturnType<typeof makePersister>;
  let repo: PropGeometryAdjustmentRepository;

  beforeEach(async () => {
    persister = makePersister();
    repo = new PropGeometryAdjustmentRepository(persister as never);
    await repo.initialize();
  });

  it("saveAdjustmentLocal updates in-memory state without persisting", () => {
    repo.saveAdjustmentLocal(input);
    expect(repo.getAdjustment(key)).toEqual({ x: 12, y: -8 });
    expect(repo.hasAdjustment(key)).toBe(true);
    expect(persister.save).not.toHaveBeenCalled();
  });

  it("deleteAdjustmentLocal removes from in-memory state without persisting", () => {
    repo.saveAdjustmentLocal(input);
    repo.deleteAdjustmentLocal(key);
    expect(repo.getAdjustment(key)).toBeNull();
    expect(persister.delete).not.toHaveBeenCalled();
  });

  it("deleteAdjustment persists the delete", async () => {
    await repo.deleteAdjustment(key);
    expect(persister.delete).toHaveBeenCalledTimes(1);
  });

  it("normalizes legacy persisted colors before they enter state", async () => {
    const legacy = {
      ...input,
      arrowColor: "blue",
      updatedAt: {} as PropGeometryAdjustment["updatedAt"],
      updatedBy: "legacy",
    } satisfies PropGeometryAdjustment;
    const legacyPersister = makePersister();
    legacyPersister.loadAll.mockResolvedValue([legacy]);

    const legacyRepo = new PropGeometryAdjustmentRepository(
      legacyPersister as never
    );
    await legacyRepo.initialize();

    expect(legacyRepo.getAdjustment(key)).toEqual({ x: 12, y: -8 });
    expect(legacyRepo.getAll()[0]?.arrowColor).toBe("left");
  });

  it("normalizes legacy caller input before new writes", async () => {
    await repo.saveAdjustment({ ...input, arrowColor: "red" });

    expect(persister.save).toHaveBeenCalledWith(
      expect.objectContaining({ arrowColor: "right" }),
      "austencloud@gmail.com"
    );
  });
});
