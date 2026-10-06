/**
 * deskHelperTips — curated grammar/vocabulary tips for the Inglés desk hub's
 * floating "helper" character ("desktop" redesign PART 5, approved mockup
 * `ChuyoCode_others/propuestas/ingles-escritorio/index.html`'s `.helper` /
 * `.bubble` / `.who`, owner's words: "los avatares podrían salir como una
 * ayuda muchas veces desde la parte inferior izquierda con un globo de texto
 * dando ayudas").
 *
 * Each tip is a short Spanish explanation with the English term/example
 * highlighted (the mockup's own `<em>` treatment — plain, not italic, a
 * yellow-tinted background instead), PLUS an English rendering of the same
 * point for the `en` locale — same "translate the chrome, keep the grammar
 * example in English" posture `propuestos`'s `focus` labels already
 * document (never translated there either, since the English term is what
 * the learner needs to recognize).
 *
 * `html` fields are AUTHORED content (this file), never visitor input, so
 * rendering them with `set:html` carries no injection risk — same posture
 * as every other static copy string in `@lib/i18n.ts`.
 *
 * Assigned round-robin across the five `CHARACTERS` (`@/content/characters`)
 * so "Otro tip" visibly changes who is speaking, not just what they say.
 */
import type { CharacterSlug } from '@/content/characters';

export interface DeskHelperTip {
  /** Stable id — never reused across entries, never renumbered. */
  id: string;
  character: CharacterSlug;
  /** Spanish explanation, English term(s)/example wrapped in `<em>`. */
  es: string;
  /** English explanation, same term(s)/example wrapped in `<em>`. */
  en: string;
}

