/**
 * ActivityStartIsland — the `/[lang]/crear` start screen island (PR B,
 * "Activities creator"; the Questions path ships in PR C, "Preguntas (quiz)
 * block"). Renders {@link BlockTypePicker}: either choice creates a
 * brand-new activity through `POST /api/actividades` and navigates straight
 * to its editor (`/[lang]/crear/<id>`).
 *
 * "First block visible" (creator polish round 4, owner feedback #2): the
 * chosen type's first block is created in THIS SAME `POST /api/actividades`
 * call, `'draft'`-tolerant server-side (`blocks.ts`'s `parseWorksheetBlock`/
 * `parseBlocks`) — never a second, best-effort save afterward, so a failure
 * here surfaces as the ordinary create-error toast instead of silently
 * landing the author on an empty editor.
 *
 *  - Worksheet: one EMPTY worksheet block (no image yet) — the editor
 *    renders its own drop-zone empty state for it (`BlockList.tsx`); the
 *    actual upload still happens INSIDE the editor, not here.
 *  - Questions: one empty quiz block, matching "starting with Preguntas
 *    creates the activity with one empty quiz block" — the editor needs no
 *    upload step, so the author lands straight on an editable question.
 *
 * Busy state (navigation-without-flicker PR): no more inline "Creando la
 * actividad…" text. The chosen card itself shows the busy state
 * (`BlockTypePicker`'s spinner + `aria-busy`) while the other one dims and
 * both become non-interactive; a failure shows a toast (`sonner`) and
 * restores the picker to idle instead of leaving an inline error message up.
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import BlockTypePicker, { type BlockTypeCard } from './BlockTypePicker';

export interface ActivityStartIslandProps {
  lang: Lang;
  /** Injectable for tests. Defaults to a real full-page navigation. */
  navigate?: (url: string) => void;
}

function defaultNavigate(url: string): void {
  window.location.href = url;
}

export default function ActivityStartIsland({ lang, navigate = defaultNavigate }: ActivityStartIslandProps) {
  const t = UI_LABELS[lang].activities.start;
  const [busyCard, setBusyCard] = useState<BlockTypeCard | null>(null);

  const createActivity = useCallback(
    async (blocks: unknown[]): Promise<string | null> => {
      const res = await fetch('/api/actividades', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lang, blocks }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { id?: string };
      return data.id ?? null;
    },
    [lang],
  );

  const handleSelectWorksheet = useCallback(async () => {
    setBusyCard('worksheet');
    try {
      const id = await createActivity([{ id: crypto.randomUUID(), type: 'worksheet', rotation: 0, zones: [] }]);
      if (!id) {
        toast.error(t.createError);
        setBusyCard(null);
        return;
      }
      navigate(`/${lang}/crear/${id}`);
    } catch {
      toast.error(t.createError);
      setBusyCard(null);
    }
  }, [createActivity, lang, navigate, t.createError]);

  const handleSelectQuestions = useCallback(async () => {
    setBusyCard('questions');
    try {
      const id = await createActivity([
        { id: crypto.randomUUID(), type: 'quiz', payload: { pools: {}, slots: [] } },
      ]);
      if (!id) {
        toast.error(t.createError);
        setBusyCard(null);
        return;
      }
      navigate(`/${lang}/crear/${id}`);
    } catch {
      toast.error(t.createError);
      setBusyCard(null);
    }
  }, [createActivity, lang, navigate, t.createError]);

  // "Une las parejas" (start-gallery redesign, build item 3/4): same shape
  // as Questions above, tagged with the `'match'` template (`blocks.ts`'s
  // `QuizTemplate`) so the editor/practice both know this block started as
  // a matching activity from its very first save.
  const handleSelectMatch = useCallback(async () => {
    setBusyCard('match');
    try {
      const id = await createActivity([
        { id: crypto.randomUUID(), type: 'quiz', template: 'match', payload: { pools: {}, slots: [] } },
      ]);
      if (!id) {
        toast.error(t.createError);
        setBusyCard(null);
        return;
      }
      navigate(`/${lang}/crear/${id}`);
    } catch {
      toast.error(t.createError);
      setBusyCard(null);
    }
  }, [createActivity, lang, navigate, t.createError]);

  // "Reordenar" (Wordwall templates build): same shape as Match above,
  // tagged with the `'reorder'` template so the editor/practice both know
  // this block started as a sentence-reordering activity from its first save.
  const handleSelectReorder = useCallback(async () => {
    setBusyCard('reorder');
    try {
      const id = await createActivity([
        { id: crypto.randomUUID(), type: 'quiz', template: 'reorder', payload: { pools: {}, slots: [] } },
      ]);
      if (!id) {
        toast.error(t.createError);
        setBusyCard(null);
        return;
      }
      navigate(`/${lang}/crear/${id}`);
    } catch {
      toast.error(t.createError);
      setBusyCard(null);
    }
  }, [createActivity, lang, navigate, t.createError]);

  return (
    <div data-testid="activity-start-island" className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-foreground">{t.heading}</h2>
      <BlockTypePicker
        lang={lang}
        onSelectWorksheet={handleSelectWorksheet}
        onSelectQuestions={handleSelectQuestions}
        onSelectMatch={handleSelectMatch}
        onSelectReorder={handleSelectReorder}
        busyCard={busyCard}
      />
    </div>
  );
}
