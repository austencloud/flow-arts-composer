/**
 * Firestore authorization audit — cross-tenant reads/writes, ownership
 * takeover, private-to-public visibility, client-supplied privileged fields,
 * and input validation on client-reachable collections.
 *
 * Read-only audit: firestore.rules is loaded verbatim and never edited.
 *
 * Guest (anonymous) access is INTENTIONAL policy in several places in this
 * repo ("play/save is open" tier). Probes here separate that policy from an
 * actual cross-tenant bypass: a control asserts the deny that policy promises,
 * and a `repro` asserts the deny that is currently MISSING.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  ADMIN_UID,
  ANON_UID,
  ATTACKER_UID,
  SDK_SETTINGS,
  THIRD_PARTY_UID,
  VICTIM_UID,
  adminCtx,
  anonCtx,
  createTestEnv,
  fullCtx,
  repro,
} from "./harness";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

function victimDb() {
  return fullCtx(env, VICTIM_UID).firestore(SDK_SETTINGS);
}
function attackerDb() {
  return fullCtx(env, ATTACKER_UID).firestore(SDK_SETTINGS);
}
function thirdPartyDb() {
  return fullCtx(env, THIRD_PARTY_UID).firestore(SDK_SETTINGS);
}
function guestDb() {
  return anonCtx(env).firestore(SDK_SETTINGS);
}
function signedOutDb() {
  return env.unauthenticatedContext().firestore(SDK_SETTINGS);
}
function adminDb() {
  return adminCtx(env).firestore(SDK_SETTINGS);
}

/** Seed through the Admin path so the probe measures the READ/WRITE under test. */
async function seed(
  writes: Array<[path: string, data: Record<string, unknown>]>
): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore(SDK_SETTINGS);
    for (const [path, data] of writes) {
      await setDoc(doc(db, path), data);
    }
  });
}

