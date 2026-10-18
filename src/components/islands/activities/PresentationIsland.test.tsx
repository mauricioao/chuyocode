// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import type { Block } from '@/lib/activities/blocks';
import PresentationIsland from './PresentationIsland';
import { TimerIcon } from '@phosphor-icons/react/dist/ssr/Timer';
import { CheckIcon } from '@phosphor-icons/react/dist/ssr/Check';

// `sonner`'s named ESM export is non-configurable, so `vi.spyOn` on the
// module namespace itself throws "Cannot redefine property" — same issue
// `ShareDialog.test.tsx`'s own header documents. Replace the export with a
// `vi.fn` wrapping the real implementation (still calls through) instead.
vi.mock('sonner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sonner')>();
  const mockToast = vi.fn(actual.toast) as unknown as typeof actual.toast;
  Object.assign(mockToast, actual.toast);
  return { ...actual, toast: mockToast };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // The sound toggle persists its mute flag to `localStorage`
  // (`gameSounds.ts`'s own `GAME_SOUND_MUTE_KEY`) — clear it so one test's
  // toggle click never leaks into the next test's "sound starts unmuted"
  // assumption.
  localStorage.clear();
});

// P1 live-quiz rhythm: s1 is MULTIPLE-CHOICE (input "choice", pool order
// a=Cat (correct) then b=Dog) — tile 1 is always "a", tile 2 is always "b"
// (`getSlotItems` returns the pool array verbatim, `exercisePayload.ts`).
// s2 stays a typed-answer question, so the file still covers BOTH the new
// tile mechanic and the unchanged reveal-then-advance path in the same deck.
const QUIZ_BLOCKS: Block[] = [
  {
    id: 'q1',
    type: 'quiz',
    payload: {
      pools: { opts1: [{ id: 'a', text: 'Cat' }, { id: 'b', text: 'Dog' }] },
      slots: [
        {
          id: 's1',
          label: 'Which animal says meow?',
          input: 'choice',
          pool: 'opts1',
          answer: ['a'],
          explanation: 'Cats say meow, dogs say woof.',
        },
      ],
    },
  },
  {
    id: 'q2',
    type: 'quiz',
    payload: {
      pools: {},
      slots: [{ id: 's2', label: 'What is the capital of France?', input: 'text', answer: ['Paris'] }],
    },
  },
];

/** Two zones, already authored top-to-bottom so reading order matches authored order (ordering itself is covered by `presentationSlides.test.ts`). */
const WORKSHEET_BLOCK: Block = {
  id: 'w1',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-images/abc/img-1.webp', width: 1000, height: 1000 },
  zones: [
    { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.2, kind: 'text', answers: ['Paris'], explanation: 'It is the capital of France.' },
    { id: 'z2', x: 0.6, y: 0.6, w: 0.2, h: 0.2, kind: 'text', answers: ['London'] },
  ],
};

const BASE_PROPS = {
  lang: 'es' as const,
  title: 'Animales y capitales',
  level: 'A2' as const,
  practiceUrl: '/es/ingles/actividades/abc',
  qrSvg: '<svg data-testid="fake-qr"></svg>',
  blocks: QUIZ_BLOCKS,
};

function next() {
  fireEvent.click(screen.getByTestId('presentation-next'));
}

function prev() {
  fireEvent.click(screen.getByTestId('presentation-prev'));
}

/** `presentation-tile-<n>`, 1-based — same number the "1-9" keyboard map and the tile's own `.key` badge use. */
function tile(n: number): HTMLElement {
  return screen.getByTestId(`presentation-tile-${n}`);
}

function tapTile(n: number) {
  fireEvent.click(tile(n));
}

/** No `@testing-library/jest-dom` matchers configured in this repo (no global
 * setup file) — read attributes off the DOM node directly, same convention
 * `UserMenu.test.tsx`/`ScrollToTop.test.tsx` use. */
function attr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

/** `window.location.assign` throws "not implemented" in jsdom unless stubbed — same helper `PasswordAuthForm.test.tsx` uses. */
function stubLocationAssign() {
  const assign = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign },
  });
  return assign;
}

describe('PresentationIsland — opens directly on the first content slide (owner feedback 2026-10-06)', () => {
  it('mounts straight on the first question, never the cover', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
    expect(screen.queryByTestId('presentation-slide-cover')).toBeNull();
  });

  it('mounts on the worksheet overview for a worksheet-only deck', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK]} />);
    expect(screen.getByTestId('presentation-worksheet-viewport')).toBeTruthy();
    expect(screen.queryByTestId('presentation-slide-cover')).toBeNull();
  });

  it('the cover is still reachable via "previous" from the first content slide', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    prev();
    expect(screen.getByTestId('presentation-slide-cover')).toBeTruthy();
  });
});

describe('PresentationIsland — cover slide (title/level/count "title card")', () => {
  it('shows the title, level and question count — no QR on this slide anymore (it moved to the on-demand overlay)', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    prev();
    const cover = screen.getByTestId('presentation-slide-cover');
    expect(cover.textContent).toContain('Animales y capitales');
    expect(cover.textContent).toContain('A2');
    expect(cover.textContent).toContain('2 preguntas');
    expect(screen.queryByTestId('presentation-cover-qr')).toBeNull();
  });

  it('shows "Sin nivel" when the activity has no level', () => {
    render(<PresentationIsland {...BASE_PROPS} level={null} />);
    prev();
    expect(screen.getByTestId('presentation-slide-cover').textContent).toContain('Sin nivel');
  });

  it('combines quiz and worksheet counts when the activity has both', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK, ...QUIZ_BLOCKS]} />);
    prev();
    const cover = screen.getByTestId('presentation-slide-cover');
    expect(cover.textContent).toContain('2 preguntas');
    expect(cover.textContent).toContain('1 hoja');
  });

  it('shows only the worksheet count for a worksheet-only activity', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK]} />);
    prev();
    const cover = screen.getByTestId('presentation-slide-cover');
    expect(cover.textContent).toContain('1 hoja');
    expect(cover.textContent).not.toContain('pregunta');
  });
});

