/**
 * Read and write PNG text chunks without touching the pixels.
 *
 * Owned here rather than pulled from a package: the maintained PNG text
 * packages write `tEXt` only, which is Latin-1 and so cannot hold a Greek
 * letter, and nothing maintained writes `iTXt` without re-encoding the image.
 * The chunk layout is a frozen standard (PNG spec, sections 5 and 11.3.4), so
 * this module stays small and stable.
 *
 * Search terms used before writing it (2026-11-16): crc32, crc-32, itxt,
 * png chunk, png metadata. No CRC-32 or chunk writer existed in `src/` or in a
 * direct dependency; `png-metadata-extractor.ts` is a legacy read-only reader
 * for old exports and is deliberately left alone.
 */

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

const TEXT_CHUNK_TYPES = new Set(["tEXt", "iTXt", "zTXt"]);

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

/** CRC-32 as the PNG spec defines it (ISO 3309), over chunk type plus data. */
function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = table[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

interface RawChunk {
  type: string;
  /** Offset of the chunk's length field. */
  start: number;
  /** Offset just past the chunk's CRC. */
  end: number;
  dataStart: number;
  dataEnd: number;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function asciiAt(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}

/**
 * Walk the chunks. Stops quietly at IEND or at the first chunk that runs past
 * the end of the buffer, so a truncated file yields what it has.
 */
function walkChunks(bytes: Uint8Array): {
  chunks: RawChunk[];
  complete: boolean;
} {
  const chunks: RawChunk[] = [];
  let offset: number = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const end = dataEnd + 4;
    if (end > bytes.length) return { chunks, complete: false };
    const type = asciiAt(bytes, offset + 4, offset + 8);
    chunks.push({ type, start: offset, end, dataStart, dataEnd });
    if (type === "IEND") return { chunks, complete: true };
    offset = end;
  }
  return { chunks, complete: false };
}

function indexOfZero(bytes: Uint8Array, from: number, to: number): number {
  for (let i = from; i < to; i++) if (bytes[i] === 0) return i;
  return -1;
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
const utf8Encoder = new TextEncoder();

function latin1(bytes: Uint8Array, start: number, end: number): string {
  return asciiAt(bytes, start, end);
}

/** The keyword of a text chunk, or null when the chunk is malformed. */
function textChunkKeyword(bytes: Uint8Array, chunk: RawChunk): string | null {
  const zero = indexOfZero(bytes, chunk.dataStart, chunk.dataEnd);
  return zero > chunk.dataStart ? latin1(bytes, chunk.dataStart, zero) : null;
}

/**
 * Keyword to text for every `tEXt` chunk (Latin-1) and every uncompressed
 * `iTXt` chunk (UTF-8). Compressed chunks are skipped. Never throws; a file
 * that is not a PNG yields an empty object. When a keyword repeats, the first
 * one wins.
 */
export function readPngTextChunks(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isPng(bytes)) return out;

  for (const chunk of walkChunks(bytes).chunks) {
    if (chunk.type !== "tEXt" && chunk.type !== "iTXt") continue;
    const zero = indexOfZero(bytes, chunk.dataStart, chunk.dataEnd);
    if (zero <= chunk.dataStart) continue;
    const keyword = latin1(bytes, chunk.dataStart, zero);
    if (keyword in out) continue;

    if (chunk.type === "tEXt") {
      out[keyword] = latin1(bytes, zero + 1, chunk.dataEnd);
      continue;
    }

    // iTXt: keyword \0 compressionFlag compressionMethod language \0
    // translatedKeyword \0 text
    const flagAt = zero + 1;
    if (flagAt + 2 > chunk.dataEnd) continue;
    if (bytes[flagAt] !== 0) continue; // compressed: skipped by design
    const languageEnd = indexOfZero(bytes, flagAt + 2, chunk.dataEnd);
    if (languageEnd < 0) continue;
    const translatedEnd = indexOfZero(bytes, languageEnd + 1, chunk.dataEnd);
    if (translatedEnd < 0) continue;
    out[keyword] = utf8Decoder.decode(
      bytes.subarray(translatedEnd + 1, chunk.dataEnd)
    );
  }
  return out;
}

function isValidKeyword(keyword: string): boolean {
  if (keyword.length < 1 || keyword.length > 79) return false;
  if (keyword !== keyword.trim()) return false;
  for (let i = 0; i < keyword.length; i++) {
    const code = keyword.charCodeAt(i);
    if (code < 32 || code > 255 || (code > 126 && code < 161)) return false;
  }
  return true;
}

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

/** An uncompressed iTXt chunk with no language tag or translated keyword. */
function buildITxtChunk(keyword: string, text: string): Uint8Array {
  const keywordBytes = Uint8Array.from(keyword, (ch) => ch.charCodeAt(0));
  const textBytes = utf8Encoder.encode(text);
  // keyword \0 flag(0) method(0) language(empty) \0 translated(empty) \0 text
  const data = new Uint8Array(keywordBytes.length + 5 + textBytes.length);
  data.set(keywordBytes, 0);
  let at = keywordBytes.length;
  data[at++] = 0; // keyword terminator
  data[at++] = 0; // compression flag: uncompressed
  data[at++] = 0; // compression method
  data[at++] = 0; // empty language tag terminator
  data[at++] = 0; // empty translated keyword terminator
  data.set(textBytes, at);
  return buildChunk("iTXt", data);
}

/**
 * Write each entry as an uncompressed `iTXt` chunk directly after `IHDR`,
 * dropping any existing text chunk with the same keyword. Pixel data is copied
 * byte for byte.
 *
 * Bytes that are not a well-formed PNG (wrong signature, no leading IHDR, a
 * truncated chunk, no IEND) come back untouched, as the same array.
 */
export function insertPngTextChunks(
  bytes: Uint8Array,
  entries: Record<string, string>
): Uint8Array {
  if (!isPng(bytes)) return bytes;
  const { chunks, complete } = walkChunks(bytes);
  const ihdr = chunks[0];
  if (!complete || ihdr?.type !== "IHDR") return bytes;

  const keywords = Object.keys(entries).filter(isValidKeyword);
  if (keywords.length === 0) return bytes;
  const replacing = new Set(keywords);

  const parts: Uint8Array[] = [bytes.subarray(0, ihdr.end)];
  for (const keyword of keywords) {
    parts.push(buildITxtChunk(keyword, entries[keyword]!));
  }
  for (const chunk of chunks.slice(1)) {
    if (TEXT_CHUNK_TYPES.has(chunk.type)) {
      const keyword = textChunkKeyword(bytes, chunk);
      if (keyword !== null && replacing.has(keyword)) continue;
    }
    parts.push(bytes.subarray(chunk.start, chunk.end));
  }

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
