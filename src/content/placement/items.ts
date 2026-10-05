/**
 * Placement test item bank — DRAFT feature, hidden route `/[lang]/ingles/nivel`
 * (see that page's own header, and `src/lib/placement/scoring.ts` for how
 * answers turn into a level).
 *
 * 30 ORIGINAL multiple-choice items (not copied from any published test),
 * A1 to B2, ordered easy -> hard: A1 x8, A2 x8, B1 x7, B2 x7. Mostly grammar,
 * some vocabulary, and at least one short functional/reading item per level
 * (a 1-2 sentence context plus a question). `items.test.ts` guards every one
 * of these invariants (counts, unique ids, exactly one correct option per
 * item, a non-empty Spanish explanation, >=2 skills per level).
 *
 * The STEM and OPTIONS are English in BOTH locales — same rule
 * `@lib/exerciseTaxonomy.ts` applies to curated exercises: this section's
 * content is English, not chrome. `explanationEs` is a one-line Spanish note
 * for a future review screen; it is never shown during the test itself
 * (spec: no per-item feedback while taking it).
 */

/**
 * CEFR levels this draft covers — a SUBSET of `@lib/exerciseTaxonomy`'s
 * `LEVELS` (which also carries C1/C2 for the curated exercises section): the
 * owner's brief caps this test at A1-B2.
 */
export const PLACEMENT_LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2'] as const;

export type PlacementLevel = (typeof PLACEMENT_LEVEL_ORDER)[number];

/**
 * What an item is mainly testing. Every level mixes at least two of these,
 * and always includes at least one `reading` item (a short context plus a
 * comprehension question).
 */
export const PLACEMENT_SKILLS = ['grammar', 'vocabulary', 'reading'] as const;

export type PlacementSkill = (typeof PLACEMENT_SKILLS)[number];

export interface PlacementItem {
  /** Stable id, e.g. `a1-3` — never a position, so reordering this file never
   * changes which item a stored answer belongs to. */
  readonly id: string;
  readonly level: PlacementLevel;
  readonly skill: PlacementSkill;
  /** The question stem, in English. */
  readonly prompt: string;
  /** Exactly 4 distinct, non-empty options, in English. */
  readonly options: readonly [string, string, string, string];
  /** Index into `options` of the one defensible correct answer. */
  readonly correctIndex: 0 | 1 | 2 | 3;
  /** One-line Spanish explanation, for a future review screen. */
  readonly explanationEs: string;
}

