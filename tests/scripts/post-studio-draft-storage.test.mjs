import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import http2 from "node:http2";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createPostStudioDraftStorage } from "../../scripts/post-studio-draft-storage.mjs";

async function serverFor(directory, run) {
  const handler = createPostStudioDraftStorage(directory);
  const server = http.createServer(async (req, res) => {
    if (!(await handler(req, res))) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("draft versions survive server restart and retain earlier mappings", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "post-studio-drafts-test-")
  );
  const first = {
    key: "tka:post-studio:project:v2:ΩΛ-XJ",
    value: "32 mapped landings ΩΛ",
  };
  const second = { ...first, value: "later edit" };
  try {
    await serverFor(directory, async (base) => {
      for (const record of [first, second]) {
        const saved = await fetch(`${base}/_local/post-studio-drafts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: [record] }),
        });
        assert.equal(saved.status, 200);
      }
    });
    await serverFor(directory, async (base) => {
      const saved = await (
        await fetch(`${base}/_local/post-studio-drafts`)
      ).json();
      assert.deepEqual(saved.records, [first, second]);
      const rejected = await fetch(`${base}/_local/post-studio-drafts`, {
        method: "POST",
        headers: { Origin: "https://unrelated.test" },
        body: JSON.stringify({ records: [second] }),
      });
      assert.equal(rejected.status, 403);
      const invalid = await fetch(`${base}/_local/post-studio-drafts`, {
        method: "POST",
        body: JSON.stringify({
          records: [{ key: "../../other", value: "bad" }],
        }),
      });
      assert.equal(invalid.status, 400);
      assert.equal((await fs.readdir(directory)).length, 2);
    });
  } finally {
    // Only this test's fresh directory under the resolved temporary root.
    assert.ok(
      path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)
    );
    await fs.rm(directory, { recursive: true });
  }
});

test("HTTP/2 saves accept the editor authority and reject other origins", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "post-studio-drafts-http2-test-")
  );
  const handler = createPostStudioDraftStorage(directory);
  const server = http2.createServer(async (req, res) => {
    if (!(await handler(req, res))) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = http2.connect(base);
  const record = {
    key: "tka:post-studio:project:v2:ΩΛ-XJ",
    value: "carefully mapped landings",
  };

  async function request(method, origin, body) {
    return new Promise((resolve, reject) => {
      const stream = client.request({
        ":method": method,
        ":path": "/_local/post-studio-drafts",
        origin,
        "content-type": "application/json",
      });
      let status;
      let response = "";
      stream.setEncoding("utf8");
      stream.on("response", (headers) => {
        status = headers[":status"];
      });
      stream.on("data", (chunk) => {
        response += chunk;
      });
      stream.on("end", () => resolve({ status, body: JSON.parse(response) }));
      stream.on("error", reject);
      stream.end(body);
    });
  }

  try {
    const saved = await request(
      "POST",
      base,
      JSON.stringify({ records: [record] })
    );
    assert.equal(saved.status, 200);
    const rejected = await request(
      "POST",
      "https://unrelated.test",
      JSON.stringify({ records: [{ ...record, value: "unwanted change" }] })
    );
    assert.equal(rejected.status, 403);
    const restored = await request("GET", base);
    assert.equal(restored.status, 200);
    assert.deepEqual(restored.body.records, [record]);
    assert.equal((await fs.readdir(directory)).length, 1);
  } finally {
    client.close();
    await new Promise((resolve) => server.close(resolve));
    assert.ok(
      path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)
    );
    await fs.rm(directory, { recursive: true });
  }
});
