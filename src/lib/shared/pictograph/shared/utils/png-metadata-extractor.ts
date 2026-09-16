/**
 * PNG Metadata Extractor for TKA Sequences — plain function module.
 *
 * Extracts ALL sequence metadata from the unified JSON structure
 * stored in the "metadata" tEXt chunk of PNG files. Uses ONE consistent
 * system — JSON metadata only, no separate tEXt chunks for individual fields.
 */

// Private helper — not exported
function findTextChunk(data: Uint8Array, keyword: string): string | null {
  let offset = 8; // Skip PNG signature

  while (offset < data.length) {
    // Read chunk length (4 bytes, big-endian)
    const length =
      (data[offset]! << 24) |
      (data[offset + 1]! << 16) |
      (data[offset + 2]! << 8) |
      data[offset + 3]!;
    offset += 4;

    // Read chunk type (4 bytes)
    const type = String.fromCharCode(
      data[offset]!,
      data[offset + 1]!,
      data[offset + 2]!,
      data[offset + 3]!
    );
    offset += 4;

    if (type === "tEXt") {
      const chunkData = data.slice(offset, offset + length);
      const text = new TextDecoder("latin1").decode(chunkData);

      const nullIndex = text.indexOf("\0");
      if (nullIndex !== -1) {
        const chunkKeyword = text.substring(0, nullIndex);
        if (chunkKeyword === keyword) {
          return text.substring(nullIndex + 1);
        }
      }
    }

    offset += length + 4;
  }

  return null;
}

/**
 * Extract complete JSON metadata from a PNG file.
 */
export async function extractMetadata(
  filePath: string
): Promise<Record<string, unknown>[]> {
  const response = await fetch(filePath);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch PNG file: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const metadataJson = findTextChunk(uint8Array, "metadata");

  if (!metadataJson) {
    throw new Error("No unified JSON metadata found in PNG file");
  }

  const parsed = JSON.parse(metadataJson) as Record<string, unknown>;
  const sequence = parsed["sequence"] as Record<string, unknown>[] | undefined;
  return sequence ?? [parsed];
}

/**
 * Extract metadata for a specific sequence by name.
 */
export async function extractSequenceMetadata(
  sequenceName: string
): Promise<Record<string, unknown>[]> {
  const encodedSequenceName = encodeURIComponent(sequenceName);

  const versionsToTry = [2, 1, 3];
  for (const version of versionsToTry) {
    const jsonPath = `/gallery/${encodedSequenceName}/${encodedSequenceName}_ver${version}.meta.json`;
    try {
      const response = await fetch(jsonPath);
      if (response.ok) {
        const jsonData = (await response.json()) as Record<string, unknown>;
        const metadata = jsonData["metadata"] as
          | Record<string, unknown>
          | undefined;
        const metadataSequence = metadata?.["sequence"] as
          | Record<string, unknown>[]
          | undefined;
        const directSequence = jsonData["sequence"] as
          | Record<string, unknown>[]
          | undefined;
        return metadataSequence ?? directSequence ?? [];
      }
    } catch {
      continue;
    }
  }

  // Fallback to PNG extraction (legacy system)
  const filePathV1 = `/gallery/${encodedSequenceName}/${encodedSequenceName}_ver1.png`;
  const filePathV2 = `/gallery/${encodedSequenceName}/${encodedSequenceName}_ver2.png`;

  try {
    return await extractMetadata(filePathV1);
  } catch {
    return extractMetadata(filePathV2);
  }
}

/**
 * Extract complete metadata structure (including date_added, is_favorite) for a sequence.
 */
