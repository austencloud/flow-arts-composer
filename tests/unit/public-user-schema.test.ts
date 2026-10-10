import { describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/firestore/index.js", async () => {
  const { z } = await import("zod");
  return { firestoreDate: z.any() };
});

import { UserFirestoreDataSchema } from "#lib/shared/community/domain/models/user-firestore-schemas.js";

describe("public user schema", () => {
  it("strips private and unknown root fields", () => {
    const parsed = UserFirestoreDataSchema.parse({
      id: "user-1",
      displayName: "Sky",
      email: "private@example.test",
      lastLocation: { city: "Chicago" },
      adminNotes: "private",
      futureSecret: "private",
    });

    expect(parsed).toEqual({ id: "user-1", displayName: "Sky" });
  });
});
