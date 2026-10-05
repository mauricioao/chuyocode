import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

/**
 * `toProfile` now awaits `getPlan` (`src/lib/access.ts`), which reads
 * `user_subscriptions` through the service-role client. This file is not
 * about plan resolution itself (see `access.test.ts` for the premium/free
 * matrix) — it only needs the service client to never touch the real
 * database, so `./supabase` is mocked the same way `roles.test.ts` mocks it
 * and left "unconfigured" throughout, which makes `getPlan` fail closed to
 * `'free'` deterministically for every case below.
 */
const clientState = vi.hoisted(() => ({ available: false }));

vi.mock('./supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { from: vi.fn() };
  },
}));

/**
 * `toProfile` also now resolves `isModerator`/`moderationPendingCount` (PR E,
 * "Moderation") via `./roles` and `./activities/moderation` — both mocked
 * here so this file stays about name/email/avatar/plan normalization; their
 * own behavior is covered by `roles.test.ts` and `moderation.test.ts`.
 */
const { hasRoleMock, pendingCountMock } = vi.hoisted(() => ({
  hasRoleMock: vi.fn(async () => false),
  pendingCountMock: vi.fn(async () => 0),
}));
vi.mock('./roles', () => ({ hasRole: hasRoleMock }));
vi.mock('./activities/moderation', () => ({ getPendingModerationCount: pendingCountMock }));

import { DISPLAY_NAME_METADATA_KEY } from './displayName';
import { toProfile } from './profile';

/**
 * A minimal stand-in for a Supabase `User`, shaped like the three sign-in
 * methods this feature must treat identically (Google, email + password,
 * magic link). Only `email` and `user_metadata` are ever read by
 * {@link toProfile}.
 */
function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'lector@example.com',
    user_metadata: {},
    ...overrides,
  } as User;
}

beforeEach(() => {
  clientState.available = false;
  hasRoleMock.mockReset().mockResolvedValue(false);
  pendingCountMock.mockReset().mockResolvedValue(0);
});

describe('toProfile — name', () => {
  // T3 (Perfil page): the visitor's OWN choice always wins, even over
  // Google's own metadata — a later Google re-sign-in must never silently
  // revert a name the visitor explicitly set.
  it('prefers the visitor\'s own display_name over Google metadata', async () => {
    const profile = await toProfile(
      user({ user_metadata: { [DISPLAY_NAME_METADATA_KEY]: 'Mi Nombre', full_name: 'Juan Perez' } }),
    );
    expect(profile.name).toBe('Mi Nombre');
  });

  it('prefers user_metadata.full_name (Google-shaped)', async () => {
    const profile = await toProfile(
      user({ user_metadata: { full_name: 'Juan Perez', picture: '' } }),
    );
    expect(profile.name).toBe('Juan Perez');
  });

  it('falls back to user_metadata.name when full_name is absent', async () => {
    const profile = await toProfile(user({ user_metadata: { name: 'Ana Gomez' } }));
    expect(profile.name).toBe('Ana Gomez');
  });

  it('falls back to the email local part when metadata carries no name (email/password, magic link)', async () => {
    const profile = await toProfile(
      user({ email: 'lector.curioso@example.com', user_metadata: {} }),
    );
    expect(profile.name).toBe('lector.curioso');
  });

  it('falls back to the email local part when user_metadata is missing entirely', async () => {
    const profile = await toProfile(
      user({ email: 'sin.metadata@example.com', user_metadata: undefined }),
    );
    expect(profile.name).toBe('sin.metadata');
  });
});

describe('toProfile — email', () => {
  it('carries the user email through unchanged', async () => {
    const profile = await toProfile(user({ email: 'lector@example.com' }));
    expect(profile.email).toBe('lector@example.com');
  });

  it('is an empty string when the user has no email', async () => {
    const profile = await toProfile(user({ email: undefined }));
    expect(profile.email).toBe('');
  });
});

