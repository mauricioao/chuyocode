import { describe, expect, it, vi } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

// ActivityCard renders thumbnails through publicImageUrl(), which lazily
// builds a Supabase client from validated env vars. `vi.mock` is hoisted,
// so stub `@lib/env` before the component (and its storage import) loads —
// same pattern as `MediaCard.test.ts`.
vi.mock('@lib/env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: '',
    AD_HMAC_SECRET: '',
  }),
}));

import ActivityCard from './ActivityCard.astro';
import type { PublishedActivityCard } from '@lib/activities/activities';

const baseActivity: PublishedActivityCard = {
  id: 'act-1',
  title: 'Present Perfect Practice',
  level: 'B1',
  blockCount: 5,
  heartCount: 12,
  viewTotal: 340,
  thumbnailPath: null,
  viewedByViewer: false,
} as unknown as PublishedActivityCard;

const baseProps = {
  lang: 'es',
  activity: baseActivity,
  levelLabels: { A1: 'Principiante', A2: 'Básico', B1: 'Intermedio', B2: 'Intermedio alto', C1: 'Avanzado', C2: 'Maestría' },
  noLevel: 'Sin nivel',
  blockCountOne: 'bloque',
  blockCountMany: 'bloques',
  viewedLabel: 'Vista',
};

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await createContainer();
  return container.renderToString(ActivityCard, { props });
}

describe('ActivityCard.astro — default variant (unchanged)', () => {
  it('renders the full-size card with a 16:9 thumbnail area', async () => {
    const html = await render(baseProps);
    expect(html).toContain('data-variant="default"');
    expect(html).toContain('aspect-video');
  });

  it('renders the highlight label as an overlay chip on the thumbnail', async () => {
    const html = await render({ ...baseProps, highlighted: true, highlightLabel: 'Actividad del día' });
    expect(html).toContain('absolute top-2 left-2');
    expect(html).toContain('Actividad del día');
  });

  it('defaults to the default variant when none is given', async () => {
    const html = await render(baseProps);
    expect(html).toContain('data-variant="default"');
  });
});

describe('ActivityCard.astro — compact variant', () => {
  it('renders a fixed-height horizontal row with a small square thumbnail', async () => {
    const html = await render({ ...baseProps, variant: 'compact' });
    expect(html).toContain('data-variant="compact"');
    expect(html).toContain('h-24');
    expect(html).toContain('aspect-square');
  });

  it('truncates the title to one line', async () => {
    const html = await render({ ...baseProps, variant: 'compact' });
    expect(html).toMatch(/truncate[^"]*"[^>]*>\s*Present Perfect Practice/);
  });

  it('renders the level line', async () => {
    const html = await render({ ...baseProps, variant: 'compact' });
    expect(html).toContain('B1 · Intermedio');
  });

  it('renders hearts and views counts', async () => {
    const html = await render({ ...baseProps, variant: 'compact' });
    expect(html).toContain('data-testid="activity-card-hearts"');
    expect(html).toContain('data-testid="activity-card-views"');
    expect(html).toMatch(/activity-card-hearts"[\s\S]*?12/);
    expect(html).toMatch(/activity-card-views"[\s\S]*?340/);
  });

  it('renders the highlight badge inline (not an overlay) when highlighted', async () => {
    const html = await render({ ...baseProps, variant: 'compact', highlighted: true, highlightLabel: 'Top de la semana' });
    expect(html).toContain('Top de la semana');
    expect(html).not.toContain('absolute top-2 left-2');
  });

  it('still emits a single anchor with the activity-card testid (card-count assertions stay valid)', async () => {
    const html = await render({ ...baseProps, variant: 'compact' });
    expect(html.match(/data-testid="activity-card"/g)).toHaveLength(1);
    expect(html).toContain(`href="/es/ingles/actividades/${baseActivity.id}"`);
  });
});
