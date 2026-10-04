import { describe, expect, it, vi } from 'vitest';
import {
  isClientBuild,
  isServerOnlyModuleId,
  looksLikeServerOnlySpecifier,
  normalizeModuleId,
  resolveServerOnlyModule,
  SERVER_ONLY_MODULES,
  serverOnlyModules,
  type ServerOnlyResolveContext,
} from './serverOnlyModules';

describe('looksLikeServerOnlySpecifier', () => {
  it.each([
    './env',
    '../env',
    '@lib/env',
    '@/lib/env',
    './env.ts',
    'ENV',
    // RED (query/hash-suffixed specifiers): a raw import specifier can carry
    // a `?query` (a Vite-specific import, e.g. `?raw`/`?url`) or a `#hash`
    // that the OLD pattern's bare `$` anchor never stripped, so it silently
    // never matched these at all.
    '@lib/env?raw',
    '@lib/env?url',
    '@lib/env#hash',
    // RED (.js specifier resolving to a .ts file): TS lets `./env.js` resolve
    // to `./env.ts` at build time, which the OLD pattern's hard-coded
    // `(\.ts)?` extension group never accepted.
    './env.js',
  ])('matches %s', (source) => {
    expect(looksLikeServerOnlySpecifier(source)).toBe(true);
  });

  it.each(['react', './exerciseMedia', '@/lib/supabase', './environment'])(
    'does not match %s',
    (source) => {
      // "./environment" is a real, uncovered gap, not a safety net with a
      // backup: `looksLikeServerOnlySpecifier` is a HARD GATE, so a
      // specifier it rejects here never reaches `context.resolve` at all
      // (see `resolveServerOnlyModule`'s early return below) — there is no
      // resolve-based check backing this prefilter up for anything that
      // slips past it. Accepted anyway because no real specifier in this
      // codebase is spelled that way.
      expect(looksLikeServerOnlySpecifier(source)).toBe(false);
    },
  );
});

describe('normalizeModuleId', () => {
  it('converts Windows backslashes to forward slashes', () => {
    expect(normalizeModuleId('E:\\repo\\src\\lib\\env.ts')).toBe('E:/repo/src/lib/env.ts');
  });

  it('strips a trailing ?query', () => {
    expect(normalizeModuleId('/repo/src/lib/env.ts?used-in-ssr')).toBe('/repo/src/lib/env.ts');
  });

  it('handles both at once', () => {
    expect(normalizeModuleId('E:\\repo\\src\\lib\\env.ts?v=1')).toBe('E:/repo/src/lib/env.ts');
  });

  it('is a no-op for an already-normalized id with no query', () => {
    expect(normalizeModuleId('/repo/src/lib/env.ts')).toBe('/repo/src/lib/env.ts');
  });
});

describe('isServerOnlyModuleId', () => {
  it('matches every entry in SERVER_ONLY_MODULES by suffix', () => {
    for (const suffix of SERVER_ONLY_MODULES) {
      expect(isServerOnlyModuleId(`/repo${suffix}`)).toBe(true);
    }
  });

  it('rejects an unrelated module', () => {
    expect(isServerOnlyModuleId('/repo/src/lib/exerciseMedia.ts')).toBe(false);
  });

  it('rejects a near-miss (substring, not suffix)', () => {
    expect(isServerOnlyModuleId('/repo/src/lib/env.ts.bak')).toBe(false);
  });
});

describe('isClientBuild', () => {
  it('reads the environment consumer when present (client)', () => {
    expect(isClientBuild({ environment: { config: { consumer: 'client' } } }, { ssr: true })).toBe(
      true,
    );
  });

  it('reads the environment consumer when present (server)', () => {
    expect(
      isClientBuild({ environment: { config: { consumer: 'server' } } }, { ssr: false }),
    ).toBe(false);
  });

  it('falls back to !options.ssr when no environment is attached (client)', () => {
    expect(isClientBuild({}, { ssr: false })).toBe(true);
    expect(isClientBuild({}, undefined)).toBe(true);
  });

  it('falls back to !options.ssr when no environment is attached (server)', () => {
    expect(isClientBuild({}, { ssr: true })).toBe(false);
  });
});

