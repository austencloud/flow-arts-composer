import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { installQrBakeNodeRuntime } from "./qr-bake-node-runtime.mjs";

test("publication rejects repeated decode errors even when the UI drawing code swallows them", async () => {
  const strictly = installQrBakeNodeRuntime(
    {
      Canvas: class {},
      loadImage: async () => {
        throw new Error("Invalid image");
      },
    },
    path.join(tmpdir(), randomUUID())
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(
      strictly(async () => {
        try {
          await createImageBitmap(new Blob(["broken"], { type: "image/png" }));
        } catch {
          /* The interactive renderer can continue drawing other layers. */
        }
        return "partial cell";
      }),
      /Image decode failed: Invalid image/
    );
  }
  await assert.rejects(
    strictly(async () => {
      await fetch("/missing-glyph.svg");
      return "cell without glyph";
    }),
    /Missing static asset/
  );
});