// ===========================================================================
// CONTROLS — the boundaries the rules DO hold. These must stay green; they
// prove the harness can observe a deny, so a `repro` failure is a real gap
// and not a broken probe.
// ===========================================================================
describe("controls: cross-tenant boundaries that hold", () => {
  it("a private owner sequence is unreadable by another account and by a guest", async () => {
    await seed([
      [
        `users/${VICTIM_UID}/sequences/seq-private`,
        { word: "ABC", visibility: "private", userId: VICTIM_UID },
      ],
    ]);

    await assertFails(
      getDoc(doc(attackerDb(), `users/${VICTIM_UID}/sequences/seq-private`))
    );
    await assertFails(
      getDoc(doc(guestDb(), `users/${VICTIM_UID}/sequences/seq-private`))
    );
    await assertSucceeds(
      getDoc(doc(victimDb(), `users/${VICTIM_UID}/sequences/seq-private`))
    );
  });

  it("a private collection is unreadable by a non-owner, public one is world-readable", async () => {
    await seed([
      [
        `users/${VICTIM_UID}/collections/private-col`,
        { name: "P", isPublic: false },
      ],
      [
        `users/${VICTIM_UID}/collections/public-col`,
        { name: "U", isPublic: true },
      ],
    ]);

    await assertFails(
      getDoc(doc(attackerDb(), `users/${VICTIM_UID}/collections/private-col`))
    );
    await assertSucceeds(
      getDoc(doc(signedOutDb(), `users/${VICTIM_UID}/collections/public-col`))
    );
  });

  it("userPrivateProfiles stays owner/admin-only", async () => {
    await seed([
      [`userPrivateProfiles/${VICTIM_UID}`, { email: "victim@example.com" }],
    ]);

    await assertFails(
      getDoc(doc(attackerDb(), `userPrivateProfiles/${VICTIM_UID}`))
    );
    await assertSucceeds(
      getDoc(doc(victimDb(), `userPrivateProfiles/${VICTIM_UID}`))
    );
    await assertSucceeds(
      getDoc(doc(adminDb(), `userPrivateProfiles/${VICTIM_UID}`))
    );
  });

  it("a client cannot self-grant role/isAdmin on its own public profile", async () => {
    await assertFails(
      setDoc(doc(attackerDb(), `users/${ATTACKER_UID}`), {
        publicProfileVersion: 2,
        displayName: "A",
        role: "admin",
      })
    );
    await assertFails(
      setDoc(doc(attackerDb(), `users/${ATTACKER_UID}`), {
        publicProfileVersion: 2,
        displayName: "A",
        isAdmin: true,
      })
    );
    // And cannot forge social/XP counters at create time.
    await assertFails(
      setDoc(doc(attackerDb(), `users/${ATTACKER_UID}`), {
        publicProfileVersion: 2,
        displayName: "A",
        followerCount: 9999,
      })
    );
    await assertSucceeds(
      setDoc(doc(attackerDb(), `users/${ATTACKER_UID}`), {
        publicProfileVersion: 2,
        displayName: "A",
      })
    );
  });

  it("an existing profile's privilege fields are not owner-writable", async () => {
    await seed([
      [
        `users/${VICTIM_UID}`,
        {
          publicProfileVersion: 2,
          displayName: "V",
          role: "user",
          isAdmin: false,
        },
      ],
    ]);

    await assertFails(
      updateDoc(doc(victimDb(), `users/${VICTIM_UID}`), { role: "admin" })
    );
    await assertFails(
      updateDoc(doc(victimDb(), `users/${VICTIM_UID}`), { isAdmin: true })
    );
    await assertFails(
      updateDoc(doc(victimDb(), `users/${VICTIM_UID}`), { totalXP: 100000 })
    );
    await assertSucceeds(
      updateDoc(doc(victimDb(), `users/${VICTIM_UID}`), { bio: "hello" })
    );
  });

  it("publicSequences ownership cannot be hijacked by overwriting ownerId", async () => {
    // The regression this repo already closed (2026-07-26). Kept as a control
    // so the same shape elsewhere is measured against a known-good baseline.
    await seed([
      [
        "publicSequences/seq-1",
        {
          ownerId: VICTIM_UID,
          sourceRef: `users/${VICTIM_UID}/sequences/seq-1`,
          word: "ABC",
          contentHash: "a".repeat(64),
          contentHashVersion: 1,
          sequenceLength: 3,
          publicProjectionRevision: 1,
          publicProjectionSchemaVersion: 2,
          publicProjectionDigest: "d".repeat(64),
          publicPerformanceCount: 0,
        },
      ],
    ]);

    await assertFails(
      updateDoc(doc(attackerDb(), "publicSequences/seq-1"), {
        ownerId: ATTACKER_UID,
        sourceRef: `users/${ATTACKER_UID}/sequences/seq-1`,
      })
    );
  });

  it("a guest cannot publish a collection, but private guest saves still work", async () => {
    // Intentional policy: the guest tier can save privately and un-publish.
    await assertSucceeds(
      setDoc(doc(guestDb(), `users/${ANON_UID}/collections/guest-col`), {
        name: "Guest",
        isPublic: false,
      })
    );
    await assertFails(
      setDoc(doc(guestDb(), `users/${ANON_UID}/collections/guest-pub`), {
        name: "Guest",
        isPublic: true,
      })
    );
  });

  it("server-owned counters and admin-only surfaces reject client writes", async () => {
    await seed([["shortcodes/AB12CD", { encoded: "x", scanCount: 0 }]]);

    // Scan counters are server-owned.
    await assertFails(
      updateDoc(doc(attackerDb(), "shortcodes/AB12CD"), { scanCount: 500 })
    );
    // Orders resolve prices server-side; clients never write.
    await assertFails(
      setDoc(doc(attackerDb(), "orders/o1"), { status: "paid", total: 0 })
    );
    // Meta/Instagram provider tokens have no client read path.
    await assertFails(
      getDoc(doc(attackerDb(), `metaPublishConnections/${VICTIM_UID}`))
    );
  });
});

