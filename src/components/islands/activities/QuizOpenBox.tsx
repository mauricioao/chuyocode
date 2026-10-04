/**
 * QuizOpenBox — "Abre la caja" (batch 1's Wordwall "Open the box"), one of
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
import { LightbulbIcon } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import SpeakButton from '@/lib/speech/SpeakButton';
import type { GameItem } from '@/lib/activities/gameModes';

export interface QuizOpenBoxProps {
  lang: Lang;
  items: readonly GameItem[];
}

export default function QuizOpenBox({ lang, items }: QuizOpenBoxProps) {
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

      <p className="text-sm text-muted-foreground">{t.openboxHint}</p>

      <div data-testid="openbox-grid" className="grid grid-cols-4 gap-2 sm:grid-cols-6">
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
              className={cn(
                'relative flex size-11 items-center justify-center rounded-md border-2 text-sm font-bold transition-colors',
                isActive && 'border-accent-ink bg-accent/10 text-foreground',
                !isActive && opened && 'border-success-strong/60 bg-success-strong/10 text-success-strong-foreground',
                !isActive && !opened && 'border-border bg-surface-soft text-foreground hover:border-accent-ink/60',
              )}
            >
              {index + 1}
              {opened && !isActive && (
                <CheckIcon aria-hidden="true" weight="bold" className="absolute -right-1 -top-1 size-4 rounded-full bg-success-strong p-0.5 text-white" />
              )}
            </button>
          );
        })}
      </div>

      {active && (
        <div
          data-testid="openbox-card"
          className="flex w-full max-w-md flex-col items-center gap-3 rounded-lg border-2 border-border bg-surface-soft p-6 text-center"
        >
          <p className="text-lg font-semibold text-foreground sm:text-xl">{active.prompt}</p>
          <SpeakButton text={active.prompt} lang={lang} />

          {revealed ? (
            <div data-testid="openbox-answer" className="flex flex-col items-center gap-2 rounded-md border border-accent-ink bg-accent/10 p-3">
              <p className="text-lg font-semibold text-foreground">{active.answer}</p>
              {active.explanation && (
                <div className="flex items-start gap-1.5 text-left text-sm text-foreground">
                  <LightbulbIcon aria-hidden="true" weight="fill" className="mt-0.5 shrink-0 text-hint" />
                  <p>{active.explanation}</p>
                </div>
              )}
            </div>
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