describe('PresentationIsland — QR overlay (N7: open by default on the FIRST slide, "join by QR from the start")', () => {
  it('shows the QR + the short "scan to play" hint as soon as the deck mounts, with no click needed', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    const overlay = screen.getByTestId('presentation-qr-overlay');
    expect(overlay.textContent).toContain('Escanea para jugar en tu celular');
    expect(screen.getByTestId('presentation-qr-overlay-image')).toBeTruthy();
  });

  it('hides automatically once the presenter advances with "Siguiente"', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(screen.getByTestId('presentation-qr-overlay')).toBeTruthy();
    next();
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();
  });

  it('also hides on a keyboard "next" press (clicker/arrow/space/enter), not just the control bar button', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();
  });

  it('the "Q" key keeps working afterwards — reopens and recloses on demand (no bar button anymore, see the control-bar restructure)', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    // Closed here via the "Q" key itself (not "Siguiente" — that auto-hide
    // path is covered by the two tests above), so this stays on slide 1,
    // unanswered, to isolate "does the toggle ever answer/advance" below.
    fireEvent.keyDown(window, { key: 'q' });
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();

    fireEvent.keyDown(window, { key: 'Q' });
    expect(screen.getByTestId('presentation-qr-overlay')).toBeTruthy();
    // Never a side effect on the deck itself (owner spec: "keep every other
    // presentation behaviour" — the Q key must not also answer/advance).
    expect(attr(tile(1), 'data-mark')).toBeNull();

    fireEvent.keyDown(window, { key: 'q' });
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();
  });

  it('closes via its own close button, and via Escape (without exiting the presentation)', () => {
    const assign = stubLocationAssign();
    render(<PresentationIsland {...BASE_PROPS} />);

    // Already open on mount (N7) — no click needed to open it first.
    fireEvent.click(screen.getByTestId('presentation-qr-overlay-close'));
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();

    fireEvent.keyDown(window, { key: 'q' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('never reopens on its own once closed — only the FIRST slide auto-opens it, not the summary (owner review: it must not cover the score/time)', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    next(); // closes QR, advances q1 (non-revealable, choice) -> q2
    next(); // reveals q2
    next(); // -> summary
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();
  });

  it('offers no overlay at all when there is no QR to show (the editor preview)', () => {
    render(<PresentationIsland {...BASE_PROPS} practiceUrl={undefined} qrSvg={null} onExit={vi.fn()} />);
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();
    fireEvent.keyDown(window, { key: 'q' });
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();
  });
});

// Author preview (R1, owner decision 2026-10-12): the activity is not
// published yet — the join QR would 404 for a student, so it must never
// open, by default or on demand. The "Q" shortcut stays reachable; it shows
// the owner's own message via toast instead.
describe('PresentationIsland — qrBlockedMessage (author preview, owner decision 2026-10-12)', () => {
  const BLOCKED =
    'No se puede compartir la actividad porque está en revisión, por el momento solo está disponible para ti 😘';

  it('does not open the overlay on mount', () => {
    render(<PresentationIsland {...BASE_PROPS} qrSvg={null} qrBlockedMessage={BLOCKED} />);
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();
  });

  it('shows the message via toast on the "Q" key, never opening the overlay', () => {
    vi.mocked(toast).mockClear();
    render(<PresentationIsland {...BASE_PROPS} qrSvg={null} qrBlockedMessage={BLOCKED} />);
    fireEvent.keyDown(window, { key: 'q' });
    expect(toast).toHaveBeenCalledWith(BLOCKED);
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();
  });
});

describe('PresentationIsland — multiple-choice tiles (P1, live-quiz rhythm)', () => {
  it('mounts idle: 2 tiles, numbered 1 and 2, no mark, not locked', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    const tiles = screen.getByTestId('presentation-tiles');
    expect(attr(tiles, 'data-count')).toBe('2');
    expect(attr(tiles, 'data-answered')).toBeNull();
    expect(attr(tile(1), 'data-index')).toBe('1');
    expect(attr(tile(1), 'data-mark')).toBeNull();
    expect((tile(1) as HTMLButtonElement).disabled).toBe(false);
    expect(tile(1).textContent).toContain('Cat');
    expect(tile(2).textContent).toContain('Dog');
  });

  // UI kit pass (`propuestas/presentacion/index.html`): each tile carries its
  // own PALETTE fill class by POSITION (`mechanics/palette.ts`'s
  // `optionColorClass` — tile 1 is always `bg-tile-1`, regardless of which
  // pool item ended up there) and a numbered key badge, never a per-
  // correctness colour.
  it('each tile carries its own position-indexed palette class and numbered key badge', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(tile(1).className).toContain('bg-tile-1');
    expect(tile(2).className).toContain('bg-tile-2');
    expect(tile(1).textContent).toContain('1');
    expect(tile(2).textContent).toContain('2');
  });

  // Without a context image, the content row's own `presentation-tiles`
  // grid runs full width; with one, it switches to a narrower column next
  // to the media box — both read off the SAME `data-count` the mockup keys
  // its `.tiles.nN` rule off.
  it('the tiles grid switches column layout with the question count (no media here: s1 has 2 options)', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    const tiles = screen.getByTestId('presentation-tiles');
    expect(attr(tiles, 'data-count')).toBe('2');
    expect(tiles.className).toContain('grid-cols-2');
  });

  it('tapping the CORRECT tile marks it "correct", plays the cue, counts the score, and locks every tile', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    tapTile(1); // "a" = Cat = correct
    expect(attr(tile(1), 'data-mark')).toBe('correct');
    const mark = screen.getByTestId('presentation-tile-mark');
    expect(mark).toBeTruthy();
    // UI kit pass: the mark is a free-floating circle pinned to the tile's
    // OWN top-right corner (mockup `.mark`), not an inline badge in the flow.
    expect(mark.className).toContain('absolute');
    expect(mark.className).toContain('right-[17px]');
    expect(mark.className).toContain('top-[17px]');
    expect(attr(tile(2), 'data-mark')).toBeNull();
    expect(attr(screen.getByTestId('presentation-tiles'), 'data-answered')).toBe('');
    expect((tile(1) as HTMLButtonElement).disabled).toBe(true);
    expect((tile(2) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('presentation-score').textContent).toContain('1');
    // The unmarked tile steps back (mockup: "opacity .32, saturate .6");
    // the marked one stays fully readable.
    expect(tile(2).className).toContain('opacity-[0.32]');
    expect(tile(1).className).not.toContain('opacity-[0.32]');
  });

  it('tapping a WRONG tile marks IT "wrong" and reveals the correct one as "reveal" — never increments the score', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    tapTile(2); // "b" = Dog = wrong
    expect(attr(tile(2), 'data-mark')).toBe('wrong');
    expect(attr(tile(1), 'data-mark')).toBe('reveal');
    expect(screen.getByTestId('presentation-score').textContent).toContain('0');
  });

  it('one answer per question — a second tap on a different tile, after the first, changes nothing', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    tapTile(2); // wrong
    tapTile(1); // too late — already locked
    expect(attr(tile(2), 'data-mark')).toBe('wrong');
    expect(attr(tile(1), 'data-mark')).toBe('reveal');
    expect(screen.getByTestId('presentation-score').textContent).toContain('0');
  });

  it('pressing the matching number key (1-9) answers the tile the same way a click would', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    fireEvent.keyDown(window, { key: '1' });
    expect(attr(tile(1), 'data-mark')).toBe('correct');
  });

  it('auto-advances to the next slide ~1.2s after the mark appears', () => {
    vi.useFakeTimers();
    render(<PresentationIsland {...BASE_PROPS} />);
    tapTile(1);
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByTestId('presentation-question-s2')).toBeTruthy();
  });

  it('does not auto-advance before the delay elapses', () => {
    vi.useFakeTimers();
    render(<PresentationIsland {...BASE_PROPS} />);
    tapTile(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
  });

  it('auto-advances instantly (no delay) under prefers-reduced-motion — the owner spec only drops the animation, never the advance itself', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.useFakeTimers();
    render(<PresentationIsland {...BASE_PROPS} />);
    tapTile(1);
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByTestId('presentation-question-s2')).toBeTruthy();
  });

  it('a bare "next" press on an UNANSWERED choice question advances straight away — no reveal step for multiple choice', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    next();
    expect(screen.getByTestId('presentation-question-s2')).toBeTruthy();
  });

  it('the content row carries no `data-has-media` when the question has no promptImage', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(attr(screen.getByTestId('presentation-content-row'), 'data-has-media')).toBeNull();
    expect(screen.queryByTestId('presentation-question-media')).toBeNull();
  });

  it("renders the question's own context image (owner decision 2026-10-16) in the presentation-question-media slot, decorative (alt=\"\"), never through the worksheet layer", () => {
    const blocksWithPromptImage: Block[] = [
      {
        ...(QUIZ_BLOCKS[0] as Extract<Block, { type: 'quiz' }>),
        promptImages: { s1: { path: 'activity-images/abc/question-img-1.webp', width: 400, height: 300 } },
      },
      QUIZ_BLOCKS[1]!,
    ];
    render(<PresentationIsland {...BASE_PROPS} blocks={blocksWithPromptImage} />);
    const row = screen.getByTestId('presentation-content-row');
    expect(attr(row, 'data-has-media')).toBe('');
    // UI kit pass (mockup `.content.with-image`): the media column runs
    // narrower than the tiles column, both scaled by the SAME 0.82fr/1.18fr
    // split, and the media box itself picks up the kit's own 26px radius.
    expect(row.className).toContain('sm:grid-cols-[0.82fr_1.18fr]');
    const mediaBox = screen.getByTestId('presentation-question-media');
    expect(mediaBox.className).toContain('rounded-[26px]');
    const img = mediaBox.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('/api/actividades/imagen?path=activity-images%2Fabc%2Fquestion-img-1.webp');
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('a non-choice question never shows a promptImage even if one is set (the media slot only exists on the choice content row)', () => {
    const blocksWithPromptImage: Block[] = [
      QUIZ_BLOCKS[0]!,
      {
        ...(QUIZ_BLOCKS[1] as Extract<Block, { type: 'quiz' }>),
        promptImages: { s2: { path: 'activity-images/abc/question-img-2.webp', width: 400, height: 300 } },
      },
    ];
    render(<PresentationIsland {...BASE_PROPS} blocks={blocksWithPromptImage} />);
    next();
    expect(screen.getByTestId('presentation-question-s2')).toBeTruthy();
    expect(screen.queryByTestId('presentation-question-media')).toBeNull();
  });
});

