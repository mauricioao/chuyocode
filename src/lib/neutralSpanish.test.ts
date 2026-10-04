import { describe, it, expect } from 'vitest';
import {
  NON_VOSEO_ACCENTED_WORDS,
  SECOND_PERSON_WORDS,
  VOSEO_AS_PRESENT_WORDS,
  findVoseo,
  flattenCopy,
  voseoWords,
} from './neutralSpanish';

/**
 * TRIANGULATION FOR EVERY GUARD IN THE REPO.
 *
 * Three separate test files assert `findVoseo(someCopyMap)).toEqual([])`. Each
 * of those passes trivially if the detector matches nothing, so the detector
 * itself is proven here — once, thoroughly — instead of three shallow times.
 */
describe('voseoWords — rule 1: voseo imperatives (final stressed á/é/í)', () => {
  it('fires on the copy this repo actually shipped', () => {
    expect(voseoWords('Elegí tu nivel y practicá con ejercicios cortos.')).toEqual(
      ['Elegí', 'practicá'],
    );
    expect(voseoWords('Revisá las respuestas marcadas.')).toEqual(['Revisá']);
    expect(voseoWords('Aprendé tecnología en tu idioma')).toEqual(['Aprendé']);
    expect(voseoWords('No se pudo validar el anuncio. Intentá de nuevo.')).toEqual(
      ['Intentá'],
    );
  });

  it('fires on the wider imperative family', () => {
    for (const word of ['Probá', 'Volvé', 'Mirá', 'Leé', 'Tené', 'Poné']) {
      expect(voseoWords(word)).toEqual([word]);
    }
  });

  it('is case-insensitive about the allowlist but preserves the reported word', () => {
    expect(voseoWords('Está listo')).toEqual([]);
    expect(voseoWords('está listo')).toEqual([]);
  });
});

describe('voseoWords — rule 2: vos present indicative of -er/-ir verbs (final stressed és/ís)', () => {
  it('fires on the forms the accent-final rule structurally cannot see', () => {
    for (const word of ['querés', 'podés', 'tenés', 'venís', 'sabés']) {
      expect(voseoWords(word)).toEqual([word]);
    }
  });
});

describe('voseoWords — rule 4: curated voseo -ás presents of -ar verbs', () => {
  it('fires on the curated list, even though rule 2 never tests á', () => {
    expect(voseoWords('La página que buscás no existe.')).toEqual(['buscás']);
    for (const word of VOSEO_AS_PRESENT_WORDS) {
      expect(voseoWords(word)).toEqual([word]);
    }
  });

  it('does not swallow the future tense, which shares the same -ás/-rás shape', () => {
    // `mirás` (voseo present of "mirar") and `verás` (future of "ver") both end
    // in `rás` — only the curated list, not a suffix pattern, can tell them
    // apart. This is the test that would fail if rule 2 ever grew `á` back.
    expect(voseoWords('mirás')).toEqual(['mirás']);
    expect(voseoWords('verás')).toEqual([]);
  });
});

describe('voseoWords — rule 3: unaccented second-person markers', () => {
  it('fires on the words that carry no written accent at all', () => {
    expect(voseoWords('Si sos parte de la comunidad')).toEqual(['sos']);
    expect(voseoWords('Registrate para continuar')).toEqual(['Registrate']);
  });

  it('matches whole tokens only, never substrings', () => {
    // `nosotros` contains `vos`; `pasos` contains `sos`. A substring rule would
    // make the guard unusable and it would be "fixed" by deleting the guard.
    expect(voseoWords('nosotros damos pasos firmes')).toEqual([]);
  });

  it('no longer treats `vas` as a marker — it is valid tuteo', () => {
    // "¿Vas a practicar?" is second-person `ir`, identical in tuteo and
    // voseo. Flagging it would fail copy that is already correct.
    expect(voseoWords('Muy pronto vas a poder aprender paso a paso.')).toEqual(
      [],
    );
  });
});