// ===========================================================================
// FINDING 1 — publicHandPaths / publicSoloProps accept a cross-account
// overwrite. update checks only the INCOMING ownerId, never the stored one:
// the exact hole publicSequences closed on 2026-07-26.
// ===========================================================================
describe("finding 1: publicSoloProps / publicHandPaths ownership takeover", () => {
  const HASH = "c".repeat(22);

  async function seedVictimArtifacts() {
    await seed([
      [
        `publicSoloProps/${HASH}`,
        {
          contentHash: HASH,
          steps: ["victim-step"],
          startLocation: "n",
          length: 1,
          ownerId: VICTIM_UID,
        },
      ],
      [
        `publicHandPaths/${HASH}`,
        {
          contentHash: HASH,
          locations: ["n", "e"],
          length: 2,
          ownerId: VICTIM_UID,
        },
      ],
    ]);
  }

  it("MEASURED: the current rules ACCEPT the takeover (documents the defect)", async () => {
    await seedVictimArtifacts();

    // Minimal request: one updateDoc from an unrelated full account.
    await assertSucceeds(
      updateDoc(doc(attackerDb(), `publicSoloProps/${HASH}`), {
        ownerId: ATTACKER_UID,
        steps: ["attacker-payload"],
      })
    );
    await assertSucceeds(
      updateDoc(doc(attackerDb(), `publicHandPaths/${HASH}`), {
        ownerId: ATTACKER_UID,
        locations: ["attacker-payload"],
      })
    );

    // The content-addressed invariant (doc id == contentHash of the payload)
    // is now broken: the id still says HASH, the body is the attacker's.
    await env.withSecurityRulesDisabled(async (context) => {
      const snap = await getDoc(
        doc(context.firestore(SDK_SETTINGS), `publicSoloProps/${HASH}`)
      );
      expect(snap.data()?.ownerId).toBe(ATTACKER_UID);
      expect(snap.data()?.steps).toEqual(["attacker-payload"]);
      expect(snap.data()?.contentHash).toBe(HASH);
    });
  });

  it("a guest (anonymous) account is correctly blocked — isFullUser() holds", async () => {
    await seedVictimArtifacts();
    await assertFails(
      updateDoc(doc(guestDb(), `publicSoloProps/${HASH}`), {
        ownerId: ANON_UID,
      })
    );
  });

  repro(
    "REPRO (red while open): a non-owner must not overwrite these docs",
    async () => {
      await seedVictimArtifacts();
      await assertFails(
        updateDoc(doc(attackerDb(), `publicSoloProps/${HASH}`), {
          ownerId: ATTACKER_UID,
          steps: ["attacker-payload"],
        })
      );
      await assertFails(
        updateDoc(doc(attackerDb(), `publicHandPaths/${HASH}`), {
          ownerId: ATTACKER_UID,
          locations: ["attacker-payload"],
        })
      );
    }
  );

  repro("REPRO (red while open): deletion is equally unguarded", async () => {
    // delete requires resource.data.ownerId == uid, so this one already holds;
    // asserted next to the update gap to show the asymmetry inside one block.
    await seedVictimArtifacts();
    await assertFails(deleteDoc(doc(attackerDb(), `publicSoloProps/${HASH}`)));
  });
});

// ===========================================================================
// FINDING 2 — the Hall of Shame daily cap is advisory only. The create rule
// never consults a counter, and the counter document the client does keep is
// writable by its own subject.
// ===========================================================================
describe("finding 2: Hall of Shame submission cap is not enforceable", () => {
  function entry(id: string) {
    return {
      id,
      sourceSequenceId: `src-${id}`,
      ownerId: ATTACKER_UID,
      word: "ABC",
      status: "pending",
      voteCount: 0,
      viewCount: 0,
      reportCount: 0,
      featured: false,
      hidden: false,
    };
  }

  it("MEASURED: one account creates far more than the 3/day client limit", async () => {
    const db = attackerDb();
    for (let i = 0; i < 8; i += 1) {
      await assertSucceeds(
        setDoc(doc(db, `hallOfShame/flood-${i}`), entry(`flood-${i}`))
      );
    }
  });

  it("MEASURED: the subject can reset its own rate-limit counter to zero", async () => {
    const limitId = `${ATTACKER_UID}_2026-09-13`;
    await seed([
      [`hallOfShameRateLimits/${limitId}`, { count: 3, userId: ATTACKER_UID }],
    ]);

    await assertSucceeds(
      updateDoc(doc(attackerDb(), `hallOfShameRateLimits/${limitId}`), {
        count: 0,
      })
    );
  });

  it("the moderation status itself stays admin-only (the gate that does hold)", async () => {
    await seed([["hallOfShame/pending-1", entry("pending-1")]]);
    await assertFails(
      updateDoc(doc(attackerDb(), "hallOfShame/pending-1"), {
        status: "approved",
      })
    );
    await assertSucceeds(
      updateDoc(doc(adminDb(), "hallOfShame/pending-1"), { status: "approved" })
    );
  });

  it("MEASURED: age verification is self-attested — the reader writes its own gate", async () => {
    // isAgeVerified() reads userPrivateProfiles/{uid}.ageVerifiedAt, and that
    // field is in the owner-writable hasOnly() allowlist with no validation.
    await assertSucceeds(
      setDoc(doc(attackerDb(), `userPrivateProfiles/${ATTACKER_UID}`), {
        ageVerifiedAt: "1900-01-01T00:00:00.000Z",
      })
    );
    await seed([
      [
        "hallOfShame/approved-1",
        { ...entry("approved-1"), ownerId: VICTIM_UID, status: "approved" },
      ],
    ]);
    await assertSucceeds(getDoc(doc(attackerDb(), "hallOfShame/approved-1")));
  });
});

