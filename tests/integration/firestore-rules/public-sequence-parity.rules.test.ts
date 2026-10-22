/**
 * Parity-repair PHASE 4 STRICT rules: every publicSequences write must prove
 * the full publish-transaction shape (schema-2 fields, owner parity after the
 * transaction, hash claim after the transaction), claims are linkage-proven
 * in both directions, owner-document projection stamps are persister-only,
 * and shortcode mints are strict schema-2 words or schema-3 solos with claim
 * linkage.
 *
 * The write shapes under test mirror what public-sequence-persister.ts and
 * ShortCodeManager.allocateCode produce inside their transactions. The
 * getAfter() proofs were DEFERRED while firebase-tools 14.23.0's emulator
 * failed every getAfter call; firebase-tools 15.24.0 fixed that (proven by
 * getafter-probe.rules.test.ts), so phase 4 flipped the deferred pins into
 * live enforcement (2026-07-27).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

let testEnv: RulesTestEnvironment;

const OWNER_UID = "publisher-1";
const OTHER_UID = "publisher-2";

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "the-kinetic-alphabet",
    firestore: {
      rules: readFileSync(
        resolve(__dirname, "../../../firestore.rules"),
        "utf8"
      ),
      host: "127.0.0.1",
      port: 8080,
    },
  });
  // ONE clear up front. NO per-test clearFirestore: the emulator's REST clear
  // can resolve before it finishes applying, racing the very next seed write
  // out of existence (observed 2026-07-26: "SEED LOST" fired intermittently on
  // the first test after a clear). Isolation comes from unique document ids
  // per test instead.
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

// Long polling is load-bearing, not a preference: over gRPC/WebChannel the
// emulator write stream corrupts on this setup (observed 2026-07-26:
// "RESOURCE_EXHAUSTED: Received message larger than max (1684300900 vs
// 4194304)" followed by max backoff) — batches then stall, resolve without
// landing, and tests flake nondeterministically.
const SDK_SETTINGS = { experimentalForceLongPolling: true };

function ownerCtx() {
  return testEnv.authenticatedContext(OWNER_UID, {
    firebase: { sign_in_provider: "password" },
  });
}
function otherCtx() {
  return testEnv.authenticatedContext(OTHER_UID, {
    firebase: { sign_in_provider: "password" },
  });
}
function ownerDb() {
  return ownerCtx().firestore(SDK_SETTINGS);
}
function otherDb() {
  return otherCtx().firestore(SDK_SETTINGS);
}

/** Unique ids per test so tests cannot collide without any per-test clear. */
function ids(tag: string) {
  const hash = (tag + "a".repeat(64)).slice(0, 64);
  return { seqId: `seq-${tag}`, hash, claimId: `2_${hash}` };
}

function schemaTwoDoc(
  seqId: string,
  hash: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: seqId,
    ownerId: OWNER_UID,
    sourceRef: `users/${OWNER_UID}/sequences/${seqId}`,
    word: "ABCD",
    sequenceLength: 4,
    contentHash: hash,
    contentHashVersion: 2,
    publicProjectionSchemaVersion: 2,
    publicProjectionRevision: 1,
    publicProjectionDigest: "d".repeat(64),
    thumbnails: [],
    tags: [],
    ...overrides,
  };
}

function claimDoc(
  seqId: string,
  hash: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    sequenceId: seqId,
    ownerId: OWNER_UID,
    contentHash: hash,
    contentHashVersion: 2,
    createdAt: new Date(),
    ...overrides,
  };
}

/** The owner document in FULL PARITY with schemaTwoDoc — what the publish
 *  transaction leaves behind on the owner side. */
function ownerDocInParity(
  hash: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    visibility: "public",
    word: "ABCD",
    sequenceLength: 4,
    contentHash: hash,
    contentHashVersion: 2,
    publicProjectionSchemaVersion: 2,
    publicProjectionRevision: 1,
    publicProjectionDigest: "d".repeat(64),
    ...overrides,
  };
}

