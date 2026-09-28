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
 */
import { useCallback, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import BlockTypePicker from './BlockTypePicker';

export interface ActivityStartIslandProps {
  lang: Lang;
  /** Injectable for tests. Defaults to a real full-page navigation. */
  navigate?: (url: string) => void;
}

type State = 'idle' | 'creating' | 'error';

function defaultNavigate(url: string): void {
  window.location.href = url;
}

export default function ActivityStartIsland({ lang, navigate = defaultNavigate }: ActivityStartIslandProps) {
  const t = UI_LABELS[lang].activities.start;
  const [state, setState] = useState<State>('idle');

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
    setState('creating');
    try {
      const id = await createActivity();
      if (!id) {
        setState('error');
        return;
      }
      navigate(`/${lang}/crear/${id}`);
    } catch {
      setState('error');
    }
  }, [createActivity, lang, navigate]);

  const handleSelectQuestions = useCallback(async () => {
    setState('creating');
    try {
      const id = await createActivity();
      if (!id) {
        setState('error');
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
      setState('error');
    }
  }, [createActivity, lang, navigate]);

  return (
    <div data-testid="activity-start-island" className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-foreground">{t.heading}</h2>
      <BlockTypePicker
        lang={lang}
        onSelectWorksheet={handleSelectWorksheet}
        onSelectQuestions={handleSelectQuestions}
        disabled={state === 'creating'}
      />
      {state === 'creating' && (
        <p role="status" data-testid="start-creating" className="text-sm text-muted-foreground">
          {t.creating}
        </p>
      )}
      {state === 'error' && (
        <p role="alert" data-testid="start-error" className="text-sm text-destructive">
          {t.createError}
        </p>
      )}
    </div>
  );
}
