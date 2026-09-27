/**
 * Minimal WebP container parser.
 *
 * Verifies the RIFF/WEBP magic bytes and reads pixel width/height straight
 * from the VP8 (lossy), VP8L (lossless) or VP8X (extended) chunk header —
 * enough to validate an upload without decoding any pixel data. Byte layout
 * per the WebP Container Specification and the VP8 Data Format and Decoding
 * Guide (RIFF chunk framing, the VP8 frame tag + start code, the VP8L
 * signature byte, the VP8X feature-flags header).
 *
 * Zero I/O, pure byte reads, no allocation beyond the returned object. Used
 * by `POST /api/actividades/imagen` to reject anything that is not really a
 * WebP image and to read its natural pixel size before it ever reaches
 * Supabase Storage.
 */

export interface WebpDimensions {
  width: number;
  height: number;
}

/** RIFF chunk header size: 4-byte fourCC + 4-byte little-endian length. */
const CHUNK_HEADER_SIZE = 8;
/** Offset of the first sub-chunk's payload: 12-byte RIFF/WEBP header + 8-byte chunk header. */
const FIRST_CHUNK_PAYLOAD_OFFSET = 12 + CHUNK_HEADER_SIZE;

/**
 * Bytes 0-3 `"RIFF"`, bytes 8-11 `"WEBP"` — the whole container magic,
 * ignoring the RIFF size field at bytes 4-7 (which this parser never trusts
 * anyway; every read below is bounds-checked against the buffer's actual
 * length instead).
 */
export function hasWebpMagic(bytes: Uint8Array): boolean {
  if (bytes.length < FIRST_CHUNK_PAYLOAD_OFFSET) return false;
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50 // "WEBP"
  );
}

function fourCharCode(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

/**
 * VP8 (lossy) frame header: a 3-byte frame tag, a 3-byte start code
 * (`0x9d 0x01 0x2a`), then two 16-bit little-endian fields whose low 14 bits
 * are width/height (the high 2 bits are an unrelated scale hint).
 */
function parseLossy(bytes: Uint8Array): WebpDimensions | null {
  const start = FIRST_CHUNK_PAYLOAD_OFFSET;
  if (bytes.length < start + 10) return null;
  if (bytes[start + 3] !== 0x9d || bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a) {
    return null;
  }
  const width = readUint16LE(bytes, start + 6) & 0x3fff;
  const height = readUint16LE(bytes, start + 8) & 0x3fff;
  if (width === 0 || height === 0) return null;
  return { width, height };
}

/**
 * VP8L (lossless): a single `0x2f` signature byte, then a packed 32-bit
 * little-endian field: 14 bits width-minus-one, 14 bits height-minus-one,
 * 1 bit alpha flag, 3 bits version (the last two this parser ignores).
 */
function parseLossless(bytes: Uint8Array): WebpDimensions | null {
  const start = FIRST_CHUNK_PAYLOAD_OFFSET;
  if (bytes.length < start + 5) return null;
  if (bytes[start] !== 0x2f) return null;
  const bits = readUint32LE(bytes, start + 1);
  const width = (bits & 0x3fff) + 1;
  const height = ((bits >>> 14) & 0x3fff) + 1;
  return { width, height };
}

/**
 * VP8X (extended): a 1-byte feature-flags field plus 3 reserved bytes, then
 * two 24-bit little-endian "canvas size minus one" fields.
 */
function parseExtended(bytes: Uint8Array): WebpDimensions | null {
  const start = FIRST_CHUNK_PAYLOAD_OFFSET;
  if (bytes.length < start + 10) return null;
  const width = readUint24LE(bytes, start + 4) + 1;
  const height = readUint24LE(bytes, start + 7) + 1;
  return { width, height };
}

/**
 * Read the pixel width/height from a WebP buffer's own container header, or
 * `null` when the buffer is not a well-formed WebP: bad magic, an unknown
 * sub-format, or truncated before the fields the matched sub-format needs.
 */
export function readWebpDimensions(bytes: Uint8Array): WebpDimensions | null {
  if (!hasWebpMagic(bytes)) return null;

  switch (fourCharCode(bytes, 12)) {
    case 'VP8 ':
      return parseLossy(bytes);
    case 'VP8L':
      return parseLossless(bytes);
    case 'VP8X':
      return parseExtended(bytes);
    default:
      return null;
  }
}
