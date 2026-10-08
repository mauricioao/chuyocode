/**
 * ModerationBlockPreview — one block, read-only, as a moderator needs to
 * judge it (PR E, "Moderation"). Renders the worksheet image plainly (no
 * zone-overlay geometry: a moderator judges CONTENT, not the learner's
 * layout, and `WorksheetPlayer`'s own geometry math — including the
 * 90/270-rotation transpose — is not worth duplicating here) plus a plain
 * list of every zone's answers/options, and a quiz's slots with their
 * resolved correct answer. `showAnswers` toggles whether that list's answer
 * column is shown at all — off by default, matching a moderator who wants
 * to see the CONTENT first, unprimed by the key.
 */
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { Block } from '@/lib/activities/blocks';
import { zoneAnswerSummary, zoneOptionsSummary, quizSlotAnswerSummary } from '@/lib/activities/moderationPreview';
import { deriveClozeGameSentences } from '@/lib/activities/clozeSentences';
import { deriveGroupSortGroups } from '@/lib/activities/gameModes';
import { FadeImage } from '@/components/ui/fade-image';

export interface ModerationBlockPreviewProps {
  lang: Lang;
  block: Block;
  /** Resolved, browser-loadable URL for a worksheet block's `image.path`. */
  resolveImageUrl: (path: string) => string;
  showAnswers: boolean;
}

export default function ModerationBlockPreview({ lang, block, resolveImageUrl, showAnswers }: ModerationBlockPreviewProps) {
  const t = UI_LABELS[lang].activities.moderation;

  if (block.type === 'worksheet') {
    // A pending-review/live worksheet always has an image by the time it
    // reaches moderation — `enviar.ts`'s own `findIncompleteBlock` gate
    // (`no_image`) blocks submitting an imageless one — this guard only
    // keeps the type honest.
    return (
      <div data-testid={`moderation-block-${block.id}`} className="flex flex-col gap-3">
        {block.image && (
          <div className="rounded-md border border-border">
            <FadeImage
              data-testid="moderation-block-image"
              src={resolveImageUrl(block.image.path)}
              alt=""
              className="max-h-96 w-full object-contain"
              placeholderClassName="h-48 w-full"
            />
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {block.zones.map((zone, index) => (
            <li key={zone.id} data-testid={`moderation-zone-${zone.id}`} className="rounded-md border border-border p-2 text-sm">
              <span className="font-medium text-foreground">
                {t.zoneLabel} {index + 1} ({zone.kind})
              </span>
              {showAnswers ? (
                <div className="mt-1 text-muted-foreground">
                  <p>
                    {t.answersLabel}: {zoneAnswerSummary(zone) || t.noAnswersYet}
                  </p>
                  {zone.kind === 'choice' && (
                    <p>
                      {t.optionsLabel}: {zoneOptionsSummary(zone) || t.noAnswersYet}
                    </p>
                  )}
                  {zone.explanation && (
                    <p>
                      {t.explanationLabel}: {zone.explanation}
                    </p>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // "Une las parejas" (build item 5, "Match in moderation"): a match block
  // is a list of PAIRS, so each row reads as one — "prompt → answer" — the
  // same `showAnswers` toggle still decides whether the answer half shows
  // at all, exactly as it does for every other block kind on this page.
  if (block.template === 'match') {
    return (
      <div data-testid={`moderation-block-${block.id}`} className="flex flex-col gap-2">
        <ul className="flex flex-col gap-2">
          {block.payload.slots.map((slot) => (
            <li key={slot.id} data-testid={`moderation-pair-${slot.id}`} className="rounded-md border border-border p-2 text-sm">
              <span className="font-medium text-foreground">{slot.label}</span>
              {showAnswers && (
                <span className="text-muted-foreground"> → {quizSlotAnswerSummary(block.payload, slot)}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // "Reordenar" (Wordwall templates build, "Reorder in moderation"): a
  // reorder block is a plain list of SENTENCES — unlike `match`/Básico there
  // is nothing to reveal behind `showAnswers` (the stored sentence already
  // IS the content, not a hidden answer), so this always shows it plainly.
  if (block.template === 'reorder') {
    return (
      <div data-testid={`moderation-block-${block.id}`} className="flex flex-col gap-2">
        <ul className="flex flex-col gap-2">
          {block.payload.slots.map((slot) => (
            <li key={slot.id} data-testid={`moderation-sentence-${slot.id}`} className="rounded-md border border-border p-2 text-sm">
              <span className="text-foreground">{quizSlotAnswerSummary(block.payload, slot) || slot.label}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // "Completar la frase": each sentence printed plainly, its own blank
  // words highlighted inline (the sentence's own authored content, same
  // "nothing to reveal behind `showAnswers`" reasoning `reorder` uses
  // above), plus the block's own distractors listed once underneath.
  if (block.template === 'cloze') {
    const poolName = block.payload.slots.find((s) => s.input === 'drop')?.pool;
    const pool = poolName ? (block.payload.pools[poolName] ?? []) : [];
    const claimedIds = new Set(block.payload.slots.flatMap((s) => s.answer));
    const distractors = pool.filter((item) => !claimedIds.has(item.id));

    return (
      <div data-testid={`moderation-block-${block.id}`} className="flex flex-col gap-2">
        <ul className="flex flex-col gap-2">
          {deriveClozeGameSentences(block.payload).map((sentence) => (
            <li
              key={sentence.seq}
              data-testid={`moderation-cloze-${sentence.seq}`}
              className="rounded-md border border-border p-2 text-sm"
            >
              <span className="text-foreground">
                {sentence.segments.map((seg, i) =>
                  seg.kind === 'text' ? (
                    <span key={i}>{seg.text}</span>
                  ) : (
                    <strong key={seg.slotId ?? i} className="text-accent-ink">
                      {seg.text}
                    </strong>
                  ),
                )}
              </span>
            </li>
          ))}
        </ul>
        {distractors.length > 0 && (
          <p data-testid={`moderation-cloze-distractors-${block.id}`} className="text-sm text-muted-foreground">
            {t.clozeDistractorsLabel}: {distractors.map((item) => item.text ?? item.id).join(', ')}
          </p>
        )}
      </div>
    );
  }

  // "Ordenar por grupos": each group printed plainly — its own name and its
  // items (the authored content itself, not a hidden answer) — same "nothing
  // to reveal behind `showAnswers`" reasoning `reorder`/`cloze` use above.
  if (block.template === 'groupsort') {
    return (
      <div data-testid={`moderation-block-${block.id}`} className="flex flex-col gap-2">
        <ul className="flex flex-col gap-2">
          {deriveGroupSortGroups(block.payload).map((group) => (
            <li
              key={group.id}
              data-testid={`moderation-group-${group.id}`}
              className="rounded-md border border-border p-2 text-sm"
            >
              <span className="font-medium text-foreground">{group.label}</span>
              <span className="text-muted-foreground">
                {' '}
                → {quizSlotAnswerSummary(block.payload, block.payload.slots.find((s) => s.id === group.id)!)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div data-testid={`moderation-block-${block.id}`} className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {block.payload.slots.map((slot) => (
          <li key={slot.id} data-testid={`moderation-slot-${slot.id}`} className="rounded-md border border-border p-2 text-sm">
            <span className="font-medium text-foreground">{slot.label}</span>
            {showAnswers && (
              <div className="mt-1 text-muted-foreground">
                <p>
                  {t.quizAnswerLabel}: {quizSlotAnswerSummary(block.payload, slot)}
                </p>
                {slot.explanation && (
                  <p>
                    {t.explanationLabel}: {slot.explanation}
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