// UI kit pass (mockup `.prompt .blank`): a slot's own gap renders as a drawn
// underline, never the raw `_____` the authored `label` carries — same
// one-blank parser (`splitLabelAtBlank`, `exercisePayload.ts`) the authoring
// editor and the practice-mode renderer already use.
describe('PresentationIsland — the prompt\'s own blank (gap-fill questions)', () => {
  const GAP_BLOCKS: Block[] = [
    {
      id: 'q1',
      type: 'quiz',
      payload: {
        pools: { opts1: [{ id: 'a', text: 'go' }, { id: 'b', text: 'goes' }] },
        slots: [{ id: 's1', label: 'She _____ to school every day.', input: 'choice', pool: 'opts1', answer: ['b'] }],
      },
    },
  ];

  it('draws the blank as an underline, never the literal underscores', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={GAP_BLOCKS} />);
    const prompt = screen.getByTestId('presentation-question-prompt');
    expect(prompt.textContent).toBe('She  to school every day.');
    expect(prompt.querySelector('span[aria-hidden="true"]')).toBeTruthy();
  });

  it('a label with no blank renders unchanged, plain text', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(screen.getByTestId('presentation-question-prompt').textContent).toBe('Which animal says meow?');
  });
});

describe('PresentationIsland — the top bar (timer + score)', () => {
  it('starts at 0:00 and ✓0, ticks once a second, pauses while the menu is open, and resumes once closed', () => {
    vi.useFakeTimers();
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(screen.getByTestId('presentation-timer').textContent).toContain('0:00');
    expect(screen.getByTestId('presentation-score').textContent).toContain('0');

    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('presentation-timer').textContent).toContain('0:03');

    fireEvent.click(screen.getByTestId('presentation-menu'));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId('presentation-timer').textContent).toContain('0:03');

    fireEvent.click(screen.getByTestId('presentation-menu-close'));
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByTestId('presentation-timer').textContent).toContain('0:05');
  });

  it('shows the score and time again on the final slide', () => {
    vi.useFakeTimers();
    render(<PresentationIsland {...BASE_PROPS} />);
    tapTile(1); // correct, +1
    act(() => vi.advanceTimersByTime(1200)); // auto-advance to q2
    next(); // reveal q2
    next(); // -> summary
    const stats = screen.getByTestId('presentation-summary-stats');
    expect(stats.textContent).toContain('1');
  });

  // UI mockup `.timer`/`.score`: a stopwatch glyph and a plain stroked
  // check (not a clock face, not a filled check-circle), and a 32px counter
  // (`3 * var(--u)` on the 1080 stage).
  it('draws the mockup glyphs — stopwatch on the timer, plain bold check on the score — and a 32px counter', () => {
    const { container: glyphs } = render(
      <>
        <TimerIcon data-glyph="timer" weight="bold" size={28} />
        <CheckIcon data-glyph="check" weight="bold" size={28} />
      </>,
    );
    const timerPaths = glyphs.querySelector('[data-glyph="timer"]')!.innerHTML;
    const checkPaths = glyphs.querySelector('[data-glyph="check"]')!.innerHTML;
    cleanup();
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(screen.getByTestId('presentation-timer').querySelector('svg')!.innerHTML).toBe(timerPaths);
    expect(screen.getByTestId('presentation-score').querySelector('svg')!.innerHTML).toBe(checkPaths);
    expect(screen.getByTestId('presentation-count').style.fontSize).toBe('32px');
  });

  it('the counter reads "N de M" (es) / "N of M" (en), not a bare "/" — owner reference', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(screen.getByTestId('presentation-count').textContent).toBe('1 de 2');
  });
});

