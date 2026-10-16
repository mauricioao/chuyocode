import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { activityResult, editActivityResult } = vi.hoisted(() => ({
  activityResult: { value: null as unknown },
  // Author preview (R1): the fallback read, tried only once
  // `getPublishedActivity` returns `null` AND a visitor is signed in.
  editActivityResult: { value: null as unknown },
}));

const getActivityForEditMock = vi.fn(async (..._args: unknown[]) => editActivityResult.value);
vi.mock('@lib/activities/activities', () => ({
  getPublishedActivity: vi.fn(async () => activityResult.value),
  getActivityForEdit: (...args: unknown[]) => getActivityForEditMock(...args),
}));

import PresentarPage from './presentar.astro';

async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(PresentarPage, {
    locals: { user: { id: 'user-1' }, ...locals } as unknown as App.Locals,
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  activityResult.value = null;
  editActivityResult.value = null;
  getActivityForEditMock.mockClear();
});

const QUIZ_ACTIVITY = {
  id: 'abc',
  title: 'Present simple: ir de compras',
  level: 'A2',
  blocks: [
    {
      id: 'q1',
      type: 'quiz',
      payload: {
        pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }] },
        slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'choice', pool: 'opts', answer: ['b'] }],
      },
    },
  ],
};

const WORKSHEET_ONLY_ACTIVITY = {
  id: 'abc',
  title: 'x',
  level: null,
  blocks: [
    {
      id: 'w1',
      type: 'worksheet',
      rotation: 0,
      image: { path: 'activity-images/abc/img-1.webp', width: 800, height: 400 },
      zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['cat'] }],
    },
  ],
};

const EMPTY_QUIZ_ACTIVITY = {
  id: 'abc',
  title: 'x',
  level: null,
  blocks: [{ id: 'q1', type: 'quiz', payload: { pools: {}, slots: [] } }],
};

describe('GET /[lang]/ingles/actividades/[id]/presentar — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/ingles/actividades/abc/presentar', {
      params: { lang: 'fr', id: 'abc' },
      locals: { lang: undefined },
    });
    expect(res.status).toBe(404);
  });

  it('404s when no visible activity matches — the same status the practice page gives (mirrors [id].astro)', async () => {
    activityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(404);
  });

  it('404s with private cache headers', async () => {
    activityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/ingles/actividades/[id]/presentar — defensive presentable-content gate', () => {
  it('404s when the activity has no blocks at all', async () => {
    activityResult.value = { ...WORKSHEET_ONLY_ACTIVITY, blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(404);
  });

  it('404s when the only quiz block has zero questions', async () => {
    activityResult.value = EMPTY_QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(404);
  });

  it('404s when the only worksheet block has an image but no zones', async () => {
    activityResult.value = {
      ...WORKSHEET_ONLY_ACTIVITY,
      blocks: [{ ...WORKSHEET_ONLY_ACTIVITY.blocks[0], zones: [] }],
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(404);
  });

  it('renders (does NOT 404) for a worksheet-only activity — the worksheet zoom tour, sprint week 3', async () => {
    activityResult.value = WORKSHEET_ONLY_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(200);
  });
});

describe('GET /[lang]/ingles/actividades/[id]/presentar — rendering', () => {
  it('returns 200 with private cache headers for an activity with at least one question', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns 200 for a ChuyoCode-owned activity (NULL authorId, 0020 account deletion transfer)', async () => {
    activityResult.value = { ...QUIZ_ACTIVITY, authorId: null };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(200);
  });

  it('opens directly on the first content slide, not the cover (owner feedback 2026-10-06)', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="presentation-question-s1"');
    expect(html).not.toContain('data-testid="presentation-slide-cover"');
    // The title/level still ship to the client (for the cover, still reachable via "previous") — see the island's own serialized props.
    expect(html).toContain('Present simple: ir de compras');
    expect(html).toContain('A2');
  });

  it('shows the QR overlay (auto-open on the first slide, P1), never a QR baked into the cover slide itself (owner feedback 2026-10-06)', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="presentation-qr-overlay"');
    expect(html).not.toContain('data-testid="presentation-cover-qr"');
  });

  // N7 (join by QR from the start): the on-demand overlay now opens BY
  // DEFAULT on the first slide a class ever sees — see
  // `PresentationIsland.test.tsx`'s own "N7" describe block for the full
  // behavior (auto-hide on "Siguiente", toggle/`Q` still working
  // afterwards); this only confirms the real route wires a real `qrSvg`
  // through, so that default-open state has something to show.
  it('shows the QR overlay with the "scan to play" line by default, right in the SSR markup', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="presentation-qr-overlay"');
    expect(html).toContain('Escanea para jugar en tu celular');
    // The overlay's own close button — no separate bar toggle anymore (P1
    // control-bar restructure), the overlay itself is the "it's open" signal.
    expect(html).toContain('data-testid="presentation-qr-overlay-close"');
  });

  // N7 (next step at the end): "Otra actividad" — same URL logic as the
  // practice page's own `nextActivityHref` (`[id].astro`'s own header) —
  // wired into the island's serialized props, same pattern
  // `_[id].test.ts`'s own `signUpHref` check uses for a client-only prop.
  describe('— "Otra actividad" wiring (N7)', () => {
    it('filters the catalog by level when the activity has one', async () => {
      activityResult.value = QUIZ_ACTIVITY; // level: 'A2'
      const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
        params: { lang: 'es', id: 'abc' },
      });
      const html = await res.text();
      expect(html).toContain(
        'nextActivityHref&quot;:[0,&quot;/es/ingles/actividades?nivel=A2&quot;',
      );
    });

    it('points at the unfiltered catalog when the activity has no level', async () => {
      activityResult.value = WORKSHEET_ONLY_ACTIVITY; // level: null
      const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
        params: { lang: 'es', id: 'abc' },
      });
      const html = await res.text();
      expect(html).toContain('nextActivityHref&quot;:[0,&quot;/es/ingles/actividades&quot;');
    });
  });

  it('has no site header/footer chrome (bare layout)', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).not.toContain('<header');
    expect(html).not.toContain('<footer');
  });

  it('ships the worksheet block to the client too — the worksheet zoom tour needs its image/zones (sprint week 3)', async () => {
    activityResult.value = {
      ...QUIZ_ACTIVITY,
      blocks: [WORKSHEET_ONLY_ACTIVITY.blocks[0], ...QUIZ_ACTIVITY.blocks],
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    // Serialized straight into the island's own props for hydration — the
    // client-only `imagePreviewUrl()` resolution happens later, inside the
    // island itself, never during this server render.
    expect(html).toContain('activity-images/abc/img-1.webp');
    expect(html).toContain('data-testid="presentation-worksheet-viewport"');
  });

  it('returns 200 in English', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/en/ingles/actividades/abc/presentar', {
      params: { lang: 'en', id: 'abc' },
    });
    expect(res.status).toBe(200);
  });
});

