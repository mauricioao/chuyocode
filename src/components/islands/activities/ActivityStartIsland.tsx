/**
 * ActivityStartIsland — the `/[lang]/crear` start screen island (PR B,
 * "Activities creator"; the Questions path ships in PR C, "Preguntas (quiz)
 * block"). Renders {@link BlockTypePicker}: either choice creates a
 * brand-new, empty activity through `POST /api/actividades` and navigates
 * straight to its editor (`/[lang]/crear/<id>`).
 *
 * Worksheet: the actual image upload happens INSIDE the editor's worksheet
 * block, not here — the activity is created with zero blocks.
 *
 * Questions: the editor needs no upload step, so this ALSO seeds one empty
 * quiz block via a second call to the editor's own autosave endpoint
 * (`guardar`, `'draft'`-tolerant since blocks.ts/exercisePayload.ts's PR C
 * change) before navigating — the author lands straight on an editable
 * question, matching "starting with Preguntas creates the activity with one
 * empty quiz block". That second call is BEST-EFFORT: a failure there still
 * navigates to a valid (if momentarily empty) editor rather than stranding
 * the author on this screen after the activity already exists.
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

  const createActivity = useCallback(async (): Promise<string | null> => {
    const res = await fetch('/api/actividades', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang, blocks: [] }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  }, [lang]);

  const handleSelectWorksheet = useCallback(async () => {
    setBusyCard('worksheet');
    try {
      const id = await createActivity();
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
      const id = await createActivity();
      if (!id) {
        toast.error(t.createError);
        setBusyCard(null);
        return;
      }
      try {
        await fetch(`/api/actividades/${id}/guardar`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: UI_LABELS[lang].activities.untitledTitle,
            level: null,
            blocks: [{ id: crypto.randomUUID(), type: 'quiz', payload: { pools: {}, slots: [] } }],
          }),
        });
      } catch {
        // Best-effort — see file header. The activity already exists; the
        // editor simply opens with zero blocks, same as Worksheet does
        // before any image is uploaded.
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
        busyCard={busyCard}
      />
    </div>
  );
}
