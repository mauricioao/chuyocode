import { describe, it, expect } from 'vitest';
import { signInReason } from './signInReason';

describe('signInReason', () => {
  it('explains the print page', () => {
    expect(
      signInReason(
        '/es/ingles/actividades/f3fe0031-92f7-46b7-86b5-17d955742343/imprimir',
        'es',
      ),
    ).toBe('imprimir');
  });

  it('explains the editor, with or without an id', () => {
    expect(signInReason('/es/crear', 'es')).toBe('crear');
    expect(signInReason('/es/crear/abc123', 'es')).toBe('crear');
  });

  it('explains "mis-actividades", with or without a nested path', () => {
    expect(signInReason('/es/mis-actividades', 'es')).toBe('misActividades');
    expect(signInReason('/es/mis-actividades/favoritas', 'es')).toBe(
      'misActividades',
    );
  });

  it('explains the bare Inglés desk hub, with or without a trailing slash', () => {
    expect(signInReason('/es/ingles', 'es')).toBe('desk');
    expect(signInReason('/es/ingles/', 'es')).toBe('desk');
  });

  it('matches in English too', () => {
    expect(signInReason('/en/crear', 'en')).toBe('crear');
  });

  it('gives no reason for a generic or unrecognized destination', () => {
    expect(signInReason('/es/', 'es')).toBeNull();
    expect(signInReason('/es/libros', 'es')).toBeNull();
    // A page nested under the desk hub, but not the hub itself.
    expect(signInReason('/es/ingles/aventura', 'es')).toBeNull();
    // The activity page itself, not its print route.
    expect(signInReason('/es/ingles/actividades/abc123', 'es')).toBeNull();
  });

  it('gives no reason for an absent next', () => {
    expect(signInReason(undefined, 'es')).toBeNull();
    expect(signInReason(null, 'es')).toBeNull();
    expect(signInReason('', 'es')).toBeNull();
  });

  it('gives no reason when next targets a different locale than the page', () => {
    expect(signInReason('/en/crear', 'es')).toBeNull();
  });

  it('gives no reason for an unsafe or foreign next, same as an unrecognized one', () => {
    expect(signInReason('//evil.com/crear', 'es')).toBeNull();
    expect(signInReason('https://evil.com/es/crear', 'es')).toBeNull();
    expect(signInReason('javascript:alert(1)', 'es')).toBeNull();
    expect(signInReason('not-a-path', 'es')).toBeNull();
  });
});
