/**
 * PromptImage — the shared rendering for a quiz question's own DISPLAY-ONLY
 * context image (owner decision 2026-10-16, `blocks.ts`'s own
 * `QuizBlock.promptImages`), factored out of `QuizBlockPractice.tsx`'s
 * default "quiz" mode so every single-card "Varios juegos" game mode
 * (Tarjetas, Cartas para hablar, Ruleta, Abre la caja, Verdadero o falso,
 * Anagrama, Ahorcado) renders it the exact same way: same `FadeImage`, same
 * modest sizing, same `alt=""` — decorative, never read on its own; the
 * slot's own prompt/statement text is what a screen reader or `SpeakButton`
 * actually reads.
 *
 * `undefined`/absent `image` renders nothing — the common case, and every
 * question authored before this field existed.
 *
 * DISPLAY-ONLY, EVERYWHERE THIS RENDERS: never interactive, never a
 * worksheet image, never routed through the worksheet camera/zoom/stage
 * layer. A mode built from PAIRS/SENTENCES/GROUPS rather than one question
 * at a time (Une las parejas, Reordenar, Completar la frase, Ordenar por
 * grupos) has no single "prompt" card to show this against and never
 * mounts this component — see `QuizBlockPractice.tsx`'s own comment next to
 * those renders.
 */
import { FadeImage } from '@/components/ui/fade-image';
import type { PromptImageRef } from '@/lib/activities/blocks';
import { imagePreviewUrl } from '@/lib/activities/paths';

export interface PromptImageProps {
  /** `undefined` = this question has no context image — renders nothing. */
  image: PromptImageRef | undefined;
  /** Override the default `data-testid` — only `QuizBlockPractice`'s own default "quiz" mode needs a per-slot id (every slot renders at once there); every single-card mode has exactly one of these mounted at a time, so the stable default suffices. */
  'data-testid'?: string;
}

export default function PromptImage({ image, 'data-testid': testId = 'prompt-image' }: PromptImageProps) {
  if (!image) return null;

  return (
    <FadeImage
      data-testid={testId}
      src={imagePreviewUrl(image.path)}
      alt=""
      className="max-h-48 w-full rounded-md object-contain"
      placeholderClassName="h-32 w-full rounded-md"
    />
  );
}
