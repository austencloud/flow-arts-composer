/** Local playground job. One Blender process, then the existing intake gates. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { intakeCharacter } from "./character-intake.mjs";
import { parseGenerationOptions } from "../../src/routes/test/character-playground/generation-options";

const [
  seedText,
  jobDirectory,
  source,
  assets,
  blender,
  stageDirectory,
  optionsFile,
] = process.argv.slice(2);
const seed = Number(seedText);
if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647)
  throw new Error("Invalid seed");
const id = `mpfb-${seed}`;
await mkdir(jobDirectory, { recursive: true });
const generated = resolve(jobDirectory, "generated");
try {
  const requestedOptions = optionsFile
    ? parseGenerationOptions(JSON.parse(await readFile(optionsFile, "utf8")))
    : undefined;
  if (optionsFile && !requestedOptions)
    throw new Error("Invalid character generation options");
  const normalizedOptionsFile = requestedOptions
    ? resolve(jobDirectory, "normalized-options.json")
    : "";
  if (requestedOptions)
    await writeFile(
      normalizedOptionsFile,
      JSON.stringify(requestedOptions, null, 2)
    );
  const result = await promisify(execFile)(
    blender,
    [
      "--background",
      "--factory-startup",
      "--python-exit-code",
      "1",
      "--python",
      resolve("scripts/characters/mpfb-proof.py"),
      "--",
      "--source",
      source,
      "--assets",
      assets,
      "--output",
      generated,
      "--seed",
      seedText,
      ...(normalizedOptionsFile ? ["--options", normalizedOptionsFile] : []),
    ],
    {
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        BLENDER_USER_RESOURCES: resolve(jobDirectory, "blender-user"),
      },
    }
  );
  await writeFile(
    resolve(jobDirectory, "blender.log"),
    result.stdout + result.stderr
  );
  // A complete finger rig can still point its thumbs away from the shaft.
  // Exercise the actual runtime grip before this export enters the catalog.
  const gripCheck = await promisify(execFile)(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/characters/verify-mpfb-grip.mjs",
      resolve(generated, "mpfb-proof.glb"),
    ],
    { windowsHide: true, maxBuffer: 1024 * 1024 }
  );
  await writeFile(
    resolve(jobDirectory, "grip-verification.json"),
    gripCheck.stdout
  );
  const provenance = JSON.parse(
    await readFile(
      resolve("scripts/characters/mpfb-proof.provenance.json"),
      "utf8"
    )
  );
  provenance.id = id;
  provenance.displayName = `MPFB ${seed}`;
  provenance.description = `Locally generated adult character, seed ${seed}. Body, face, hair and outfit randomized with MPFB.`;
  const generation = JSON.parse(
    await readFile(resolve(generated, "generation.json"), "utf8")
  );
  // The intake schema only accepts licensing provenance. Keep its metadata
  // valid while retaining the reproducible control snapshot in its source note.
  provenance.source.assetName = `Official MPFB base and CC0 system assets; seed ${seed}; controls ${JSON.stringify(generation.resolvedControls)}`;
  provenance.acquiredAt = new Date().toISOString();
  const provenanceFile = resolve(jobDirectory, "provenance.json");
  await writeFile(provenanceFile, JSON.stringify(provenance, null, 2));
  const resultIntake = await intakeCharacter({
    source: resolve(generated, "mpfb-proof.glb"),
    provenanceFile,
    outputDirectory: resolve(jobDirectory, "intake"),
    stageBakeoff: true,
    stageDirectory,
    skipThumbnail: true,
    textureSize: 2048,
  });
  if (resultIntake.status === "rejected")
    throw new Error(
      "Character failed intake checks; see the job's intake report."
    );
  await writeFile(
    resolve(jobDirectory, "result.json"),
    JSON.stringify({ id: `intake-${id}`, seed, options: requestedOptions })
  );
} catch (error) {
  await writeFile(
    resolve(jobDirectory, "failure.log"),
    String(error) + "\n" + (error.stdout ?? "") + (error.stderr ?? "")
  );
  process.exitCode = 1;
}