describe('toProfile — avatarUrl', () => {
  it('prefers user_metadata.avatar_url (Supabase-native)', async () => {
    const profile = await toProfile(
      user({
        user_metadata: {
          avatar_url: 'https://cdn.example.com/a.png',
          picture: 'https://cdn.example.com/b.png',
        },
      }),
    );
    expect(profile.avatarUrl).toBe('https://cdn.example.com/a.png');
  });

  it('falls back to user_metadata.picture (Google-shaped)', async () => {
    const profile = await toProfile(
      user({
        user_metadata: { picture: 'https://lh3.googleusercontent.com/a/photo.jpg' },
      }),
    );
    expect(profile.avatarUrl).toBe('https://lh3.googleusercontent.com/a/photo.jpg');
  });

  it('is null when neither field is present (email/password, magic link)', async () => {
    const profile = await toProfile(user({ user_metadata: {} }));
    expect(profile.avatarUrl).toBeNull();
  });

  it('is null for a non-https URL (never render an insecure or script-scheme image)', async () => {
    const profile = await toProfile(
      user({ user_metadata: { avatar_url: 'http://insecure.example.com/a.png' } }),
    );
    expect(profile.avatarUrl).toBeNull();
  });

  it('is null for a javascript: scheme value', async () => {
    const profile = await toProfile(
      user({ user_metadata: { avatar_url: 'javascript:alert(1)' } }),
    );
    expect(profile.avatarUrl).toBeNull();
  });

  it('is null for an unparsable value', async () => {
    const profile = await toProfile(
      user({ user_metadata: { avatar_url: 'not a url' } }),
    );
    expect(profile.avatarUrl).toBeNull();
  });
});

describe('toProfile — initials', () => {
  it('takes the first letter of the first and last word for a two+ word name', async () => {
    const profile = await toProfile(user({ user_metadata: { full_name: 'Juan Perez' } }));
    expect(profile.initials).toBe('JP');
  });

  it('skips middle words', async () => {
    const profile = await toProfile(
      user({ user_metadata: { full_name: 'Juan Carlos Perez' } }),
    );
    expect(profile.initials).toBe('JP');
  });

  it('is a single uppercase letter for a one-word name (email-derived)', async () => {
    const profile = await toProfile(
      user({ email: 'lector@example.com', user_metadata: {} }),
    );
    expect(profile.initials).toBe('L');
  });

  it('uppercases lowercase names', async () => {
    const profile = await toProfile(user({ user_metadata: { full_name: 'ana gomez' } }));
    expect(profile.initials).toBe('AG');
  });
});

describe('toProfile — plan', () => {
  it('is free when no subscription can be resolved (Login step 1b: fail closed to the lower plan)', async () => {
    expect((await toProfile(user())).plan).toBe('free');
  });
});

describe('toProfile — google-shaped, email-only and missing-metadata users, end to end', () => {
  it('normalizes a Google user', async () => {
    const profile = await toProfile(
      user({
        email: 'juan.perez@gmail.com',
        user_metadata: {
          full_name: 'Juan Perez',
          picture: 'https://lh3.googleusercontent.com/a/photo.jpg',
        },
      }),
    );
    expect(profile).toEqual({
      name: 'Juan Perez',
      email: 'juan.perez@gmail.com',
      avatarUrl: 'https://lh3.googleusercontent.com/a/photo.jpg',
      initials: 'JP',
      plan: 'free',
      isModerator: false,
      moderationPendingCount: 0,
    });
  });

  it('normalizes an email + password user with no metadata at all', async () => {
    const profile = await toProfile(
      user({ email: 'sin.foto@example.com', user_metadata: undefined }),
    );
    expect(profile).toEqual({
      name: 'sin.foto',
      email: 'sin.foto@example.com',
      avatarUrl: null,
      initials: 'S',
      plan: 'free',
      isModerator: false,
      moderationPendingCount: 0,
    });
  });
});

describe('toProfile — moderation (PR E)', () => {
  it('is isModerator: false and moderationPendingCount: 0 for an ordinary user, without even querying the count', async () => {
    hasRoleMock.mockResolvedValue(false);
    const profile = await toProfile(user());
    expect(profile.isModerator).toBe(false);
    expect(profile.moderationPendingCount).toBe(0);
    expect(pendingCountMock).not.toHaveBeenCalled();
  });

  it('is isModerator: true and carries the pending count for a moderator', async () => {
    hasRoleMock.mockResolvedValue(true);
    pendingCountMock.mockResolvedValue(7);
    const profile = await toProfile(user());
    expect(profile.isModerator).toBe(true);
    expect(profile.moderationPendingCount).toBe(7);
  });
});