// Guest play: this route has no user-dependent branching of its own (no
// hearts/report/duplicate here) — it only needed the login gate removed
// (`@lib/access`'s `isPublicActivityRoute`, covered by `middleware.test.ts`).
// This confirms the page's own frontmatter already renders correctly with no
// session at all.
describe('GET /[lang]/ingles/actividades/[id]/presentar — guest play (anonymous visitor)', () => {
  it('returns 200 with private cache headers for an anonymous visitor', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const html = await res.text();
    expect(html).toContain('data-testid="presentation-question-s1"');
  });

  it('404s an anonymous visit to a draft/unpublished activity, same as a missing one', async () => {
    activityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    expect(res.status).toBe(404);
  });

  it('still shows the join QR overlay (pointing at the now-public practice page) for an anonymous visitor', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="presentation-qr-overlay"');
    expect(html).toContain('/es/ingles/actividades/abc');
  });
});

// Owner decision 2026-10-12 (R1): the author can present their OWN
// unpublished activity too, but the join QR must never be offered for real
// (it would 404 for a student) -- the toggle/`Q` shortcut stays reachable,
// it just shows the owner's message instead of opening a real QR.
describe('GET /[lang]/ingles/actividades/[id]/presentar -- author preview of an unpublished activity (owner decision 2026-10-12)', () => {
  const DRAFT_EDIT = {
    id: 'abc',
    title: 'Mi borrador',
    level: 'A2',
    blocks: QUIZ_ACTIVITY.blocks,
    revisionId: 'rev-1',
    revisionStatus: 'draft',
    status: 'draft',
    reviewNote: null,
    source: null,
  };

  it('404s for an anonymous visitor (never falls back to getActivityForEdit with no user)', async () => {
    activityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    expect(res.status).toBe(404);
    expect(getActivityForEditMock).not.toHaveBeenCalled();
  });

  it('404s for a different signed-in visitor, not this activity author', async () => {
    activityResult.value = null;
    editActivityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'stranger-1' } },
    });
    expect(res.status).toBe(404);
  });

  it('renders 200 for the own author, a draft', async () => {
    activityResult.value = null;
    editActivityResult.value = DRAFT_EDIT;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Mi borrador');
  });

  it('does NOT open the QR overlay by default (it would 404 for a student)', async () => {
    activityResult.value = null;
    editActivityResult.value = DRAFT_EDIT;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="presentation-qr-overlay"');
  });

  it('still ships the blocked message to the client (the "Q" shortcut stays reachable), never a real QR code in the markup', async () => {
    activityResult.value = null;
    editActivityResult.value = DRAFT_EDIT;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    // No bar button to assert on anymore (P1 control-bar restructure, QR is
    // keyboard-only via "Q") — the client-side gate is the serialized
    // `qrBlockedMessage` prop itself, present either way.
    expect(html).toContain('No se puede compartir la actividad');
    expect(html).not.toContain('data-testid="presentation-qr-overlay-image"');
  });

  it('the author preview response is never cacheable (private, no-store)', async () => {
    activityResult.value = null;
    editActivityResult.value = DRAFT_EDIT;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('still offers "Otra actividad" at the end screen', async () => {
    activityResult.value = null;
    editActivityResult.value = DRAFT_EDIT;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('nextActivityHref&quot;:[0,&quot;/es/ingles/actividades?nivel=A2&quot;');
  });
});