describe('PresentationIsland — the score is hidden when the deck has no multiple-choice question (owner review: "✓ 0" forever is noise)', () => {
  it('omits the top-bar score pill for a reorder-only deck (no multiple-choice question)', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={REORDER_BLOCKS} />);
    expect(screen.getByTestId('presentation-timer')).toBeTruthy();
    expect(screen.queryByTestId('presentation-score')).toBeNull();
  });

  it('drops the score from the final slide\'s stats line, keeping only the time', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={REORDER_BLOCKS} />);
    next(); // reveals the one reorder slide
    next(); // -> summary
    expect(screen.queryByTestId('presentation-score')).toBeNull();
    const stats = screen.getByTestId('presentation-summary-stats');
    expect(stats.textContent).not.toContain('Aciertos');
    expect(stats.textContent).toContain('Tiempo');
  });

  it('still shows the score when at least one multiple-choice question is in the deck', () => {
    render(<PresentationIsland {...BASE_PROPS} />); // QUIZ_BLOCKS has a choice question (s1)
    expect(screen.getByTestId('presentation-score')).toBeTruthy();
  });
});

describe('PresentationIsland — the question-list menu', () => {
  it('opens the menu, lists every content slide, marks an already-answered question, and jumps on click', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    tapTile(1); // q1 answered correctly
    fireEvent.click(screen.getByTestId('presentation-menu'));
    const panel = screen.getByTestId('presentation-menu-panel');
    expect(panel).toBeTruthy();
    expect(attr(screen.getByTestId('presentation-menu-item-1'), 'data-state')).toBe('correct');
    expect(attr(screen.getByTestId('presentation-menu-item-2'), 'data-state')).toBe('unanswered');

    fireEvent.click(screen.getByTestId('presentation-menu-item-2'));
    expect(screen.queryByTestId('presentation-menu-panel')).toBeNull();
    expect(screen.getByTestId('presentation-question-s2')).toBeTruthy();
  });

  it('each question number fills its own grid cell (a full-width pill, not a 1-character chip pinned left)', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByTestId('presentation-menu'));
    expect(screen.getByTestId('presentation-menu-item-1').className).toContain('w-full');
  });

  it('closes on its own close button', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByTestId('presentation-menu'));
    fireEvent.click(screen.getByTestId('presentation-menu-close'));
    expect(screen.queryByTestId('presentation-menu-panel')).toBeNull();
  });

  it('Escape closes the menu first, without exiting the presentation', () => {
    const assign = stubLocationAssign();
    render(<PresentationIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByTestId('presentation-menu'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('presentation-menu-panel')).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('swallows navigation/answer keys while open', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByTestId('presentation-menu'));
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('presentation-menu-panel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('presentation-menu-close'));
    expect(attr(tile(1), 'data-mark')).toBeNull();
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
  });
});

