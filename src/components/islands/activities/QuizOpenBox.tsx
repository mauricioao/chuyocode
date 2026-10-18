/**
 * QuizOpenBox — "Caja sorpresa" (batch 1's Wordwall "Open the box"), one of
 * the alternate games a `quiz` block's own questions can be replayed as
 * (`gameModes.ts`'s `deriveGameItems`). A grid of numbered boxes, one per
 * item; opening a box reveals its prompt (with `SpeakButton`) behind a
 * "Ver respuesta" answer reveal — same reveal shape as every other alternate
 * game in this file's family. An opened box stays marked (a checkmark
 * overlay) even after a different box is opened, so a learner can see at a
 * glance which questions they have already worked through; re-opening an
 * already-opened box simply shows its content again.
 *
 * SELF-CONTAINED, NOT WIRED INTO THE PAGE'S SCORE — same posture as every
 * sibling in this file's family.
 */
import { useEffect, useMemo, useState } from 'react';
import { CheckIcon } from '@phosphor-icons/react/dist/ssr/Check';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import SpeakButton from '@/lib/speech/SpeakButton';
import type { GameItem } from '@/lib/activities/gameModes';
import type { PromptImageRef } from '@/lib/activities/blocks';
import PromptImage from '@/components/islands/mechanics/PromptImage';
import { optionColorClass } from '@/components/islands/mechanics/palette';
import {
  AnswerReveal,
  SINGLE_CARD,
  SINGLE_CARD_META,
  SINGLE_CARD_PROMPT,
} from '@/components/islands/mechanics/singleCard';

export interface QuizOpenBoxProps {
  lang: Lang;
  items: readonly GameItem[];
  /** This block's own `promptImages` map (owner decision 2026-10-16 follow-up), keyed by slot id — `undefined` = no question images authored, the common case. Display-only; see `PromptImage`'s own header. */
  promptImages?: Record<string, PromptImageRef>;
}

export default function QuizOpenBox({ lang, items, promptImages }: QuizOpenBoxProps) {
  const t = UI_LABELS[lang].activities.gameModes;
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const [openedIds, setOpenedIds] = useState<ReadonlySet<string>>(new Set());
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);

  // A different block (or its own item list changed) — start over.
  useEffect(() => {
    setOpenedIds(new Set());
    setActiveId(undefined);
    setRevealed(false);
  }, [items]);

  const active = activeId ? byId.get(activeId) : undefined;

  function handleOpen(id: string) {
    setActiveId(id);
    setOpenedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    setRevealed(false);
  }

  function handleReveal() {
    setRevealed(true);
  }

  if (items.length < 2) return null;

  return (
    <div data-testid="quiz-openbox" className="flex flex-col items-center gap-4">
      <div aria-live="polite" role="status" className="sr-only" data-testid="openbox-live-region">
        {active ? active.prompt : ''}
      </div>

      <p className={SINGLE_CARD_META}>{t.openboxHint}</p>

      <div data-testid="openbox-grid" className="grid grid-cols-4 gap-3 sm:grid-cols-6">
        {items.map((item, index) => {
          const opened = openedIds.has(item.id);
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`openbox-box-${item.id}`}
              onClick={() => handleOpen(item.id)}
              aria-label={`${t.openboxBoxAriaPrefix} ${index + 1}, ${opened ? t.openboxOpenedSuffix : t.openboxClosedSuffix}`}
              // A closed (or the active) box is a filled tile in the shared
              // position palette (`palette.ts` — the box's own place in the
              // grid, never correctness), the same matte "pressed key" lip
              // `chip.ts`'s colour chips use; the active one also lifts and
              // gains an ink ring. An opened box goes plain white — "already
              // looked inside" — with a neutral slate check, never green
              // (red/green stay reserved for a graded ✓/✕).
              className={cn(
                'relative flex size-14 items-center justify-center rounded-[12px] text-lg font-bold tabular-nums outline-none transition-[translate,background-color,box-shadow] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
                (isActive || !opened) && [
                  optionColorClass(index),
                  'text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.18)]',
                ],
                isActive && '-translate-y-0.5 ring-3 ring-foreground ring-offset-2 ring-offset-card',
                !isActive && !opened && 'hover:-translate-y-0.5',
                !isActive && opened && 'bg-card text-muted-foreground shadow-(--shadow-elevation-1) ring-1 ring-foreground/10',
              )}
            >
              {index + 1}
              {opened && !isActive && (
                <CheckIcon aria-hidden="true" weight="bold" className="absolute -right-1.5 -top-1.5 size-5 rounded-full bg-pop-slate p-1 text-white shadow-(--shadow-elevation-1)" />
              )}
            </button>
          );
        })}
      </div>

      {active && (
        <div data-testid="openbox-card" className={SINGLE_CARD}>
          <PromptImage image={promptImages?.[active.id]} />
          <p className={SINGLE_CARD_PROMPT}>{active.prompt}</p>
          <SpeakButton text={active.prompt} lang={lang} />

          {revealed ? (
            <AnswerReveal data-testid="openbox-answer" answer={active.answer} explanation={active.explanation} />
          ) : (
            <Button type="button" variant="outline" data-testid="openbox-reveal" onClick={handleReveal} className="h-11 sm:h-8">
              {t.openboxReveal}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
