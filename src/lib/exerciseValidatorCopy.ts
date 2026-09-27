/**
 * Bilingual copy for `ValidationCode` (design.md §7, "No human strings").
 *
 * The validator itself emits codes only, never prose — this is the one place
 * a code becomes a message, exactly like `LikeButton.COPY`,
 * `SignInForm.COPY` and `ReactionControl.COPY`.
 */
import type { ValidationCode } from './exerciseValidator';

export const COPY: Record<'es' | 'en', Record<ValidationCode, string>> = {
  es: {
    payload_unparseable: 'El contenido del ejercicio no se pudo interpretar.',
    slot_answer_empty: 'Este espacio no tiene una respuesta válida.',
    slot_answer_unknown_id: 'La respuesta no coincide con ninguna opción del banco.',
    slot_pool_missing: 'Este espacio usa un banco de opciones que no existe.',
    slot_multiple_blanks: 'El enunciado tiene más de un espacio en blanco.',
    slot_unknown_mechanic: 'Este tipo de ejercicio aún no existe.',
    pool_duplicate_id: 'Dos opciones del banco comparten el mismo id.',
    pool_duplicate_text: 'Dos opciones del banco muestran el mismo texto.',
    pool_empty: 'Este banco de opciones está vacío.',
    drop_pool_too_small: 'El banco compartido no tiene suficientes piezas para arrastrar.',
    listening_requires_audio: 'Un ejercicio de audio necesita un archivo de audio.',
    slug_invalid: 'El slug debe ser texto en inglés, en minúsculas y separado por guiones.',
    block_coverage_mismatch: 'Los bloques no cubren exactamente los espacios del ejercicio.',
    exercise_too_few_mechanics: 'Se recomienda combinar al menos dos mecánicas distintas.',
  },
  en: {
    payload_unparseable: 'The exercise content could not be parsed.',
    slot_answer_empty: 'This slot has no accepted answer.',
    slot_answer_unknown_id: 'The answer does not match any option in the pool.',
    slot_pool_missing: 'This slot references a pool that does not exist.',
    slot_multiple_blanks: 'The label has more than one blank.',
    slot_unknown_mechanic: 'This mechanic does not exist yet.',
    pool_duplicate_id: 'Two pool options share the same id.',
    pool_duplicate_text: 'Two pool options show the same text.',
    pool_empty: 'This pool has no items.',
    drop_pool_too_small: 'The shared pool does not have enough tiles to drag.',
    listening_requires_audio: 'A listening exercise needs an audio file.',
    slug_invalid: 'The slug must be lowercase, hyphen-separated English text.',
    block_coverage_mismatch: "The blocks do not cover the exercise's slots exactly.",
    exercise_too_few_mechanics: 'Combining at least two distinct mechanics is recommended.',
  },
};

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

/** The es/en message for one `ValidationCode`. Defaults to Spanish, like the
 * rest of the `COPY` maps in this codebase. */
export function messageFor(code: ValidationCode, lang: string): string {
  return copyFor(lang)[code];
}
