import { describe, it, expect } from "vitest";
import {
  createLocationMutationQueue,
  type MutationOutcome,
} from "#lib/features/community/domain/location-mutation-queue.js";

/**
 * A promise whose settlement the test controls, so orderings that never occur
 * naturally can be produced on purpose.
 *
 * Mocks that resolve in call order are the false pass this suite exists to
 * avoid: they cannot express "the earlier request finishes last", which is the
 * shape of every bug found in this design.
 */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = () => res();
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets the microtask queue drain so serialized work can advance. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(uid: string | null = "user-1") {
  let liveUid = uid;
  const writes: string[] = [];
  const queue = createLocationMutationQueue({ getLiveUid: () => liveUid });
  return {
    queue,
    writes,
    setLiveUid(next: string | null) {
      liveUid = next;
    },
    /** A write that records its label and resolves immediately. */
    write(label: string) {
      return async () => {
        writes.push(label);
      };
    },
  };
}

describe("location mutation queue", () => {
  describe("gesture ordering", () => {
    it("lets the last gesture win: add A, add B, remove ends removed", async () => {
      const { queue, writes, write } = setup();

      const a = queue.beginIntent("add");
      const b = queue.beginIntent("add");
      const remove = queue.beginIntent("remove");

      const outcomes = await Promise.all([
        queue.submit(a, write("add:A")),
        queue.submit(b, write("add:B")),
        queue.submit(remove, write("remove")),
      ]);

      expect(outcomes.map((o) => o.status)).toEqual([
        "superseded",
        "superseded",
        "applied",
      ]);
      expect(writes).toEqual(["remove"]);
    });

    it("does not make remove win automatically: remove then add C ends at C", async () => {
      const { queue, writes, write } = setup();

      const remove = queue.beginIntent("remove");
      const addC = queue.beginIntent("add");

      const outcomes = await Promise.all([
        queue.submit(remove, write("remove")),
        queue.submit(addC, write("add:C")),
      ]);

      // Removing and then changing your mind is a real later decision. A
      // "remove always wins" rule would silently discard it.
      expect(outcomes.map((o) => o.status)).toEqual(["superseded", "applied"]);
      expect(writes).toEqual(["add:C"]);
    });

    it("cannot resurrect a removed user when canonicalization resolves late", async () => {
      // THE regression this queue exists for. A picker selection starts a
      // Places lookup; the user presses Remove while it is still in flight;
      // the lookup resolves afterward. If intent numbers were stamped at
      // enqueue rather than at the gesture, the late add would outrank the
      // remove and put the user back on the map.
      const { queue, writes, write } = setup();

      const addIntent = queue.beginIntent("add");
      const canonicalization = deferred();
      const addSubmitted = canonicalization.promise.then(() =>
        queue.submit(addIntent, write("add:late")),
      );

      const removeIntent = queue.beginIntent("remove");
      const removeOutcome = await queue.submit(removeIntent, write("remove"));
      expect(removeOutcome.status).toBe("applied");

      canonicalization.resolve();
      const addOutcome = await addSubmitted;

      expect(addOutcome.status).toBe("superseded");
      expect(writes).toEqual(["remove"]);
    });

    it("keeps a retry in its original position rather than promoting it", async () => {
      const { queue, writes } = setup();

      const addIntent = queue.beginIntent("add");
      const firstAttempt = await queue.submit(addIntent, async () => {
        throw new Error("network");
      });
      expect(firstAttempt.status).toBe("failed");

      // Retrying reuses the same intent, so a genuine later gesture still wins.
      const removeIntent = queue.beginIntent("remove");
      const [retry, removal] = await Promise.all([
        queue.submit(addIntent, async () => {
          writes.push("add:retry");
        }),
        queue.submit(removeIntent, async () => {
          writes.push("remove");
        }),
      ]);

      expect(retry.status).toBe("superseded");
      expect(removal.status).toBe("applied");
      expect(writes).toEqual(["remove"]);
    });

    it("applies a retry when nothing newer happened", async () => {
      const { queue, writes } = setup();

      const addIntent = queue.beginIntent("add");
      await queue.submit(addIntent, async () => {
        throw new Error("network");
      });

      const retry = await queue.submit(addIntent, async () => {
        writes.push("add:retry");
      });

      expect(retry.status).toBe("applied");
      expect(writes).toEqual(["add:retry"]);
    });
  });

  describe("serialization", () => {
    it("never has two writes in flight for one user", async () => {
      const { queue } = setup();
      let inFlight = 0;
      let maxInFlight = 0;

      // Each intent is submitted before the previous one settles, so only the
      // queue's own chaining can keep them apart.
      const gates = [deferred(), deferred(), deferred()];
      const submissions = gates.map((gate) => {
        const intent = queue.beginIntent("add");
        return { intent, gate };
      });

      const running = submissions.map(({ intent, gate }) =>
        queue.submit(intent, async () => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await gate.promise;
          inFlight -= 1;
        }),
      );

      for (const gate of gates) {
        await settle();
        gate.resolve();
      }
      await Promise.all(running);

      expect(maxInFlight).toBe(1);
    });

    it("does not let one failure stall or reject later mutations", async () => {
      const { queue, writes, write } = setup();

      // The failing mutation has to be the latest intent when it runs, or it
      // is discarded before reaching its write and the chain is never exposed
      // to a rejection at all.
      const failing = queue.beginIntent("add");
      const failure = await queue.submit(failing, async () => {
        throw new Error("boom");
      });
      expect(failure).toMatchObject({ status: "failed" });

      const later = queue.beginIntent("remove");
      const laterOutcome = await queue.submit(later, write("remove"));

      expect(laterOutcome).toMatchObject({ status: "applied" });
      expect(writes).toEqual(["remove"]);
    });
  });

  describe("session cancellation", () => {
    it("cancels a queued mutation when the session is invalidated", async () => {
      const { queue, writes } = setup();

      // The blocker must reach its write before the next intent exists,
      // otherwise it is superseded, returns instantly, and nothing is ever
      // actually queued behind it.
      const blocker = queue.beginIntent("add");
      const gate = deferred();
      const blocked = queue.submit(blocker, async () => {
        writes.push("blocker");
        await gate.promise;
      });
      await settle();
      expect(writes).toEqual(["blocker"]);

      const queued = queue.beginIntent("remove");
      const queuedOutcome = queue.submit(queued, async () => {
        writes.push("should-not-run");
      });

      queue.invalidateSession();
      gate.resolve();

      await blocked;
      const outcome = await queuedOutcome;

      expect(outcome.status).toBe("cancelled");
      expect(writes).toEqual(["blocker"]);
    });

    it("cancels across a sign-out and sign-in as the same uid", async () => {
      // The boundary is the session, not the identity. Comparing uid alone
      // would let work created before the sign-out execute afterward.
      const { queue, writes, setLiveUid } = setup("user-1");

      const intent = queue.beginIntent("add");

      setLiveUid(null);
      queue.invalidateSession();
      setLiveUid("user-1");

      // The uid matches again, so only the generation can catch this.
      const outcome = await queue.submit(intent, async () => {
        writes.push("should-not-run");
      });

      expect(outcome.status).toBe("cancelled");
      expect(writes).toEqual([]);
    });

    it("cancels when the uid changes without a session bump", async () => {
      const { queue, writes, setLiveUid } = setup("user-1");

      const intent = queue.beginIntent("add");
      setLiveUid("user-2");

      const outcome = await queue.submit(intent, async () => {
        writes.push("should-not-run");
      });

      expect(outcome.status).toBe("cancelled");
      expect(writes).toEqual([]);
    });

    it("reports an issued write honestly when the session changes mid-flight", async () => {
      // The queue does not claim to recall a request Firestore already has.
      // Callers must treat this as potentially committed, which is why the
      // outcome is `applied` rather than `cancelled`.
      const { queue, writes } = setup();

      const intent = queue.beginIntent("add");
      const gate = deferred();
      const outcome = queue.submit(intent, async () => {
        writes.push("issued");
        await gate.promise;
      });

      await settle();
      expect(writes).toEqual(["issued"]);

      queue.invalidateSession();
      gate.resolve();

      expect((await outcome).status).toBe("applied");
    });
  });

  describe("outcomes", () => {
    it("carries the originating intent on every outcome", async () => {
      const { queue, write } = setup();

      const superseded = queue.beginIntent("add");
      const applied = queue.beginIntent("remove");

      const results: MutationOutcome[] = await Promise.all([
        queue.submit(superseded, write("a")),
        queue.submit(applied, write("b")),
      ]);

      expect(results[0]).toEqual({ status: "superseded", intent: superseded.intent });
      expect(results[1]).toEqual({ status: "applied", intent: applied.intent });
    });

    it("reports a synchronous throw from the write as failed, not as a rejection", async () => {
      const { queue } = setup();
      const intent = queue.beginIntent("add");

      const outcome = await queue.submit(intent, () => {
        throw new Error("sync boom");
      });

      expect(outcome.status).toBe("failed");
      expect(outcome).toMatchObject({ intent: intent.intent });
    });
  });
});
