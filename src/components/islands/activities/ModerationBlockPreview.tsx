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
