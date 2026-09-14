import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageManifest = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8")
);
const temporaryRoot = mkdtempSync(join(tmpdir(), "tka-mcp-pack-"));

function runNpm(args, cwd) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("npm_execpath is required to verify the packed MCP");
  }

  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

async function waitForExit(pid) {
  if (!pid) return;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      process.kill(pid, 0);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    } catch {
      return;
    }
  }
  process.kill(pid);
}

try {
  const packOutput = runNpm(
    ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryRoot],
    packageRoot
  );
  const [{ filename, files }] = JSON.parse(packOutput);
  const packagedPaths = new Set(files.map((file) => file.path));

  for (const requiredPath of [
    "dist/index.js",
    "assets/images/letters_trimmed/Type1/A.svg",
    "assets/images/letters_trimmed/Type6/τ.svg",
  ]) {
    if (!packagedPaths.has(requiredPath)) {
      throw new Error(`Packed MCP is missing ${requiredPath}`);
    }
  }

  writeFileSync(
    join(temporaryRoot, "package.json"),
    JSON.stringify({ private: true, type: "module" })
  );
  runNpm(
    [
      "install",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      join(temporaryRoot, filename),
    ],
    temporaryRoot
  );

  const serverEntry = join(
    temporaryRoot,
    "node_modules/@austencloud/tka-domain-mcp/dist/index.js"
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    cwd: packageRoot,
    stderr: "pipe",
  });
  const client = new Client({
    name: "packed-renderer-verifier",
    version: "1.0.0",
  });

  await client.connect(transport);
  const serverPid = transport.pid;
  const serverVersion = client.getServerVersion();
  if (serverVersion?.version !== packageManifest.version) {
    throw new Error(
      `Installed MCP reported version ${serverVersion?.version ?? "unknown"}; expected ${packageManifest.version}`
    );
  }
  const result = await client.callTool({
    name: "generate_sequence",
    arguments: {
      word: "ALID",
      cellSize: 180,
      darkMode: false,
      showDifficulty: false,
      showStepNumbers: true,
      showWord: true,
      notes: "none",
      level: 1,
    },
  });
  await client.close();
  await transport.close();
  await waitForExit(serverPid);

  const image = result.content.find((item) => item.type === "image");
  if (!image || typeof image.data !== "string") {
    throw new Error(
      `Installed MCP did not return an image for the ALID fixture: ${JSON.stringify(result)}`
    );
  }
  if (image._meta?.rendererProfile !== "composer-card-v1") {
    throw new Error(
      "Installed MCP did not identify the canonical renderer profile"
    );
  }

  const png = Buffer.from(image.data, "base64");
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!png.subarray(0, signature.length).equals(signature)) {
    throw new Error("Installed MCP returned invalid PNG data");
  }

  if (process.env.MCP_PACK_RENDER_OUTPUT) {
    writeFileSync(resolve(process.env.MCP_PACK_RENDER_OUTPUT), png);
  }

  console.log(
    `Verified installed MCP tarball (${png.length} byte ALID render)`
  );
} finally {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  rmSync(temporaryRoot, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 250,
  });
}
