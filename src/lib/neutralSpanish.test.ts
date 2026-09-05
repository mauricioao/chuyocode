import { describe, it, expect } from 'vitest';
import {
  NON_VOSEO_ACCENTED_WORDS,
  SECOND_PERSON_WORDS,
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

describe('voseoWords — rule 2: vos present indicative (final stressed ás/és/ís)', () => {
  it('fires on the forms the accent-final rule structurally cannot see', () => {
    expect(voseoWords('La página que buscás no existe.')).toEqual(['buscás']);
    for (const word of ['querés', 'podés', 'tenés', 'venís', 'sabés']) {
      expect(voseoWords(word)).toEqual([word]);
    }
  });
});

describe('voseoWords — rule 3: unaccented second-person markers', () => {
  it('fires on the words that carry no written accent at all', () => {
    expect(voseoWords('Muy pronto vas a poder aprender paso a paso.')).toEqual([
      'vas',
    ]);
    expect(voseoWords('Si sos parte de la comunidad')).toEqual(['sos']);
    expect(voseoWords('Registrate para continuar')).toEqual(['Registrate']);
  });

  it('matches whole tokens only, never substrings', () => {
    // `nosotros` contains `vos`; `pasos` contains `sos`. A substring rule would
    // make the guard unusable and it would be "fixed" by deleting the guard.
    expect(voseoWords('nosotros damos pasos firmes')).toEqual([]);
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
