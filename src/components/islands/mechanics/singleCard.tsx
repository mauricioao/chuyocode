/**
 * The single-card games' shared stage look — ONE recipe for "Tarjetas",
 * "Ruleta", "Caja sorpresa", "Verdadero o falso", "Anagrama", "Ahorcado" and
 * "Cartas para hablar" (DIRECCION-VISUAL.md §5 pending item: "Llevar el
 * mismo estilo a los juegos de una sola tarjeta"), instead of seven copies
 * of the old `rounded-lg border-2 border-border bg-surface-soft` box with a
 * yellow `bg-accent/10` answer well drifting apart one edit at a time — the
 * same argument `chip.ts`'s own header makes for the drag games' chips.
 *
 * Kit rules this follows (DIRECCION-VISUAL.md §3.2/§3.3): a card is a
 * rounded rectangle on the radius ladder (26px for a ~240px card, ~22% of a
 * typical card's height is far above the ladder's top step, so the ladder's
 * own large step wins), a soft ink-tinted shadow (`shadow-elevation-2`,
 * never pure black) plus a hairline ring instead of a hard 2px border, and
 * no halo glow behind it. The revealed answer sits in a pale sky well — the
 * kit's light tones are for "selección, burbujas y fondos con texto
 * oscuro", and red/green stay reserved for the ✓/✕ marks, so a NEUTRAL
 * reveal never borrows either.
 */
import { LightbulbIcon } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { cn } from '@/lib/utils';

/** The white stage card a single-card game shows its one question on. Callers add only their own extras (`min-h-*`, an entrance animation). */
export const SINGLE_CARD =
  'flex w-full max-w-xl flex-col items-center justify-center gap-4 rounded-[26px] bg-card p-6 text-center shadow-elevation-2 ring-1 ring-foreground/5 sm:p-8';

/** The question/statement text on {@link SINGLE_CARD} — semibold ink, sentence case, one step up on wider screens. */
export const SINGLE_CARD_PROMPT = 'text-xl font-semibold text-foreground sm:text-2xl';

/** The quiet "1 / 6", "Palabra 1 de 6" counters and hints above a card. */
export const SINGLE_CARD_META = 'text-sm font-medium text-muted-foreground tabular-nums';

export interface AnswerRevealProps {
  answer: string;
  explanation?: string;
  'data-testid': string;
  className?: string;
}

/**
 * The revealed answer (+ the slot's own explanation, when authored) — the
 * SAME markup "Ruleta", "Caja sorpresa" and "Cartas para hablar" each used
 * to repeat inline. `data-testid` stays each caller's own (`wheel-answer`,
 * `openbox-answer`, `speaking-answer`).
 */
export function AnswerReveal({ answer, explanation, 'data-testid': testId, className }: AnswerRevealProps) {
  return (
    <div
      data-testid={testId}
      className={cn('flex flex-col items-center gap-2 rounded-2xl bg-pop-sky/15 px-5 py-3', className)}
    >
      <p className="text-lg font-semibold text-foreground sm:text-xl">{answer}</p>
      {explanation && <AnswerExplanation text={explanation} />}
    </div>
  );
}

/** The lightbulb + explanation line — shared by {@link AnswerReveal} and the flashcard's own back face. */
export function AnswerExplanation({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-1.5 text-left text-sm text-foreground">
      <LightbulbIcon aria-hidden="true" weight="fill" className="mt-0.5 shrink-0 text-hint" />
      <p>{text}</p>
    </div>
  );
}