export async function extractCompleteMetadata(
  sequenceName: string,
  thumbnailPath?: string
): Promise<{
  sequence: Record<string, unknown>[];
  date_added?: string;
  is_favorite?: boolean;
}> {
  const encodedSequenceName = encodeURIComponent(sequenceName);

  if (thumbnailPath) {
    const versionMatch = thumbnailPath.match(/_ver(\d+)\.webp$/);
    if (versionMatch) {
      const version = versionMatch[1];
      const jsonPath = `/gallery/${encodedSequenceName}/${encodedSequenceName}_ver${version}.meta.json`;
      try {
        const response = await fetch(jsonPath);
        if (response.ok) {
          const jsonData = (await response.json()) as Record<string, unknown>;
          const metadata = jsonData["metadata"] as
            | {
                sequence: Record<string, unknown>[];
                date_added?: string;
                is_favorite?: boolean;
              }
            | undefined;
          return (
            metadata ??
            (jsonData as {
              sequence: Record<string, unknown>[];
              date_added?: string;
              is_favorite?: boolean;
            })
          );
        }
      } catch {
        // Fall back to version guessing
      }
    }
  }

  const versionsToTry = [2, 1, 3];
  for (const version of versionsToTry) {
    const jsonPath = `/gallery/${encodedSequenceName}/${encodedSequenceName}_ver${version}.meta.json`;
    try {
      const response = await fetch(jsonPath);
      if (response.ok) {
        const jsonData = (await response.json()) as Record<string, unknown>;
        const metadata = jsonData["metadata"] as
          | {
              sequence: Record<string, unknown>[];
              date_added?: string;
              is_favorite?: boolean;
            }
          | undefined;
        return (
          metadata ??
          (jsonData as {
            sequence: Record<string, unknown>[];
            date_added?: string;
            is_favorite?: boolean;
          })
        );
      }
    } catch {
      continue;
    }
  }

  // Fallback to PNG extraction (legacy system)
  let response: Response | null = null;

  if (thumbnailPath) {
    const versionMatch = thumbnailPath.match(/_ver(\d+)\.webp$/);
    if (versionMatch) {
      const version = versionMatch[1];
      const filePath = `/gallery/${encodedSequenceName}/${encodedSequenceName}_ver${version}.png`;
      try {
        response = await fetch(filePath);
        if (!response.ok) response = null;
      } catch {
        // continue
      }
    }
  }

  if (!response?.ok) {
    for (const version of versionsToTry) {
      const filePath = `/gallery/${encodedSequenceName}/${encodedSequenceName}_ver${version}.png`;
      try {
        response = await fetch(filePath);
        if (response.ok) break;
      } catch {
        continue;
      }
    }
  }

  if (!response?.ok) {
    throw new Error(
      `Failed to fetch metadata for ${sequenceName}: No valid version found (tried both .meta.json and .png)`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const metadataJson = findTextChunk(uint8Array, "metadata");

  if (!metadataJson) {
    throw new Error(
      `PNG file exists but contains no metadata tEXt chunk. File may have been created without sequence data.`
    );
  }

  return JSON.parse(metadataJson) as {
    sequence: Record<string, unknown>[];
    date_added?: string;
    is_favorite?: boolean;
  };
}

/**
 * Debug method to display complete unified metadata for a sequence.
 */
export async function debugSequenceMetadata(sequenceName: string): Promise<{
  metadata: Record<string, unknown>[];
  author: string;
  startPlacement: string;
  level: string;
  steps: Array<{ letter: string; leftMotion: string; rightMotion: string }>;
}> {
  const metadata = await extractSequenceMetadata(sequenceName);

  const firstEntry = metadata[0] ?? {};
  const startPlacementEntries = metadata.filter(
    (step: Record<string, unknown>) => step["sequence_start_position"]
  );

  const author = String(firstEntry["author"] ?? "MISSING");
  const startPlacement = String(
    startPlacementEntries[0]?.["sequence_start_position"] ?? "MISSING"
  );
  const level = String(firstEntry["level"] ?? "MISSING");

  const realBeats = metadata
    .slice(1)
    .filter(
      (step: Record<string, unknown>) =>
        step["letter"] && !step["sequence_start_position"]
    );
  const steps = realBeats.map((step: Record<string, unknown>) => {
    const leftAttrs = (step["leftAttributes"] ?? step["blueAttributes"]) as
      | Record<string, unknown>
      | undefined;
    const rightAttrs = (step["rightAttributes"] ?? step["redAttributes"]) as
      | Record<string, unknown>
      | undefined;
    return {
      letter: String(step["letter"] ?? "?"),
      leftMotion: String(leftAttrs?.["motionType"] ?? "unknown"),
      rightMotion: String(rightAttrs?.["motionType"] ?? "unknown"),
    };
  });

  return { metadata, author, startPlacement, level, steps };
}

// Extend Window interface for debug function
declare global {
  interface Window {
    extractPngMetadata?: typeof debugSequenceMetadata;
  }
}

// Global utility function for easy debugging (browser only)
if (typeof window !== "undefined") {
  window.extractPngMetadata = debugSequenceMetadata;
}
