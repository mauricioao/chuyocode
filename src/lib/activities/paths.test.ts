import { describe, it, expect } from 'vitest';
import {
  UPLOADS_BUCKET,
  IMAGES_BUCKET,
  isUuid,
  uploadPath,
  approvedImagePath,
  parseImagePath,
  isOwnUploadPath,
  isPublicImagePath,
  AUDIO_UPLOADS_BUCKET,
  AUDIO_BUCKET,
  uploadAudioPath,
  approvedAudioPath,
  parseAudioPath,
  isOwnAudioUploadPath,
  isPublicAudioPath,
  audioPreviewUrl,
} from './paths';

const USER = 'a1b2c3d4-0000-4000-8000-000000000001';
const OTHER_USER = 'a1b2c3d4-0000-4000-8000-000000000002';
const ACTIVITY = 'a1b2c3d4-0000-4000-8000-000000000099';
const OBJECT = 'f1e2d3c4-0000-4000-8000-0000000000ff';

describe('isUuid', () => {
  it('accepts a canonical uuid', () => {
    expect(isUuid(USER)).toBe(true);
  });

  it('accepts an uppercase uuid (case-insensitive)', () => {
    expect(isUuid(USER.toUpperCase())).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['too short', 'a1b2c3d4'],
    ['missing dashes', 'a1b2c3d40000400080000000000001'],
    ['wrong segment length', 'a1b2c3d-0000-4000-8000-000000000001'],
    ['non-hex characters', 'g1b2c3d4-0000-4000-8000-000000000001'],
    ['trailing garbage', `${USER}x`],
    ['path traversal', '../../etc/passwd'],
  ])('rejects %s', (_label, value) => {
    expect(isUuid(value)).toBe(false);
  });
});

describe('uploadPath / approvedImagePath', () => {
  it('builds the uploads-bucket path with the bucket prefix', () => {
    expect(uploadPath(USER, OBJECT)).toBe(`${UPLOADS_BUCKET}/${USER}/${OBJECT}.webp`);
  });

  it('builds the images-bucket path with the bucket prefix', () => {
    expect(approvedImagePath(ACTIVITY, OBJECT)).toBe(
      `${IMAGES_BUCKET}/${ACTIVITY}/${OBJECT}.webp`,
    );
  });
});

describe('parseImagePath', () => {
  it('parses a well-formed uploads path', () => {
    expect(parseImagePath(uploadPath(USER, OBJECT))).toEqual({
      bucket: UPLOADS_BUCKET,
      ownerId: USER,
      objectId: OBJECT,
      objectPath: `${USER}/${OBJECT}.webp`,
    });
  });

  it('parses a well-formed images path', () => {
    expect(parseImagePath(approvedImagePath(ACTIVITY, OBJECT))).toEqual({
      bucket: IMAGES_BUCKET,
      ownerId: ACTIVITY,
      objectId: OBJECT,
      objectPath: `${ACTIVITY}/${OBJECT}.webp`,
    });
  });

  it('lowercases an uppercase-uuid path on parse', () => {
    const upper = `${UPLOADS_BUCKET}/${USER.toUpperCase()}/${OBJECT.toUpperCase()}.webp`;
    expect(parseImagePath(upper)).toEqual({
      bucket: UPLOADS_BUCKET,
      ownerId: USER,
      objectId: OBJECT,
      objectPath: `${USER}/${OBJECT}.webp`,
    });
  });

  it.each([
    ['a bare URL', `https://evil.example/${UPLOADS_BUCKET}/${USER}/${OBJECT}.webp`],
    ['an unknown bucket', `other-bucket/${USER}/${OBJECT}.webp`],
    ['path traversal in the owner segment', `${UPLOADS_BUCKET}/../${OBJECT}.webp`],
    ['path traversal via dot-dot segment', `${UPLOADS_BUCKET}/${USER}/../../../etc/passwd`],
    ['a non-uuid owner segment', `${UPLOADS_BUCKET}/not-a-uuid/${OBJECT}.webp`],
    ['a non-uuid object name', `${UPLOADS_BUCKET}/${USER}/not-a-uuid.webp`],
    ['a non-webp extension', `${UPLOADS_BUCKET}/${USER}/${OBJECT}.png`],
    ['no extension', `${UPLOADS_BUCKET}/${USER}/${OBJECT}`],
    ['an extra path segment', `${UPLOADS_BUCKET}/${USER}/nested/${OBJECT}.webp`],
    ['a missing owner segment', `${UPLOADS_BUCKET}/${OBJECT}.webp`],
    ['a data: URI', `data:image/webp;base64,AAAA`],
    ['empty string', ''],
  ])('rejects %s', (_label, path) => {
    expect(parseImagePath(path)).toBeNull();
  });
});

describe('isOwnUploadPath', () => {
  it('accepts the caller\'s own upload path', () => {
    expect(isOwnUploadPath(uploadPath(USER, OBJECT), USER)).toBe(true);
  });

  it('rejects another user\'s upload folder', () => {
    expect(isOwnUploadPath(uploadPath(OTHER_USER, OBJECT), USER)).toBe(false);
  });

  it('rejects a well-formed path in the wrong bucket', () => {
    expect(isOwnUploadPath(approvedImagePath(USER, OBJECT), USER)).toBe(false);
  });

  it('rejects a malformed caller id', () => {
    expect(isOwnUploadPath(uploadPath(USER, OBJECT), 'not-a-uuid')).toBe(false);
  });

  it('rejects a traversal attempt regardless of caller id', () => {
    expect(isOwnUploadPath(`${UPLOADS_BUCKET}/../${OBJECT}.webp`, USER)).toBe(false);
  });
});

