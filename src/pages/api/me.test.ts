/**
 * GET /api/me — the client-only identity chip's only network call.
 *
 * `locals.user` is already server-verified by middleware (`getUser()`, never
 * `getSession()`), so this endpoint does no Supabase I/O of its own: it only
 * normalizes what middleware already resolved. Always private/no-store (T7)
 * — the whole point of this response is per-visitor identity, so it must
 * never reach a shared cache.
 */
import { describe, it, expect, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

/**
 * `toProfile` (via `GET`) now awaits `getPlan`, which reads
 * `user_subscriptions` through the service-role client. Mocked here so this
 * endpoint test never touches the real Supabase project — same posture as
 * `roles.test.ts`/`profile.test.ts`. Left "unconfigured", `getPlan` fails
 * closed to `'free'`, matching this file's existing expectations.
 */
vi.mock('@lib/supabase', () => ({
  createServiceClient: () => {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  },
}));

import { GET } from './me';

function ctx(user: User | null) {
  return { locals: { user } } as unknown as Parameters<typeof GET>[0];
}

function googleUser(): User {
  return {
    id: 'u1',
    email: 'juan.perez@gmail.com',
    user_metadata: {
      full_name: 'Juan Perez',
      picture: 'https://lh3.googleusercontent.com/a/photo.jpg',
    },
  } as unknown as User;
}

describe('GET /api/me — signed in', () => {
  it('returns 200 with the normalized profile', async () => {
    const res = await GET(ctx(googleUser()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: unknown };
    expect(body.profile).toEqual({
      name: 'Juan Perez',
      email: 'juan.perez@gmail.com',
      avatarUrl: 'https://lh3.googleusercontent.com/a/photo.jpg',
      initials: 'JP',
      plan: 'free',
    });
  });
});

describe('GET /api/me — signed out', () => {
  it('returns 200 with profile: null', async () => {
    const res = await GET(ctx(null));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: unknown };
    expect(body.profile).toBeNull();
  });
});

describe('GET /api/me — cache safety (T7)', () => {
  it('is always private/no-store, signed in or not', async () => {
    expect((await GET(ctx(googleUser()))).headers.get('cache-control')).toBe(
      'private, no-store',
    );
    expect((await GET(ctx(null))).headers.get('cache-control')).toBe(
      'private, no-store',
    );
  });

  it('answers JSON', async () => {
    const res = await GET(ctx(null));
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
