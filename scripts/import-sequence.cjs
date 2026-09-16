#!/usr/bin/env node
/**
 * Import a sequence from JSON into your Firestore library.
 *
 * Usage:
 *   node scripts/import-sequence.cjs sequence.json
 *   node scripts/import-sequence.cjs sequence.json --notes "My tagline"
 *   cat sequence.json | node scripts/import-sequence.cjs --stdin
 *
 * Reads a full sequence JSON (as exported from the app or pasted from Claude),
 * auto-detects LOOP type, generates required metadata, and writes to
 * users/{uid}/sequences/{id}.
 *
 * Compositional fields (leftSoloProp, rightSoloProp, stepPairings) are
 * computed automatically at import time — no manual migration needed.
 */

const { readFileSync } = require("fs");
const { resolve } = require("path");
const { pathToFileURL } = require("url");
const crypto = require("crypto");
const { decomposeSequence } = require("./lib/compose-sequence.cjs");

// Parse CLI args

let jsonPath = null;
let useStdin = false;
let notes = null;
let visibility = "private";
let dryRun = false;
let forceCircular = null;
let forceLoopType = null;

function parseCliArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--stdin") {
      useStdin = true;
    } else if (args[i] === "--notes" && args[i + 1]) {
      notes = args[++i];
    } else if (args[i] === "--visibility" && args[i + 1]) {
      visibility = args[++i];
    } else if (args[i] === "--circular") {
      forceCircular = true;
    } else if (args[i] === "--loop-type" && args[i + 1]) {
      forceLoopType = args[++i];
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (!args[i].startsWith("--")) {
      jsonPath = args[i];
    }
  }

  if (!jsonPath && !useStdin) {
    console.error(
      "Usage: node scripts/import-sequence.cjs <file.json> [--notes 'tagline'] [--circular] [--loop-type mirrored_swapped] [--visibility private|unlisted] [--dry-run]"
    );
    console.error(
      "       echo '{...}' | node scripts/import-sequence.cjs --stdin"
    );
    process.exit(1);
  }
}

// Constants

const AUSTEN_UID = "PBp3GSBO6igCKPwJyLZNmVEmamI3";

// The app's persistence normalizer is the behavior owner for exact words,
// composition, canonical step count, and content identity. This script still
// runs under plain Node, so load that TypeScript module through tsx instead of
// maintaining a second import-only version of the same rules.
let normalizerPromise = null;
function loadPersistenceNormalizer() {
  normalizerPromise ??= import("tsx/esm/api").then(({ tsImport }) =>
    tsImport(
      "../src/lib/shared/library/services/sequence-persistence-normalizer.ts",
      pathToFileURL(__filename).href
    )
  );
  return normalizerPromise;
}

async function normalizeFirestoreDoc(built) {
  const { normalizeSequenceForPersistence } = await loadPersistenceNormalizer();
  const normalized = await normalizeSequenceForPersistence({
    ...built.data,
    id: built.id,
  });

  return {
    id: built.id,
    data: { ...normalized.ownerData, id: built.id },
    hydrated: normalized.hydrated,
    contentHash: normalized.contentHash,
    contentHashVersion: normalized.contentHashVersion,
  };
}

function stampNewSequenceTimestamps(data, fieldValue) {
  return {
    ...data,
    birthday: fieldValue.serverTimestamp(),
    createdAt: fieldValue.serverTimestamp(),
    updatedAt: fieldValue.serverTimestamp(),
  };
}

// LOOP Detection

// Maps LOOP component IDs to the loopType enum values used in Firestore
const COMPONENT_TO_LOOP_TYPE = {
  rotated: "rotated",
  mirrored: "mirrored",
  swapped: "swapped",
  inverted: "inverted",
};

/**
 * Convert a raw step (current motions.left/right or legacy motions.blue/red) to the
 * SequenceStep format expected by the sequence-engine's LOOP detector.
 */
function convertToEngineStep(step, index) {
  const left = step.motions?.left || step.motions?.blue || {};
  const right = step.motions?.right || step.motions?.red || {};
  return {
    letter: step.letter,
    startPlacement: step.startPlacement,
    endPlacement: step.endPlacement,
    // The detector reads `motions.{left,right}` while transform comparators use
    // flat `leftMotion`/`rightMotion`. Emit both current shapes.
    motions: { left, right },
    leftMotion: {
      motionType: left.motionType,
      startLocation: left.startLocation,
      endLocation: left.endLocation,
      rotationDirection: left.rotationDirection,
      startOrientation: left.startOrientation,
      endOrientation: left.endOrientation,
      turns: left.turns,
    },
    rightMotion: {
      motionType: right.motionType,
      startLocation: right.startLocation,
      endLocation: right.endLocation,
      rotationDirection: right.rotationDirection,
      startOrientation: right.startOrientation,
      endOrientation: right.endOrientation,
      turns: right.turns,
    },
    beatIndex: index,
    stepNumber: index,
  };
}

