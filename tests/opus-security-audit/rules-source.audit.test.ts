/**
 * Offline authorization audit — no emulator required.
 *
 * WHY THIS FILE EXISTS: this cloud session's egress policy denies
 * storage.googleapis.com, dl.google.com and www.gstatic.com (403 at the
 * gateway), so `firebase emulators:exec` cannot download
 * cloud-firestore-emulator-v1.22.0.jar — the JAR that BOTH the Firestore
 * emulator and the Storage rules runtime need. The runtime allow/deny probes
 * live in firestore-authz.audit.test.ts / storage-authz.audit.test.ts and are
 * ready to run wherever that JAR is reachable.
 *
 * What this file measures instead is the shipped rule text itself: for each
 * finding it asserts that the guard is ABSENT from the clause under test and
 * PRESENT on the sibling clause that already does it right. That is a real,
 * deterministic observation of production code — it is not a runtime
 * allow/deny measurement, and the report labels it that way.
 *
 * Read-only audit: firestore.rules and storage.rules are read, never written.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isDeviceId,
  validateCardScanIngestRequest,
  PHYSICAL_CARD_SCHEMA_VERSION,
} from "../../src/lib/shared/qr/domain/physical-card";

const ROOT = resolve(__dirname, "../..");
const firestoreRules = readFileSync(resolve(ROOT, "firestore.rules"), "utf8");
const storageRules = readFileSync(resolve(ROOT, "storage.rules"), "utf8");

/**
 * Return the body of a `match <path> {` block, brace-balanced, so an assertion
 * about "this clause" cannot accidentally read a neighbouring block's text.
 */
