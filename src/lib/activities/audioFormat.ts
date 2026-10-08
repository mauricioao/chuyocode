/**
 * Minimal audio container sniffing — the audio counterpart of `webp.ts`.
 *
 * Verifies a buffer's magic bytes actually match the content-type the
 * uploader CLAIMS it is, for every format `POST /api/actividades/audio`
 * accepts: `audio/webm` (also covers a `MediaRecorder` recording, which the
 * editor records as WebM/Opus), `audio/mp4`/`audio/x-m4a`, `audio/mpeg`
 * (mp3), `audio/ogg`, and `audio/wav`. Zero I/O, pure byte reads — same
 * posture as `webp.ts`: enough to reject something that is not really what
 * it claims to be, without decoding any audio data.
 */

/** WebM/Matroska's own EBML magic (also every `MediaRecorder` WebM recording): `1A 45 DF A3`. */
export function hasWebmMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

/**
 * ISO base media file format (MP4/M4A): a 4-byte box size, then the box
 * type `"ftyp"` at bytes 4-7 — the size itself is never trusted (several
 * encoders emit different values there), only the type.
 */
export function hasMp4Magic(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70; // "ftyp"
}

/**
 * MP3: either an `"ID3"` tag (0x49 0x44 0x33) at the very start, or a bare
 * MPEG frame sync — byte 0 all-ones (`0xFF`) and byte 1's top three bits
 * also set (`& 0xE0 === 0xE0`).
 */
export function hasMp3Magic(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true; // "ID3"
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

/** Ogg container magic: `"OggS"`. */
export function hasOggMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  );
}

/** WAV: `"RIFF"` at bytes 0-3, `"WAVE"` at bytes 8-11 — ignores the RIFF size field (bytes 4-7), same posture as `webp.ts`'s own RIFF check. */
export function hasWavMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45 // "WAVE"
  );
}

/** content-type -> its own magic-byte check, one entry per `AUDIO_EXTENSIONS` key (`paths.ts`). */
const AUDIO_MAGIC_CHECKS: Readonly<Record<string, (bytes: Uint8Array) => boolean>> = {
  'audio/webm': hasWebmMagic,
  'audio/mp4': hasMp4Magic,
  'audio/x-m4a': hasMp4Magic,
  'audio/mpeg': hasMp3Magic,
  'audio/ogg': hasOggMagic,
  'audio/wav': hasWavMagic,
};

/**
 * Does `bytes` actually look like `contentType` claims? `false` for an
 * unrecognized content-type too — the caller (`audio.ts`) only ever calls
 * this after already checking `contentType` against `AUDIO_EXTENSIONS`.
 */
export function matchesAudioMagicBytes(contentType: string, bytes: Uint8Array): boolean {
  const check = AUDIO_MAGIC_CHECKS[contentType];
  return check !== undefined && check(bytes);
}
