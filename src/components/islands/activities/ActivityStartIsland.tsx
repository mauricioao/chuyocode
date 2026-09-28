/**
 * ActivityStartIsland — the `/[lang]/crear` start screen island (PR B,
 * "Activities creator"). Renders {@link BlockTypePicker}; choosing Worksheet
 * creates a brand-new, empty activity through `POST /api/actividades` and
 * navigates straight to its editor (`/[lang]/crear/<id>`) — the actual image
 * upload happens INSIDE the editor's worksheet block, not here.
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

  const handleSelectWorksheet = useCallback(async () => {
    setState('creating');
    try {
      const res = await fetch('/api/actividades', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lang, blocks: [] }),
      });
      if (!res.ok) {
        setState('error');
        return;
      }
      const data = (await res.json()) as { id?: string };
      if (!data.id) {
        setState('error');
        return;
      }
      navigate(`/${lang}/crear/${data.id}`);
    } catch {
      setState('error');
    }
  }, [lang, navigate]);

  return (
    <div data-testid="activity-start-island" className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-foreground">{t.heading}</h2>
      <BlockTypePicker lang={lang} onSelectWorksheet={handleSelectWorksheet} disabled={state === 'creating'} />
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