describe('PresentationIsland — the sound toggle', () => {
  it('toggles aria-pressed on click', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    const soundButton = screen.getByTestId('presentation-sound');
    expect(attr(soundButton, 'aria-pressed')).toBe('false');
    fireEvent.click(soundButton);
    expect(attr(soundButton, 'aria-pressed')).toBe('true');
  });

  it('answering a question never throws even without a real WebAudio context (jsdom)', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(() => tapTile(1)).not.toThrow();
  });
});

describe('PresentationIsland — the full flow (quiz-only deck)', () => {
  it('walks q1 (choice, tap to answer+auto-advance) -> q2 (unrevealed) -> q2 (revealed) -> summary -> restart', () => {
    vi.useFakeTimers();
    render(<PresentationIsland {...BASE_PROPS} />);

    // Mounts straight on question 1, nothing answered yet (owner feedback 2026-10-06 — no cover step first).
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
    expect(attr(tile(1), 'data-mark')).toBeNull();

    // Tapping the correct tile marks it and auto-advances.
    tapTile(1);
    expect(attr(tile(1), 'data-mark')).toBe('correct');
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByTestId('presentation-question-s2')).toBeTruthy();
    expect(screen.queryByTestId('presentation-answer-reveal')).toBeNull();

    // next reveals q2's typed answer.
    next();
    expect(screen.getByTestId('presentation-answer-reveal').textContent).toContain('Paris');

    // next advances to the summary.
    next();
    const summary = screen.getByTestId('presentation-slide-summary');
    expect(summary.textContent).toContain('¡Listo!');
    expect(summary.textContent).toContain('2 preguntas');
    // Emoji sticker accent (visual-identity decision, 2026-10-04).
    const emojiImg = screen.getByTestId('presentation-summary-emoji').querySelector('img') as HTMLImageElement;
    expect(emojiImg.getAttribute('src')).toContain('trophy');

    // Restart returns to the FIRST CONTENT slide, unanswered, score/timer reset.
    fireEvent.click(screen.getByTestId('presentation-restart'));
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
    expect(attr(tile(1), 'data-mark')).toBeNull();
    expect(screen.getByTestId('presentation-score').textContent).toContain('0');
    expect(screen.getByTestId('presentation-timer').textContent).toContain('0:00');
  });

  it('previous steps back to q1, still showing its earlier mark gone (fresh slide instance) — q1 was never answered here', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    next(); // -> q2 (q1 never answered, so it just advances)
    prev();
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
    expect(attr(tile(1), 'data-mark')).toBeNull();
  });
});

describe('PresentationIsland — "Otra actividad" at the end (N7, next step)', () => {
  function walkToSummary() {
    vi.useFakeTimers();
    tapTile(1); // q1 answered, auto-advances
    act(() => vi.advanceTimersByTime(1200));
    next(); // reveal q2
    next(); // -> summary
  }

  it('offers "Otra actividad" as the primary action, and "Volver a empezar" as secondary, when given a nextActivityHref', () => {
    render(<PresentationIsland {...BASE_PROPS} nextActivityHref="/es/ingles/actividades?nivel=A2" />);
    walkToSummary();

    const nextActivity = screen.getByTestId('presentation-next-activity');
    expect(attr(nextActivity, 'href')).toBe('/es/ingles/actividades?nivel=A2');
    expect(nextActivity.textContent).toBe('Otra actividad');
    expect(nextActivity.className).toContain('bg-primary');

    const restart = screen.getByTestId('presentation-restart');
    expect(restart.textContent).toBe('Volver a empezar');
    // Secondary styling (owner review, same as `GameResult.tsx`): ink text, never a filled `bg-primary` pill.
    expect(restart.className).toContain('text-accent-ink');
    expect(restart.className).not.toContain('bg-primary');
  });

  it('"Otra actividad" points at the unfiltered catalog for an activity with no level', () => {
    render(<PresentationIsland {...BASE_PROPS} nextActivityHref="/es/ingles/actividades" />);
    walkToSummary();
    expect(attr(screen.getByTestId('presentation-next-activity'), 'href')).toBe('/es/ingles/actividades');
  });

  it('"Volver a empezar" still restarts the deck when "Otra actividad" is also offered', () => {
    render(<PresentationIsland {...BASE_PROPS} nextActivityHref="/es/ingles/actividades?nivel=A2" />);
    walkToSummary();
    fireEvent.click(screen.getByTestId('presentation-restart'));
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
  });

  it('falls back to the single "Volver a empezar" primary button when no nextActivityHref is given (the editor preview)', () => {
    render(<PresentationIsland {...BASE_PROPS} practiceUrl={undefined} qrSvg={null} onExit={vi.fn()} />);
    walkToSummary();
    expect(screen.queryByTestId('presentation-next-activity')).toBeNull();
    const restart = screen.getByTestId('presentation-restart');
    expect(restart.textContent).toBe('Volver a empezar');
    expect(restart.className).toContain('bg-primary');
  });
});