describe('isPublicImagePath', () => {
  it('accepts a well-formed images-bucket path', () => {
    expect(isPublicImagePath(approvedImagePath(ACTIVITY, OBJECT))).toBe(true);
  });

  it('rejects a well-formed uploads-bucket path', () => {
    expect(isPublicImagePath(uploadPath(USER, OBJECT))).toBe(false);
  });

  it('rejects garbage', () => {
    expect(isPublicImagePath('../../etc/passwd')).toBe(false);
  });
});

describe('uploadAudioPath / approvedAudioPath', () => {
  it('builds the audio-uploads-bucket path with the bucket prefix and given extension', () => {
    expect(uploadAudioPath(USER, OBJECT, 'webm')).toBe(`${AUDIO_UPLOADS_BUCKET}/${USER}/${OBJECT}.webm`);
  });

  it('builds the audio-bucket path with the bucket prefix and given extension', () => {
    expect(approvedAudioPath(ACTIVITY, OBJECT, 'mp3')).toBe(`${AUDIO_BUCKET}/${ACTIVITY}/${OBJECT}.mp3`);
  });
});

describe('parseAudioPath', () => {
  it.each(['webm', 'm4a', 'mp3', 'ogg', 'wav'])('parses a well-formed uploads path for .%s', (ext) => {
    expect(parseAudioPath(uploadAudioPath(USER, OBJECT, ext))).toEqual({
      bucket: AUDIO_UPLOADS_BUCKET,
      ownerId: USER,
      objectId: OBJECT,
      ext,
      objectPath: `${USER}/${OBJECT}.${ext}`,
    });
  });

  it('parses a well-formed audio-bucket path', () => {
    expect(parseAudioPath(approvedAudioPath(ACTIVITY, OBJECT, 'wav'))).toEqual({
      bucket: AUDIO_BUCKET,
      ownerId: ACTIVITY,
      objectId: OBJECT,
      ext: 'wav',
      objectPath: `${ACTIVITY}/${OBJECT}.wav`,
    });
  });

  it('lowercases an uppercase-uuid path on parse', () => {
    const upper = `${AUDIO_UPLOADS_BUCKET}/${USER.toUpperCase()}/${OBJECT.toUpperCase()}.WEBM`;
    expect(parseAudioPath(upper)).toEqual({
      bucket: AUDIO_UPLOADS_BUCKET,
      ownerId: USER,
      objectId: OBJECT,
      ext: 'webm',
      objectPath: `${USER}/${OBJECT}.webm`,
    });
  });

  it.each([
    ['a bare URL', `https://evil.example/${AUDIO_UPLOADS_BUCKET}/${USER}/${OBJECT}.webm`],
    ['an unknown bucket', `other-bucket/${USER}/${OBJECT}.webm`],
    ['an image bucket (not an audio one)', `${UPLOADS_BUCKET}/${USER}/${OBJECT}.webm`],
    ['path traversal in the owner segment', `${AUDIO_UPLOADS_BUCKET}/../${OBJECT}.webm`],
    ['a non-uuid owner segment', `${AUDIO_UPLOADS_BUCKET}/not-a-uuid/${OBJECT}.webm`],
    ['a non-uuid object name', `${AUDIO_UPLOADS_BUCKET}/${USER}/not-a-uuid.webm`],
    ['an unaccepted extension', `${AUDIO_UPLOADS_BUCKET}/${USER}/${OBJECT}.exe`],
    ['no extension', `${AUDIO_UPLOADS_BUCKET}/${USER}/${OBJECT}`],
    ['an extra path segment', `${AUDIO_UPLOADS_BUCKET}/${USER}/nested/${OBJECT}.webm`],
    ['empty string', ''],
  ])('rejects %s', (_label, path) => {
    expect(parseAudioPath(path)).toBeNull();
  });
});

describe('isOwnAudioUploadPath', () => {
  it("accepts the caller's own audio upload path", () => {
    expect(isOwnAudioUploadPath(uploadAudioPath(USER, OBJECT, 'webm'), USER)).toBe(true);
  });

  it("rejects another user's audio uploads folder", () => {
    expect(isOwnAudioUploadPath(uploadAudioPath(OTHER_USER, OBJECT, 'webm'), USER)).toBe(false);
  });

  it('rejects a well-formed audio path in the wrong bucket', () => {
    expect(isOwnAudioUploadPath(approvedAudioPath(USER, OBJECT, 'webm'), USER)).toBe(false);
  });

  it('rejects a malformed caller id', () => {
    expect(isOwnAudioUploadPath(uploadAudioPath(USER, OBJECT, 'webm'), 'not-a-uuid')).toBe(false);
  });
});

describe('isPublicAudioPath', () => {
  it('accepts a well-formed audio-bucket path', () => {
    expect(isPublicAudioPath(approvedAudioPath(ACTIVITY, OBJECT, 'webm'))).toBe(true);
  });

  it('rejects a well-formed audio-uploads-bucket path', () => {
    expect(isPublicAudioPath(uploadAudioPath(USER, OBJECT, 'webm'))).toBe(false);
  });

  it('rejects garbage', () => {
    expect(isPublicAudioPath('../../etc/passwd')).toBe(false);
  });
});

describe('audioPreviewUrl', () => {
  it('builds the preview endpoint URL with the path encoded as a query param', () => {
    const path = uploadAudioPath(USER, OBJECT, 'webm');
    expect(audioPreviewUrl(path)).toBe(`/api/actividades/audio?path=${encodeURIComponent(path)}`);
  });
});