/**
 * Detect LOOP type from raw sequence steps.
 * Returns { isCircular, loopType, description } or null if detection unavailable.
 */
function detectLoop(raw) {
  try {
    const {
      detectLOOPFromSteps,
    } = require("../packages/sequence-engine/dist/loop/detection/LOOPDetector.js");

    const steps = raw.steps || [];
    const startPos = raw.startPlacement || raw.startingPlacement;
    const startGridPos = startPos?.startPlacement || startPos?.gridPlacement;

    // Build engine-format steps with start position as step 0
    const startLeft = {
      motionType: "static",
      startLocation: startPos?.motions?.left?.startLocation || "n",
      endLocation: startPos?.motions?.left?.endLocation || "n",
      rotationDirection: "noRotation",
      turns: 0,
    };
    const startRight = {
      motionType: "static",
      startLocation: startPos?.motions?.right?.startLocation || "n",
      endLocation: startPos?.motions?.right?.endLocation || "n",
      rotationDirection: "noRotation",
      turns: 0,
    };

    const engineSteps = [
      {
        letter: startPos?.letter || "β",
        startPlacement: startGridPos || "beta1",
        endPlacement: startPos?.endPlacement || startGridPos || "beta1",
        motions: { left: startLeft, right: startRight },
        leftMotion: {
          motionType: "static",
          startLocation: startPos?.motions?.left?.startLocation || "n",
          endLocation: startPos?.motions?.left?.endLocation || "n",
          rotationDirection: "noRotation",
          turns: 0,
        },
        rightMotion: {
          motionType: "static",
          startLocation: startPos?.motions?.right?.startLocation || "n",
          endLocation: startPos?.motions?.right?.endLocation || "n",
          rotationDirection: "noRotation",
          turns: 0,
        },
        beatIndex: 0,
        stepNumber: 0,
      },
      ...steps.map((s, i) => convertToEngineStep(s, i + 1)),
    ];

    const result = detectLOOPFromSteps(engineSteps);

    // Map the first detected component to a loopType enum value
    let loopType = null;
    if (result.components && result.components.length > 0) {
      loopType =
        COMPONENT_TO_LOOP_TYPE[result.components[0]] || result.components[0];
    }

    return {
      isCircular: result.isCircular,
      loopType,
      components: result.components || [],
      description: result.description,
    };
  } catch (err) {
    // sequence-engine not built or not available — skip detection
    console.warn(`LOOP detection unavailable: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Read and parse input
// ---------------------------------------------------------------------------

async function readInput() {
  if (useStdin) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  return readFileSync(resolve(jsonPath), "utf8");
}

// ---------------------------------------------------------------------------
// Build Firestore document from raw sequence JSON
// ---------------------------------------------------------------------------

/**
 * Build a complete startPlacement object. Two input shapes are tolerated:
 *
 *   1. Rich object (from the app or a prior export): has current
 *      .motions.left/right or legacy .motions.blue/red. Normalize it here.
 *   2. Bare string or stub (from MCP generate_sequence, which returns
 *      startPlacement as a grid-placement string like "beta5"): synthesize a
 *      static startPlacement object from the first step's start-side motion
 *      data. Without this, the Firestore doc ends up with undefined
 *      motions, and the thumbnail renderer draws an empty Start cell.
 */
function buildStartPlacementObject(startPosInput, steps, sequenceId) {
  if (
    startPosInput &&
    typeof startPosInput === "object" &&
    (startPosInput.motions?.left || startPosInput.motions?.blue) &&
    (startPosInput.motions?.right || startPosInput.motions?.red)
  ) {
    const gridPos =
      startPosInput.gridPlacement ||
      startPosInput.startPlacement ||
      steps?.[0]?.startPlacement ||
      null;
    return {
      isStartPlacement: true,
      id: startPosInput.id || `start-${sequenceId}`,
      gridPlacement: gridPos,
      letter: startPosInput.letter,
      startPlacement: startPosInput.startPlacement || gridPos,
      endPlacement: startPosInput.endPlacement || gridPos,
      motions: {
        left: startPosInput.motions.left || startPosInput.motions.blue,
        right: startPosInput.motions.right || startPosInput.motions.red,
      },
    };
  }

  const firstStep = steps?.[0];
  const leftMotion = firstStep?.motions?.left || firstStep?.motions?.blue;
  const rightMotion = firstStep?.motions?.right || firstStep?.motions?.red;
  if (!leftMotion || !rightMotion) return null;

  const gridPos =
    (typeof startPosInput === "string" ? startPosInput : null) ||
    firstStep.startPlacement ||
    null;

  const letter =
    typeof gridPos === "string"
      ? gridPos.startsWith("alpha")
        ? "α"
        : gridPos.startsWith("beta")
          ? "β"
          : gridPos.startsWith("gamma")
            ? "γ"
            : null
      : null;

  return {
    isStartPlacement: true,
    id: `start-${sequenceId}`,
    gridPlacement: gridPos,
    letter,
    startPlacement: gridPos,
    endPlacement: gridPos,
    motions: {
      left: {
        hand: "left",
        motionType: "static",
        startLocation: leftMotion.startLocation,
        endLocation: leftMotion.startLocation,
        startOrientation: leftMotion.startOrientation,
        endOrientation: leftMotion.startOrientation,
        rotationDirection: "no_rotation",
        turns: 0,
        isVisible: leftMotion.isVisible !== false,
      },
      right: {
        hand: "right",
        motionType: "static",
        startLocation: rightMotion.startLocation,
        endLocation: rightMotion.startLocation,
        startOrientation: rightMotion.startOrientation,
        endOrientation: rightMotion.startOrientation,
        rotationDirection: "no_rotation",
        turns: 0,
        isVisible: rightMotion.isVisible !== false,
      },
    },
  };
}

/**
 * Build the Firestore library document from raw sequence JSON.
 *
 * @param raw Raw sequence JSON ({word, gridMode, startPlacement, steps})
 * @param fieldValue Object with a serverTimestamp() factory (e.g. admin.firestore.FieldValue)
 * @param loopInfo Result of detectLoop(raw), or null
 * @param opts { visibility, notes, forceCircular, forceLoopType, demo }
 */
function buildFirestoreDoc(raw, fieldValue, loopInfo, opts = {}) {
  const optVisibility = opts.visibility ?? visibility;
  const optNotes = opts.notes ?? raw.notes ?? notes;
  const optForceCircular = opts.forceCircular ?? forceCircular;
  const optForceLoopType = opts.forceLoopType ?? forceLoopType;

  if (optVisibility === "public") {
    throw new Error(
      "Script imports must land private or unlisted. Publish through the app so the owner, public projection, and hash claim commit together."
    );
  }
  if (optVisibility !== "private" && optVisibility !== "unlisted") {
    throw new Error(
      `Unsupported import visibility ${JSON.stringify(optVisibility)}; expected private or unlisted.`
    );
  }

  const sequenceId = `seq_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = fieldValue.serverTimestamp();

  const word = raw.word || "";
  const name = raw.name || word;

  // Use CLI override > LOOP detector > manual end-matches-start check
  const steps = raw.steps || [];
  const startPos = raw.startPlacement || raw.startingPlacement;
  const startPosObject = buildStartPlacementObject(startPos, steps, sequenceId);
  const startGridPos =
    startPosObject?.gridPlacement ||
    (typeof startPos === "string" ? startPos : null) ||
    startPos?.startPlacement ||
    startPos?.gridPlacement;
  const lastStep = steps[steps.length - 1];
  const manualCircular =
    lastStep && startGridPos ? lastStep.endPlacement === startGridPos : false;
  const isCircular =
    optForceCircular != null
      ? optForceCircular
      : loopInfo != null
        ? loopInfo.isCircular
        : manualCircular;

  // Determine starting position group (alpha, beta, gamma)
  let startingPlacementGroup = null;
  if (startGridPos) {
    if (startGridPos.startsWith("alpha")) startingPlacementGroup = "alpha";
    else if (startGridPos.startsWith("beta")) startingPlacementGroup = "beta";
    else if (startGridPos.startsWith("gamma")) startingPlacementGroup = "gamma";
  }

  const doc = {
    id: sequenceId,
    name,
    word,
    steps: steps.map((step, i) => ({
      stepNumber: step.stepNumber ?? i + 1,
      letter: step.letter,
      startPlacement: step.startPlacement,
      endPlacement: step.endPlacement,
      duration: step.duration ?? 1,
      motions: step.motions,
    })),
    startPlacement: startPosObject,
    startingPlacementGroup,
    gridMode: raw.gridMode || "diamond",
    sequenceLength: steps.length,
    thumbnails: [],
    tags: Array.from(
      new Set([
        ...(Array.isArray(raw.tags) ? raw.tags : []),
        ...(opts.demo ? ["demo"] : []),
      ])
    ),
    isFavorite: false,
    isCircular,
    // Legacy readers still inspect metadata.visibility, so keep it aligned
    // with the top-level owner field even though imports cannot publish.
    metadata: {
      ...(raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {}),
      visibility: optVisibility,
    },
    ownerId: AUSTEN_UID,
    visibility: optVisibility,
    birthday: now,
    createdAt: now,
    updatedAt: now,
    _version: 1,
  };

  if (raw.displayName) {
    doc.displayName = raw.displayName;
  }

  if (opts.demo) {
    doc.demo = true;
  }

  // Add LOOP type — CLI override takes precedence over detector
  if (optForceLoopType) {
    doc.loopType = optForceLoopType;
  } else if (loopInfo?.loopType) {
    doc.loopType = loopInfo.loopType;
  }

  if (optNotes) {
    doc.notes = optNotes;
  }

  // Compute compositional fields (leftSoloProp, rightSoloProp, stepPairings)
  const compositional = decomposeSequence(doc);
  if (compositional) {
    Object.assign(doc, compositional);
  }

  // Strip any undefined/null values (Firestore rejects them)
  return {
    id: sequenceId,
    data: Object.fromEntries(
      Object.entries(doc).filter(([, v]) => v !== undefined && v !== null)
    ),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  parseCliArgs();
  const input = await readInput();
  let raw;
  try {
    raw = JSON.parse(input);
  } catch (err) {
    console.error("Failed to parse JSON:", err.message);
    process.exit(1);
  }

  console.log(`Sequence: "${raw.word || "(no word)"}"`);
  console.log(`Steps: ${(raw.steps || []).length}`);
  console.log(`Grid mode: ${raw.gridMode || "diamond"}`);

  // Auto-detect LOOP type
  const loopInfo = detectLoop(raw);
  if (loopInfo) {
    console.log(`Circular: ${loopInfo.isCircular}`);
    if (loopInfo.loopType) {
      console.log(`LOOP type: ${loopInfo.loopType} (${loopInfo.description})`);
    } else if (loopInfo.isCircular) {
      console.log(`LOOP type: freeform (circular but no recognized pattern)`);
    }
  }

  if (dryRun) {
    const localClock = { serverTimestamp: () => new Date() };
    const built = buildFirestoreDoc(raw, localClock, loopInfo);
    const { id, data } = await normalizeFirestoreDoc(built);
    console.log(
      `\n[DRY RUN] Would save as: users/${AUSTEN_UID}/sequences/${id}`
    );
    console.log(`Fields: ${Object.keys(data).join(", ")}`);
    console.log(`Visibility: ${data.visibility}`);
    console.log(`isCircular: ${data.isCircular}`);
    if (data.loopType) console.log(`loopType: ${data.loopType}`);
    if (data.notes) console.log(`Notes: ${data.notes}`);
    return;
  }

  // Initialize Firebase Admin
  const admin = require("firebase-admin");
  const serviceAccountPath = resolve(__dirname, "../serviceAccountKey.json");
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
  } catch {
    console.error("Missing serviceAccountKey.json in project root.");
    console.error(
      "Place your Firebase service account key there to use this script."
    );
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  const db = admin.firestore();
  const localClock = { serverTimestamp: () => new Date() };
  const built = buildFirestoreDoc(raw, localClock, loopInfo);
  const normalized = await normalizeFirestoreDoc(built);
  const id = normalized.id;
  const data = stampNewSequenceTimestamps(
    normalized.data,
    admin.firestore.FieldValue
  );

  const docPath = `users/${AUSTEN_UID}/sequences/${id}`;
  console.log(`\nSaving to: ${docPath}`);

  await db.doc(docPath).set(data);

  // Update sequence count
  await db.doc(`users/${AUSTEN_UID}`).set(
    {
      sequenceCount: admin.firestore.FieldValue.increment(1),
      lastActivityDate: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log("Saved successfully.");
  console.log(`ID: ${id}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}

// Reused by the batch importer and the one-shot QR pipeline.
module.exports = {
  AUSTEN_UID,
  detectLoop,
  buildFirestoreDoc,
  normalizeFirestoreDoc,
  stampNewSequenceTimestamps,
};