export const DESK_HELPER_TIPS: readonly DeskHelperTip[] = [
  {
    id: 'since-present-perfect',
    character: 'bruno',
    es: 'Para algo que empezó y sigue, usa <em>since</em> con el presente perfecto: <em>I have lived here since 2019.</em>',
    en: 'For something that started in the past and still continues, use <em>since</em> with the present perfect: <em>I have lived here since 2019.</em>',
  },
  {
    id: 'can-bare-infinitive',
    character: 'paco',
    es: '<em>Can</em> va siempre con el verbo sin <em>to</em>: <em>She can swim</em>, nunca <em>she can to swim</em>.',
    en: '<em>Can</em> is always followed by the bare infinitive: <em>She can swim</em>, never <em>she can to swim</em>.',
  },
  {
    id: 'days-months-capital',
    character: 'luna',
    es: 'Los días y los meses en inglés van con mayúscula: <em>Tuesday, October</em>.',
    en: 'Days and months are always capitalised in English: <em>Tuesday, October</em>.',
  },
  {
    id: 'a-an-sound',
    character: 'mia',
    es: 'Usa <em>an</em> antes de un sonido vocálico, no solo antes de una vocal escrita: <em>an hour</em>, pero <em>a university</em>.',
    en: 'Use <em>an</em> before a vowel SOUND, not just a written vowel: <em>an hour</em>, but <em>a university</em>.',
  },
  {
    id: 'much-many',
    character: 'tobi',
    es: 'Usa <em>many</em> con sustantivos contables (<em>many books</em>) y <em>much</em> con incontables (<em>much time</em>).',
    en: 'Use <em>many</em> with countable nouns (<em>many books</em>) and <em>much</em> with uncountable ones (<em>much time</em>).',
  },
  {
    id: 'third-person-s',
    character: 'bruno',
    es: 'En presente simple, la tercera persona singular lleva una <em>-s</em>: <em>she works</em>, no <em>she work</em>.',
    en: 'In the simple present, third-person singular takes an <em>-s</em>: <em>she works</em>, not <em>she work</em>.',
  },
  {
    id: 'false-friend-embarrassed',
    character: 'paco',
    es: '<em>Embarrassed</em> significa "avergonzado", no "embarazada" — ese falso amigo cambia todo el sentido de la frase.',
    en: '<em>Embarrassed</em> means "ashamed", not "pregnant" — that false friend changes the whole meaning.',
  },
  {
    id: 'adjective-order',
    character: 'luna',
    es: 'Los adjetivos en inglés suelen ir en este orden: opinión, tamaño, edad, color, origen, material: <em>a lovely small old red Italian lamp</em>.',
    en: 'English adjectives usually follow this order: opinion, size, age, colour, origin, material: <em>a lovely small old red Italian lamp</em>.',
  },
  {
    id: 'present-perfect-vs-past-simple',
    character: 'mia',
    es: 'El presente perfecto conecta el pasado con el presente: <em>I have lost my keys</em> (todavía no las encuentro). El pasado simple cierra el hecho: <em>I lost my keys yesterday</em>.',
    en: 'The present perfect links the past to now: <em>I have lost my keys</em> (still missing). The simple past closes the event: <em>I lost my keys yesterday</em>.',
  },
  {
    id: 'there-is-there-are',
    character: 'tobi',
    es: 'Usa <em>there is</em> con singular/incontable y <em>there are</em> con plural: <em>there is milk</em>, <em>there are eggs</em>.',
    en: 'Use <em>there is</em> with singular/uncountable nouns and <em>there are</em> with plurals: <em>there is milk</em>, <em>there are eggs</em>.',
  },
  {
    id: 'false-friend-actually',
    character: 'bruno',
    es: '<em>Actually</em> significa "en realidad", no "actualmente" — para eso usa <em>currently</em> o <em>nowadays</em>.',
    en: '<em>Actually</em> means "in fact", not "currently" — use <em>currently</em> or <em>nowadays</em> for that.',
  },
  {
    id: 'phrasal-verb-look-forward',
    character: 'paco',
    es: '<em>Look forward to</em> siempre va seguido de un gerundio: <em>I look forward to seeing you</em>, no <em>to see you</em>.',
    en: '<em>Look forward to</em> is always followed by a gerund: <em>I look forward to seeing you</em>, not <em>to see you</em>.',
  },
  {
    id: 'comparatives-short-long',
    character: 'luna',
    es: 'Adjetivos cortos (1 sílaba) suman <em>-er</em>: <em>bigger</em>. Adjetivos largos usan <em>more</em>: <em>more interesting</em>.',
    en: 'Short adjectives (one syllable) add <em>-er</em>: <em>bigger</em>. Longer adjectives use <em>more</em>: <em>more interesting</em>.',
  },
  {
    id: 'first-conditional',
    character: 'mia',
    es: 'El primer condicional describe algo probable: <em>If it rains, I will stay home</em> — presente simple + <em>will</em>.',
    en: 'The first conditional describes something likely: <em>If it rains, I will stay home</em> — simple present + <em>will</em>.',
  },
  {
    id: 'false-friend-library',
    character: 'tobi',
    es: '<em>Library</em> es "biblioteca"; la tienda de libros se llama <em>bookshop</em> o <em>bookstore</em>.',
    en: '<em>Library</em> means "biblioteca" in Spanish; a shop that sells books is a <em>bookshop</em> or <em>bookstore</em>.',
  },
  {
    id: 'used-to-habit',
    character: 'bruno',
    es: 'Usa <em>used to</em> para hábitos o estados pasados que ya no ocurren: <em>I used to play the guitar</em>.',
    en: 'Use <em>used to</em> for past habits or states that no longer happen: <em>I used to play the guitar</em>.',
  },
  {
    id: 'countable-advice',
    character: 'paco',
    es: '<em>Advice</em> es incontable: se dice <em>a piece of advice</em>, nunca <em>an advice</em>.',
    en: '<em>Advice</em> is uncountable: say <em>a piece of advice</em>, never <em>an advice</em>.',
  },
  {
    id: 'prepositions-time',
    character: 'luna',
    es: 'Usa <em>in</em> para meses/años, <em>on</em> para días y <em>at</em> para horas exactas: <em>in July</em>, <em>on Monday</em>, <em>at 9am</em>.',
    en: 'Use <em>in</em> for months/years, <em>on</em> for days, and <em>at</em> for exact times: <em>in July</em>, <em>on Monday</em>, <em>at 9am</em>.',
  },
  {
    id: 'question-tags',
    character: 'mia',
    es: 'Las "question tags" invierten la polaridad: afirmativa + negativa: <em>You like coffee, don’t you?</em>',
    en: 'Question tags flip polarity: positive statement, negative tag: <em>You like coffee, don’t you?</em>',
  },
  {
    id: 'false-friend-sensible',
    character: 'tobi',
    es: '<em>Sensible</em> en inglés significa "sensato", no "sensible" — para eso usa <em>sensitive</em>.',
    en: '<em>Sensible</em> in English means "sensible/wise", not "emotionally sensitive" — for that use <em>sensitive</em>.',
  },
] as const;

/**
 * Deterministic day-of-year index into `DESK_HELPER_TIPS` (or any array of
 * `length`), from the CALLER's own `Date` — called with a server `Date` at
 * SSR time and again with the visitor's own local `Date` client-side (see
 * `DeskHelper.astro`'s inline anti-flash script), so the index naturally
 * reads as "the browser's own timezone" once JS runs, while still giving a
 * real, non-arbitrary default with no JS at all. Pure and cheap enough to
 * duplicate verbatim in that classic inline script (kept tiny on purpose —
 * same posture as `BaseLayout.astro`'s own chrome-visibility script).
 */
export function pickDailyTipIndex(date: Date, length: number): number {
  if (length <= 0) return 0;
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86_400_000);
  return ((dayOfYear % length) + length) % length;
}
