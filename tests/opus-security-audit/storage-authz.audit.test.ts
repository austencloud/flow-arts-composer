/**
 * Cloud Storage authorization audit — overwrite of shared, publicly-read
 * caches, and the owner boundaries that hold.
 *
 * Read-only audit: storage.rules is loaded verbatim and never edited.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import {
  ANON_UID,
  ATTACKER_UID,
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
  await env.clearStorage();
});

const WEBP = { contentType: "image/webp" } as const;
const VICTIM_BYTES = new Uint8Array([1, 1, 1, 1]);
const ATTACKER_BYTES = new Uint8Array([9, 9, 9, 9, 9, 9]);

function victimStorage() {
  return fullCtx(env, VICTIM_UID).storage();
}
function attackerStorage() {
  return fullCtx(env, ATTACKER_UID).storage();
}
function guestStorage() {
  return anonCtx(env).storage();
}
function signedOutStorage() {
  return env.unauthenticatedContext().storage();
}
function adminStorage() {
  return adminCtx(env).storage();
}

/** Put the victim's object in place through the Admin path. */
async function seedObject(path: string, bytes = VICTIM_BYTES): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), path), bytes, WEBP);
  });
}

async function byteLength(path: string): Promise<number> {
  let size = -1;
  await env.withSecurityRulesDisabled(async (context) => {
    const buffer = await getBytes(ref(context.storage(), path));
    size = buffer.byteLength;
  });
  return size;
}

// ===========================================================================
// CONTROLS — per-user Storage paths are correctly isolated.
// ===========================================================================
describe("controls: per-user object boundaries hold", () => {
  it("recordings, audio, screenshots and POI images are owner-only", async () => {
    const paths = [
      `users/${VICTIM_UID}/recordings/take-1.webm`,
      `users/${VICTIM_UID}/audio/track.mp3`,
      `screenshots/${VICTIM_UID}/shot.png`,
      `users/${VICTIM_UID}/poi-images/pattern.png`,
    ];
    for (const path of paths) {
      await seedObject(path);
      await assertFails(getBytes(ref(attackerStorage(), path)));
      await assertFails(
        uploadBytes(ref(attackerStorage(), path), ATTACKER_BYTES, WEBP)
      );
    }
  });

  it("feedback screenshots are not readable across accounts", async () => {
    const path = `feedback/${VICTIM_UID}/fb-1/screenshot.png`;
    await seedObject(path);
    await assertFails(getBytes(ref(attackerStorage(), path)));
    await assertSucceeds(getBytes(ref(victimStorage(), path)));
  });

  it("avatars cannot be overwritten by another account", async () => {
    const path = `avatars/${VICTIM_UID}/generated.png`;
    await seedObject(path, VICTIM_BYTES);
    await assertFails(
      uploadBytes(ref(attackerStorage(), path), ATTACKER_BYTES, {
        contentType: "image/png",
      })
    );
  });

  it("prepared-qrs is first-writer-wins — the pattern this file already knows", async () => {
    const path = `prepared-qrs/${"a".repeat(64)}.json`;
    await seedObject(path, new Uint8Array([123, 125]));
    await assertFails(
      uploadBytes(ref(attackerStorage(), path), new Uint8Array([123, 125]), {
        contentType: "application/json",
      })
    );
    await assertFails(deleteObject(ref(attackerStorage(), path)));
    await assertSucceeds(deleteObject(ref(adminStorage(), path)));
  });

  it("public artifact posters are owner-write only", async () => {
    const path = `public-artifacts/${VICTIM_UID}/artifact-1/v1_${"a".repeat(64)}.webp`;
    await seedObject(path);
    await assertFails(
      uploadBytes(ref(attackerStorage(), path), ATTACKER_BYTES, WEBP)
    );
    await assertSucceeds(getBytes(ref(signedOutStorage(), path)));
  });
});