describe('PresentationIsland — the worksheet zoom tour (worksheet-only deck)', () => {
  it('walks overview (zones numbered) -> zone 1 blank -> reveal shows the answer and explanation -> zone 2 blank -> reveal -> summary', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK]} />);

    // Mounts straight on the overview, both zones numbered, nothing to reveal (no cover step first).
    expect(screen.getByTestId('presentation-worksheet-viewport')).toBeTruthy();
    expect(screen.getByTestId('presentation-overview-zone-z1')).toBeTruthy();
    expect(screen.getByTestId('presentation-overview-zone-z2')).toBeTruthy();
    expect(screen.getByLabelText('Zona 1')).toBeTruthy();
    expect(screen.getByLabelText('Zona 2')).toBeTruthy();

    // A single "next" advances straight past the overview (never revealable).
    next();
    expect(screen.getByTestId('presentation-zone-blank-z1')).toBeTruthy();
    expect(screen.queryByTestId('presentation-zone-answer-z1')).toBeNull();

    // next reveals zone 1's answer + explanation instead of advancing.
    next();
    expect(screen.getByTestId('presentation-zone-answer-z1').textContent).toBe('Paris');
    expect(screen.getByTestId('presentation-zone-explanation-z1').textContent).toContain(
      'It is the capital of France.',
    );

    // next NOW advances to zone 2, blank again.
    next();
    expect(screen.getByTestId('presentation-zone-blank-z2')).toBeTruthy();
    expect(screen.queryByTestId('presentation-zone-answer-z2')).toBeNull();

    // zone 2 has no explanation — reveal shows only the answer.
    next();
    expect(screen.getByTestId('presentation-zone-answer-z2').textContent).toBe('London');
    expect(screen.queryByTestId('presentation-zone-explanation-z2')).toBeNull();

    // next advances to the summary.
    next();
    expect(screen.getByTestId('presentation-slide-summary')).toBeTruthy();
  });
});

describe('PresentationIsland — audio markers ("colocar un audio propio")', () => {
  beforeEach(() => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  it('renders a play button on the overview slide for each audio marker', () => {
    const withAudio: Block = {
      ...WORKSHEET_BLOCK,
      audio: [{ id: 'a1', x: 0.5, y: 0.5, path: 'activity-audio/abc/a1.webm' }],
    };
    render(<PresentationIsland {...BASE_PROPS} blocks={[withAudio]} />);
    expect(screen.getByTestId('presentation-overview-audio-a1')).toBeTruthy();
  });

  it('never shows an audio marker once past the overview (zoomed into a zone)', () => {
    const withAudio: Block = {
      ...WORKSHEET_BLOCK,
      audio: [{ id: 'a1', x: 0.5, y: 0.5, path: 'activity-audio/abc/a1.webm' }],
    };
    render(<PresentationIsland {...BASE_PROPS} blocks={[withAudio]} />);
    next();
    expect(screen.queryByTestId('presentation-overview-audio-a1')).toBeNull();
  });

  it('clicking the marker plays it', async () => {
    const withAudio: Block = {
      ...WORKSHEET_BLOCK,
      audio: [{ id: 'a1', x: 0.5, y: 0.5, path: 'activity-audio/abc/a1.webm' }],
    };
    render(<PresentationIsland {...BASE_PROPS} blocks={[withAudio]} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('presentation-overview-audio-a1'));
    });
    expect(screen.getByTestId('presentation-overview-audio-a1').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('PresentationIsland — interleaved worksheet + quiz order', () => {
  it('visits every slide in exactly the authored block order', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK, ...QUIZ_BLOCKS]} />);

    const countLabel = () => attr(screen.getByTestId('presentation-count'), 'aria-label');

    // Mounts straight on the overview (slide 1/5), no cover step first.
    expect(screen.getByTestId('presentation-worksheet-viewport')).toBeTruthy();
    expect(countLabel()).toBe('Diapositiva 1 de 5');

    next(); // -> zone 1 blank (slide 2/5)
    expect(screen.getByTestId('presentation-zone-blank-z1')).toBeTruthy();
    next(); // reveal zone 1
    expect(screen.getByTestId('presentation-zone-answer-z1')).toBeTruthy();

    next(); // -> zone 2 blank (slide 3/5)
    expect(screen.getByTestId('presentation-zone-blank-z2')).toBeTruthy();
    next(); // reveal zone 2

    next(); // -> q1 (slide 4/5), a multiple-choice question — unanswered
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
    expect(countLabel()).toBe('Diapositiva 4 de 5');
    next(); // choice question is non-revealable: "next" advances straight away

    expect(screen.getByTestId('presentation-question-s2')).toBeTruthy();
    expect(countLabel()).toBe('Diapositiva 5 de 5');
    next(); // reveal q2

    next(); // -> summary
    expect(screen.getByTestId('presentation-slide-summary')).toBeTruthy();
  });
});

describe('PresentationIsland — worksheet camera transitions and prefers-reduced-motion', () => {
  it('animates the worksheet camera over ~400ms by default', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK]} />);
    const camera = screen.getByTestId('presentation-worksheet-camera');
    expect(camera.style.transitionDuration).toBe('400ms');
  });

  it('is instant once mounted under prefers-reduced-motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK]} />);
    const camera = screen.getByTestId('presentation-worksheet-camera');
    expect(camera.style.transitionDuration).toBe('0ms');
  });
});

