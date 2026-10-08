import { describe, it, expect } from 'vitest';
import {
  hasWebmMagic,
  hasMp4Magic,
  hasMp3Magic,
  hasOggMagic,
  hasWavMagic,
  matchesAudioMagicBytes,
} from './audioFormat';

const WEBM = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
const MP4 = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
const MP3_ID3 = Uint8Array.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0]);
const MP3_FRAME_SYNC = Uint8Array.from([0xff, 0xfb, 0x90, 0]);
const OGG = Uint8Array.from([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0]);
const WAV = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
const GARBAGE = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

describe('hasWebmMagic', () => {
  it('accepts the EBML header', () => {
    expect(hasWebmMagic(WEBM)).toBe(true);
  });
  it('rejects garbage and a too-short buffer', () => {
    expect(hasWebmMagic(GARBAGE)).toBe(false);
    expect(hasWebmMagic(Uint8Array.from([0x1a, 0x45]))).toBe(false);
  });
});

describe('hasMp4Magic', () => {
  it('accepts an "ftyp" box regardless of its own size field', () => {
    expect(hasMp4Magic(MP4)).toBe(true);
  });
  it('rejects garbage and a too-short buffer', () => {
    expect(hasMp4Magic(GARBAGE)).toBe(false);
    expect(hasMp4Magic(Uint8Array.from([0, 0, 0]))).toBe(false);
  });
});

describe('hasMp3Magic', () => {
  it('accepts an ID3 tag', () => {
    expect(hasMp3Magic(MP3_ID3)).toBe(true);
  });
  it('accepts a bare MPEG frame sync', () => {
    expect(hasMp3Magic(MP3_FRAME_SYNC)).toBe(true);
  });
  it('rejects garbage and a too-short buffer', () => {
    expect(hasMp3Magic(GARBAGE)).toBe(false);
    expect(hasMp3Magic(Uint8Array.from([0xff]))).toBe(false);
  });
});

describe('hasOggMagic', () => {
  it('accepts the "OggS" magic', () => {
    expect(hasOggMagic(OGG)).toBe(true);
  });
  it('rejects garbage', () => {
    expect(hasOggMagic(GARBAGE)).toBe(false);
  });
});

describe('hasWavMagic', () => {
  it('accepts a RIFF/WAVE header', () => {
    expect(hasWavMagic(WAV)).toBe(true);
  });
  it('rejects a RIFF header that is not WAVE (e.g. a renamed WebP), and garbage', () => {
    const riffNotWave = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(hasWavMagic(riffNotWave)).toBe(false);
    expect(hasWavMagic(GARBAGE)).toBe(false);
  });
});

describe('matchesAudioMagicBytes', () => {
  it.each([
    ['audio/webm', WEBM],
    ['audio/mp4', MP4],
    ['audio/x-m4a', MP4],
    ['audio/mpeg', MP3_ID3],
    ['audio/ogg', OGG],
    ['audio/wav', WAV],
  ])('matches %s against its own bytes', (contentType, bytes) => {
    expect(matchesAudioMagicBytes(contentType, bytes)).toBe(true);
  });

  it('rejects a mismatched content-type/bytes pair', () => {
    expect(matchesAudioMagicBytes('audio/wav', WEBM)).toBe(false);
    expect(matchesAudioMagicBytes('audio/webm', WAV)).toBe(false);
  });

  it('rejects an unrecognized content-type', () => {
    expect(matchesAudioMagicBytes('audio/flac', WAV)).toBe(false);
  });
});
