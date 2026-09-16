/**
 * Release the six universal Timing & Direction hand-path reference cards.
 *
 * Usage:
 *   npm run deck:release:hand-path -- --dry-run
 *   npm run deck:release:hand-path
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  HAND_PATH_REFERENCE_CARD_DEFINITIONS,
  HAND_PATH_REFERENCE_CARD_VERSION,
  getHandPathReferenceDefinitionNotes,
} from "../src/lib/features/choreo-card/domain/hand-path-reference-card-manifest";
import { getHandPathReferenceCards } from "../src/lib/features/choreo-card/domain/hand-path-reference-cards";
import { normalizeSequenceForPersistence } from "../src/lib/shared/library/services/sequence-persistence-normalizer";
import { buildHandPathShortCodePayload } from "../src/lib/shared/qr/services/hand-path-short-code-payload";
import { hydrateSelfContainedShortCodePayload } from "../src/lib/shared/qr/services/short-code-payload-hydrator";
import { encodeSequence } from "../src/lib/shared/navigation/services/sequence-encoder";
import type { ShortCodeData } from "../src/lib/shared/qr/services/types";

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NAME = "Timing & Direction Hand Paths";
const DESCRIPTION =
  "Six universal, prop-free cards for learning the Timing & Direction relationships.";
const NOTES = "Hand Path Reference Deck · Version 1";
const CATALOG_ID = "hand-path-references";

function serviceAccountPath(): string {
  const localPath = resolve(REPO_ROOT, "serviceAccountKey.json");
  if (existsSync(localPath)) return localPath;

  const commonGitDirectory = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: REPO_ROOT, encoding: "utf8" }
  ).trim();
  const sharedCheckoutPath = resolve(
    dirname(commonGitDirectory),
    "serviceAccountKey.json"
  );
  if (existsSync(sharedCheckoutPath)) return sharedCheckoutPath;

  throw new Error(
    "serviceAccountKey.json was not found in the task or shared checkout."
  );
}

function printComposition(): void {
  console.log("=== Hand Path Deck Release ===");
  console.log(`Deck: ${NAME}`);
  console.log(`Reference-card version: ${HAND_PATH_REFERENCE_CARD_VERSION}`);
  console.log(`Cards: ${HAND_PATH_REFERENCE_CARD_DEFINITIONS.length}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log("\nComposition:");
  for (const [
    index,
    referenceCard,
  ] of HAND_PATH_REFERENCE_CARD_DEFINITIONS.entries()) {
    console.log(
      `  ${index + 1}. ${referenceCard.cardTitle} — ${getHandPathReferenceDefinitionNotes(referenceCard)}`
    );
  }
  console.log("\nBreakdown:");
  for (const timing of ["Together", "Split", "Quarter"] as const) {
    const count = HAND_PATH_REFERENCE_CARD_DEFINITIONS.filter(
      (referenceCard) => referenceCard.timing === timing
    ).length;
    console.log(`  ${timing}: ${count}`);
  }
  console.log("  Same direction: 3");
  console.log("  Opposite direction: 3");
}

async function main(): Promise<void> {
  printComposition();
  const prepared = await Promise.all(
    getHandPathReferenceCards().map(async (card) => {
      const normalized = await normalizeSequenceForPersistence(card.sequence);
      const payload = await buildHandPathShortCodePayload(normalized.hydrated);
      const encoderHash = createHash("sha256")
        .update(encodeSequence(normalized.hydrated))
        .digest("hex");
      return { card, normalized, payload, encoderHash };
    })
  );
  if (DRY_RUN) {
    console.log(
      "Validated six saved compositions and hands-only QR round trips."
    );
    console.log("\n[DRY RUN] No Firestore records were written.");
    return;
  }

  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath(), "utf8"));
  if (getApps().length === 0) {
    initializeApp({ credential: cert(serviceAccount) });
  }
  const db = getFirestore();

  const existing = await db
    .collection("deckReleases/counter/manifests")
    .where("handPathCards.version", "==", HAND_PATH_REFERENCE_CARD_VERSION)
    .limit(1)
    .get();
  const counterRef = db.doc("deckReleases/counter");
  const release = await db.runTransaction(async (transaction) => {
    const counterSnapshot = await transaction.get(counterRef);
    const previous = !FORCE ? existing.docs[0] : undefined;
    const previousSnapshot = previous
      ? await transaction.get(previous.ref)
      : undefined;
    const deckNumber =
      previousSnapshot?.data()?.deckNumber ??
      (counterSnapshot.exists
        ? ((counterSnapshot.data()?.next as number | undefined) ?? 1)
        : 1);
    // All reads precede writes. Hash indexes preserve printed identities on reruns.
    const records = await Promise.all(
      prepared.map(async (entry) => {
        const indexRef = db.doc(`shortcodeHashes/${entry.encoderHash}`);
        const indexSnapshot = await transaction.get(indexRef);
        const code =
          indexSnapshot.data()?.code ??
          entry.encoderHash.slice(0, 6).toUpperCase();
        const qrRef = db.doc(`shortcodes/${code}`);
        const qrSnapshot = await transaction.get(qrRef);
        if (
          qrSnapshot.exists &&
          qrSnapshot.data()?.encoderHash !== entry.encoderHash
        ) {
          throw new Error(
            `QR identity collision at ${code}; no records were written.`
          );
        }
        const sequenceRef = db.doc(
          `catalogs/${CATALOG_ID}/sequences/${entry.card.sequence.id}`
        );
        const savedSequence = await transaction.get(sequenceRef);
        if (
          savedSequence.exists &&
          savedSequence.data()?.contentHash !== entry.normalized.contentHash
        ) {
          throw new Error(
            `Saved reference ${entry.card.id} changed; a new version is required.`
          );
        }
        return {
          ...entry,
          indexRef,
          code,
          qrRef,
          qrSnapshot,
          sequenceRef,
          savedSequence,
        };
      })
    );
    const cards = records.map((entry, position) => ({
      sequenceId: entry.card.sequence.id,
      sourceCatalogId: CATALOG_ID,
      stepCount: entry.normalized.sequenceLength,
      word: "",
      position,
      footer: { center: entry.card.sequence.notes },
      qrUrl: `https://tka.run/${entry.code}`,
    }));
    const manifest = {
      ...previousSnapshot?.data(),
      deckNumber,
      createdAt:
        previousSnapshot?.data()?.createdAt ?? new Date().toISOString(),
      name: NAME,
      description: DESCRIPTION,
      theme: "cosmic",
      cardCount: HAND_PATH_REFERENCE_CARD_DEFINITIONS.length,
      notes: NOTES,
      sequences: cards,
      stepCountDistribution: {
        4: HAND_PATH_REFERENCE_CARD_DEFINITIONS.length,
      },
      handPathCards: {
        version: HAND_PATH_REFERENCE_CARD_VERSION,
        cardIds: HAND_PATH_REFERENCE_CARD_DEFINITIONS.map(
          (referenceCard) => referenceCard.id
        ),
      },
    };
    const manifestId = String(deckNumber).padStart(3, "0");
    for (const entry of records) {
      if (!entry.savedSequence.exists)
        transaction.create(entry.sequenceRef, entry.normalized.ownerData);
      if (!entry.qrSnapshot.exists) {
        transaction.create(entry.qrRef, {
          ...entry.payload,
          encoderHash: entry.encoderHash,
          sourceRef: entry.sequenceRef.path,
          deckId: manifestId,
          deckName: NAME,
        });
        transaction.set(entry.indexRef, {
          code: entry.code,
          createdAt: entry.payload.createdAt,
        });
      }
    }
    transaction.set(
      db.doc(`deckReleases/counter/manifests/${manifestId}`),
      manifest
    );
    if (!previousSnapshot?.exists)
      transaction.set(counterRef, { next: deckNumber + 1 }, { merge: true });
    return { manifestId, manifest };
  });

  const verification = await db
    .doc(`deckReleases/counter/manifests/${release.manifestId}`)
    .get();
  const saved = verification.data();
  if (
    !verification.exists ||
    saved?.cardCount !== HAND_PATH_REFERENCE_CARD_DEFINITIONS.length ||
    saved?.sequences?.length !== 6 ||
    saved?.handPathCards?.version !== HAND_PATH_REFERENCE_CARD_VERSION ||
    saved?.handPathCards?.cardIds?.length !==
      HAND_PATH_REFERENCE_CARD_DEFINITIONS.length
  ) {
    throw new Error(
      "The saved hand-path manifest failed read-back verification."
    );
  }

  for (const card of release.manifest.sequences) {
    const code = card.qrUrl.split("/").pop()!;
    const qr = await db.doc(`shortcodes/${code}`).get();
    const decoded = await hydrateSelfContainedShortCodePayload(
      code,
      qr.data() as ShortCodeData
    );
    const sequence = await db
      .doc(`catalogs/${CATALOG_ID}/sequences/${card.sequenceId}`)
      .get();
    if (
      !sequence.exists ||
      decoded?.sequenceKind !== "hand-path" ||
      decoded.steps.length !== 4 ||
      !decoded.startPlacement
    ) {
      throw new Error(
        `Saved sequence / QR read-back failed for ${card.sequenceId}.`
      );
    }
    console.log(`${decoded.displayName}: ${card.qrUrl}`);
  }

  console.log(`\nDeck #${release.manifestId} released and verified.`);
  console.log(`Manifest: deckReleases/counter/manifests/${release.manifestId}`);
  console.log(
    "Physical count: 6 cards, each with a saved sequence and durable QR link."
  );
}

main().catch((error: unknown) => {
  console.error("Fatal:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