// ===========================================================================
// FINDING 3 — unauthenticated, unbounded document creation on shop_waitlist:
// the only validation is the email field's type and length. No key allowlist,
// no auth, no shape cap on anything else in the document.
// ===========================================================================
describe("finding 3: shop_waitlist accepts unauthenticated arbitrary documents", () => {
  it("MEASURED: a signed-out client writes 50 KB of unrelated fields", async () => {
    const junk = "x".repeat(50_000);
    await assertSucceeds(
      setDoc(doc(signedOutDb(), "shop_waitlist/attacker-chosen-id"), {
        email: "a@b.co",
        junkPayload: junk,
        forgedSource: "admin-import",
        nested: { deep: { arbitrary: junk } },
      })
    );
  });

  it("reads and edits stay closed (so this is a write-amplification gap, not disclosure)", async () => {
    await seed([["shop_waitlist/e1", { email: "a@b.co" }]]);
    await assertFails(getDoc(doc(signedOutDb(), "shop_waitlist/e1")));
    await assertFails(getDoc(doc(attackerDb(), "shop_waitlist/e1")));
    await assertFails(
      updateDoc(doc(signedOutDb(), "shop_waitlist/e1"), { email: "c@d.co" })
    );
    await assertSucceeds(getDoc(doc(adminDb(), "shop_waitlist/e1")));
  });

  repro(
    "REPRO (red while open): the document shape should be allowlisted",
    async () => {
      await assertFails(
        setDoc(doc(signedOutDb(), "shop_waitlist/shape-probe"), {
          email: "a@b.co",
          junkPayload: "x".repeat(50_000),
        })
      );
    }
  );
});

// ===========================================================================
// FINDING 4 — errorTelemetry update is open to ANY caller, signed out
// included. Doc ids are deterministic ({utcDay}_{hash(key)}), so a caller who
// can derive an id can rewrite someone else's report in place.
// ===========================================================================
describe("finding 4: errorTelemetry reports are rewritable by anyone", () => {
  it("MEASURED: a signed-out client rewrites an existing report's contents", async () => {
    await seed([
      [
        "errorTelemetry/20260913_abcdef",
        { message: "real failure", count: 12, resolved: false },
      ],
    ]);

    await assertSucceeds(
      updateDoc(doc(signedOutDb(), "errorTelemetry/20260913_abcdef"), {
        message: "overwritten",
        count: 0,
      })
    );
  });

  it("the admin triage flag is the one field that is protected", async () => {
    await seed([
      [
        "errorTelemetry/20260913_abcdef",
        { message: "real failure", resolved: false },
      ],
    ]);
    await assertFails(
      updateDoc(doc(signedOutDb(), "errorTelemetry/20260913_abcdef"), {
        resolved: true,
      })
    );
    await assertFails(
      getDoc(doc(signedOutDb(), "errorTelemetry/20260913_abcdef"))
    );
  });

  repro(
    "REPRO (red while open): a report should not be rewritable by a stranger",
    async () => {
      await seed([
        [
          "errorTelemetry/20260913_abcdef",
          { message: "real failure", count: 12 },
        ],
      ]);
      await assertFails(
        updateDoc(doc(signedOutDb(), "errorTelemetry/20260913_abcdef"), {
          message: "overwritten",
          count: 0,
        })
      );
    }
  );
});

