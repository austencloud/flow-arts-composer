/**
 * Generate Thumbnail Manifest
 *
 * Lists all thumbnails in Firebase Storage and generates a manifest.json file.
 * This manifest enables instant cloud cache hits across all devices by pre-populating
 * the "known exists" list on app load.
 *
 * Usage: node scripts/generate-thumbnail-manifest.cjs
 *        node scripts/generate-thumbnail-manifest.cjs --dry-run
 *
 * Requires Firebase Admin SDK credentials (GOOGLE_APPLICATION_CREDENTIALS env var)
 */

const admin = require("firebase-admin");
const path = require("path");

const dryRun = process.argv.includes("--dry-run");

// Initialize Firebase Admin
const serviceAccountPath = path.resolve(__dirname, "../serviceAccountKey.json");

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "the-kinetic-alphabet.firebasestorage.app",
  });
} catch (error) {
  console.error(
    "Failed to load service account. Make sure serviceAccountKey.json exists in the project root."
  );
  console.error(
    "You can download it from Firebase Console > Project Settings > Service Accounts"
  );
  process.exit(1);
}

const bucket = admin.storage().bucket();

// The app only ever asks for cards drawn by the current renderer, so older
// renders in the bucket are dead weight in a manifest every visitor downloads
// at startup. Read the version from the app's own constant so a renderer bump
// and the next manifest run can't disagree.
const fs = require("fs");
const { execFileSync } = require("child_process");
const repoRoot = path.resolve(__dirname, "..");
const KEY_DERIVER = "src/lib/shared/browse/services/thumbnail-key-deriver.ts";

function readRendererVersion(source) {
  const match = source.match(
    /export const THUMBNAIL_RENDERER_VERSION = (\d+);/
  );
  return match ? match[1] : null;
}

const localVersion = readRendererVersion(
  fs.readFileSync(path.join(repoRoot, KEY_DERIVER), "utf8")
);
if (!localVersion) {
  console.error(`Could not read THUMBNAIL_RENDERER_VERSION from ${KEY_DERIVER}`);
  process.exit(1);
}
const rendererVersions = new Set([localVersion]);

// The live site runs GitHub main, which can trail local main by days. Keep the
// live renderer's cards listed too, so a renderer bump on local main never
// empties the index production reads before that bump ships.
try {
  const liveVersion = readRendererVersion(
    execFileSync("git", ["show", `origin/main:${KEY_DERIVER}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  );
  if (liveVersion) rendererVersions.add(liveVersion);
} catch {
  // No origin/main here; the local version is all there is to go on.
}
const rendererLabel = [...rendererVersions].join(" and ");
const currentRendererSuffix = new RegExp(
  `_r(${[...rendererVersions].join("|")})_(dark|light)$`
);

/**
 * Convert a storage path to a cache key
 * Path format: thumbnails/{variant}/{propType}/{sequenceName}_{mode}.webp
 * Key format: {variant}/{propType}/{sequenceName}_{mode}
 */
function pathToCacheKey(filePath) {
  // Remove "thumbnails/" prefix and ".webp" suffix
  const withoutPrefix = filePath.replace(/^thumbnails\//, "");
  const withoutSuffix = withoutPrefix.replace(/\.webp$/, "");
  return withoutSuffix;
}

async function generateManifest() {
  console.log("Scanning Firebase Storage for thumbnails...");

  const cacheKeys = [];
  let fileCount = 0;
  let olderRenders = 0;

  // List all files in the thumbnails folder
  const [files] = await bucket.getFiles({ prefix: "thumbnails/" });

  for (const file of files) {
    // Skip directories (they end with /)
    if (file.name.endsWith("/")) continue;

    // Skip manifest itself
    if (file.name === "thumbnails/manifest.json") continue;

    // Only include .webp files
    if (!file.name.endsWith(".webp")) continue;

    const cacheKey = pathToCacheKey(file.name);
    fileCount++;
    if (!currentRendererSuffix.test(cacheKey)) {
      olderRenders++;
      continue;
    }
    cacheKeys.push(cacheKey);
  }

  console.log(
    `Found ${fileCount} thumbnails: ${cacheKeys.length} from renderer ${rendererLabel}, ${olderRenders} older renders left out.`
  );

  // Generate manifest
  const manifest = {
    keys: cacheKeys,
    generated: new Date().toISOString(),
    version: 1,
  };

  // Upload manifest to Firebase Storage with public access
  const manifestPath = "thumbnails/manifest.json";
  if (dryRun) {
    console.log(
      `\nDry run: would replace gs://the-kinetic-alphabet.firebasestorage.app/${manifestPath}`
    );
    console.log(
      `Manifest would contain ${cacheKeys.length} live thumbnail keys.`
    );
    return;
  }

  const manifestFile = bucket.file(manifestPath);

  await manifestFile.save(JSON.stringify(manifest), {
    contentType: "application/json",
    metadata: {
      cacheControl: "public, max-age=300", // 5 minute cache for CDN
    },
    public: true, // Make publicly readable
  });

  // Ensure the file is publicly accessible
  await manifestFile.makePublic();

  console.log(
    `\nManifest uploaded to gs://the-kinetic-alphabet.firebasestorage.app/${manifestPath}`
  );
  console.log(`Total thumbnails indexed: ${cacheKeys.length}`);
}

generateManifest()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error generating manifest:", error);
    process.exit(1);
  });
