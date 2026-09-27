import { describe, it, expect } from 'vitest';
import { requiresLogin, hasAccess } from './access';
import type { User } from '@supabase/supabase-js';

/** A minimal stand-in for a Supabase `User` — only `id` is ever read here. */
function user(id = 'u1'): User {
  return { id } as User;
}

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
});