describe('PresentationIsland — keyboard map', () => {
  it.each([['ArrowRight'], [' '], ['PageDown'], ['Enter']])(
    '"%s" reveals/advances like the next button, on a non-choice slide',
    (key) => {
      render(<PresentationIsland {...BASE_PROPS} />);
      next(); // -> q2 (choice q1 is non-revealable, this just advances)
      // q2 is typed-answer: one press of any of these keys must REVEAL it,
      // same as clicking "Siguiente" would (the two-step reveal-then-advance,
      // unchanged for non-choice questions).
      fireEvent.keyDown(window, { key });
      expect(screen.getByTestId('presentation-answer-reveal')).toBeTruthy();
    },
  );

  it.each([['ArrowLeft'], ['PageUp']])('"%s" steps back like the previous button', (key) => {
    render(<PresentationIsland {...BASE_PROPS} />);
    next();
    next();
    fireEvent.keyDown(window, { key });
    expect(screen.queryByTestId('presentation-answer-reveal')).toBeNull();
  });

  it.each([['r'], ['R']])('"%s" reveals without advancing, on a non-choice slide', (key) => {
    render(<PresentationIsland {...BASE_PROPS} />);
    next(); // -> q2 (typed-answer)
    fireEvent.keyDown(window, { key });
    expect(screen.getByTestId('presentation-answer-reveal')).toBeTruthy();
    expect(screen.getByTestId('presentation-question-s2')).toBeTruthy();
  });

  it('"f" toggles fullscreen without throwing (jsdom has no real Fullscreen API)', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(() => fireEvent.keyDown(window, { key: 'f' })).not.toThrow();
  });

  it('Escape navigates to the practice page (closing the default-open QR overlay first, N7)', () => {
    const assign = stubLocationAssign();
    render(<PresentationIsland {...BASE_PROPS} />);
    // The QR overlay is open by default on mount (N7) — the FIRST Escape
    // closes it, same "undo the last thing you opened" rule any other
    // overlay already follows (unchanged by N7).
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();
    expect(assign).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(assign).toHaveBeenCalledWith('/es/ingles/actividades/abc');
  });

  it('does not double-dispatch when Enter/Space activates a focused control-bar button', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    // `.focus()` synchronously fires the control bar's `onFocus` handler
    // (`setControlsVisible`), so — same as the idle-hide describe block
    // below — it must be wrapped in `act()` itself; it is not an event
    // `fireEvent` wraps for us.
    act(() => {
      screen.getByTestId('presentation-next').focus();
    });
    fireEvent.keyDown(screen.getByTestId('presentation-next'), { key: 'Enter' });
    // The native click (fired below) is what advances — the global listener
    // must not ALSO advance on the same keydown, or two "next" dispatches
    // would overshoot straight past q2 to the summary.
    fireEvent.click(screen.getByTestId('presentation-next'));
    expect(screen.getByTestId('presentation-question-s2')).toBeTruthy();
  });
});

describe('PresentationIsland — the exit control (kept: no automatic replacement, unlike reveal/QR)', () => {
  it('is a real link to the practice page, labeled "Salir"', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    const exit = screen.getByRole('link', { name: 'Salir' });
    expect(attr(exit, 'href')).toBe('/es/ingles/actividades/abc');
  });
});

describe('PresentationIsland — the editor overlay (onExit, no real practice URL)', () => {
  it('renders the exit control as a button, not a link, and calls onExit instead of navigating', () => {
    const onExit = vi.fn();
    render(<PresentationIsland {...BASE_PROPS} practiceUrl={undefined} qrSvg={null} onExit={onExit} />);
    expect(screen.queryByRole('link', { name: 'Salir' })).toBeNull();
    const exitButton = screen.getByRole('button', { name: 'Salir' });
    fireEvent.click(exitButton);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('calls onExit on Escape instead of navigating', () => {
    const assign = stubLocationAssign();
    const onExit = vi.fn();
    render(<PresentationIsland {...BASE_PROPS} practiceUrl={undefined} qrSvg={null} onExit={onExit} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('PresentationIsland — control bar accessible names', () => {
  it('gives every control a real, labeled button or link', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(screen.getByRole('button', { name: 'Preguntas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Silenciar sonido' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pantalla completa' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Salir' })).toBeTruthy();
  });

  it('names the count readout for assistive tech, generalized to "Diapositiva" (not just quiz questions)', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    // Mounted on slide 1 already — no more "0 de 2" first.
    expect(attr(screen.getByTestId('presentation-count'), 'aria-label')).toBe('Diapositiva 1 de 2');
    prev();
    expect(attr(screen.getByTestId('presentation-count'), 'aria-label')).toBe('Diapositiva 0 de 2');
  });
});

describe('PresentationIsland — the polite live region', () => {
  it('announces the first slide at mount, the cover (still reachable), and the summary', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    const region = () => screen.getByTestId('presentation-live-region');
    // No more "Portada" announcement first — mounts straight on slide 1.
    expect(region().textContent).toBe('Diapositiva 1 de 2');
    prev();
    expect(region().textContent).toBe('Portada');
  });

  it('announces a revealed non-choice question', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    next(); // -> q2
    next(); // reveal q2
    expect(screen.getByTestId('presentation-live-region').textContent).toContain('revelada');
  });

  it('names a worksheet overview slide explicitly (it can never be "revealed")', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK]} />);
    expect(screen.getByTestId('presentation-live-region').textContent).toContain('Vista general de la hoja');
  });
});