// ===========================================================================
// FINDING A — pictograph-cells/{hash}.webp is a content-addressed, publicly
// read cache for /q scan cards. Any authenticated session, anonymous included,
// may overwrite an existing cell. prepared-qrs in the same file guards this
// with `resource == null`; these caches do not.
// ===========================================================================
describe("finding A: the public pictograph cell cache is overwritable", () => {
  const CELL = `pictograph-cells/${"b".repeat(64)}.webp`;

  it("MEASURED: an unrelated full account replaces an existing cell's bytes", async () => {
    await seedObject(CELL, VICTIM_BYTES);
    expect(await byteLength(CELL)).toBe(VICTIM_BYTES.byteLength);

    await assertSucceeds(
      uploadBytes(ref(attackerStorage(), CELL), ATTACKER_BYTES, WEBP)
    );
    expect(await byteLength(CELL)).toBe(ATTACKER_BYTES.byteLength);
  });

  it("MEASURED: an ANONYMOUS session can do the same", async () => {
    await seedObject(CELL, VICTIM_BYTES);
    await assertSucceeds(
      uploadBytes(ref(guestStorage(), CELL), ATTACKER_BYTES, WEBP)
    );
    expect(await byteLength(CELL)).toBe(ATTACKER_BYTES.byteLength);
  });

  it("the guards that do hold: signed-out writes, non-webp, oversize, delete", async () => {
    await assertFails(
      uploadBytes(ref(signedOutStorage(), CELL), ATTACKER_BYTES, WEBP)
    );
    await assertFails(
      uploadBytes(ref(attackerStorage(), CELL), ATTACKER_BYTES, {
        contentType: "text/html",
      })
    );
    await assertFails(
      uploadBytes(
        ref(attackerStorage(), CELL),
        new Uint8Array(200 * 1024),
        WEBP
      )
    );
    await seedObject(CELL);
    await assertFails(deleteObject(ref(attackerStorage(), CELL)));
  });

  repro(
    "REPRO (red while open): an existing cell must not be replaceable",
    async () => {
      await seedObject(CELL, VICTIM_BYTES);
      await assertFails(
        uploadBytes(ref(attackerStorage(), CELL), ATTACKER_BYTES, WEBP)
      );
      await assertFails(
        uploadBytes(ref(guestStorage(), CELL), ATTACKER_BYTES, WEBP)
      );
      // A FIRST write by any signed-in renderer must keep working.
      await env.clearStorage();
      await assertSucceeds(
        uploadBytes(ref(attackerStorage(), CELL), ATTACKER_BYTES, WEBP)
      );
    }
  );
});

// ===========================================================================
// FINDING B — the same gap on the crowd-sourced thumbnail caches, which are
// world-readable and rendered directly in Browse and on scan cards.
// ===========================================================================
describe("finding B: crowd-sourced thumbnail caches are overwritable", () => {
  const VARIANT = "thumbnails/gallery/staff/ABCD_diamond.webp";
  const LEGACY = "thumbnails/staff/ABCD_diamond.webp";

  it("MEASURED: any signed-in session replaces a published thumbnail (both layouts)", async () => {
    for (const path of [VARIANT, LEGACY]) {
      await env.clearStorage();
      await seedObject(path, VICTIM_BYTES);
      expect(await byteLength(path)).toBe(VICTIM_BYTES.byteLength);

      await assertSucceeds(
        uploadBytes(ref(attackerStorage(), path), ATTACKER_BYTES, WEBP)
      );
      expect(await byteLength(path)).toBe(ATTACKER_BYTES.byteLength);

      // And anonymously.
      await assertSucceeds(
        uploadBytes(ref(guestStorage(), path), VICTIM_BYTES, WEBP)
      );
    }
  });

  it("the replaced object stays world-readable, so the swap reaches every viewer", async () => {
    await seedObject(VARIANT, VICTIM_BYTES);
    await assertSucceeds(
      uploadBytes(ref(attackerStorage(), VARIANT), ATTACKER_BYTES, WEBP)
    );
    const bytes = await assertSucceeds(
      getBytes(ref(signedOutStorage(), VARIANT))
    );
    expect((bytes as ArrayBuffer).byteLength).toBe(ATTACKER_BYTES.byteLength);
  });

  it("the manifest and shop covers stay admin-write only (the gate that holds)", async () => {
    await assertFails(
      uploadBytes(
        ref(attackerStorage(), "thumbnails/manifest.json"),
        ATTACKER_BYTES,
        {
          contentType: "application/json",
        }
      )
    );
    await assertFails(
      uploadBytes(
        ref(attackerStorage(), "shop-covers/prod-1/0.png"),
        ATTACKER_BYTES,
        {
          contentType: "image/png",
        }
      )
    );
    await assertSucceeds(
      uploadBytes(
        ref(adminStorage(), "thumbnails/manifest.json"),
        ATTACKER_BYTES,
        {
          contentType: "application/json",
        }
      )
    );
  });

  repro(
    "REPRO (red while open): a published thumbnail must not be replaceable",
    async () => {
      await seedObject(VARIANT, VICTIM_BYTES);
      await assertFails(
        uploadBytes(ref(attackerStorage(), VARIANT), ATTACKER_BYTES, WEBP)
      );
      await assertFails(
        uploadBytes(ref(guestStorage(), VARIANT), ATTACKER_BYTES, WEBP)
      );
    }
  );
});

