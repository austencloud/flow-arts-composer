export const CANDIDATE_IDS = ["personal-metaperson"] as const;

export type FixedCandidateId = (typeof CANDIDATE_IDS)[number];
export type StagedCandidateId = `intake-${string}`;
export type CandidateId = FixedCandidateId | StagedCandidateId;

export interface LocalCharacterCandidate {
  id: CandidateId;
  label: string;
  source: string;
  modelUrl: string;
  bytes: number | null;
  continuity: "current";
  note: string;
}

export const FIXED_LOCAL_CHARACTERS: Record<
  FixedCandidateId,
  LocalCharacterCandidate
> = {
  "personal-metaperson": {
    id: "personal-metaperson",
    label: "Personal MetaPerson",
    source: "MetaPerson Creator photo export",
    modelUrl: "/models/avatars/bakeoff/personal-metaperson.glb",
    bytes: 12_150_852,
    continuity: "current",
    note: "Evaluation-only LOD1 GLB with the standard 73-joint MetaPerson skeleton and 1K PBR textures.",
  },
};

/** Written by `pnpm run characters:intake -- --stage-bakeoff` into the ignored stage directory. */
export const INTAKE_MANIFEST_URL =
  "/models/avatars/bakeoff/intake-manifest.json";
const STAGE_DIRECTORY_URL = "/models/avatars/bakeoff";
const STAGED_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STAGED_FILE_PATTERN = /^[A-Za-z0-9._-]+\.glb$/;
// Austen rejected Marcus on visual quality; a complete rig does not qualify him.
const REJECTED_INTAKE_IDS = new Set(["marcus"]);

export interface StagedIntakeEntry {
  id: string;
  label: string;
  source: string;
  file: string;
  bytes: number | null;
  note: string;
  stagedAt: string;
  sha256: string;
}

function stringField(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Read the manifest defensively: it is a local file written by a script, and
 * a half-written or hand-edited record must not take the whole route down.
 * Entries that cannot name a valid file are dropped rather than repaired.
 */
export function parseIntakeManifest(value: unknown): StagedIntakeEntry[] {
  if (value === null || typeof value !== "object") return [];
  const candidates = (value as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return [];
  const entries: StagedIntakeEntry[] = [];
  const seen = new Set<string>();
  for (const raw of candidates) {
    if (raw === null || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const rig = record.rig as { fingerChains?: unknown } | undefined;
    if (rig?.fingerChains !== true) continue;
    const id = stringField(record.id);
    if (REJECTED_INTAKE_IDS.has(id)) continue;
    const file = stringField(record.file);
    if (!STAGED_ID_PATTERN.test(id) || !STAGED_FILE_PATTERN.test(file))
      continue;
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push({
      id,
      label: stringField(record.label, id),
      source: stringField(record.source, "Local character intake pipeline"),
      file,
      bytes: typeof record.bytes === "number" ? record.bytes : null,
      note: stringField(record.note),
      stagedAt: stringField(record.stagedAt),
      sha256: /^[a-f0-9]{64}$/i.test(stringField(record.sha256))
        ? stringField(record.sha256)
        : "",
    });
  }
  return entries;
}

export function stagedCandidateId(entryId: string): StagedCandidateId {
  return `intake-${entryId}`;
}

export function stagedCandidate(
  entry: StagedIntakeEntry
): LocalCharacterCandidate {
  return {
    id: stagedCandidateId(entry.id),
    label: entry.label,
    source: entry.source,
    modelUrl: `${STAGE_DIRECTORY_URL}/${entry.file}${entry.sha256 ? `?v=${entry.sha256}` : ""}`,
    bytes: entry.bytes,
    continuity: "current",
    note:
      entry.note ||
      "Locally staged character. Inspect motion and grip before catalog promotion.",
  };
}

export async function loadStagedIntakeCandidates(
  fetchImpl: typeof fetch = fetch
): Promise<LocalCharacterCandidate[]> {
  try {
    const response = await fetchImpl(INTAKE_MANIFEST_URL, {
      cache: "no-store",
    });
    if (!response.ok) return [];
    return parseIntakeManifest(await response.json()).map(stagedCandidate);
  } catch {
    return [];
  }
}

// Local evaluation files can disappear independently of the manifest. Check
// them before offering a button; the dev server may return HTML for a bad URL.
export async function loadAvailableCandidates(
  fetchImpl: typeof fetch = fetch
): Promise<LocalCharacterCandidate[]> {
  const staged = await loadStagedIntakeCandidates(fetchImpl);
  const candidates = [...Object.values(FIXED_LOCAL_CHARACTERS), ...staged];
  const available = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const response = await fetchImpl(candidate.modelUrl, {
          method: "HEAD",
          cache: "no-store",
        });
        const type = response.headers
          .get("content-type")
          ?.split(";")[0]
          ?.trim();
        return response.ok &&
          (type === "model/gltf-binary" || type === "application/octet-stream")
          ? candidate
          : null;
      } catch {
        return null;
      }
    })
  );
  return available.filter(
    (candidate): candidate is LocalCharacterCandidate => candidate !== null
  );
}

export function resolveCandidate(
  id: string | null,
  available: readonly LocalCharacterCandidate[]
): LocalCharacterCandidate | null {
  return (
    available.find((candidate) => candidate.id === id) ?? available[0] ?? null
  );
}

export function formatMegabytes(bytes: number | null): string {
  if (bytes === null) return "local staged file";
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
