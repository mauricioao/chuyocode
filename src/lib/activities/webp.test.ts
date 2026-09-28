import { describe, it, expect } from 'vitest';
import { hasWebpMagic, readWebpDimensions } from './webp';

/**
 * Fixture builders assemble byte-for-byte valid WebP container headers per
 * the WebP Container Specification / VP8 Data Format and Decoding Guide:
 * RIFF framing (`"RIFF"` + size + `"WEBP"`), a sub-chunk header
 * (`fourCC` + size), then the sub-format's own header fields. Pixel data
 * beyond what the parser reads is never generated — these are real,
 * spec-accurate headers, not decodable images.
 */

function asciiBytes(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

function writeUint32LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}

function buildContainer(fourCC: string, payload: Uint8Array): Uint8Array {
  const chunkSize = payload.length;
  const riffSize = 4 + 8 + chunkSize; // "WEBP" + this chunk's 8-byte header + payload
  const buf = new Uint8Array(8 + riffSize);
  buf.set(asciiBytes('RIFF'), 0);
  writeUint32LE(buf, 4, riffSize);
  buf.set(asciiBytes('WEBP'), 8);
  buf.set(asciiBytes(fourCC), 12);
  writeUint32LE(buf, 16, chunkSize);
  buf.set(payload, 20);
  return buf;
}

function buildLossyWebp(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  // Frame tag (3 bytes): key frame (bit 0 = 0), rest arbitrary.
  payload[0] = 0x10;
  payload[1] = 0x00;
  payload[2] = 0x00;
  // Start code.
  payload[3] = 0x9d;
  payload[4] = 0x01;
  payload[5] = 0x2a;
  // width/height, 14 bits each, little-endian, scale bits (top 2) left 0.
  payload[6] = width & 0xff;
  payload[7] = (width >>> 8) & 0x3f;
  payload[8] = height & 0xff;
  payload[9] = (height >>> 8) & 0x3f;
  return buildContainer('VP8 ', payload);
}

function buildLosslessWebp(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(5);
  payload[0] = 0x2f; // signature
  const bits = (((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14)) >>> 0;
  writeUint32LE(payload, 1, bits);
  return buildContainer('VP8L', payload);
}

function buildExtendedWebp(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  payload[0] = 0x00; // feature flags, none set
  // bytes 1-3 reserved, left 0
  const w = width - 1;
  const h = height - 1;
  payload[4] = w & 0xff;
  payload[5] = (w >>> 8) & 0xff;
  payload[6] = (w >>> 16) & 0xff;
  payload[7] = h & 0xff;
  payload[8] = (h >>> 8) & 0xff;
  payload[9] = (h >>> 16) & 0xff;
  return buildContainer('VP8X', payload);
}

describe('hasWebpMagic', () => {
  it('accepts a real RIFF/WEBP header (lossy)', () => {
    expect(hasWebpMagic(buildLossyWebp(200, 200))).toBe(true);
  });

  it('rejects a PNG signature', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(hasWebpMagic(png)).toBe(false);
  });

  it('rejects a JPEG signature', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(hasWebpMagic(jpeg)).toBe(false);
  });

  it('rejects a RIFF file that is not WEBP (e.g. WAV)', () => {
    const wav = buildContainer('fmt ', new Uint8Array(4));
    wav.set(asciiBytes('WAVE'), 8);
    expect(hasWebpMagic(wav)).toBe(false);
  });

  it('rejects an empty buffer', () => {
    expect(hasWebpMagic(new Uint8Array(0))).toBe(false);
  });

  it('rejects a buffer truncated before the WEBP tag', () => {
    expect(hasWebpMagic(new Uint8Array(10))).toBe(false);
  });
});

describe('readWebpDimensions — VP8 (lossy)', () => {
  it.each([
    [200, 200],
    [1600, 900],
    [2400, 2400],
    [1, 1],
    [16383, 16383], // max 14-bit value
  ])('reads %i x %i from a lossy header', (width, height) => {
    expect(readWebpDimensions(buildLossyWebp(width, height))).toEqual({ width, height });
  });

  it('rejects a corrupted start code', () => {
    const bytes = buildLossyWebp(200, 200);
    bytes[23] = 0x00; // corrupt the 0x9d byte of the start code
    expect(readWebpDimensions(bytes)).toBeNull();
  });

  it('rejects a chunk truncated before the width/height fields', () => {
    const bytes = buildLossyWebp(200, 200).slice(0, 25);
    expect(readWebpDimensions(bytes)).toBeNull();
  });
});

describe('readWebpDimensions — VP8L (lossless)', () => {
  it.each([
    [200, 200],
    [1600, 900],
    [1, 1],
    [16384, 16384], // max 14-bit-plus-one value
  ])('reads %i x %i from a lossless header', (width, height) => {
    expect(readWebpDimensions(buildLosslessWebp(width, height))).toEqual({ width, height });
  });

  it('rejects a wrong signature byte', () => {
    const bytes = buildLosslessWebp(200, 200);
    bytes[20] = 0x00;
    expect(readWebpDimensions(bytes)).toBeNull();
  });

  it('rejects a chunk truncated before the packed size field', () => {
    const bytes = buildLosslessWebp(200, 200).slice(0, 22);
    expect(readWebpDimensions(bytes)).toBeNull();
  });
});

describe('readWebpDimensions — VP8X (extended)', () => {
  it.each([
    [200, 200],
    [1600, 900],
    [2400, 1200],
  ])('reads %i x %i from an extended header', (width, height) => {
    expect(readWebpDimensions(buildExtendedWebp(width, height))).toEqual({ width, height });
  });

  it('rejects a chunk truncated before the canvas size fields', () => {
    const bytes = buildExtendedWebp(200, 200).slice(0, 24);
    expect(readWebpDimensions(bytes)).toBeNull();
  });
});

describe('readWebpDimensions — malformed input', () => {
  it('rejects a non-WebP buffer outright', () => {
    expect(readWebpDimensions(new Uint8Array(30))).toBeNull();
  });

  it('rejects an unknown fourCC', () => {
    const bytes = buildContainer('VP9 ', new Uint8Array(10));
    expect(readWebpDimensions(bytes)).toBeNull();
  });

  it('rejects an empty buffer', () => {
    expect(readWebpDimensions(new Uint8Array(0))).toBeNull();
  });
});
