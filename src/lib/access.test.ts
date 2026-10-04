import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

/**
 * `getPlan` now reads `public.user_subscriptions` through the service-role
 * client (mirrors `src/lib/roles.ts`'s pattern, including how it is mocked in
 * `roles.test.ts`): the mock `from().select().eq()` chain resolves to
 * whatever `listResult` holds when awaited.
 */
const { clientState, eqMock, fromMock, listResult } = vi.hoisted(() => {
  const listResult: { value: unknown; throws: Error | null } = {
    value: { data: [], error: null },
    throws: null,
  };
  const builder: Record<string, unknown> = {
    then: (
      onfulfilled: (value: unknown) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => {
      const settled = listResult.throws
        ? Promise.reject(listResult.throws)
        : Promise.resolve(listResult.value);
      return settled.then(onfulfilled, onrejected);
    },
  };
  const eqMock = vi.fn((_column: string, _value: unknown) => builder);
  builder.eq = eqMock;
  const selectMock = vi.fn((_columns: string) => builder);
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return {
    clientState: { available: true },
    eqMock,
    selectMock,
    fromMock,
    listResult,
  };
});

vi.mock('./supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { from: fromMock };
  },
}));

import {
  requiresLogin,
  hasAccess,
  isPublicActivityRoute,
  getPlan,
  clearAccessClient,
  USER_SUBSCRIPTIONS_TABLE,
} from './access';

/** A minimal stand-in for a Supabase `User` — only `id` is ever read here. */
function user(id = 'u1'): User {
  return { id } as User;
}

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  listResult.value = { data: [], error: null };
  listResult.throws = null;
  clearAccessClient();
});

describe('requiresLogin', () => {
  it.each([
    ['/es/ingles', 'the ingles section root'],
    ['/en/ingles', 'the ingles section root, en'],
    ['/es/ingles/A1/present-simple', 'a level/focus path under ingles'],
    ['/es/ingles/A1/present-simple/greetings', 'a full exercise path under ingles'],
    ['/es/cursos', 'the cursos section root'],
    ['/en/cursos', 'the cursos section root, en'],
    ['/es/cursos/react-basico', 'a path under cursos'],
  ])('is true for %s (%s)', (pathname) => {
    expect(requiresLogin(pathname)).toBe(true);
  });

  it.each([
    ['/es/libros', 'libros stays public'],
    ['/es/libros/clean-architecture', 'a book detail path'],
    ['/es/noticias', 'noticias stays public'],
    ['/es/noticias/some-article', 'a news article path'],
    ['/es/', 'the localized home'],
    ['/es/crear', 'the authoring surface (its own gate)'],
    ['/es/inglesx', 'a section name that merely starts with ingles'],
    ['/es/cursosx', 'a section name that merely starts with cursos'],
    ['/', 'the bare root'],
    ['/api/auth/signin', 'an api route'],
  ])('is false for %s (%s)', (pathname) => {
    expect(requiresLogin(pathname)).toBe(false);
  });
});

describe('hasAccess', () => {
  it('grants access to a public section for an anonymous visitor', () => {
    expect(hasAccess(null, '/es/libros')).toBe(true);
  });

  it('grants access to a public section for a signed-in visitor', () => {
    expect(hasAccess(user(), '/es/libros')).toBe(true);
  });

  it('denies a gated section to an anonymous visitor', () => {
    expect(hasAccess(null, '/es/ingles')).toBe(false);
  });

  it('denies a gated cursos path to an anonymous visitor', () => {
    expect(hasAccess(null, '/es/cursos/react-basico')).toBe(false);
  });

  it('grants a gated section to a signed-in visitor (today: login is the whole gate)', () => {
    expect(hasAccess(user(), '/es/ingles')).toBe(true);
    expect(hasAccess(user(), '/es/cursos')).toBe(true);
  });

  // Guest play: the two activity routes are exempt from the gate, for every
  // visitor — the page itself (`getPublishedActivity`) decides whether the
  // activity is actually published.
  it('grants an anonymous visitor the practice page', () => {
    expect(hasAccess(null, '/es/ingles/actividades/abc123')).toBe(true);
  });

  it('grants an anonymous visitor the presentation-mode page', () => {
    expect(hasAccess(null, '/es/ingles/actividades/abc123/presentar')).toBe(true);
  });

  it('still denies an anonymous visitor the activities catalog', () => {
    expect(hasAccess(null, '/es/ingles/actividades')).toBe(false);
  });

  it('still denies an anonymous visitor the print page', () => {
    expect(hasAccess(null, '/es/ingles/actividades/abc123/imprimir')).toBe(false);
  });
});