// ===========================================================================
// FINDING 5 — a collaborator (or a pending invitee) on a collaborators-only
// video can grant read access to arbitrary third parties and evict the other
// collaborators. Only `creatorId` and `visibility` are frozen for them.
// ===========================================================================
describe("finding 5: video collaborator rosters are re-shareable by collaborators", () => {
  async function seedPrivateVideo() {
    await seed([
      [
        "videos/vid-1",
        {
          creatorId: VICTIM_UID,
          visibility: "collaborators-only",
          collaboratorIds: [ATTACKER_UID],
          pendingInviteUserIds: [],
          title: "private cut",
        },
      ],
    ]);
  }

  it("a stranger cannot read or edit the private video (the gate that holds)", async () => {
    await seedPrivateVideo();
    await assertFails(getDoc(doc(thirdPartyDb(), "videos/vid-1")));
    await assertFails(
      updateDoc(doc(thirdPartyDb(), "videos/vid-1"), {
        collaboratorIds: [ATTACKER_UID, THIRD_PARTY_UID],
      })
    );
    await assertFails(
      updateDoc(doc(attackerDb(), "videos/vid-1"), { visibility: "public" })
    );
    await assertFails(
      updateDoc(doc(attackerDb(), "videos/vid-1"), { creatorId: ATTACKER_UID })
    );
    await assertFails(deleteDoc(doc(attackerDb(), "videos/vid-1")));
  });

  it("MEASURED: a collaborator adds a stranger, who can then read the video", async () => {
    await seedPrivateVideo();

    await assertSucceeds(
      updateDoc(doc(attackerDb(), "videos/vid-1"), {
        collaboratorIds: [ATTACKER_UID, THIRD_PARTY_UID],
      })
    );
    await assertSucceeds(getDoc(doc(thirdPartyDb(), "videos/vid-1")));
  });

  it("MEASURED: a collaborator evicts every other collaborator, including by-invite", async () => {
    await seed([
      [
        "videos/vid-2",
        {
          creatorId: VICTIM_UID,
          visibility: "collaborators-only",
          collaboratorIds: [ATTACKER_UID, THIRD_PARTY_UID],
          pendingInviteUserIds: ["pending-someone"],
          beatMap: { 0: "victim" },
        },
      ],
    ]);

    await assertSucceeds(
      updateDoc(doc(attackerDb(), "videos/vid-2"), {
        collaboratorIds: [ATTACKER_UID],
        pendingInviteUserIds: [],
        beatMap: { 0: "attacker" },
      })
    );
    await assertFails(getDoc(doc(thirdPartyDb(), "videos/vid-2")));
  });

  repro(
    "REPRO (red while open): roster changes should be the creator's alone",
    async () => {
      await seedPrivateVideo();
      await assertFails(
        updateDoc(doc(attackerDb(), "videos/vid-1"), {
          collaboratorIds: [ATTACKER_UID, THIRD_PARTY_UID],
        })
      );
    }
  );
});

// ===========================================================================
// FINDING 6 — /usernames is fully listable by any session, including an
// anonymous guest. The collection is the username -> userId map, so one query
// enumerates every account handle and uid.
// ===========================================================================
describe("finding 6: the username index is enumerable, not just checkable", () => {
  it("MEASURED: a guest lists the whole username -> userId map", async () => {
    await seed([
      ["usernames/alice", { userId: VICTIM_UID, username: "Alice" }],
      ["usernames/bob", { userId: THIRD_PARTY_UID, username: "Bob" }],
    ]);

    const snap = await assertSucceeds(
      getDocs(collection(guestDb(), "usernames"))
    );
    expect(snap.size).toBe(2);
    expect(snap.docs.map((d) => d.data().userId).sort()).toEqual(
      [THIRD_PARTY_UID, VICTIM_UID].sort()
    );
  });

  it("a signed-out client is correctly denied (auth is required)", async () => {
    await seed([["usernames/alice", { userId: VICTIM_UID }]]);
    await assertFails(getDocs(collection(signedOutDb(), "usernames")));
  });

  it("a claimed username cannot be stolen by another account", async () => {
    await seed([["usernames/alice", { userId: VICTIM_UID }]]);
    await assertFails(
      setDoc(doc(attackerDb(), "usernames/alice"), { userId: ATTACKER_UID })
    );
    await assertFails(deleteDoc(doc(attackerDb(), "usernames/alice")));
  });

  repro(
    "REPRO (red while open): availability checks need get, not list",
    async () => {
      await seed([["usernames/alice", { userId: VICTIM_UID }]]);
      await assertFails(getDocs(collection(guestDb(), "usernames")));
      // A single-document availability check must keep working.
      await assertSucceeds(getDoc(doc(guestDb(), "usernames/alice")));
    }
  );
});

// ===========================================================================
// Rules-file hygiene: /products is declared twice. Duplicate match blocks OR
// together, so this is not an access change — but it means a future tightening
// of one block is silently overridden by the other.
// ===========================================================================
describe("hygiene: duplicate /products match block", () => {
  it("firestore.rules declares match /products/{productId} twice", () => {
    const rules = readFileSync(
      resolve(__dirname, "../../firestore.rules"),
      "utf8"
    );
    const matches = rules.match(/match \/products\/\{productId\}/g) ?? [];
    expect(matches.length).toBe(2);
  });
});
