import { describe, it, expect } from 'vitest';

// image.ts builds a `@sanity/image-url` builder from validated env vars at first
// use. Provide the required vars so loadEnv() passes without a real environment.
import { vi } from 'vitest';
vi.mock('./env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: '',
    AD_HMAC_SECRET: '',
  }),
}));

import { buildImage, type MediaVariant } from './image';

// A resolved cover as produced by the `cover.asset->{url, "lqip": metadata.lqip}`
// GROQ projection. The url embeds project/dataset/asset id like a real CDN URL.
const COVER_URL =
  'https://cdn.sanity.io/images/proj/production/abc123-800x1200.jpg';

const withLqip = {
  asset: {
    url: COVER_URL,
    metadata: { lqip: 'data:image/jpeg;base64,QUJD' },
  },
};

// Parse the width descriptors ("<url> <w>w") out of a srcset string.
function srcsetWidths(srcset: string): number[] {
  return srcset
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => Number(c.split(/\s+/)[1]?.replace('w', '')));
}

describe('buildImage srcset', () => {
  it.each<MediaVariant>(['poster', 'wide', 'ranked'])(
    'emits at least 3 width descriptors with ?w=&auto=format for %s',
    (variant) => {
      const { srcset } = buildImage(withLqip, variant);
      const candidates = srcset.split(',').map((c) => c.trim());
      expect(candidates.length).toBeGreaterThanOrEqual(3);
      for (const candidate of candidates) {
        const [url, descriptor] = candidate.split(/\s+/);
        expect(url).toContain('?w=');
        expect(url).toContain('auto=format');
        expect(descriptor).toMatch(/^\d+w$/);
      }
    },
  );

  it('uses variant-specific widths', () => {
    expect(srcsetWidths(buildImage(withLqip, 'poster').srcset)).toEqual([
      360, 480, 640, 768,
    ]);
    expect(srcsetWidths(buildImage(withLqip, 'wide').srcset)).toEqual([
      640, 960, 1280, 1920,
    ]);
    expect(srcsetWidths(buildImage(withLqip, 'ranked').srcset)).toEqual([
      320, 420, 560,
    ]);
  });

  it('never emits a raw full-resolution URL (all candidates carry ?w=)', () => {
    const { src, srcset } = buildImage(withLqip, 'wide');
    expect(src).toContain('?w=');
    for (const candidate of srcset.split(',')) {
      expect(candidate).toContain('?w=');
    }
  });

  it('sets src to the largest variant width', () => {
    const { src } = buildImage(withLqip, 'poster');
    expect(src).toContain('w=768');
  });
});

describe('buildImage sizes', () => {
  it('returns the poster sizes hint', () => {
    expect(buildImage(withLqip, 'poster').sizes).toBe(
      '(min-width: 640px) 18rem, 12rem',
    );
  });

  it('returns the wide sizes hint', () => {
    expect(buildImage(withLqip, 'wide').sizes).toBe(
      '(min-width: 1024px) 38rem, 100vw',
    );
  });

  it('returns the ranked sizes hint', () => {
    expect(buildImage(withLqip, 'ranked').sizes).toBe('11rem');
  });
});

describe('buildImage lqip', () => {
  it('passes through metadata.lqip when present', () => {
    expect(buildImage(withLqip, 'poster').lqip).toBe(
      'data:image/jpeg;base64,QUJD',
    );
  });

  it('omits lqip when metadata has no lqip (graceful fallback)', () => {
    const result = buildImage(
      { asset: { url: COVER_URL } },
      'poster',
    );
    expect(result.lqip).toBeUndefined();
    // Responsive attributes still render without a placeholder.
    expect(result.srcset).not.toBe('');
    expect(result.src).not.toBe('');
  });

  it('omits lqip when metadata.lqip is an empty string', () => {
    const result = buildImage(
      { asset: { url: COVER_URL, metadata: { lqip: '' } } },
      'poster',
    );
    expect(result.lqip).toBeUndefined();
  });
});

describe('buildImage safe defaults', () => {
  it('returns empty src/srcset for a missing asset', () => {
    const result = buildImage({}, 'poster');
    expect(result.src).toBe('');
    expect(result.srcset).toBe('');
    expect(result.lqip).toBeUndefined();
    // sizes stays populated so the <img> keeps its layout hint.
    expect(result.sizes).toBe('(min-width: 640px) 18rem, 12rem');
  });

  it('returns empty src/srcset for a null asset', () => {
    const result = buildImage({ asset: null }, 'wide');
    expect(result.src).toBe('');
    expect(result.srcset).toBe('');
  });

  it('returns empty src/srcset for an asset with no url or _ref', () => {
    const result = buildImage({ asset: { metadata: { lqip: 'x' } } }, 'ranked');
    expect(result.src).toBe('');
    expect(result.srcset).toBe('');
  });

  it('builds from a raw _ref when no url is present', () => {
    const result = buildImage(
      { asset: { _ref: 'image-abc123-800x1200-jpg' } },
      'poster',
    );
    expect(result.src).toContain('?w=');
    expect(srcsetWidths(result.srcset).length).toBeGreaterThanOrEqual(3);
  });
});
