import { readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import {
  PRONUNCIATION_POSITIONS,
  getLetterPronunciation,
  type PronunciationManifest,
  type PronunciationPosition,
  type PronunciationRecordingSet,
} from "#lib/shared/pronunciation/pronunciation-plan.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const recordingsRoot = join(
  projectRoot,
  "static",
  "audio",
  "pronunciations",
  "v1"
);
const manifestPath = join(recordingsRoot, "manifest.json");

const expectedAssetKeys = new Set(
  Object.values(Letter).map((letter) => {
    const pronunciation = getLetterPronunciation(letter);
    if (!pronunciation)
      throw new Error(`Missing pronunciation metadata for ${letter}`);
    return pronunciation.assetKey;
  })
);

const rootEntries = await readdir(recordingsRoot, { withFileTypes: true });
const recordingDirectories = rootEntries.filter((entry) => entry.isDirectory());
const unexpectedRootFiles = rootEntries
  .filter((entry) => entry.isFile() && entry.name !== "manifest.json")
  .map((entry) => entry.name);
if (unexpectedRootFiles.length > 0) {
  throw new Error(
    `Unexpected files at the pronunciation root: ${unexpectedRootFiles.join(", ")}`
  );
}

const unknownDirectories = recordingDirectories
  .map((entry) => entry.name)
  .filter((name) => !expectedAssetKeys.has(name));

if (unknownDirectories.length > 0) {
  throw new Error(
    `Unknown pronunciation directories: ${unknownDirectories.join(", ")}`
  );
}

const recordings: Record<string, PronunciationRecordingSet> = {};
let cueCount = 0;

for (const directory of recordingDirectories.sort((a, b) =>
  a.name.localeCompare(b.name)
)) {
  const files = await readdir(join(recordingsRoot, directory.name), {
    withFileTypes: true,
  });
  const fileNames = files
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  const unexpectedFiles = fileNames.filter(
    (name) =>
      !PRONUNCIATION_POSITIONS.some((position) => name === `${position}.wav`)
  );
  if (unexpectedFiles.length > 0) {
    throw new Error(
      `Unexpected files in ${directory.name}: ${unexpectedFiles.join(", ")}`
    );
  }

  const recordingSet: PronunciationRecordingSet = {};
  for (const position of PRONUNCIATION_POSITIONS) {
    const fileName = `${position}.wav`;
    if (!fileNames.includes(fileName)) continue;
    recordingSet[position as PronunciationPosition] =
      `${directory.name}/${fileName}`;
    cueCount += 1;
  }

  if (Object.keys(recordingSet).length > 0) {
    recordings[directory.name] = recordingSet;
  }
}

const manifest: PronunciationManifest = {
  version: 1,
  recordings,
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const expectedCueCount =
  expectedAssetKeys.size * PRONUNCIATION_POSITIONS.length;
console.log(
  `Pronunciation manifest: ${cueCount}/${expectedCueCount} contextual cues across ${Object.keys(recordings).length}/${expectedAssetKeys.size} letters.`
);
