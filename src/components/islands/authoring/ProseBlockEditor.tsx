/**
 * ProseBlockEditor — the plain-textarea editor for a `prose` context block
 * (slice 15, design.md §8).
 *
 * Content-only, never graded (`specs/exercise-blocks/spec.md`, "prose and
 * media Blocks Are Context-Only"): this editor writes `ProseBlock.text` and
 * nothing else.
 *
 * COPY IS LOCAL, never `UI_LABELS` — same rule `ExerciseIsland.tsx` and
 * `ReactionControl.tsx` document at their own local `COPY`: this is a React
 * island and must not pull the Astro-side i18n module into the client
 * bundle.
 */
import type { ProseBlock } from '@/lib/exercisePayload';

export const COPY = {
  es: { label: 'Texto de contexto', remove: 'Quitar este bloque de texto' },
  en: { label: 'Context text', remove: 'Remove this text block' },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface ProseBlockEditorProps {
  block: ProseBlock;
  lang: string;
  onChange: (text: string) => void;
  onRemove: () => void;
}

export default function ProseBlockEditor({ block, lang, onChange, onRemove }: ProseBlockEditorProps) {
  const t = copyFor(lang);
  const fieldId = `${block.id}-text`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className="text-sm font-medium text-zinc-100">
          {t.label}
        </label>
        <button
          type="button"
          aria-label={t.remove}
          data-testid={`remove-block-${block.id}`}
          className="text-sm text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          &times;
        </button>
      </div>
      <textarea
        id={fieldId}
        data-testid={`prose-text-${block.id}`}
        value={block.text}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        className="w-full rounded-md border border-input bg-input/30 px-3 py-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  );
}
