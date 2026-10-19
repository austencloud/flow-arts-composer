/**
 * Collection short links (`collectionLinks/{code}`) may be removed by their
 * owner only once the collection itself is gone, so deleting a collection
 * retires its /c/ code while a live collection's link stays put.
 *
 * Run: firebase emulators:exec --only firestore --project demo-collection-links \
 *   "vitest run --config tests/config/vitest.rules.config.ts tests/integration/firestore-rules/collection-links.rules.test.ts"
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, setDoc, writeBatch } from "firebase/firestore";

const SDK_SETTINGS = { experimentalForceLongPolling: true };
const COLLECTION = "users/owner/collections/c1";
const LINK = "collectionLinks/ABCD";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-collection-links",
    firestore: {
      rules: readFileSync(resolve("firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore(SDK_SETTINGS);
    await setDoc(doc(db, COLLECTION), {
      name: "Test",
      isPublic: true,
      shareCode: "ABCD",
    });
    await setDoc(doc(db, LINK), { ownerId: "owner", collectionId: "c1" });
  });
});

afterAll(async () => env?.cleanup());

const asUser = (uid: string) =>
  env
    .authenticatedContext(uid, { firebase: { sign_in_provider: "password" } })
    .firestore(SDK_SETTINGS);

describe("collectionLinks delete", () => {
  it("lets the owner remove the link in the same commit that deletes the collection", async () => {
    const db = asUser("owner");
    const batch = writeBatch(db);
    batch.delete(doc(db, COLLECTION));
    batch.delete(doc(db, LINK));
    await assertSucceeds(batch.commit());
  });

  it("lets the owner remove the link after the collection is already gone", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(SDK_SETTINGS), COLLECTION));
    });
    await assertSucceeds(deleteDoc(doc(asUser("owner"), LINK)));
  });

  it("keeps a live collection's link, even from its owner", async () => {
    await assertFails(deleteDoc(doc(asUser("owner"), LINK)));
  });

  it("refuses anyone else, even after the collection is gone", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(SDK_SETTINGS), COLLECTION));
    });
    await assertFails(deleteDoc(doc(asUser("stranger"), LINK)));
    await assertFails(
      deleteDoc(doc(env.unauthenticatedContext().firestore(SDK_SETTINGS), LINK))
    );
  });
});
