import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteObject,
  getBytes,
  getDownloadURL,
  listAll,
  ref,
  uploadBytes,
} from "firebase/storage";

let env: RulesTestEnvironment;
const directory = "users/poi-owner/poi-images";
const imagePath = `${directory}/clown.png`;
const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const png = { contentType: "image/png" };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-poi-images",
    storage: {
      host: "127.0.0.1",
      port: 9199,
      rules: readFileSync(resolve("storage.rules"), "utf8"),
    },
  });
});

beforeEach(async () => env.clearStorage());
afterAll(async () => env?.cleanup());

describe("private poi image library", () => {
  // The Storage emulator supplies request.resource = null on reads; production
  // omits it. Also verify this flow with the Rules API using a get request that
  // has no resource field, then retry an actual upload in the signed-in lab.
  it("lets the owner upload and retrieve the URL needed to save My Images", async () => {
    const image = ref(
      env.authenticatedContext("poi-owner").storage(),
      imagePath
    );
    await assertSucceeds(uploadBytes(image, imageBytes, png));

    // Saving the library entry happens after this read. An upload alone can
    // succeed while My Images stays empty if the read rule rejects the owner.
    await assertSucceeds(getDownloadURL(image));
    const bytes = await assertSucceeds(getBytes(image));
    expect(new Uint8Array(bytes)).toEqual(imageBytes);
  });

  it("lets the owner list, replace, and delete their saved images", async () => {
    const storage = env.authenticatedContext("poi-owner").storage();
    const image = ref(storage, imagePath);
    await assertSucceeds(uploadBytes(image, imageBytes, png));
    const listed = await assertSucceeds(listAll(ref(storage, directory)));
    expect(listed.items.map((item) => item.fullPath)).toEqual([imagePath]);
    await assertSucceeds(uploadBytes(image, new Uint8Array([1, 2, 3]), png));
    await assertSucceeds(deleteObject(image));
  });

  it.each(["image/png", "image/jpeg", "image/bmp", "image/webp"])(
    "accepts supported %s uploads from the owner",
    async (contentType) => {
      const image = ref(
        env.authenticatedContext("poi-owner").storage(),
        imagePath
      );
      await assertSucceeds(uploadBytes(image, imageBytes, { contentType }));
    }
  );

  it("rejects unsupported types and files at the 10 MiB limit", async () => {
    const image = ref(
      env.authenticatedContext("poi-owner").storage(),
      imagePath
    );
    await assertFails(
      uploadBytes(image, imageBytes, { contentType: "text/html" })
    );
    await assertFails(
      uploadBytes(image, new Uint8Array(10 * 1024 * 1024), png)
    );
  });

  it.each(["another-user", null])(
    "blocks reads and writes by %s",
    async (userId) => {
      const ownerImage = ref(
        env.authenticatedContext("poi-owner").storage(),
        imagePath
      );
      await assertSucceeds(uploadBytes(ownerImage, imageBytes, png));
      const context = userId
        ? env.authenticatedContext(userId)
        : env.unauthenticatedContext();
      const storage = context.storage();
      const image = ref(storage, imagePath);
      await assertFails(getDownloadURL(image));
      await assertFails(getBytes(image));
      await assertFails(listAll(ref(storage, directory)));
      await assertFails(uploadBytes(image, imageBytes, png));
      await assertFails(
        uploadBytes(ref(storage, `${directory}/new.png`), imageBytes, png)
      );
      await assertFails(deleteObject(image));
    }
  );
});