describe('PresentationIsland — control bar idle-hide', () => {
  it('is visible on mount, hides after ~2s idle, and reappears on pointer movement', () => {
    vi.useFakeTimers();
    render(<PresentationIsland {...BASE_PROPS} />);
    const bar = screen.getByTestId('presentation-controls');
    expect(bar.className).toContain('opacity-100');

    act(() => vi.advanceTimersByTime(2000));
    expect(bar.className).toContain('opacity-0');

    fireEvent.pointerMove(screen.getByTestId('presentation-viewport'));
    expect(bar.className).toContain('opacity-100');
  });

  it('stays visible while a control inside it has keyboard focus', () => {
    vi.useFakeTimers();
    render(<PresentationIsland {...BASE_PROPS} />);
    const bar = screen.getByTestId('presentation-controls');
    act(() => {
      screen.getByTestId('presentation-next').focus();
    });
    act(() => vi.advanceTimersByTime(5000));
    expect(bar.className).toContain('opacity-100');
  });
});

const REORDER_BLOCKS: Block[] = [
  {
    id: 'q3',
    type: 'quiz',
    template: 'reorder',
    payload: {
      pools: {},
      slots: [{ id: 's1', label: 'Cats sleep', input: 'text', answer: ['Cats sleep'] }],
    },
  },
];

const GROUPSORT_BLOCKS: Block[] = [
  {
    id: 'q4',
    type: 'quiz',
    template: 'groupsort',
    payload: {
      pools: { p1: [{ id: 'dog', text: 'dog' }, { id: 'cat', text: 'cat' }, { id: 'bread', text: 'bread' }] },
      slots: [
        { id: 'g1', label: 'Animals', input: 'group', pool: 'p1', answer: ['dog', 'cat'] },
        { id: 'g2', label: 'Food', input: 'group', pool: 'p1', answer: ['bread'] },
      ],
    },
  },
];

describe('PresentationIsland — "Reordenar" (one slide per sentence)', () => {
  it('shows the scrambled words unrevealed, then the correct sentence once revealed', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={REORDER_BLOCKS} />);
    const slide = screen.getByTestId('presentation-reorder-s1');
    expect(slide.textContent).not.toContain('Cats sleep');
    expect(slide.textContent).toContain('Cats');
    expect(slide.textContent).toContain('sleep');
    expect(screen.queryByTestId('presentation-reorder-answer')).toBeNull();

    next(); // reveals, same "next reveals then advances" rule every other non-choice slide follows
    expect(screen.getByTestId('presentation-reorder-answer').textContent).toBe('Cats sleep');
  });
});

describe('PresentationIsland — "Ordenar por grupos" (one combined slide for the whole board)', () => {
  it('shows every group by name, unrevealed, then every group filled with its own items once revealed', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={GROUPSORT_BLOCKS} />);
    const slide = screen.getByTestId('presentation-groupsort-q4');
    expect(slide.textContent).toContain('Animals');
    expect(slide.textContent).toContain('Food');
    expect(slide.textContent).not.toContain('dog');
    expect(screen.queryByTestId('presentation-groupsort-item-g1-0')).toBeNull();

    next(); // reveals, same "next reveals then advances" rule every other non-choice slide follows
    expect(screen.getByTestId('presentation-groupsort-group-g1').textContent).toContain('dog');
    expect(screen.getByTestId('presentation-groupsort-group-g1').textContent).toContain('cat');
    expect(screen.getByTestId('presentation-groupsort-group-g2').textContent).toContain('bread');
  });
});

describe('PresentationIsland — SSR/hydration', () => {
  it('hydrates cleanly against its own server-rendered markup (no React #418) for a quiz-only deck', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => <PresentationIsland {...BASE_PROPS} />);
    expect(recoverableErrors).toEqual([]);
  });

  it('hydrates cleanly for a deck with a worksheet (the camera layer + reduced-motion hook included)', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => (
      <PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK, ...QUIZ_BLOCKS]} />
    ));
    expect(recoverableErrors).toEqual([]);
  });
});

describe('PresentationIsland — stage frame (UI mockup, propuestas/presentacion)', () => {
  it('marks its fixed viewport with data-presentation-viewport, the hook global.css uses to drop the page scrollbar gutter', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(attr(screen.getByTestId('presentation-viewport'), 'data-presentation-viewport')).toBe('');
  });

  it('sets the whole stage in the Inglés display face (mockup: Inter on tiles, pills and counter, not just the prompt)', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(screen.getByTestId('presentation-stage').className).toContain('font-display');
  });

  // Mockup `.stage` grid (auto / auto / 1fr / auto): the prompt sits right
  // under the top bar and the tiles take the remaining row — not a column
  // squeezed into a 1024px box in the middle of a 1920px stage.
  it('lays a multiple-choice slide out like the mockup: full stage width, bars cleared, prompt capped at 92%, tiles in the remaining row', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    const slide = screen.getByTestId('presentation-question-s1');
    expect(slide.className).not.toContain('max-w-5xl');
    expect(slide.className).toContain('w-full');
    expect(slide.style.paddingTop).toBe('84px');
    expect(slide.style.paddingBottom).toBe('93px');
    expect(screen.getByTestId('presentation-question-prompt').className).toContain('max-w-[92%]');
    expect(screen.getByTestId('presentation-content-row').className).toContain('flex-1');
  });

  it('caps the content row at the mockup media height when the question has a context image', () => {
    const blocks: Block[] = [
      {
        ...(QUIZ_BLOCKS[0] as Extract<Block, { type: 'quiz' }>),
        promptImages: { s1: { path: 'activity-images/abc/question-img-1.webp', width: 400, height: 300 } },
      },
    ];
    render(<PresentationIsland {...BASE_PROPS} blocks={blocks} />);
    expect(screen.getByTestId('presentation-content-row').style.maxHeight).toBe('562px');
  });
});
