/**
 * Neutral-Spanish guard — the detector behind the SITE-WIDE "no voseo" rule.
 *
 * STANDING PROJECT RULE (owner decision, 2026-10-04). ChuyoCode serves the
 * whole Latin community, not Argentina, so regional (Rioplatense) verb forms
 * must never reach the UI. The register is NEUTRAL LATIN-AMERICAN TUTEO:
 * address the reader as "tú" — imperatives ("Revisa", "Crea", "Sube",
 * "Inténtalo"), present ("puedes", "tienes", "estás"), future ("podrás",
 * "recibirás"), possessives ("tu", "tus"). Short action labels (buttons, menu
 * items, tabs, links) may stay infinitival or nominal when that already reads
 * naturally ("Comprobar", "Crear cuenta", "Reintentar", "Imprimir") — this
 * guard does not police register choice, only the one thing that must never
 * happen anywhere: VOSEO (podés, tenés, revisá, elegí, registrate, vos, sos…)
 * and other regionalisms. Tuteo, an occasional impersonal infinitive, and a
 * short nominal label all pass; only the Rioplatense shape fails.
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
 * Ordinary Spanish words that legitimately end in a stressed á/é/í with no
 * following `s` (rule 1), or in a stressed é/í followed by `s` (rule 2).
 *
 * Rules 1 and 2 flag a stressed final syllable because that is what separates
 * `Revisá` from `Revisar`, `Elegí` from `Elegir` and `querés` from `quiere`. A
 * short list of everyday words shares that ending, so they are named here
 * explicitly: extending the list is then a deliberate, reviewable act rather
 * than a silent loosening of the rule.
 *
 * NOTHING HERE EVER PAIRS `á` WITH A TRAILING `s`. Rule 2 ({@link voseoWords})
 * only tests é/í before `s`, on purpose: the future tense conjugates to `-ás`/
 * `-rás` identically in tuteo and voseo for every verb ("podrás", "tendrás",
 * "verás", "recibirás", "estás"…), so it carries no regional signal at all —
 * and unlike `será`/`estará`/`podrá` (rule 1, no trailing `s`, finite and
 * listed below), the second-person forms are an open-ended set no allowlist
 * could keep up with. Excluding `á` from rule 2's pattern closes that whole
 * class at once instead of chasing it one verb at a time.
 *
 * `inglés`, `francés`, `país`, `después`, `través` are load-bearing for rule 2
 * — ordinary words this site's own copy uses that happen to share the vos
 * present indicative's é/í+s shape.
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
  // Same third-person future tense shape as `será`/`estará`/`podrá` above
  // ("un enlace te llegará" — the link, not the reader, is the subject).
  'llegará',
  'quizá',
  'café',
  'sí',
  // Interrogative/exclamative, not an imperative — "¿Qué esperas?" is
  // tuteo register, same shape as "¿Qué tal?"; it carries no more of a
  // tú/vos fork than "aquí" or "café" do.
  'qué',
  // Stressed final syllable + `s`. Same shape as the vos present indicative
  // (`tenés`, `podés`), so rule 2 cannot tell them apart without this list.
  'inglés',
  'francés',
  'país',
  'después',
  'través',
];

/**
 * Second-person markers the accent rules cannot see.
 *
 * `vos` and `sos` carry no written accent, and voseo imperatives with an
 * enclitic pronoun (`registrate`, `fijate`) move the stress off the final
 * syllable entirely — so rules 1 and 2 are blind to all of them. They are named
 * one by one because the alternative is a conjugation table, and this guard is
 * deliberately a heuristic with a short, readable escape hatch.
 *
 * `vas` is deliberately NOT one of these markers. "¿Vas a practicar?" is valid
 * tuteo (present indicative of `ir`, second person singular) — identical to
 * its voseo form, so it carries no regional signal at all, same reasoning as
 * the possessives above.
 */
export const SECOND_PERSON_WORDS = [
  'vos',
  'sos',
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
 * Common voseo present-indicative forms of `-ar` verbs, stressed `-ás` —
 * curated explicitly rather than caught by a pattern.
 *
 * Rule 2 deliberately never tests `á` (see {@link NON_VOSEO_ACCENTED_WORDS}'s
 * own note on why): the future tense shares the exact same `-ás`/`-rás` shape
 * for every verb, with no way to tell `mirás` (voseo present of "mirar",
 * regional) from `verás` (future of "ver", dialect-neutral) apart by shape
 * alone — both end in `rás`. Rather than chase that ambiguity with more
 * pattern rules, this is a short, reviewable list of the voseo `-ás` forms
 * most likely to turn up in THIS site's own instructions and exercise/game
 * copy (play, search, use, try, save, create, need…). Extend it the same
 * deliberate way as the other lists here when a new one surfaces.
 */
export const VOSEO_AS_PRESENT_WORDS = [
  'jugás',
  'hablás',
  'buscás',
  'usás',
  'mirás',
  'tomás',
  'empezás',
  'practicás',
  'creás',
  'guardás',
  'cambiás',
  'probás',
  'necesitás',
];

/**
 * The regional voseo forms inside `text`, in order.
 *
 * Deliberately a heuristic, not a parser. Four checks, each aimed at one shape:
 *
 *  1. a final stressed á/é/í — every Rioplatense imperative shares it
 *     (`Elegí`, `Revisá`, `Probá`, `Volvé`, `Aprendé`, `Intentá`);
 *  2. a final stressed é/í followed by `s` — the vos present indicative of
 *     `-er`/`-ir` verbs (`querés`, `podés`, `tenés`, `venís`). Deliberately
 *     NOT `á` — see {@link VOSEO_AS_PRESENT_WORDS} and the note on
 *     {@link NON_VOSEO_ACCENTED_WORDS} for why;
 *  3. an exact match against {@link SECOND_PERSON_WORDS} — the unaccented
 *     markers the first two rules structurally cannot reach;
 *  4. an exact match against {@link VOSEO_AS_PRESENT_WORDS} — the curated
 *     `-ás` presents rule 2 deliberately does not pattern-match.
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
    if (VOSEO_AS_PRESENT_WORDS.includes(lower)) return true;
    if (NON_VOSEO_ACCENTED_WORDS.includes(lower)) return false;

    // Rule 1: imperative (á/é/í, no trailing `s`).
    // Rule 2: present indicative (é/í + `s` — `á` is deliberately excluded).
    return word.length > 2 && (/[áéí]$/u.test(word) || /[éí]s$/u.test(word));
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
