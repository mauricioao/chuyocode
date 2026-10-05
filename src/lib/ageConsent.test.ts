/**
 * Tests for `src/lib/ageConsent.ts`. `./supabase` is mocked the same way
 * `accountDeletion.test.ts` mocks it for `auth.admin.deleteUser` — this file
 * proves the WRITE shape (merge-before-write, version/timestamp) and the two
 * pure predicates; it does not re-test `isPublicActivityRoute` itself
 * (already covered by `access.test.ts`), only that this module defers to it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { updateUserByIdMock, clientState } = vi.hoisted(() => ({
  updateUserByIdMock: vi.fn(),
  clientState: { available: true },
}));

vi.mock('./supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { auth: { admin: { updateUserById: updateUserByIdMock } } };
  },
}));

import {
  AGE_CONSENT_VERSION,
  hasRecordedConsent,
  isConsentExemptPath,
  recordAgeConsent,
  clearAgeConsentClient,
} from './ageConsent';

const USER_ID = 'a9a9a9a9-0000-4000-8000-000000000009';

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  updateUserByIdMock.mockResolvedValue({ data: {}, error: null });
  clearAgeConsentClient();
});

/** A minimal stand-in for a Supabase `User` — only `app_metadata` is ever read here. */
function user(appMetadata?: Record<string, unknown>): Pick<User, 'app_metadata'> {
  return { app_metadata: appMetadata ?? {} } as Pick<User, 'app_metadata'>;
}

describe('hasRecordedConsent', () => {
  it('is false for null/undefined', () => {
    expect(hasRecordedConsent(null)).toBe(false);
    expect(hasRecordedConsent(undefined)).toBe(false);
  });

  it('is false when app_metadata carries no ageConsent key', () => {
    expect(hasRecordedConsent(user({ provider: 'email', providers: ['email'] }))).toBe(false);
  });

  it('is false when ageConsent is malformed (no acceptedAt string)', () => {
    expect(hasRecordedConsent(user({ ageConsent: {} }))).toBe(false);
    expect(hasRecordedConsent(user({ ageConsent: { acceptedAt: 123 } }))).toBe(false);
    expect(hasRecordedConsent(user({ ageConsent: 'yes' }))).toBe(false);
  });

  it('is true once a well-formed record is present', () => {
    expect(
      hasRecordedConsent(
        user({ ageConsent: { acceptedAt: '2026-10-05T00:00:00.000Z', version: 'v1' } }),
      ),
    ).toBe(true);
  });
});

describe('isConsentExemptPath', () => {
  it.each([
    ['/es/', 'home (trailing slash)'],
    ['/es', 'home (no trailing slash)'],
    ['/es/libros', 'libros'],
    ['/es/libros/un-libro', 'libros (nested)'],
    ['/en/noticias', 'noticias'],
    ['/es/creditos', 'creditos'],
    ['/es/premium', 'premium'],
    ['/es/legal/terms', 'legal'],
    ['/es/legal/privacy', 'legal'],
    ['/es/auth/entrar', 'auth'],
    ['/es/auth/consentimiento', 'the consent screen itself (no loop)'],
    ['/es/ingles/actividades/abc123', 'guest-play practice'],
    ['/es/ingles/actividades/abc123/presentar', 'guest-play presentation mode'],
  ])('exempts %s (%s)', (pathname) => {
    expect(isConsentExemptPath(pathname)).toBe(true);
  });

  it.each([
    ['/es/ingles', 'ingles (signed-in section)'],
    ['/es/ingles/A1/present-simple', 'ingles (nested lesson)'],
    ['/es/ingles/actividades/abc123/imprimir', 'ingles print view (not guest-play)'],
    ['/es/cursos/react-basico', 'cursos'],
    ['/es/crear', 'crear (signed-in-only, not login-gated today)'],
    ['/es/mis-actividades', 'mis-actividades'],
    ['/es/admin/actividades', 'admin'],
  ])('does not exempt %s (%s)', (pathname) => {
    expect(isConsentExemptPath(pathname)).toBe(false);
  });
});

describe('recordAgeConsent', () => {
  it('writes acceptedAt/version, merged with the caller-supplied current app_metadata', async () => {
    const ok = await recordAgeConsent(USER_ID, { provider: 'google', providers: ['google'] });

    expect(ok).toBe(true);
    expect(updateUserByIdMock).toHaveBeenCalledTimes(1);
    const [calledId, patch] = updateUserByIdMock.mock.calls[0];
    expect(calledId).toBe(USER_ID);
    expect(patch.app_metadata.provider).toBe('google');
    expect(patch.app_metadata.providers).toEqual(['google']);
    expect(patch.app_metadata.ageConsent.version).toBe(AGE_CONSENT_VERSION);
    expect(patch.app_metadata.ageConsent.acceptedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('tolerates a null/undefined current app_metadata', async () => {
    const ok = await recordAgeConsent(USER_ID, null);
    expect(ok).toBe(true);
    const [, patch] = updateUserByIdMock.mock.calls[0];
    expect(patch.app_metadata.ageConsent.version).toBe(AGE_CONSENT_VERSION);
  });

  it('fails closed, logged, when the service-role key is unset', async () => {
    clientState.available = false;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ok = await recordAgeConsent(USER_ID, {});

    expect(ok).toBe(false);
    expect(updateUserByIdMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('fails closed, logged, on a Supabase error', async () => {
    updateUserByIdMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ok = await recordAgeConsent(USER_ID, {});

    expect(ok).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('[ageConsent] updateUserById failed:', 'boom');
    errorSpy.mockRestore();
  });

  it('fails closed, logged, when the client throws (unreachable Supabase)', async () => {
    updateUserByIdMock.mockRejectedValue(new Error('offline'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ok = await recordAgeConsent(USER_ID, {});

    expect(ok).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('[ageConsent] updateUserById threw:', expect.any(Error));
    errorSpy.mockRestore();
  });
});