describe('isPublicActivityRoute', () => {
  it.each([
    ['/es/ingles/actividades/abc123', 'the practice page'],
    ['/en/ingles/actividades/abc123', 'the practice page, en'],
    ['/es/ingles/actividades/abc123/presentar', 'the presentation-mode page'],
  ])('is true for %s (%s)', (pathname) => {
    expect(isPublicActivityRoute(pathname)).toBe(true);
  });

  it.each([
    ['/es/ingles/actividades', 'the catalog itself, no id'],
    ['/es/ingles/actividades/abc123/imprimir', 'the print page'],
    ['/es/ingles/actividades/abc123/presentar/extra', 'an over-long path'],
    ['/es/ingles', 'the ingles hub'],
    ['/es/ingles/propuestos', 'the proposed-activities page'],
    ['/es/ingles/A1/present-simple', 'a curated exercise path'],
    ['/es/cursos/abc123', 'a cursos path (different section)'],
    ['/es/crear/abc123', 'the editor (different section entirely)'],
  ])('is false for %s (%s)', (pathname) => {
    expect(isPublicActivityRoute(pathname)).toBe(false);
  });
});

describe('getPlan', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();

  it('is premium for an active subscription with no end date (manual/test grant)', async () => {
    listResult.value = {
      data: [{ status: 'active', current_period_end: null }],
      error: null,
    };
    expect(await getPlan(user())).toBe('premium');
  });

  it('is premium for an active subscription with a future end date', async () => {
    listResult.value = {
      data: [{ status: 'active', current_period_end: future }],
      error: null,
    };
    expect(await getPlan(user())).toBe('premium');
  });

  it('is free for an active subscription whose period already ended (expired)', async () => {
    listResult.value = {
      data: [{ status: 'active', current_period_end: past }],
      error: null,
    };
    expect(await getPlan(user())).toBe('free');
  });

  // 🔴 CHANGED BY 0019 (billing foundation): a canceled Paddle subscription
  // keeps access until the period the customer already paid for ends — see
  // `getPlan`'s header. Was 'free' unconditionally before this migration;
  // now it depends on whether `current_period_end` is still in the future.
  it('is premium for a canceled subscription still within its paid period', async () => {
    listResult.value = {
      data: [{ status: 'canceled', current_period_end: future }],
      error: null,
    };
    expect(await getPlan(user())).toBe('premium');
  });

  it('is free for a canceled subscription whose paid period already ended', async () => {
    listResult.value = {
      data: [{ status: 'canceled', current_period_end: past }],
      error: null,
    };
    expect(await getPlan(user())).toBe('free');
  });

  it('is free for a canceled subscription with no period end at all', async () => {
    listResult.value = {
      data: [{ status: 'canceled', current_period_end: null }],
      error: null,
    };
    expect(await getPlan(user())).toBe('free');
  });

  it('is premium for a past_due subscription still within its paid period', async () => {
    listResult.value = {
      data: [{ status: 'past_due', current_period_end: future }],
      error: null,
    };
    expect(await getPlan(user())).toBe('premium');
  });

  it('is free for a past_due subscription whose paid period already ended', async () => {
    listResult.value = {
      data: [{ status: 'past_due', current_period_end: past }],
      error: null,
    };
    expect(await getPlan(user())).toBe('free');
  });

  it('is free for a past_due subscription with no period end at all', async () => {
    listResult.value = {
      data: [{ status: 'past_due', current_period_end: null }],
      error: null,
    };
    expect(await getPlan(user())).toBe('free');
  });

  it('is premium for a trialing subscription with no end date yet', async () => {
    listResult.value = {
      data: [{ status: 'trialing', current_period_end: null }],
      error: null,
    };
    expect(await getPlan(user())).toBe('premium');
  });

  it('is premium for a trialing subscription with a future end date', async () => {
    listResult.value = {
      data: [{ status: 'trialing', current_period_end: future }],
      error: null,
    };
    expect(await getPlan(user())).toBe('premium');
  });

  it('is free for a trialing subscription whose period already ended', async () => {
    listResult.value = {
      data: [{ status: 'trialing', current_period_end: past }],
      error: null,
    };
    expect(await getPlan(user())).toBe('free');
  });

  it('is free for an unrecognized status', async () => {
    listResult.value = {
      data: [{ status: 'something_else', current_period_end: future }],
      error: null,
    };
    expect(await getPlan(user())).toBe('free');
  });

  it('is free when there is no subscription row', async () => {
    listResult.value = { data: [], error: null };
    expect(await getPlan(user())).toBe('free');
  });

  // 🔴 THE LOAD-BEARING CASE, mirroring roles.ts: a Supabase failure MUST
  // collapse to the LOWER plan ('free'), never to premium.
  it('fails CLOSED to free on a Supabase error', async () => {
    listResult.value = { data: null, error: { message: 'down' } };
    expect(await getPlan(user())).toBe('free');
  });

  it('fails CLOSED to free when the client throws', async () => {
    listResult.throws = new Error('network down');
    expect(await getPlan(user())).toBe('free');
  });

  it('fails CLOSED to free when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await getPlan(user())).toBe('free');
  });

  it('is free for a null user, without querying Supabase', async () => {
    expect(await getPlan(null)).toBe('free');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('queries user_subscriptions for the given user id', async () => {
    listResult.value = { data: [], error: null };
    await getPlan(user('another-id'));
    expect(fromMock).toHaveBeenCalledWith(USER_SUBSCRIPTIONS_TABLE);
    expect(eqMock).toHaveBeenCalledWith('user_id', 'another-id');
  });
});