describe('voseoWords — the allowlist', () => {
  it('stays silent on ordinary Spanish that ends in a stress', () => {
    expect(
      voseoWords('Practicar inglés aquí, así, cuando esté todo listo.'),
    ).toEqual([]);
    expect(voseoWords('Leer más sobre esto después, además, a través de él.')).toEqual(
      [],
    );
  });

  it('allowlists nothing that is actually voseo', () => {
    // A guard whose allowlist swallowed a real imperative would pass forever.
    for (const word of NON_VOSEO_ACCENTED_WORDS) {
      expect(SECOND_PERSON_WORDS).not.toContain(word);
      expect(VOSEO_AS_PRESENT_WORDS).not.toContain(word);
    }
    expect(NON_VOSEO_ACCENTED_WORDS).not.toContain('elegí');
    expect(NON_VOSEO_ACCENTED_WORDS).not.toContain('revisá');
    expect(NON_VOSEO_ACCENTED_WORDS).not.toContain('aprendé');
    expect(NON_VOSEO_ACCENTED_WORDS).not.toContain('buscás');
  });

  it('leaves possessives alone — they carry no regional signal', () => {
    // `tu` / `tus` are identical in tuteo and voseo. Flagging them would force
    // brand copy like "en tu idioma" to be rewritten for no benefit.
    expect(voseoWords('Aprender tecnología en tu idioma con tus tiempos')).toEqual(
      [],
    );
  });
});

describe('voseoWords — neutral Latin-American tuteo, SITE-WIDE policy', () => {
  // Owner decision (2026-10-04): Spanish UI copy is tuteo, not impersonal.
  // This guard's only job is to keep voseo and other regionalisms out — it
  // does not police tuteo vs. an occasional impersonal infinitive.

  it('passes ordinary tuteo sentences', () => {
    for (const sentence of [
      'Estás jugando como invitado.',
      'Revisa tu correo.',
      'Podrás crear tus actividades.',
      '¿Vas a practicar?',
      'Inténtalo de nuevo.',
    ]) {
      expect(voseoWords(sentence)).toEqual([]);
    }
  });

  it('fails ordinary voseo sentences', () => {
    expect(voseoWords('Revisá tu correo')).toEqual(['Revisá']);
    expect(voseoWords('¿Podés entrar?')).toEqual(['Podés']);
    expect(voseoWords('Tenés que registrarte')).toEqual(['Tenés']);
    expect(voseoWords('Registrate gratis')).toEqual(['Registrate']);
    expect(voseoWords('vos sabés')).toEqual(['vos', 'sabés']);
  });
});

describe('flattenCopy', () => {
  it('pairs every leaf string with the dotted path that reaches it', () => {
    expect(
      flattenCopy({ home: { hero: { headline: 'Hola' } }, list: ['a', 'b'] }),
    ).toEqual([
      { key: 'home.hero.headline', text: 'Hola' },
      { key: 'list.0', text: 'a' },
      { key: 'list.1', text: 'b' },
    ]);
  });

  it('ignores non-string leaves rather than stringifying them', () => {
    expect(flattenCopy({ a: 1, b: null, c: undefined, d: 'x' })).toEqual([
      { key: 'd', text: 'x' },
    ]);
  });
});

describe('findVoseo', () => {
  it('names BOTH the offending key and the offending word', () => {
    // This is the whole ergonomic point of the guard: on failure vitest prints
    // these strings verbatim, so the author gets the fix location for free.
    expect(
      findVoseo({
        meta: { siteDescription: 'Aprendé tecnología' },
        error: { body: 'La página que buscás no existe' },
        ok: { body: 'Revisar las respuestas marcadas.' },
      }),
    ).toEqual(['meta.siteDescription: Aprendé', 'error.body: buscás']);
  });

  it('returns an empty list for copy that is already neutral', () => {
    expect(findVoseo({ a: 'Elegir nivel', b: ['Probar con otro tema.'] })).toEqual(
      [],
    );
  });
});
