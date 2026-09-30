/**
 * Aventura scene content format — the hidden retro-RPG English lesson
 * prototype (`/[lang]/ingles/aventura`, never linked). A scene is authored
 * data (`src/content/aventura/*.ts`), never user input, but it is still
 * hand-authored and easy to typo, so it is validated with a PURE parser
 * (zero I/O, no dependency — same posture as every other hand-rolled
 * validator in this codebase, e.g. `@lib/exerciseTaxonomy`'s `isLevel`)
 * rather than trusted as-typed. `parseScene` never throws — it returns every
 * problem it finds so a content mistake is one readable list, not a stack
 * trace; `parseSceneOrThrow` is the fail-fast wrapper content modules call at
 * import time so a broken scene breaks the build instead of shipping.
 */

/** Backdrops the retro screen can draw (CSS/SVG shapes, no image assets — see `SceneBackdrop`). */
export const BACKGROUNDS = ['inn', 'forest', 'castle', 'market'] as const;
export type Background = (typeof BACKGROUNDS)[number];

export interface Speaker {
  name: string;
  /** Optional sprite key for `SceneBackdrop`'s portrait box; falls back to a generic silhouette. */
  sprite?: string;
}

export interface ChoiceOption {
  en: string;
  correct: boolean;
  feedback_es: string;
}

export interface Choice {
  question_es: string;
  options: ChoiceOption[];
}

export interface GrammarNote {
  title: string;
  note: string;
}

export interface Line {
  id: string;
  speaker: Speaker;
  en: string;
  es: string;
  grammar?: GrammarNote;
  choice?: Choice;
  /** Explicit next line id — omitted means "the next line in authored order". */
  next?: string;
}

export interface Scene {
  id: string;
  title: string;
  background: Background;
  lines: Line[];
}

export interface ParseResult {
  ok: boolean;
  scene: Scene | null;
  errors: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSpeaker(value: unknown, path: string, errors: string[]): Speaker | null {
  if (!isRecord(value)) {
    errors.push(`${path}: speaker must be an object`);
    return null;
  }
  if (!isNonEmptyString(value.name)) {
    errors.push(`${path}.speaker.name: required non-empty string`);
    return null;
  }
  const speaker: Speaker = { name: value.name };
  if (value.sprite !== undefined) {
    if (!isNonEmptyString(value.sprite)) {
      errors.push(`${path}.speaker.sprite: must be a non-empty string when present`);
      return null;
    }
    speaker.sprite = value.sprite;
  }
  return speaker;
}

function parseGrammar(value: unknown, path: string, errors: string[]): GrammarNote | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isNonEmptyString(value.title) || !isNonEmptyString(value.note)) {
    errors.push(`${path}.grammar: must be { title, note } with non-empty strings`);
    return undefined;
  }
  return { title: value.title, note: value.note };
}

function parseChoice(value: unknown, path: string, errors: string[]): Choice | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isNonEmptyString(value.question_es)) {
    errors.push(`${path}.choice.question_es: required non-empty string`);
    return undefined;
  }
  if (!Array.isArray(value.options) || value.options.length < 2) {
    errors.push(`${path}.choice.options: needs at least 2 options`);
    return undefined;
  }
  const options: ChoiceOption[] = [];
  let hasInvalid = false;
  value.options.forEach((raw, i) => {
    const optPath = `${path}.choice.options[${i}]`;
    if (!isRecord(raw) || !isNonEmptyString(raw.en) || typeof raw.correct !== 'boolean' || !isNonEmptyString(raw.feedback_es)) {
      errors.push(`${optPath}: must be { en, correct: boolean, feedback_es }`);
      hasInvalid = true;
      return;
    }
    options.push({ en: raw.en, correct: raw.correct, feedback_es: raw.feedback_es });
  });
  if (hasInvalid) return undefined;
  const correctCount = options.filter((o) => o.correct).length;
  if (correctCount !== 1) {
    errors.push(`${path}.choice.options: exactly one option must be correct, found ${correctCount}`);
    return undefined;
  }
  return { question_es: value.question_es, options };
}

function parseLine(value: unknown, index: number, errors: string[]): Line | null {
  const path = `lines[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path}: must be an object`);
    return null;
  }
  if (!isNonEmptyString(value.id)) {
    errors.push(`${path}.id: required non-empty string`);
    return null;
  }
  const speaker = parseSpeaker(value.speaker, path, errors);
  if (!isNonEmptyString(value.en)) errors.push(`${path}.en: required non-empty string`);
  if (!isNonEmptyString(value.es)) errors.push(`${path}.es: required non-empty string`);
  if (value.next !== undefined && !isNonEmptyString(value.next)) {
    errors.push(`${path}.next: must be a non-empty string when present`);
  }

  const grammar = parseGrammar(value.grammar, path, errors);
  const choice = parseChoice(value.choice, path, errors);

  if (!speaker || !isNonEmptyString(value.en) || !isNonEmptyString(value.es)) return null;

  const line: Line = { id: value.id, speaker, en: value.en, es: value.es };
  if (grammar) line.grammar = grammar;
  if (choice) line.choice = choice;
  if (isNonEmptyString(value.next)) line.next = value.next;
  return line;
}

/**
 * Validate raw, untyped data into a {@link Scene}. Never throws: collects
 * every problem found and returns `{ ok: false, errors }` rather than
 * stopping at the first one, so one bad authoring pass fixes every issue in
 * one read.
 */
export function parseScene(data: unknown): ParseResult {
  const errors: string[] = [];

  if (!isRecord(data)) {
    return { ok: false, scene: null, errors: ['scene: must be an object'] };
  }
  if (!isNonEmptyString(data.id)) errors.push('id: required non-empty string');
  if (!isNonEmptyString(data.title)) errors.push('title: required non-empty string');
  if (!isNonEmptyString(data.background) || !(BACKGROUNDS as readonly string[]).includes(data.background)) {
    errors.push(`background: must be one of ${BACKGROUNDS.join(', ')}`);
  }
  if (!Array.isArray(data.lines) || data.lines.length === 0) {
    errors.push('lines: required non-empty array');
    return { ok: false, scene: null, errors };
  }

  const lines: Line[] = [];
  data.lines.forEach((raw, i) => {
    const line = parseLine(raw, i, errors);
    if (line) lines.push(line);
  });

  if (lines.length !== data.lines.length) {
    return { ok: false, scene: null, errors };
  }

  const seenIds = new Set<string>();
  for (const line of lines) {
    if (seenIds.has(line.id)) errors.push(`lines: duplicate line id "${line.id}"`);
    seenIds.add(line.id);
  }
  for (const line of lines) {
    if (line.next !== undefined && !seenIds.has(line.next)) {
      errors.push(`lines: "${line.id}".next references unknown line id "${line.next}"`);
    }
  }

  if (errors.length > 0) return { ok: false, scene: null, errors };

  // Every branch above that could leave `id`/`title` invalid already pushed
  // to `errors` and returned early — by this point both are known-valid
  // non-empty strings, just not narrowed as such through `isNonEmptyString`.
  const scene: Scene = {
    id: data.id as string,
    title: data.title as string,
    background: data.background as Background,
    lines,
  };
  return { ok: true, scene, errors: [] };
}

/** Fail-fast wrapper: throws with every collected error joined, one per line — for content modules to call at import time. */
export function parseSceneOrThrow(data: unknown): Scene {
  const result = parseScene(data);
  if (!result.ok || !result.scene) {
    throw new Error(`Invalid Aventura scene:\n${result.errors.join('\n')}`);
  }
  return result.scene;
}
