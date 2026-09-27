import { describe, it, expect } from 'vitest';
import type { User } from '@supabase/supabase-js';
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

describe('toProfile — name', () => {
  it('prefers user_metadata.full_name (Google-shaped)', () => {
    const profile = toProfile(
      user({ user_metadata: { full_name: 'Juan Perez', picture: '' } }),
    );
    expect(profile.name).toBe('Juan Perez');
  });

  it('falls back to user_metadata.name when full_name is absent', () => {
    const profile = toProfile(user({ user_metadata: { name: 'Ana Gomez' } }));
    expect(profile.name).toBe('Ana Gomez');
  });

  it('falls back to the email local part when metadata carries no name (email/password, magic link)', () => {
    const profile = toProfile(
      user({ email: 'lector.curioso@example.com', user_metadata: {} }),
    );
    expect(profile.name).toBe('lector.curioso');
  });

  it('falls back to the email local part when user_metadata is missing entirely', () => {
    const profile = toProfile(
      user({ email: 'sin.metadata@example.com', user_metadata: undefined }),
    );
    expect(profile.name).toBe('sin.metadata');
  });
});

describe('toProfile — email', () => {
  it('carries the user email through unchanged', () => {
    const profile = toProfile(user({ email: 'lector@example.com' }));
    expect(profile.email).toBe('lector@example.com');
  });

  it('is an empty string when the user has no email', () => {
    const profile = toProfile(user({ email: undefined }));
    expect(profile.email).toBe('');
  });
});

describe('toProfile — avatarUrl', () => {
  it('prefers user_metadata.avatar_url (Supabase-native)', () => {
    const profile = toProfile(
      user({
        user_metadata: {
          avatar_url: 'https://cdn.example.com/a.png',
          picture: 'https://cdn.example.com/b.png',
        },
      }),
    );
    expect(profile.avatarUrl).toBe('https://cdn.example.com/a.png');
  });

  it('falls back to user_metadata.picture (Google-shaped)', () => {
    const profile = toProfile(
      user({
        user_metadata: { picture: 'https://lh3.googleusercontent.com/a/photo.jpg' },
      }),
    );
    expect(profile.avatarUrl).toBe('https://lh3.googleusercontent.com/a/photo.jpg');
  });

  it('is null when neither field is present (email/password, magic link)', () => {
    const profile = toProfile(user({ user_metadata: {} }));
    expect(profile.avatarUrl).toBeNull();
  });

  it('is null for a non-https URL (never render an insecure or script-scheme image)', () => {
    const profile = toProfile(
      user({ user_metadata: { avatar_url: 'http://insecure.example.com/a.png' } }),
    );
    expect(profile.avatarUrl).toBeNull();
  });

  it('is null for a javascript: scheme value', () => {
    const profile = toProfile(
      user({ user_metadata: { avatar_url: 'javascript:alert(1)' } }),
    );
    expect(profile.avatarUrl).toBeNull();
  });

  it('is null for an unparsable value', () => {
    const profile = toProfile(user({ user_metadata: { avatar_url: 'not a url' } }));
    expect(profile.avatarUrl).toBeNull();
  });
});

describe('toProfile — initials', () => {
  it('takes the first letter of the first and last word for a two+ word name', () => {
    const profile = toProfile(user({ user_metadata: { full_name: 'Juan Perez' } }));
    expect(profile.initials).toBe('JP');
  });

  it('skips middle words', () => {
    const profile = toProfile(
      user({ user_metadata: { full_name: 'Juan Carlos Perez' } }),
    );
    expect(profile.initials).toBe('JP');
  });

  it('is a single uppercase letter for a one-word name (email-derived)', () => {
    const profile = toProfile(
      user({ email: 'lector@example.com', user_metadata: {} }),
    );
    expect(profile.initials).toBe('L');
  });

  it('uppercases lowercase names', () => {
    const profile = toProfile(user({ user_metadata: { full_name: 'ana gomez' } }));
    expect(profile.initials).toBe('AG');
  });
});

describe('toProfile — plan', () => {
  it('is always free today (Login step 1b: no paid tier yet)', () => {
    expect(toProfile(user()).plan).toBe('free');
  });
});

describe('toProfile — google-shaped, email-only and missing-metadata users, end to end', () => {
  it('normalizes a Google user', () => {
    const profile = toProfile(
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
    });
  });

  it('normalizes an email + password user with no metadata at all', () => {
    const profile = toProfile(
      user({ email: 'sin.foto@example.com', user_metadata: undefined }),
    );
    expect(profile).toEqual({
      name: 'sin.foto',
      email: 'sin.foto@example.com',
      avatarUrl: null,
      initials: 'S',
      plan: 'free',
    });
  });
});
