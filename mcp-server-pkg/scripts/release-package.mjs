import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  artifactIntegrity,
  assertVerifiedArtifact,
} from "./release-artifact.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "..");
const publish = process.argv.includes("--publish");
const npmCli = process.env.npm_execpath;
if (!npmCli || !/npm-cli\.js$/.test(npmCli)) {
  throw new Error(
    "Run this gate with npm run release:verify or npm run release:publish."
  );
}
const manifest = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8")
);
const git = (...args) =>
  execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
const assertClean = () => {
  if (git("status", "--porcelain"))
    throw new Error("Publishing requires a clean committed checkout.");
};
if (publish) assertClean();

function npm(args, cwd = packageRoot, env = {}, capture = false) {
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
}

// Build before packing, then never rebuild between comparison and publication.
npm(["run", "build:packages"], repositoryRoot);
execFileSync(
  process.execPath,
  [join(packageRoot, "scripts/verify-hand-key-glyphs.mjs")],
  {
    cwd: repositoryRoot,
    stdio: "inherit",
  }
);
npm(["run", "typecheck"]);
npm(["run", "build"]);
npm(["run", "test:pack"]);
const outputDirectory = join(packageRoot, ".release");
mkdirSync(outputDirectory, { recursive: true });
const [packed] = JSON.parse(
  npm(
    [
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      outputDirectory,
    ],
    packageRoot,
    {},
    true
  )
);
const archive = join(outputDirectory, packed.filename);
const integrity = artifactIntegrity(readFileSync(archive));
const temporaryRoot = mkdtempSync(join(tmpdir(), "tka-installed-parity-"));
try {
  writeFileSync(
    join(temporaryRoot, "package.json"),
    JSON.stringify({ private: true, type: "module" })
  );
  npm(
    ["install", "--omit=dev", "--no-audit", "--no-fund", archive],
    temporaryRoot
  );
  const installedRoot = join(
    temporaryRoot,
    "node_modules",
    ...manifest.name.split("/")
  );
  npm(["run", "test:card-mcp-parity"], repositoryRoot, {
    MCP_PACKED_ROOT: installedRoot,
  });
  const receipt = {
    package: manifest.name,
    version: manifest.version,
    commit,
    integrity,
    parityPassed: true,
  };
  assertVerifiedArtifact(
    readFileSync(archive),
    receipt,
    git("rev-parse", "HEAD")
  );
  writeFileSync(
    join(outputDirectory, "verification.json"),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  if (publish) {
    assertClean();
    // Publishing a tarball does not invoke prepack or rebuild generated assets.
    npm(["publish", archive, "--access", "public", "--tag", "latest"]);
  }
  console.log(
    `${publish ? "Published" : "Verified"} ${manifest.name}@${manifest.version}: ${integrity}`
  );
  console.log(`Archive: ${archive}`);
} finally {
  // This directory was created above and contains only the isolated package install.
  rmSync(temporaryRoot, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 250,
  });
}
