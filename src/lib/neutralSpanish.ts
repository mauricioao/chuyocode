/**
 * Neutral-Spanish guard — the detector behind the SITE-WIDE "no voseo" rule.
 *
 * STANDING PROJECT RULE. ChuyoCode serves the whole Latin community, not
 * Argentina, so regional (Rioplatense) verb forms must never reach the UI. The
 * register is IMPERSONAL: the infinitive for instructions ("Revisar las
 * respuestas marcadas", "Probar con otro tema") and impersonal prose for
 * descriptions. Nothing addresses the reader with a second-person VERB, which
 * removes the tú/vos fork at the root instead of picking a side of it.
 *
 * Possessives (`tu idioma`, `tus datos`) are deliberately NOT flagged. They are
 * identical in tuteo and voseo, so they carry no regional signal at all, and
 * stripping them would gut brand copy in exchange for nothing.
 *
 * This module is imported by TESTS ONLY — it is the shared detector behind the
 * guards in `i18n.test.ts`, `AdModal.test.tsx` and `ExerciseIsland.test.tsx`.
 * It lives here instead of being copy-pasted into each of them because three
 * hand-maintained copies of one allowlist drift apart, and a drifted guard is
 * worse than no guard: it keeps passing while it stops checking.
 */

/**
 * Ordinary Spanish words that legitimately end in a stressed á/é/í(s).
 *
 * Rules 1 and 2 below flag a stressed final syllable because that is what
 * separates `Revisá` from `Revisar`, `Elegí` from `Elegir` and `buscás` from
 * `busca`. A short list of everyday words shares that ending, so they are named
 * here explicitly: extending the list is then a deliberate, reviewable act
 * rather than a silent loosening of the rule.
 *
 * `inglés` and `más` are load-bearing — the site's own nav and "Leer más" link
 * would fail the guard without them.
 */
export const NON_VOSEO_ACCENTED_WORDS = [
  'aquí',
  'ahí',
  'allí',
  'así',
  'está',
  'esté',
  'estará',
  'será',
  'habrá',
  'podrá',
  'quizá',
  'café',
  'sí',
  // Stressed final syllable + `s`. Same shape as the vos present indicative
  // (`tenés`, `podés`), so rule 2 cannot tell them apart without this list.
  'inglés',
  'francés',
  'más',
  'además',
  'después',
  'través',
];

/**
 * Second-person markers the accent rules cannot see.
 *
 * `vos`, `sos` and `vas` carry no written accent, and voseo imperatives with an
 * enclitic pronoun (`registrate`, `fijate`) move the stress off the final
 * syllable entirely — so rules 1 and 2 are blind to all of them. They are named
 * one by one because the alternative is a conjugation table, and this guard is
 * deliberately a heuristic with a short, readable escape hatch.
 */
export const SECOND_PERSON_WORDS = [
  'vos',
  'sos',
  'vas',
  'registrate',
  'fijate',
  'andate',
  'acordate',
  'quedate',
  'sentate',
  'contanos',
  'escribinos',
  'mandanos',
];

/**
 * The regional / second-person verb forms inside `text`, in order.
 *
 * Deliberately a heuristic, not a parser. Three rules, each aimed at one shape:
 *
 *  1. a final stressed á/é/í — every Rioplatense imperative shares it
 *     (`Elegí`, `Revisá`, `Probá`, `Volvé`, `Aprendé`, `Intentá`);
 *  2. a final stressed ás/és/ís — the vos present indicative
 *     (`buscás`, `querés`, `podés`, `tenés`, `venís`);
 *  3. an exact match against {@link SECOND_PERSON_WORDS} — the unaccented
 *     leftovers the first two rules structurally cannot reach.
 *
 * Rules 1 and 2 are filtered by {@link NON_VOSEO_ACCENTED_WORDS}. Matching is
 * done on whole tokens, so `nosotros` never matches `vos`.
 *
 * The companion triangulation tests prove every rule actually fires, so no
 * guard built on this can pass by matching nothing.
 */
export function voseoWords(text: string): string[] {
  return (text.match(/\p{L}+/gu) ?? []).filter((word) => {
    const lower = word.toLowerCase();

    if (SECOND_PERSON_WORDS.includes(lower)) return true;
    if (NON_VOSEO_ACCENTED_WORDS.includes(lower)) return false;

    // Rule 1: imperative. Rule 2: present indicative.
    return word.length > 2 && (/[áéí]$/u.test(word) || /[áéí]s$/u.test(word));
  });
}

/** One leaf string of a copy map, with the dotted path that reaches it. */
export interface CopyEntry {
  /** Dotted path, e.g. `home.hero.headline` or `english.exercise.back.0`. */
  key: string;
  text: string;
}

/**
 * Every string reachable under `value`, at any depth, paired with its path.
 *
 * The path is the whole point: a guard that reports only the offending WORD
 * leaves the author grepping for it. Reporting `home.hero.headline: Aprendé`
 * makes the fix a single jump.
 */
export function flattenCopy(value: unknown, prefix = ''): CopyEntry[] {
  if (typeof value === 'string') return [{ key: prefix, text: value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) =>
      flattenCopy(item, prefix ? `${prefix}.${i}` : String(i)),
    );
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      flattenCopy(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [];
}

/**
 * Guard-ready offender list: `"<key>: <word>"` for every regional form found.
 *
 * Shaped for `expect(findVoseo(map)).toEqual([])` — on failure vitest prints the
 * offending entries verbatim, so the message already names both the key and the
 * word without any custom assertion message.
 */
export function findVoseo(copy: unknown): string[] {
  return flattenCopy(copy).flatMap(({ key, text }) =>
    voseoWords(text).map((word) => `${key}: ${word}`),
  );
}
