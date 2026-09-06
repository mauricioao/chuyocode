/**
 * The contract every mechanic renderer implements.
 *
 * A mechanic is "how the learner answers" (`slot.input`), never "what the
 * learner perceives" — audio, images and video are the OTHER axis and live in
 * `payload.media` (docs/exercise-model.md, "The two axes"). Keeping the props
 * identical across mechanics is what lets the registry dispatch on `slot.input`
 * alone, with no branch per mechanic.
 */
import type { PoolItem, Slot } from '@/lib/exercisePayload';

export interface MechanicRendererProps {
  /** The slot being answered. `slot.answer` is present but never read here. */
  slot: Slot;
  /** Options resolved from the slot's pool. Empty when the learner types. */
  items: PoolItem[];
  /** Current answer, always an array — even for single-value mechanics. */
  value: string[];
  /** Report a new answer for this slot. */
  onChange: (next: string[]) => void;
  /** Locked after grading, so feedback cannot be edited out from under itself. */
  disabled?: boolean;
  /**
   * Localized "nothing chosen yet" copy, for mechanics that need an explicit
   * empty state (currently `select`).
   *
   * Passed to EVERY renderer and ignored by the ones that do not need it, which
   * is what keeps the props uniform and the registry free of per-mechanic
   * branches. Chrome copy is localized; the exercise content inside the pool is
   * English only (docs/exercise-model.md, "Authoring checklist").
   */
  placeholder?: string;
  /**
   * Pool item ids already consumed by OTHER slots of the same mechanic.
   *
   * Only `drop` needs this today: a pool is SHARED across slots, and a tile the
   * learner has already dropped into another question must not still be offered
   * here — otherwise the same answer can be used twice and the shared pool is a
   * lie. That set cannot be derived from `value`, which describes THIS slot
   * alone, so the island (the only holder of the whole response) supplies it.
   *
   * Optional and ignorable, exactly like {@link MechanicRendererProps.placeholder}:
   * a mechanic whose items are not consumed simply never reads it, which is what
   * keeps the registry's dispatch free of a branch per mechanic.
   */
  claimed?: readonly string[];
  /**
   * Active locale, for the few mechanics that own chrome copy beyond
   * {@link MechanicRendererProps.placeholder} — currently only `drop`, whose
   * screen-reader announcements are whole sentences rather than one label.
   *
   * The copy itself stays in a LOCAL map inside the renderer rather than
   * `UI_LABELS`: these are React islands and must not pull the Astro-side i18n
   * module into the client bundle (see AdModal.tsx and ExerciseIsland.tsx).
   * Unknown values fall back to English.
   */
  lang?: string;
  /**
   * Callback ref for the slot's PRIMARY focusable control — the element a
   * caller should move focus to when it wants the learner's attention on this
   * slot (e.g. the first blank they still have to fix after grading).
   *
   * A callback ref rather than a `RefObject`, deliberately: a callback ref is
   * assignable to every DOM `ref` position (`HTMLInputElement`,
   * `HTMLSelectElement`, `HTMLButtonElement`, …) because function parameters
   * are checked contravariantly, whereas a mutable `RefObject<HTMLElement>` is
   * invariant and would not type-check against any of them.
   *
   * OPTIONAL and ignorable. A mechanic with no single focusable control simply
   * does not wire it, and the caller falls through to doing nothing — which is
   * why this keeps the registry's dispatch free of a branch per mechanic, just
   * like {@link MechanicRendererProps.placeholder}.
   */
  focusRef?: (node: HTMLElement | null) => void;
}

/** A renderer is any component honouring {@link MechanicRendererProps}. */
export type MechanicRenderer = (props: MechanicRendererProps) => React.ReactNode;