async function seedOwnerDoc(
  seqId: string,
  fields: Record<string, unknown>
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `users/${OWNER_UID}/sequences/${seqId}`),
      fields
    );
  });
}

/** Seed a committed schema-2 publish the way production commits one: the
 *  owner doc in parity, then the owner's own batched public+claim write,
 *  which the strict rules provably accept. */
async function seedPublishedSequence(
  seqId: string,
  hash: string,
  claimId: string
) {
  await seedOwnerDoc(seqId, ownerDocInParity(hash));
  const db = ownerDb();
  const batch = writeBatch(db);
  batch.set(doc(db, `publicSequences/${seqId}`), schemaTwoDoc(seqId, hash));
  batch.set(doc(db, `publicSequenceHashes/${claimId}`), claimDoc(seqId, hash));
  await batch.commit();
  const seeded = await getDoc(doc(db, `publicSequences/${seqId}`));
  if (!seeded.exists()) throw new Error(`SEED LOST: publicSequences/${seqId}`);
}

describe("publicSequences: phase-4 strict writes", () => {
  it("PHASE 4: a legacy-shape write (no schema-2 stamp) is DENIED", async () => {
    // Phase 2's dual-compat allowance is removed. An old cached client now
    // fails its public cloud sync instead of creating drift.
    const db = ownerDb();
    await assertFails(
      setDoc(doc(db, "publicSequences/seq-legacy-shape"), {
        ownerId: OWNER_UID,
        word: "AB",
        thumbnails: [],
      })
    );
  });

  it("allows the publish-transaction shape (owner in parity, doc + claim batched), and it LANDS", async () => {
    const { seqId, hash, claimId } = ids("batchok");
    await seedOwnerDoc(seqId, ownerDocInParity(hash));
    const db = ownerDb();
    const batch = writeBatch(db);
    batch.set(doc(db, `publicSequences/${seqId}`), schemaTwoDoc(seqId, hash));
    batch.set(
      doc(db, `publicSequenceHashes/${claimId}`),
      claimDoc(seqId, hash)
    );
    await assertSucceeds(batch.commit());
    const landedDoc = await getDoc(doc(db, `publicSequences/${seqId}`));
    const landedClaim = await getDoc(
      doc(db, `publicSequenceHashes/${claimId}`)
    );
    if (!landedDoc.exists() || !landedClaim.exists()) {
      throw new Error("batch reported success but writes did not land");
    }
  });

  it("denies a client publish that forges server-owned performance metadata", async () => {
    const { seqId, hash, claimId } = ids("forgedperformance");
    await seedOwnerDoc(seqId, ownerDocInParity(hash));
    const db = ownerDb();
    const batch = writeBatch(db);
    batch.set(
      doc(db, `publicSequences/${seqId}`),
      schemaTwoDoc(seqId, hash, { publicPerformanceCount: 1 })
    );
    batch.set(
      doc(db, `publicSequenceHashes/${claimId}`),
      claimDoc(seqId, hash)
    );
    await assertFails(batch.commit());
  });

  it("denies an owner update that changes server-owned performance metadata", async () => {
    const { seqId, hash, claimId } = ids("mutateperformance");
    await seedPublishedSequence(seqId, hash, claimId);

    await assertFails(
      updateDoc(doc(ownerDb(), `publicSequences/${seqId}`), {
        publicPerformanceCount: 99,
      })
    );
  });

  it("allows the FULL publish batch that also stamps the owner document", async () => {
    // The exact publishPublicSequence shape: owner stamp update + public set
    // + claim set in one atomic commit, starting from an unstamped owner doc
    // (fresh save that has never been published).
    const { seqId, hash, claimId } = ids("fullpub");
    await seedOwnerDoc(seqId, {
      visibility: "public",
      word: "ABCD",
      sequenceLength: 4,
      contentHash: hash,
      contentHashVersion: 2,
    });
    const db = ownerDb();
    const batch = writeBatch(db);
    batch.update(doc(db, `users/${OWNER_UID}/sequences/${seqId}`), {
      publicProjectionRevision: 1,
      publicProjectionSchemaVersion: 2,
      publicProjectionDigest: "d".repeat(64),
      word: "ABCD",
      sequenceLength: 4,
      contentHash: hash,
      contentHashVersion: 2,
    });
    batch.set(doc(db, `publicSequences/${seqId}`), schemaTwoDoc(seqId, hash));
    batch.set(
      doc(db, `publicSequenceHashes/${claimId}`),
      claimDoc(seqId, hash)
    );
    await assertSucceeds(batch.commit());
  });

  it("PHASE 4 LIVE: a schema-2 write without its claim is DENIED (getAfter enforced)", async () => {
    // The deliberate flip of the phase-2 "PHASE 4 DEFERRED" pin: the claim
    // linkage is now rules-enforced, so a claimless schema-2 write fails even
    // with the owner document in perfect parity.
    const { seqId, hash } = ids("noclaim");
    await seedOwnerDoc(seqId, ownerDocInParity(hash));
    const db = ownerDb();
    await assertFails(
      setDoc(doc(db, `publicSequences/${seqId}`), schemaTwoDoc(seqId, hash))
    );
  });

  it("denies a publish whose owner document is missing", async () => {
    const { seqId, hash, claimId } = ids("noowner");
    const db = ownerDb();
    const batch = writeBatch(db);
    batch.set(doc(db, `publicSequences/${seqId}`), schemaTwoDoc(seqId, hash));
    batch.set(
      doc(db, `publicSequenceHashes/${claimId}`),
      claimDoc(seqId, hash)
    );
    await assertFails(batch.commit());
  });

  it("denies a publish whose owner document is not public", async () => {
    const { seqId, hash, claimId } = ids("privowner");
    await seedOwnerDoc(
      seqId,
      ownerDocInParity(hash, { visibility: "private" })
    );
    const db = ownerDb();
    const batch = writeBatch(db);
    batch.set(doc(db, `publicSequences/${seqId}`), schemaTwoDoc(seqId, hash));
    batch.set(
      doc(db, `publicSequenceHashes/${claimId}`),
      claimDoc(seqId, hash)
    );
    await assertFails(batch.commit());
  });

  it("denies a publish whose owner parity disagrees on a core field", async () => {
    const { seqId, hash, claimId } = ids("drift");
    await seedOwnerDoc(seqId, ownerDocInParity(hash, { word: "WXYZ" }));
    const db = ownerDb();
    const batch = writeBatch(db);
    batch.set(doc(db, `publicSequences/${seqId}`), schemaTwoDoc(seqId, hash));
    batch.set(
      doc(db, `publicSequenceHashes/${claimId}`),
      claimDoc(seqId, hash)
    );
    await assertFails(batch.commit());
  });

  it("denies a schema-2 write missing its identity fields", async () => {
    const { seqId } = ids("badshape");
    const db = ownerDb();
    await assertFails(
      setDoc(
        doc(db, `publicSequences/${seqId}`),
        schemaTwoDoc(seqId, "tooshort", { contentHash: "tooshort" })
      )
    );
    await assertFails(
      setDoc(
        doc(db, `publicSequences/${seqId}`),
        schemaTwoDoc(seqId, ids("badshape").hash, { word: "" })
      )
    );
  });

  it("denies a schema-2 write whose sourceRef points at another user", async () => {
    const { seqId, hash, claimId } = ids("badsrc");
    await seedOwnerDoc(seqId, ownerDocInParity(hash));
    const db = ownerDb();
    const batch = writeBatch(db);
    batch.set(
      doc(db, `publicSequences/${seqId}`),
      schemaTwoDoc(seqId, hash, {
        sourceRef: `users/${OTHER_UID}/sequences/${seqId}`,
      })
    );
    batch.set(
      doc(db, `publicSequenceHashes/${claimId}`),
      claimDoc(seqId, hash)
    );
    await assertFails(batch.commit());
  });

  it("allows the thumbnail-restamp shape (paired public + owner update); denies it unpaired", async () => {
    const { seqId, hash, claimId } = ids("patch");
    await seedPublishedSequence(seqId, hash, claimId);

    // Unpaired public-only patch: the owner's stamps would no longer match —
    // denied. (updatePublicThumbnails always restamps the owner in the same
    // transaction.)
    const db = ownerDb();
    await assertFails(
      updateDoc(doc(db, `publicSequences/${seqId}`), {
        thumbnails: ["t.png"],
        publicProjectionRevision: 2,
        publicProjectionDigest: "e".repeat(64),
      })
    );

    const paired = writeBatch(db);
    paired.update(doc(db, `publicSequences/${seqId}`), {
      thumbnails: ["t.png"],
      publicProjectionRevision: 2,
      publicProjectionDigest: "e".repeat(64),
    });
    paired.update(doc(db, `users/${OWNER_UID}/sequences/${seqId}`), {
      publicProjectionRevision: 2,
      publicProjectionDigest: "e".repeat(64),
    });
    await assertSucceeds(paired.commit());
  });

  it("denies a non-owner rewriting someone else's public doc", async () => {
    const { seqId, hash, claimId } = ids("hijack");
    await seedPublishedSequence(seqId, hash, claimId);

    const db = otherDb();
    await assertFails(
      setDoc(doc(db, `publicSequences/${seqId}`), {
        ownerId: OTHER_UID,
        word: "STOLEN",
      })
    );
  });

  it("denies publishing a saved copy of another owner's gallery sequence, and allows the owner's identical republish", async () => {
    // The 2026-10 publish reports (seq_1791923102683_sysj46042 and
    // 3b7882d6-...): a gallery sequence saved into another library keeps its
    // id, so the copy's publish finds the publisher's mirror, claim and
    // revision already present and commits only the mirror set plus its own
    // owner stamp. The rules must keep refusing that (it would hand the
    // publisher's public entry to the copier); the client now stops first
    // with PublicSequenceOwnedElsewhereError.
    const { seqId, hash, claimId } = ids("savedcopy");
    await seedPublishedSequence(seqId, hash, claimId);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${OTHER_UID}/sequences/${seqId}`),
        { visibility: "public", word: "ABCD", sequenceLength: 4 }
      );
    });

    const stamps = {
      publicProjectionRevision: 2,
      publicProjectionSchemaVersion: 2,
      publicProjectionDigest: "e".repeat(64),
      word: "ABCD",
      sequenceLength: 4,
      contentHash: hash,
      contentHashVersion: 2,
    };

    const copierDb = otherDb();
    const copier = writeBatch(copierDb);
    copier.set(
      doc(copierDb, `publicSequences/${seqId}`),
      schemaTwoDoc(seqId, hash, {
        ownerId: OTHER_UID,
        sourceRef: `users/${OTHER_UID}/sequences/${seqId}`,
        publicProjectionRevision: 2,
        publicProjectionDigest: "e".repeat(64),
      })
    );
    copier.update(
      doc(copierDb, `users/${OTHER_UID}/sequences/${seqId}`),
      stamps
    );
    await assertFails(copier.commit());

    const ownerDatabase = ownerDb();
    const owner = writeBatch(ownerDatabase);
    owner.set(
      doc(ownerDatabase, `publicSequences/${seqId}`),
      schemaTwoDoc(seqId, hash, {
        publicProjectionRevision: 2,
        publicProjectionDigest: "e".repeat(64),
      })
    );
    owner.update(
      doc(ownerDatabase, `users/${OWNER_UID}/sequences/${seqId}`),
      stamps
    );
    await assertSucceeds(owner.commit());
  });

  it("allows the unpublish shape and denies its unpaired fragments", async () => {
    const { seqId, hash, claimId } = ids("unpub");
    await seedPublishedSequence(seqId, hash, claimId);
    const db = ownerDb();

    // Fragment 1: owner stamp clear while the mirror still exists — denied.
    await assertFails(
      updateDoc(doc(db, `users/${OWNER_UID}/sequences/${seqId}`), {
        publicProjectionRevision: deleteField(),
        publicProjectionSchemaVersion: deleteField(),
        publicProjectionDigest: deleteField(),
      })
    );
    // Fragment 2: public delete stranding its own claim — denied.
    await assertFails(deleteDoc(doc(db, `publicSequences/${seqId}`)));

    // The full unpublishPublicSequence shape: doc + claim + stamp clear.
    const batch = writeBatch(db);
    batch.delete(doc(db, `publicSequences/${seqId}`));
    batch.delete(doc(db, `publicSequenceHashes/${claimId}`));
    batch.update(doc(db, `users/${OWNER_UID}/sequences/${seqId}`), {
      publicProjectionRevision: deleteField(),
      publicProjectionSchemaVersion: deleteField(),
      publicProjectionDigest: deleteField(),
    });
    await assertSucceeds(batch.commit());
    const gone = await getDoc(doc(db, `publicSequences/${seqId}`));
    if (gone.exists())
      throw new Error("unpublish reported success but doc remains");
  });

  it("denies forging owner projection stamps without the mirror", async () => {
    const { seqId, hash } = ids("forge");
    await seedOwnerDoc(seqId, {
      visibility: "public",
      word: "ABCD",
      sequenceLength: 4,
      contentHash: hash,
      contentHashVersion: 2,
    });
    const db = ownerDb();
    await assertFails(
      updateDoc(doc(db, `users/${OWNER_UID}/sequences/${seqId}`), {
        publicProjectionRevision: 1,
        publicProjectionSchemaVersion: 2,
        publicProjectionDigest: "d".repeat(64),
      })
    );
  });

  it("allows a content-hash change that republished + releases the stale claim", async () => {
    const { seqId, hash, claimId } = ids("rehashx");
    await seedPublishedSequence(seqId, hash, claimId);
    const newHash = ("rehashnew" + "b".repeat(64)).slice(0, 64);
    const newClaimId = `2_${newHash}`;

    // The publish transaction on changed content: public doc rewritten with
    // the new hash, new claim created, stale claim released, owner restamped.
    const db = ownerDb();
    const batch = writeBatch(db);
    batch.set(
      doc(db, `publicSequences/${seqId}`),
      schemaTwoDoc(seqId, newHash, { publicProjectionRevision: 2 })
    );
    batch.set(
      doc(db, `publicSequenceHashes/${newClaimId}`),
      claimDoc(seqId, newHash)
    );
    batch.delete(doc(db, `publicSequenceHashes/${claimId}`));
    batch.update(doc(db, `users/${OWNER_UID}/sequences/${seqId}`), {
      contentHash: newHash,
      publicProjectionRevision: 2,
    });
    await assertSucceeds(batch.commit());
  });
});

describe("admin unpublish allowance", () => {
  const ADMIN_UID = "labeler-admin";
  const PROFILED_UID = "profiled-regular";

  function adminDb() {
    return testEnv
      .authenticatedContext(ADMIN_UID, {
        firebase: { sign_in_provider: "password" },
        role: "admin",
        admin: true,
        isAdmin: true,
      })
      .firestore(SDK_SETTINGS);
  }
  function profiledDb() {
    return testEnv
      .authenticatedContext(PROFILED_UID, {
        firebase: { sign_in_provider: "password" },
      })
      .firestore(SDK_SETTINGS);
  }

  it("lets an admin run the full unpublish transaction on another owner's doc; a profiled non-admin cannot", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `users/${ADMIN_UID}`), { role: "admin" });
      await setDoc(doc(db, `users/${PROFILED_UID}`), { role: "user" });
    });

    const denied = ids("admindeny");
    await seedPublishedSequence(denied.seqId, denied.hash, denied.claimId);
    {
      const db = profiledDb();
      const batch = writeBatch(db);
      batch.delete(doc(db, `publicSequences/${denied.seqId}`));
      batch.delete(doc(db, `publicSequenceHashes/${denied.claimId}`));
      await assertFails(batch.commit());
    }

    const allowed = ids("adminok");
    await seedPublishedSequence(allowed.seqId, allowed.hash, allowed.claimId);
    {
      // The labeler's unpublishPublicSequence shape: public doc + claim +
      // owner stamp clear, atomically, by an admin who is not the owner.
      const db = adminDb();
      const batch = writeBatch(db);
      batch.delete(doc(db, `publicSequences/${allowed.seqId}`));
      batch.delete(doc(db, `publicSequenceHashes/${allowed.claimId}`));
      batch.update(doc(db, `users/${OWNER_UID}/sequences/${allowed.seqId}`), {
        publicProjectionRevision: deleteField(),
        publicProjectionSchemaVersion: deleteField(),
        publicProjectionDigest: deleteField(),
      });
      await assertSucceeds(batch.commit());
    }
  });
});

describe("publicSequenceHashes: claim linkage", () => {
  it("denies a standalone claim naming unpublished content", async () => {
    // PHASE 4: a claim can only exist for a public doc that carries its hash
    // pair after the transaction.
    const { seqId, hash, claimId } = ids("orphanclaim");
    const db = ownerDb();
    await assertFails(
      setDoc(doc(db, `publicSequenceHashes/${claimId}`), claimDoc(seqId, hash))
    );
  });

  it("denies a claim whose id does not match its hash pair", async () => {
    const { seqId, hash } = ids("mismatch");
    const db = ownerDb();
    await assertFails(
      setDoc(
        doc(db, `publicSequenceHashes/2_${"b".repeat(64)}`),
        claimDoc(seqId, hash)
      )
    );
  });

  it("denies a claim carrying someone else's ownerId", async () => {
    const { seqId, hash, claimId } = ids("notyours");
    const db = otherDb();
    await assertFails(
      setDoc(doc(db, `publicSequenceHashes/${claimId}`), claimDoc(seqId, hash))
    );
  });

  it("denies claim updates outright — the mapping is immutable", async () => {
    const { seqId, hash, claimId } = ids("immutable");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `publicSequenceHashes/${claimId}`),
        claimDoc(seqId, hash)
      );
    });
    const db = ownerDb();
    await assertFails(
      updateDoc(doc(db, `publicSequenceHashes/${claimId}`), {
        sequenceId: "hijacked",
      })
    );
  });

  it("denies releasing a claim while its public doc still carries the hash", async () => {
    // Release is proven inside unpublish / hash-change transactions (covered
    // above). A bare delete that would orphan a LIVE published hash is denied
    // even for the owner.
    const { seqId, hash, claimId } = ids("liverel");
    await seedPublishedSequence(seqId, hash, claimId);
    await assertFails(
      deleteDoc(doc(ownerDb(), `publicSequenceHashes/${claimId}`))
    );
    await assertFails(
      deleteDoc(doc(otherDb(), `publicSequenceHashes/${claimId}`))
    );
  });

  it("denies claim creation from an anonymous session", async () => {
    const { seqId, hash, claimId } = ids("anon");
    const db = testEnv
      .authenticatedContext("anon-1", {
        firebase: { sign_in_provider: "anonymous" },
      })
      .firestore(SDK_SETTINGS);
    await assertFails(
      setDoc(
        doc(db, `publicSequenceHashes/${claimId}`),
        claimDoc(seqId, hash, { ownerId: "anon-1" })
      )
    );
  });
});

describe("shortcodes: phase-4 strict mint", () => {
  const MINT_HASH = ("mint" + "c".repeat(64)).slice(0, 64);
  const EMBED_MINT_HASH = ("embed" + "d".repeat(64)).slice(0, 64);
  const SOLO_MINT_HASH = ("solo" + "e".repeat(64)).slice(0, 64);
  const SOLO_EMBED_HASH = ("soloembed" + "f".repeat(64)).slice(0, 64);
  const SOLO_CONTENT_HASH = "s".repeat(22);

  function mintDoc(overrides: Record<string, unknown> = {}) {
    return {
      encoded: "payload-blob",
      payloadWord: "AB",
      payloadStepCount: 2,
      payloadSchemaVersion: 2,
      sequence: "AB",
      sequenceName: "AB",
      encoderHash: MINT_HASH,
      createdAt: new Date().toISOString(),
      scanCount: 0,
      ...overrides,
    };
  }

  function soloMintDoc(overrides: Record<string, unknown> = {}) {
    return {
      encoded: "solo-payload-blob",
      payloadKind: "solo",
      payloadTitle: "Left-hand choreography",
      payloadStepCount: 1,
      payloadContentHash: SOLO_CONTENT_HASH,
      payloadSchemaVersion: 3,
      authoredHand: "left",
      sourceSoloPropId: "solo-prop-1",
      sequence: "Left-hand choreography",
      sequenceName: "Left-hand choreography",
      encoderHash: SOLO_MINT_HASH,
      createdAt: new Date().toISOString(),
      scanCount: 0,
      ...overrides,
    };
  }

  it("allows the allocateCode shape: code doc + hash claim in one transaction, and it LANDS", async () => {
    const db = ownerDb();
    const batch = writeBatch(db);
    batch.set(doc(db, "shortcodes/MNT1"), mintDoc());
    batch.set(doc(db, `shortcodeHashes/${MINT_HASH}`), {
      code: "MNT1",
      createdAt: new Date().toISOString(),
    });
    await assertSucceeds(batch.commit());
    const landed = await getDoc(doc(db, "shortcodes/MNT1"));
    if (!landed.exists())
      throw new Error("mint reported success but did not land");
  });

  it("allows a verified embed-only mint and matching hash claim to land", async () => {
    const db = ownerDb();
    const embedOnlyDoc = mintDoc({
      encoderHash: EMBED_MINT_HASH,
      sequenceData: {
        steps: [{ letter: "A" }, { letter: "B" }],
        word: "AB",
      },
    }) as Record<string, unknown>;
    delete embedOnlyDoc.encoded;

    const batch = writeBatch(db);
    batch.set(doc(db, "shortcodes/MNT4"), embedOnlyDoc);
    batch.set(doc(db, `shortcodeHashes/${EMBED_MINT_HASH}`), {
      code: "MNT4",
      createdAt: new Date().toISOString(),
    });

    await assertSucceeds(batch.commit());
    const landed = await getDoc(doc(db, "shortcodes/MNT4"));
    if (!landed.exists() || landed.data().encoded !== undefined) {
      throw new Error("embed-only mint did not land with the expected shape");
    }
  });

  it("denies a mint without payload-derived label fields", async () => {
    const db = ownerDb();
    await assertFails(
      setDoc(doc(db, "shortcodes/MNT2"), {
        encoded: "payload-blob",
        sequenceName: "Sequence 12:42:28 PM",
      })
    );
  });

  it("denies a hash-carrying mint that skips its claim", async () => {
    const db = ownerDb();
    await assertFails(setDoc(doc(db, "shortcodes/MNT3"), mintDoc()));
  });

  it("allows a schema-3 encoded solo mint with no synthetic payloadWord", async () => {
    const db = ownerDb();
    const batch = writeBatch(db);
    batch.set(doc(db, "shortcodes/SOL1"), soloMintDoc());
    batch.set(doc(db, `shortcodeHashes/${SOLO_MINT_HASH}`), {
      code: "SOL1",
      createdAt: new Date().toISOString(),
    });

    await assertSucceeds(batch.commit());
    const landed = await getDoc(doc(db, "shortcodes/SOL1"));
    if (!landed.exists() || landed.data().payloadWord !== undefined) {
      throw new Error("schema-3 encoded solo did not land cleanly");
    }
  });

  it("allows an encoded solo mint without false persisted-artifact provenance", async () => {
    const db = ownerDb();
    const hash = "4".repeat(64);
    const mint = soloMintDoc({ encoderHash: hash }) as Record<string, unknown>;
    delete mint.sourceSoloPropId;
    const batch = writeBatch(db);
    batch.set(doc(db, "shortcodes/SOL0"), mint);
    batch.set(doc(db, `shortcodeHashes/${hash}`), {
      code: "SOL0",
      createdAt: new Date().toISOString(),
    });

    await assertSucceeds(batch.commit());
  });

  it("allows a schema-3 canonical soloData fallback", async () => {
    const db = ownerDb();
    const fallback = soloMintDoc({
      encoderHash: SOLO_EMBED_HASH,
      soloData: {
        id: "solo-prop-1",
        steps: [{ motionType: "pro" }],
        startLocation: "n",
        startOrientation: "in",
        contentHash: SOLO_CONTENT_HASH,
        handPath: { id: "hand-path-1", locations: ["n", "e"] },
        length: 1,
        bigrams: ["n-e"],
        impliedGridMode: "diamond",
        authoredHand: "left",
      },
    }) as Record<string, unknown>;
    delete fallback.encoded;
    delete fallback.sourceSoloPropId;
    const batch = writeBatch(db);
    batch.set(doc(db, "shortcodes/SOL2"), fallback);
    batch.set(doc(db, `shortcodeHashes/${SOLO_EMBED_HASH}`), {
      code: "SOL2",
      createdAt: new Date().toISOString(),
    });

    await assertSucceeds(batch.commit());
    const landed = await getDoc(doc(db, "shortcodes/SOL2"));
    if (!landed.exists() || landed.data().encoded !== undefined) {
      throw new Error("schema-3 soloData fallback did not land cleanly");
    }
  });

  it("denies schema-3 solos that smuggle a word or paired sequenceData", async () => {
    const db = ownerDb();
    const wordSmuggling = soloMintDoc({
      payloadWord: "A",
    }) as Record<string, unknown>;
    delete wordSmuggling.encoderHash;
    await assertFails(setDoc(doc(db, "shortcodes/SOL3"), wordSmuggling));
    const pairedSmuggling = soloMintDoc({
      sequenceData: { steps: [{ letter: "A" }] },
    }) as Record<string, unknown>;
    delete pairedSmuggling.encoderHash;
    await assertFails(setDoc(doc(db, "shortcodes/SOL4"), pairedSmuggling));
  });

  it("denies a schema-3 solo whose embedded identity contradicts its envelope", async () => {
    const db = ownerDb();
    const contradictory = soloMintDoc({
      soloData: {
        id: "different-prop",
        steps: [{ motionType: "pro" }],
        startLocation: "n",
        startOrientation: "in",
        contentHash: "x".repeat(22),
        handPath: { id: "hand-path-1", locations: ["n", "e"] },
        length: 1,
        bigrams: ["n-e"],
        impliedGridMode: "diamond",
        authoredHand: "right",
      },
    }) as Record<string, unknown>;
    delete contradictory.encoderHash;
    delete contradictory.encoded;

    await assertFails(setDoc(doc(db, "shortcodes/SOL5"), contradictory));
  });

  it("allows the resolution-time claim heal only for a matching code doc", async () => {
    const healHash = ("heal" + "e".repeat(64)).slice(0, 64);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "shortcodes/HEAL1"), {
        encoded: "x",
        payloadWord: "AB",
        payloadStepCount: 2,
        payloadSchemaVersion: 2,
        encoderHash: healHash,
      });
    });
    const db = ownerDb();
    await assertSucceeds(
      setDoc(doc(db, `shortcodeHashes/${healHash}`), {
        code: "HEAL1",
        createdAt: new Date().toISOString(),
      })
    );
    // A claim naming a code whose doc carries a DIFFERENT hash (or none) is
    // unverifiable and denied — never index an unproven mapping.
    const wrongHash = ("wrong" + "f".repeat(64)).slice(0, 64);
    await assertFails(
      setDoc(doc(db, `shortcodeHashes/${wrongHash}`), {
        code: "HEAL1",
        createdAt: new Date().toISOString(),
      })
    );
  });
});