/** A fake plugin-context resolve/error pair, so `resolveServerOnlyModule`
 * can be driven without a real Vite dev server or build. */
function fakeContext(
  resolvedId: string | null,
  environment?: { config: { consumer?: string } },
): ServerOnlyResolveContext & { error: ReturnType<typeof vi.fn> } {
  const error = vi.fn((message: string) => {
    throw new Error(message);
  }) as unknown as ReturnType<typeof vi.fn>;

  return {
    environment,
    resolve: vi.fn(async () => (resolvedId ? { id: resolvedId } : null)),
    error: error as never,
  } as ServerOnlyResolveContext & { error: ReturnType<typeof vi.fn> };
}

describe('resolveServerOnlyModule', () => {
  it('never resolves, and skips the resolve call for an unrelated specifier', async () => {
    const context = fakeContext('/repo/src/lib/env.ts', { config: { consumer: 'client' } });
    const result = await resolveServerOnlyModule(context, 'react', undefined, {});
    expect(result).toBeNull();
    expect(context.resolve).not.toHaveBeenCalled();
  });

  it('errors for the client build when the specifier resolves to env.ts', async () => {
    const context = fakeContext('/repo/src/lib/env.ts', { config: { consumer: 'client' } });
    await expect(
      resolveServerOnlyModule(context, './env', '/repo/src/lib/exerciseMedia.ts', {}),
    ).rejects.toThrow(/exerciseMedia\.ts.*env\.ts.*server-only/s);
  });

  it('does not error for the server build when the specifier resolves to env.ts', async () => {
    const context = fakeContext('/repo/src/lib/env.ts', { config: { consumer: 'server' } });
    const result = await resolveServerOnlyModule(
      context,
      './env',
      '/repo/src/lib/exerciseMedia.server.ts',
      {},
    );
    expect(result).toBeNull();
  });

  it('errors on a Windows-style resolved id with a query string, for the client', async () => {
    const context = fakeContext('E:\\repo\\src\\lib\\env.ts?v=1', { config: { consumer: 'client' } });
    await expect(resolveServerOnlyModule(context, '@lib/env', 'importer.tsx', {})).rejects.toThrow();
  });

  it('is silent for a module that merely looks related but is not server-only', async () => {
    const context = fakeContext('/repo/src/lib/exerciseMedia.ts', { config: { consumer: 'client' } });
    const result = await resolveServerOnlyModule(context, './env', 'importer.tsx', {});
    expect(result).toBeNull();
  });

  it('is silent when the resolver cannot resolve the specifier at all', async () => {
    const context = fakeContext(null, { config: { consumer: 'client' } });
    const result = await resolveServerOnlyModule(context, './env', 'importer.tsx', {});
    expect(result).toBeNull();
  });

  it('falls back to the ssr option when no environment is attached, and still errors for the client', async () => {
    const context = fakeContext('/repo/src/lib/env.ts');
    await expect(
      resolveServerOnlyModule(context, './env', 'importer.tsx', { ssr: false }),
    ).rejects.toThrow();
  });

  it('falls back to the ssr option when no environment is attached, and stays silent for the server', async () => {
    const context = fakeContext('/repo/src/lib/env.ts');
    const result = await resolveServerOnlyModule(context, './env', 'importer.tsx', { ssr: true });
    expect(result).toBeNull();
  });
});

describe('serverOnlyModules', () => {
  it('returns a Vite plugin named for its purpose, with a resolveId hook', () => {
    const plugin = serverOnlyModules();
    expect(plugin.name).toBe('chuyocode:server-only-modules');
    expect(typeof plugin.resolveId).toBe('function');
  });
});