function matchBlock(rules: string, matchPath: string): string {
  const header = `match ${matchPath} {`;
  const start = rules.indexOf(header);
  expect(start, `match block not found: ${matchPath}`).toBeGreaterThan(-1);

  let depth = 0;
  let index = start + header.length - 1;
  for (; index < rules.length; index += 1) {
    if (rules[index] === "{") depth += 1;
    else if (rules[index] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return rules.slice(start, index + 1);
}

/** Strip nested `match` sub-blocks so a parent assertion ignores children. */
function withoutNestedMatches(block: string): string {
  const firstBrace = block.indexOf("{");
  const body = block.slice(firstBrace + 1, block.lastIndexOf("}"));
  const out: string[] = [];
  let depth = 0;
  for (const line of body.split("\n")) {
    if (depth === 0 && /^\s*match\s/.test(line)) depth = 1;
    if (depth === 0) out.push(line);
    else {
      depth += (line.match(/\{/g) ?? []).length;
      depth -= (line.match(/\}/g) ?? []).length;
      if (depth <= 1 && /\}/.test(line) && !/\{/.test(line)) depth = 0;
    }
  }
  return out.join("\n");
}

/** The text of one `allow <verbs>: if ...;` clause inside a block. */
function allowClause(block: string, verbs: string): string {
  const pattern = new RegExp(
    `allow\\s+${verbs.replace(/,\s*/g, ",\\s*")}\\s*:([\\s\\S]*?);`,
    "m"
  );
  const found = block.match(pattern);
  expect(found, `allow clause not found: "allow ${verbs}"`).not.toBeNull();
  return found?.[1] ?? "";
}

// ===========================================================================
// F1 — shared, world-readable render caches in Cloud Storage accept an
// overwrite from ANY authenticated session, anonymous included.
// ===========================================================================
describe("F1: public render caches accept overwrites (storage.rules)", () => {
  const overwritable = [
    "/pictograph-cells/{fileName}",
    "/thumbnails/{variant}/{propType}/{fileName}",
    "/thumbnails/{propType}/{fileName}",
  ];

  it.each(overwritable)(
    "%s grants `update` to any signed-in caller with no first-writer guard",
    (path) => {
      const block = matchBlock(storageRules, path);
      const clause = allowClause(block, "create, update");

      // The write gate is authentication only — no owner, no admin claim.
      expect(clause).toContain("request.auth != null");
      // No first-writer guard, so an EXISTING object is replaceable.
      expect(clause).not.toContain("resource == null");
      // And no anonymous-provider exclusion, so a guest session qualifies.
      expect(clause).not.toContain("sign_in_provider");
      // The object is world-readable, so the swap reaches every viewer.
      expect(allowClause(block, "read")).toContain("true");
    }
  );

  it("prepared-qrs in the SAME file shows the guard that is missing", () => {
    const block = matchBlock(storageRules, "/prepared-qrs/{fileName}");
    expect(allowClause(block, "create")).toContain("resource == null");
    // ...and it has no `update` in the create clause at all: update is admin.
    expect(allowClause(block, "update, delete")).toContain("admin");
  });

  it("the app reads these caches from a deterministic public URL", () => {
    const reader = readFileSync(
      resolve(ROOT, "src/lib/shared/render/services/pictograph-cloud-cache.ts"),
      "utf8"
    );
    // The key is a content hash, but nothing re-verifies the bytes against it
    // on download — the cache is trusted by construction.
    expect(reader).toContain("pictograph-cells/${hash}.webp");
    expect(reader).not.toMatch(/verifyDigest|recomputeHash|subtle\.digest/);
  });

  it("INTENT: open create is deliberate; the CLIENT believes writes are first-write-wins", () => {
    // The tool page states the open-write policy in so many words, so the
    // `create` permission is policy, not an oversight.
    const tool = readFileSync(
      resolve(ROOT, "src/routes/tools/warm-thumbnails/+page.svelte"),
      "utf8"
    );
    expect(tool).toContain(
      "accept any authenticated writer, anonymous guests included"
    );

    // But the uploader documents the contract as first-write-wins, and the
    // rule never enforces it. That gap is the finding.
    const uploader = readFileSync(
      resolve(ROOT, "src/lib/shared/render/services/pictograph-cloud-cache.ts"),
      "utf8"
    );
    expect(uploader).toContain("First-write-wins, deduped per session");
    expect(
      allowClause(
        matchBlock(storageRules, "/pictograph-cells/{fileName}"),
        "create, update"
      )
    ).not.toContain("resource == null");
  });
});

// ===========================================================================
// F2 — publicHandPaths / publicSoloProps check only the INCOMING ownerId on
// update. publicSequences closed this exact hole on 2026-07-26.
// ===========================================================================
describe("F2: publicHandPaths / publicSoloProps ownership takeover", () => {
  const collections = [
    "/publicHandPaths/{pathId}",
    "/publicSoloProps/{soloPropId}",
  ];

  it.each(collections)(
    "%s update validates request.resource.data.ownerId but never resource.data.ownerId",
    (path) => {
      const block = matchBlock(firestoreRules, path);
      const clause = allowClause(block, "create, update");

      expect(clause).toContain(
        "request.resource.data.ownerId == request.auth.uid"
      );
      // The stored owner is never consulted, so update is not owner-scoped.
      expect(clause).not.toMatch(/(?<!request\.)\bresource\.data\.ownerId\b/);
      // Delete DOES check the stored owner — the asymmetry inside one block.
      expect(allowClause(block, "delete")).toContain(
        "resource.data.ownerId == request.auth.uid"
      );
      // And the collection is world-readable, so doc ids are enumerable.
      expect(allowClause(block, "read")).toContain("true");
    }
  );

  it("publicSequences (the fixed sibling) checks BOTH sides on update", () => {
    const block = matchBlock(firestoreRules, "/publicSequences/{sequenceId}");
    const clause = allowClause(block, "update");
    expect(clause).toContain(
      "resource.data.get('ownerId', '') == request.auth.uid"
    );
    expect(clause).toContain(
      "request.resource.data.get('ownerId', '') == request.auth.uid"
    );
  });

  it("the collections are live: the library syncer writes both by content hash", () => {
    const syncer = readFileSync(
      resolve(ROOT, "src/lib/features/library/services/public-index-syncer.ts"),
      "utf8"
    );
    expect(syncer).toContain('collectionPath: "publicHandPaths"');
    expect(syncer).toContain('collectionPath: "publicSoloProps"');
    // docId is the content hash, which is what makes an overwrite a lie.
    expect(syncer).toContain("docId: hp.contentHash");
    expect(syncer).toContain("docId: soloProp.contentHash");
  });
});

// ===========================================================================
// F3 — scan ingestion moved server-side, but the only actor identity is a
// client-supplied UUID, which is also the dedup key.
// ===========================================================================
describe("F3: scan-count integrity rests on a client-chosen deviceId", () => {
  it("MEASURED: the validator accepts any well-formed UUID as a device identity", () => {
    const forged = [
      "00000000-0000-4000-8000-000000000000",
      "ffffffff-ffff-4fff-bfff-ffffffffffff",
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];
    for (const deviceId of forged) {
      expect(isDeviceId(deviceId)).toBe(true);
      const result = validateCardScanIngestRequest({
        schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
        shortCode: "AB12CD",
        physicalCardId: null,
        deviceId,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.deviceId).toBe(deviceId);
    }
  });

  it("MEASURED: nothing binds the deviceId to a prior session or credential", () => {
    const handler = readFileSync(
      resolve(ROOT, "src/routes/api/physical-cards/scan/+server.ts"),
      "utf8"
    );
    // The per-actor quota is keyed on the hash of that same client value...
    expect(handler).toMatch(/RATE_LIMITS\.CARD_SCAN,\s*"key",\s*deviceHash/);
    // ...and the dedup document id mixes it in, so rotating it mints new events.
    const identity = readFileSync(
      resolve(ROOT, "src/lib/server/physical-cards/scan-event-identity.ts"),
      "utf8"
    );
    expect(identity).toContain("input.deviceHash");
    // No signed attestation, no server-issued device token, no auth requirement.
    expect(handler).not.toMatch(
      /verifyIdToken|requireFirebaseUser|requireFullFirebaseUser/
    );
    // Auth, when present, is optional metadata only.
    expect(handler).toContain("getOptionalFirebaseUser");
  });

  it("geo provenance IS correctly server-only (the part that holds)", () => {
    const handler = readFileSync(
      resolve(ROOT, "src/routes/api/physical-cards/scan/+server.ts"),
      "utf8"
    );
    // Cloudflare's request metadata, with an explicitly empty header bag.
    expect(handler).toContain("parseCloudflareGeo(new Headers(), cf)");
    // Every card fact is read from Firestore, never taken from the body.
    expect(handler).toContain("PHYSICAL_CARD_MASK");
  });

  it("the rules comment claims browsers cannot manufacture these events", () => {
    const block = matchBlock(firestoreRules, "/shortcodes/{code}");
    expect(block).toContain(
      "browsers cannot manufacture\n        // events or spoof geo/device attribution"
    );
    // Client counter writes are indeed closed; the endpoint is the open path.
    expect(allowClause(withoutNestedMatches(block), "update")).toContain(
      "isAdmin()"
    );
  });
});

// ===========================================================================
// F4 — errorTelemetry update carries no auth predicate at all.
// ===========================================================================
describe("F4: errorTelemetry reports are rewritable by unauthenticated callers", () => {
  const block = matchBlock(firestoreRules, "/errorTelemetry/{docId}");

  it("update requires no authentication and no ownership", () => {
    const clause = allowClause(block, "update");
    expect(clause).not.toContain("request.auth");
    // The only constraint is that `resolved` is untouched.
    expect(clause).toContain("hasAny(['resolved'])");
    // So every other field of an existing report is freely replaceable.
    expect(clause).not.toContain("hasOnly");
  });

  it("create is likewise unconditional, with no shape or size constraint", () => {
    expect(allowClause(block, "create").trim()).toBe("if true");
  });

  it("read and delete are correctly closed (the part that holds)", () => {
    expect(allowClause(block, "read").trim()).toBe("if false");
    expect(allowClause(block, "delete").trim()).toBe("if false");
  });

  it("doc ids are deterministic, so a stranger can address a specific report", () => {
    const reporter = readFileSync(
      resolve(
        ROOT,
        "src/lib/shared/error/services/error-telemetry-reporter.ts"
      ),
      "utf8"
    );
    expect(reporter).toMatch(/utcDay|toISOString\(\)\.slice/);
  });
});

// ===========================================================================
// F5 — a collaborator (or pending invitee) on a private video owns the access
// roster: only creatorId and visibility are frozen for them.
// ===========================================================================
describe("F5: video collaborator rosters are re-shareable by collaborators", () => {
  const block = matchBlock(firestoreRules, "/videos/{videoId}");
  const clause = allowClause(block, "update");

  it("the non-creator branch may rewrite collaboratorIds and pendingInviteUserIds", () => {
    expect(clause).toContain("'collaboratorIds'");
    expect(clause).toContain("'pendingInviteUserIds'");
    // Entry to that branch requires only being on one of those two lists...
    expect(clause).toContain(
      "request.auth.uid in collaboratorIds(resource.data)"
    );
    expect(clause).toContain(
      "request.auth.uid in pendingInviteUserIds(resource.data)"
    );
    // ...and the branch is guarded by hasOnly, not by who may grant access.
    expect(clause).toContain("hasOnly");
  });

  it("read access is granted purely by membership of those same lists", () => {
    const read = allowClause(block, "read");
    expect(read).toContain(
      "request.auth.uid in collaboratorIds(resource.data)"
    );
    expect(read).toContain(
      "request.auth.uid in pendingInviteUserIds(resource.data)"
    );
  });

  it("creatorId and visibility ARE frozen for non-creators (the part that holds)", () => {
    expect(clause).toContain(
      "request.resource.data.creatorId == resource.data.creatorId"
    );
    expect(clause).toContain("hasValidVisibility(request.resource.data)");
    expect(allowClause(block, "delete")).toContain(
      "resource.data.creatorId == request.auth.uid"
    );
  });

  it("collections took the opposite approach: membership goes through a callable", () => {
    // The precedent for the safe fix already exists in this repo: the
    // per-collection grant docs (nested under users/{uid}/collections/{id})
    // are read-only to clients and written only by the callable.
    const shares = matchBlock(firestoreRules, "/shares/{recipientId}");
    expect(allowClause(shares, "create, update, delete").trim()).toBe(
      "if false"
    );
    expect(firestoreRules).toContain(
      "Cross-account grants are written by callable functions"
    );
  });
});

// ===========================================================================
// F6 — shop_waitlist accepts unauthenticated writes with no key allowlist.
// ===========================================================================
describe("F6: shop_waitlist accepts unauthenticated arbitrary documents", () => {
  const block = matchBlock(firestoreRules, "/shop_waitlist/{entryId}");

  it("create has no auth predicate and no field allowlist", () => {
    const clause = allowClause(block, "create");
    expect(clause).not.toContain("request.auth");
    expect(clause).not.toContain("hasOnly");
    // The only validation is on one field's type and length.
    expect(clause).toContain("request.resource.data.email is string");
  });

  it("reads and edits stay closed, so this is write amplification not disclosure", () => {
    expect(allowClause(block, "read")).toContain("isAdmin()");
    expect(allowClause(block, "update, delete").trim()).toBe("if false");
  });

  it("the sibling public-submission surface routes through the rate-limited API", () => {
    // software_submissions took the safe route; shop_waitlist writes direct.
    const sibling = matchBlock(
      firestoreRules,
      "/software_submissions/{entryId}"
    );
    expect(allowClause(sibling, "create, update, delete").trim()).toBe(
      "if false"
    );
    const writer = readFileSync(
      resolve(ROOT, "src/lib/features/store/services/waitlist.ts"),
      "utf8"
    );
    expect(writer).toContain('collection(firestore, "shop_waitlist")');
  });
});

// ===========================================================================
// Lower-severity notes, each asserted so the report's claims are checkable.
// ===========================================================================
describe("notes: lower-severity observations", () => {
  it("N1: /usernames grants read (get AND list) to any session, so it enumerates", () => {
    const block = matchBlock(firestoreRules, "/usernames/{usernameLowercase}");
    const clause = allowClause(block, "read");
    expect(clause).toContain("isAuthenticated()");
    // No get/list split, so an availability check and a full dump are one rule.
    expect(block).not.toContain("allow list:");
    // Contrast: /users splits them and constrains list.
    const users = withoutNestedMatches(
      matchBlock(firestoreRules, "/users/{userId}")
    );
    expect(users).toContain("allow list:");
  });

  it("N2: the Hall of Shame create rule never consults a submission counter", () => {
    const block = matchBlock(firestoreRules, "/hallOfShame/{sequenceId}");
    const clause = allowClause(block, "create");
    expect(clause).not.toContain("hallOfShameRateLimits");
    expect(clause).not.toContain("getAfter");
    // And the counter doc is writable by its own subject.
    const limits = matchBlock(
      firestoreRules,
      "/hallOfShameRateLimits/{limitId}"
    );
    expect(allowClause(limits, "read, create, update")).toContain(
      "limitId.matches(request.auth.uid"
    );
  });

  it("N3: age verification reads a field its own subject may write", () => {
    expect(firestoreRules).toContain(
      "get(/databases/$(database)/documents/userPrivateProfiles/$(request.auth.uid)).data.ageVerifiedAt != null"
    );
    const profiles = matchBlock(
      firestoreRules,
      "/userPrivateProfiles/{userId}"
    );
    const clause = allowClause(profiles, "create, update");
    expect(clause).toContain("isOwner(userId)");
    expect(clause).toContain("'ageVerifiedAt'");
    // No value validation on the field the gate reads.
    expect(clause).not.toContain("ageVerifiedAt is timestamp");
  });

  it("N4: the two rules files disagree on what an admin claim looks like", () => {
    // firestore.rules accepts three claim shapes...
    expect(firestoreRules).toContain("request.auth.token.admin == true");
    expect(firestoreRules).toContain("request.auth.token.isAdmin == true");
    expect(firestoreRules).toContain("request.auth.token.role == 'admin'");

    // ...storage.rules isAdmin() accepts only `role`.
    const helper = storageRules.slice(
      storageRules.indexOf("function isAdmin()"),
      storageRules.indexOf("function isAdmin()") + 200
    );
    expect(helper).toContain("request.auth.token.role == 'admin'");
    expect(helper).not.toContain("token.admin == true");

    // Yet other clauses in the same file DO spell both out — inconsistently.
    expect(storageRules).toContain("request.auth.token.admin == true");
  });

  it("N5: several owner-scoped Storage prefixes carry no size or type cap", () => {
    for (const path of [
      "/ml-training/{userId}/{allPaths=**}",
      "/users/{userId}/recordings/{allPaths=**}",
      "/users/{userId}/audio/{allPaths=**}",
    ]) {
      const clause = allowClause(matchBlock(storageRules, path), "read, write");
      expect(clause).not.toContain("request.resource.size");
      expect(clause).not.toContain("contentType");
    }
    // Contrast: neighbours in the same file do cap.
    expect(
      allowClause(
        matchBlock(storageRules, "/avatars/{userId}/{fileName}"),
        "create, update"
      )
    ).toContain("request.resource.size < 1024 * 1024");
  });

  it("N6: /products is declared twice, so tightening one block is a no-op", () => {
    const declarations =
      firestoreRules.match(/match \/products\/\{productId\}/g) ?? [];
    expect(declarations.length).toBe(2);
  });

  it("N7: the two documented-open spec items are still open in current code", () => {
    // Spec F1: qr-video PUT has a rate limit but still no user requirement.
    const qrVideo = readFileSync(
      resolve(ROOT, "src/routes/api/qr-video/[hash]/+server.ts"),
      "utf8"
    );
    expect(qrVideo).toContain("withRateLimit");
    expect(qrVideo).not.toContain("requireFirebaseUser");

    // Spec F5: tika/sequence is still rate-limit-only (anon landing demo).
    const tika = readFileSync(
      resolve(ROOT, "src/routes/api/tika/sequence/+server.ts"),
      "utf8"
    );
    expect(tika).toContain("withRateLimit");
    expect(tika).not.toContain("requireFirebaseUser");
  });
});

// ===========================================================================
// Boundaries this audit checked and found sound. Recorded so a future reader
// knows these were examined, not skipped.
// ===========================================================================
describe("verified sound: boundaries that hold in the rule text", () => {
  it("provider tokens and order pricing have no client path", () => {
    for (const path of [
      "/metaPublishConnections/{uid}",
      "/instagramAuthLinks/{linkId}",
      "/instagramDataDeletionRequests/{confirmationCode}",
      "/userAdminMetadata/{userId}",
    ]) {
      expect(
        allowClause(matchBlock(firestoreRules, path), "read, write").trim()
      ).toBe("if false");
    }
    const orders = matchBlock(firestoreRules, "/orders/{orderId}");
    expect(allowClause(orders, "read")).toContain("isAdmin()");
    expect(allowClause(orders, "write")).toContain("false");
  });

  it("the r2 presign callables require auth and derive the key server-side", () => {
    const r2 = readFileSync(
      resolve(ROOT, "firebase-functions/src/r2/index.ts"),
      "utf8"
    );
    // Every exported callable starts from requireAuth.
    const callables = r2.match(/export const r2\w+ = onCall/g) ?? [];
    expect(callables.length).toBeGreaterThanOrEqual(8);
    expect((r2.match(/requireAuth\(request\)/g) ?? []).length).toBe(
      callables.length
    );
    // The object key is built from sanitized parts, never taken verbatim.
    expect(r2).toContain('s.replace(/[^a-zA-Z0-9_\\-\\.]/g, "")');
    expect(r2).toContain("Cannot access objects outside your own path");
  });

  it("shared-collection membership is validated in a callable, not by rules", () => {
    const fn = readFileSync(
      resolve(
        ROOT,
        "firebase-functions/src/collections/collectionCollaboration.ts"
      ),
      "utf8"
    );
    expect(fn).toContain("You can add your own sequences or public sequences.");
    expect(fn).toContain(
      "Publish the sequence before adding it to a public collection."
    );
    expect(fn).toContain(
      "Can edit access is required to change this collection."
    );
  });

  it("private message media stays Admin-SDK-written and participant-scoped", () => {
    const staging = matchBlock(
      storageRules,
      "/message-image-staging/{userId}/{conversationId}/{messageId}/{attachmentId}"
    );
    expect(allowClause(staging, "get, list, update").trim()).toBe("if false");
    const final = matchBlock(
      storageRules,
      "/message-images/{conversationId}/{messageId}/{fileName}"
    );
    expect(allowClause(final, "list, create, update, delete").trim()).toBe(
      "if false"
    );
    expect(allowClause(final, "get")).toContain("isConversationParticipant");
  });

  it("the Storage default is deny-all", () => {
    const fallback = matchBlock(storageRules, "/{allPaths=**}");
    expect(allowClause(fallback, "read, write").trim()).toBe("if false");
  });
});
