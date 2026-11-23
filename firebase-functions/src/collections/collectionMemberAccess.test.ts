import { canReturnSourceSequence } from "./collectionMemberAccess";

const OWNER = "collection-owner";
const CALLER = "caller";
const VICTIM = "victim";

describe("canReturnSourceSequence", () => {
  it("hides another user's private sequence in the caller's own collection", () => {
    const access = {
      actorId: CALLER,
      collectionOwnerId: CALLER,
      sharedWithActor: false,
    };
    expect(canReturnSourceSequence(access, VICTIM, "private")).toBe(false);
    expect(canReturnSourceSequence(access, VICTIM, undefined)).toBe(false);
  });

  it("hides another user's private sequence in a public collection", () => {
    const access = {
      actorId: CALLER,
      collectionOwnerId: OWNER,
      sharedWithActor: false,
    };
    expect(canReturnSourceSequence(access, VICTIM, "private")).toBe(false);
    // The owner's private sequences stay hidden from a public-only reader too.
    expect(canReturnSourceSequence(access, OWNER, "private")).toBe(false);
    expect(canReturnSourceSequence(access, OWNER, "public")).toBe(true);
  });

  it("hides a third user's private sequence in a collection shared with the caller", () => {
    const access = {
      actorId: CALLER,
      collectionOwnerId: OWNER,
      sharedWithActor: true,
    };
    expect(canReturnSourceSequence(access, VICTIM, "private")).toBe(false);
    expect(canReturnSourceSequence(access, VICTIM, "public")).toBe(true);
    // The share does grant the owner's own sequences.
    expect(canReturnSourceSequence(access, OWNER, "private")).toBe(true);
  });

  it("always returns the caller's own sequence", () => {
    const access = {
      actorId: CALLER,
      collectionOwnerId: OWNER,
      sharedWithActor: false,
    };
    expect(canReturnSourceSequence(access, CALLER, "private")).toBe(true);
  });
});
