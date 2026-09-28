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
