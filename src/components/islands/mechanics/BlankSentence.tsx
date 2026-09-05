/**
 * The authored sentence with its control spliced in where the blank was.
 *
 * Shared by every mechanic whose label carries a `___` marker, so the flow and
 * wrapping rules are defined ONCE. Duplicating this class string per renderer is
 * how two blanks on the same page end up sitting on different baselines.
 *
 * A `<p>`, not a `<label>`. The control lives INSIDE the sentence, and a label
 * that wraps its own control makes that control part of its own accessible name
 * — so the name is carried on the control itself (`aria-label`) and this element
 * stays a plain paragraph with no ARIA role of its own.
 *
 * `before` and `after` are rendered as expression children, never as JSX
 * literals: JSX strips literal leading/trailing whitespace, and the single space
 * on each side of the gap is exactly what keeps "The cat" from touching the box.
 */
import type { ReactNode } from 'react';

export interface BlankSentenceProps {
  /** Slot id — scopes the test hook, since one page may carry several blanks. */
  slotId: string;
  /** Authored text before the gap. Empty when the sentence opens with it. */
  before: string;
  /** Authored text after the gap. Empty when the sentence ends with it. */
  after: string;
  /** The control that answers this slot. */
  children: ReactNode;
}

export default function BlankSentence({
  slotId,
  before,
  after,
  children,
}: BlankSentenceProps) {
  return (
    <p
      data-testid={`slot-sentence-${slotId}`}
      // `leading-loose` is load-bearing, not decoration: an inline control is
      // taller than the text around it, so on a narrow screen — where the
      // sentence WILL wrap — default line height lets the next line collide with
      // the box. Wrapping itself is free, because the parts are plain text nodes
      // and the control is a single unbreakable inline-block.
      className="text-base leading-loose font-medium text-zinc-100"
    >
      {before}
      {children}
      {after}
    </p>
  );
}