// ===========================================================================
// FINDING C — storage.rules isAdmin() accepts only token.role == 'admin',
// while firestore.rules isAdmin() also accepts token.admin / token.isAdmin.
// An admin provisioned with the `admin: true` claim alone cannot read the
// feedback screenshots the admin review UI shows. Availability, not exposure —
// but the two files disagree about who an admin is.
// ===========================================================================
describe("finding C: admin claim shapes disagree between the two rules files", () => {
  /** An admin provisioned with the boolean claims only — no `role`. */
  function booleanAdminStorage() {
    return env
      .authenticatedContext("audit-admin-bool", {
        firebase: { sign_in_provider: "password" },
        admin: true,
        isAdmin: true,
      })
      .storage();
  }

  it("MEASURED: an admin-by-boolean-claim is denied feedback screenshot reads", async () => {
    const feedbackPath = `feedback/${VICTIM_UID}/fb-1/screenshot.png`;
    const legacyPath = "feedback/legacy-fb-1/screenshot.png";
    await seedObject(feedbackPath);
    await seedObject(legacyPath);

    // storage.rules isAdmin() is role-only, so both feedback reads deny...
    await assertFails(getBytes(ref(booleanAdminStorage(), feedbackPath)));
    await assertFails(getBytes(ref(booleanAdminStorage(), legacyPath)));
  });

  it("...while a rule that spells both claim shapes out accepts the same token", async () => {
    const thumbPath = "thumbnails/gallery/staff/claim-probe.webp";
    await seedObject(thumbPath);
    await assertSucceeds(deleteObject(ref(booleanAdminStorage(), thumbPath)));
  });

  it("the role-claim admin is accepted on both", async () => {
    const path = `feedback/${VICTIM_UID}/fb-1/screenshot.png`;
    await seedObject(path);
    await assertSucceeds(getBytes(ref(adminStorage(), path)));
  });
});

// ===========================================================================
// FINDING D — several owner-scoped Storage prefixes carry no size or type cap,
// so one signed-in account can push unbounded bytes into the project's bucket.
// Neighbouring rules in the same file do cap (avatars 1 MB, thumbnails 500 KB,
// POI images 10 MB), so the omission is inconsistent rather than deliberate.
// ===========================================================================
describe("finding D: uncapped owner-scoped upload prefixes", () => {
  it("MEASURED: ml-training, recordings and audio accept an oversize non-image blob", async () => {
    const big = new Uint8Array(3 * 1024 * 1024);
    for (const path of [
      `ml-training/${ATTACKER_UID}/blob.bin`,
      `users/${ATTACKER_UID}/recordings/blob.bin`,
      `users/${ATTACKER_UID}/audio/blob.bin`,
    ]) {
      await assertSucceeds(
        uploadBytes(ref(attackerStorage(), path), big, {
          contentType: "application/octet-stream",
        })
      );
    }
  });

  it("a guest session can do the same under its own anonymous uid", async () => {
    await assertSucceeds(
      uploadBytes(
        ref(guestStorage(), `ml-training/${ANON_UID}/blob.bin`),
        new Uint8Array(1024 * 1024),
        { contentType: "application/octet-stream" }
      )
    );
  });

  it("the capped neighbours reject the same payload (the contrast)", async () => {
    await assertFails(
      uploadBytes(
        ref(attackerStorage(), `avatars/${ATTACKER_UID}/big.png`),
        new Uint8Array(2 * 1024 * 1024),
        { contentType: "image/png" }
      )
    );
    await assertFails(
      uploadBytes(
        ref(
          attackerStorage(),
          `pronunciation-corpus/${ATTACKER_UID}/s1/001.wav`
        ),
        new Uint8Array(6 * 1024 * 1024),
        { contentType: "audio/wav" }
      )
    );
  });
});