export const PLACEMENT_ITEMS: readonly PlacementItem[] = [
  // ---------------------------------------------------------------- A1 (8)
  {
    id: 'a1-1',
    level: 'A1',
    skill: 'grammar',
    prompt: 'Maria ___ from Peru.',
    options: ['am', 'is', 'are', 'be'],
    correctIndex: 1,
    explanationEs: "Con la tercera persona singular (she/he/it) el verbo 'to be' es 'is'.",
  },
  {
    id: 'a1-2',
    level: 'A1',
    skill: 'grammar',
    prompt: 'This is Tom. ___ car is red.',
    options: ['He', 'His', 'Him', "He's"],
    correctIndex: 1,
    explanationEs: "Antes de un sustantivo se usa el adjetivo posesivo 'his', no el pronombre 'he'.",
  },
  {
    id: 'a1-3',
    level: 'A1',
    skill: 'grammar',
    prompt: 'She has ___ umbrella in her bag.',
    // No 'the' option: "the umbrella" is grammatical too (a known umbrella).
    options: ['a', 'an', 'some', '-'],
    correctIndex: 1,
    explanationEs: "Se usa 'an' delante de una palabra que empieza con sonido vocálico, como 'umbrella'.",
  },
  {
    id: 'a1-4',
    level: 'A1',
    skill: 'grammar',
    prompt: 'There are three ___ on the table.',
    options: ['apple', 'apples', "apples's", 'an apple'],
    correctIndex: 1,
    explanationEs: "Con 'three' (más de uno) el sustantivo va en plural: 'apples'.",
  },
  {
    id: 'a1-5',
    level: 'A1',
    skill: 'grammar',
    prompt: '___ you speak English?',
    options: ['Do', 'Does', 'Are', 'Is'],
    correctIndex: 0,
    explanationEs: "Las preguntas en presente simple con 'you' se forman con el auxiliar 'do'.",
  },
  {
    id: 'a1-6',
    level: 'A1',
    skill: 'vocabulary',
    prompt: "Which word means the opposite of 'big'?",
    options: ['Small', 'Tall', 'Long', 'Heavy'],
    correctIndex: 0,
    explanationEs: "'Small' es el antónimo de 'big' (pequeño frente a grande).",
  },
  {
    id: 'a1-7',
    level: 'A1',
    skill: 'vocabulary',
    prompt: 'What do you use to write on paper?',
    options: ['A spoon', 'A pen', 'A key', 'A plate'],
    correctIndex: 1,
    explanationEs: "'A pen' (un bolígrafo) es lo que se usa para escribir.",
  },
  {
    id: 'a1-8',
    level: 'A1',
    skill: 'reading',
    prompt: "A sign on a shop door says: 'CLOSED. Back at 3 p.m.' What does this sign mean?",
    options: [
      'The shop is open right now.',
      'The shop will open later.',
      'The shop is open all day.',
      'The shop closed forever.',
    ],
    correctIndex: 1,
    explanationEs: 'El cartel dice que la tienda está cerrada y vuelve a abrir a las 3 p.m.',
  },

  // ---------------------------------------------------------------- A2 (8)
  {
    id: 'a2-1',
    level: 'A2',
    skill: 'grammar',
    prompt: 'Yesterday, I ___ my homework before dinner.',
    options: ['finish', 'finished', 'finishing', 'finishes'],
    correctIndex: 1,
    explanationEs: "'Yesterday' indica pasado; los verbos regulares forman el pasado con '-ed': finished.",
  },
  {
    id: 'a2-2',
    level: 'A2',
    skill: 'grammar',
    prompt: 'They ___ to Mexico last summer.',
    options: ['go', 'goes', 'went', 'going'],
    correctIndex: 2,
    explanationEs: "'Go' es un verbo irregular; su forma de pasado es 'went'.",
  },
  {
    id: 'a2-3',
    level: 'A2',
    skill: 'grammar',
    prompt: 'Look! It ___ outside right now.',
    options: ['rains', 'rain', 'is raining', 'rained'],
    correctIndex: 2,
    explanationEs: "'Right now' indica una acción en curso, por eso se usa el presente continuo.",
  },
  {
    id: 'a2-4',
    level: 'A2',
    skill: 'grammar',
    prompt: 'This exercise is ___ than the last one.',
    options: ['easy', 'easier', 'more easy', 'easiest'],
    correctIndex: 1,
    explanationEs: "Los adjetivos cortos como 'easy' forman el comparativo con '-er': easier.",
  },
  {
    id: 'a2-5',
    level: 'A2',
    skill: 'grammar',
    prompt: "There isn't ___ milk in the fridge.",
    options: ['some', 'any', 'a', 'much a'],
    correctIndex: 1,
    explanationEs: "En oraciones negativas se usa 'any', no 'some'.",
  },
  {
    id: 'a2-6',
    level: 'A2',
    skill: 'vocabulary',
    prompt: 'A person who teaches students is called a ___.',
    options: ['doctor', 'teacher', 'driver', 'waiter'],
    correctIndex: 1,
    explanationEs: "'Teacher' es la persona que enseña a los estudiantes.",
  },
  {
    id: 'a2-7',
    level: 'A2',
    skill: 'vocabulary',
    prompt: 'What do you call the meal you eat in the morning?',
    options: ['Breakfast', 'Lunch', 'Dinner', 'Snack'],
    correctIndex: 0,
    explanationEs: "'Breakfast' es la comida de la mañana.",
  },
  {
    id: 'a2-8',
    level: 'A2',
    skill: 'reading',
    prompt:
      "A text message says: 'Can't talk now, in a meeting. Call you back at 5?' What does the sender want to do?",
    options: ['End the friendship.', 'Call back later.', 'Meet for lunch.', 'Cancel the meeting.'],
    correctIndex: 1,
    explanationEs: 'El mensaje dice que va a devolver la llamada más tarde, a las 5.',
  },

  // ---------------------------------------------------------------- B1 (7)
  {
    id: 'b1-1',
    level: 'B1',
    skill: 'grammar',
    // 'since' forces the present perfect; "I saw this movie before" would be
    // accepted in American English, so an experience cue is not enough.
    prompt: 'I ___ in this city since 2019.',
    options: ['live', 'lived', 'have lived', 'am living'],
    correctIndex: 2,
    explanationEs:
      "Con 'since' + el momento en que empezó algo que sigue hoy se usa el presente perfecto: 'have lived'.",
  },
  {
    id: 'b1-2',
    level: 'B1',
    skill: 'grammar',
    prompt: 'If it rains tomorrow, we ___ the picnic.',
    // Not 'cancel': a present-tense plan ("we cancel") is heard colloquially.
    options: ['cancelling', 'will cancel', 'cancelled', 'would cancel'],
    correctIndex: 1,
    explanationEs: "El primer condicional usa 'will' + verbo en la cláusula principal para una condición real y futura.",
  },
  {
    id: 'b1-3',
    level: 'B1',
    skill: 'grammar',
    prompt: "You ___ wear a uniform at this school; it's a strict rule.",
    options: ['can', 'might', 'have to', 'could'],
    correctIndex: 2,
    explanationEs: "'Have to' expresa una obligación externa, como una norma del colegio.",
  },
  {
    id: 'b1-4',
    level: 'B1',
    skill: 'grammar',
    prompt: 'The woman ___ lives next door is a doctor.',
    options: ['which', 'who', 'whose', 'whom'],
    correctIndex: 1,
    explanationEs: "'Who' se usa para referirse a personas como sujeto de la oración.",
  },
  {
    id: 'b1-5',
    level: 'B1',
    skill: 'vocabulary',
    prompt: "If you 'look forward to' something, you ___.",
    options: [
      'are worried about it',
      'feel excited about something coming',
      'have already finished it',
      'have forgotten about it',
    ],
    correctIndex: 1,
    explanationEs: "'Look forward to' significa esperar algo con ilusión o entusiasmo.",
  },
  {
    id: 'b1-6',
    level: 'B1',
    skill: 'vocabulary',
    prompt: 'The meeting was ___ postponed because of the storm.',
    options: ['suddenly', 'sudden', 'suddenness', 'suddenize'],
    correctIndex: 0,
    explanationEs: "Se necesita un adverbio para modificar el verbo 'postponed'; la forma correcta es 'suddenly'.",
  },
  {
    id: 'b1-7',
    level: 'B1',
    skill: 'reading',
    prompt:
      "An email says: 'Sorry, I can't make it to the meeting today — something urgent came up at home. Can we reschedule for tomorrow?' What is the writer asking for?",
    options: [
      'To cancel the meeting for good.',
      'To move the meeting to another day.',
      'To start the meeting early.',
      "To meet at the writer's home.",
    ],
    correctIndex: 1,
    explanationEs: 'El mensaje pide posponer (reprogramar) la reunión para el día siguiente.',
  },

  // ---------------------------------------------------------------- B2 (7)
  {
    id: 'b2-1',
    level: 'B2',
    skill: 'grammar',
    prompt: 'If I ___ more free time, I would learn to play the guitar.',
    options: ['have', 'had', 'will have', 'would have'],
    correctIndex: 1,
    explanationEs:
      "El segundo condicional usa el pasado simple en la cláusula 'if' para una situación hipotética en el presente.",
  },
  {
    id: 'b2-2',
    level: 'B2',
    skill: 'grammar',
    prompt: 'This bridge ___ in 1932.',
    options: ['built', 'was built', 'has built', 'builds'],
    correctIndex: 1,
    explanationEs: "La voz pasiva en pasado se forma con 'was/were' + participio: 'was built'.",
  },
  {
    id: 'b2-3',
    level: 'B2',
    skill: 'grammar',
    // Distractors are ungrammatical here on purpose: 'will' (British deduction)
    // and 'should' (expectation) would both be defensible answers.
    prompt: "You've been working for twelve hours. You ___ be exhausted.",
    options: ['must', 'can', 'need', 'ought'],
    correctIndex: 0,
    explanationEs:
      "'Must' expresa una deducción lógica fuerte sobre el presente; 'need' y 'ought' necesitarían otra estructura ('need not', 'ought to').",
  },
  {
    id: 'b2-4',
    level: 'B2',
    skill: 'grammar',
    // A reported QUESTION: backshift in reported statements is optional when
    // the fact still holds, so 'is' vs 'was' items have two defensible answers.
    prompt: 'She asked me where ___.',
    options: ['I lived', 'did I live', 'do I live', 'I do live'],
    correctIndex: 0,
    explanationEs:
      "En las preguntas indirectas va el orden de una afirmación (sujeto + verbo), sin 'do/did': 'where I lived'.",
  },
  {
    id: 'b2-5',
    level: 'B2',
    skill: 'vocabulary',
    prompt: "Someone who is 'reliable' is a person you can ___.",
    options: ['depend on', 'argue with', 'laugh at', 'forget about'],
    correctIndex: 0,
    explanationEs: "'Reliable' significa que se puede confiar o depender de esa persona.",
  },
  {
    id: 'b2-6',
    level: 'B2',
    skill: 'vocabulary',
    prompt: "Choose the word closest in meaning to 'reluctant': He was ___ to admit his mistake.",
    options: ['eager', 'unwilling', 'proud', 'quick'],
    correctIndex: 1,
    explanationEs: "'Reluctant' significa poco dispuesto a hacer algo, como 'unwilling'.",
  },
  {
    id: 'b2-7',
    level: 'B2',
    skill: 'reading',
    prompt:
      "A notice in an office reads: 'Due to essential maintenance, the lift will be out of service from Monday to Wednesday. Please use the stairs.' What should employees do on Tuesday?",
    options: [
      'Wait for the lift to be fixed before entering the building.',
      'Use the stairs instead of the lift.',
      'Work from home that day.',
      'Report the lift as broken.',
    ],
    correctIndex: 1,
    explanationEs: 'El aviso indica que el ascensor estará fuera de servicio esos días y hay que usar las escaleras.',
  },
];
