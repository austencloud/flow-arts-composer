import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  ref,
  uploadBytes,
  getBytes,
  deleteObject,
  listAll,
} from "firebase/storage";

let env: RulesTestEnvironment;
let path: string;
let recordIndex = 0;
const body = new TextEncoder().encode(JSON.stringify({ svg: "<svg/>" }));
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-qr-reuse",
    storage: {
      host: "127.0.0.1",
      port: 9199,
      rules: readFileSync(resolve("storage.rules"), "utf8"),
    },
  });
});
beforeEach(async () => {
  await env.clearStorage();
  path = `prepared-qrs/${(++recordIndex).toString(16).padStart(64, "0")}.json`;
});
afterAll(async () => env?.cleanup());

describe("prepared QR storage", () => {
  it("lets an authenticated publisher create an image record and any scanner read it", async () => {
    await assertSucceeds(
      uploadBytes(
        ref(env.authenticatedContext("publisher").storage(), path),
        body,
        { contentType: "application/json" }
      )
    );
    await assertSucceeds(
      getBytes(ref(env.unauthenticatedContext().storage(), path))
    );
  });
  it("rejects guest publishing, invalid paths, oversized records and other content types", async () => {
    const storage = env.authenticatedContext("publisher").storage();
    await assertFails(
      uploadBytes(ref(env.unauthenticatedContext().storage(), path), body, {
        contentType: "application/json",
      })
    );
    await assertFails(
      uploadBytes(ref(storage, "prepared-qrs/arbitrary.json"), body, {
        contentType: "application/json",
      })
    );
    await assertFails(
      uploadBytes(ref(storage, path), new Uint8Array(512 * 1024), {
        contentType: "application/json",
      })
    );
    await assertFails(
      uploadBytes(ref(storage, path), body, { contentType: "text/html" })
    );
  });
  it("prevents later viewers from replacing, deleting or listing published records", async () => {
    const owner = env.authenticatedContext("publisher").storage();
    const viewer = env.authenticatedContext("viewer").storage();
    await assertSucceeds(
      uploadBytes(ref(owner, path), body, { contentType: "application/json" })
    );
    await assertFails(
      uploadBytes(ref(viewer, path), body, { contentType: "application/json" })
    );
    await assertFails(deleteObject(ref(viewer, path)));
    await assertFails(listAll(ref(viewer, "prepared-qrs")));
  });
});
