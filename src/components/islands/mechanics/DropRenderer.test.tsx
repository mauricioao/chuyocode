// @vitest-environment jsdom
/**
 * DropRenderer tests — the wiring, not the rules.
 *
 * The RULES (what a drop means, which tiles remain, what an occupied box does)
 * are proved in `exerciseDrop.test.ts` against pure functions, because they must
 * hold regardless of how the gesture arrived. What is left for this file is the
 * part that only exists once React and dnd-kit are involved:
 *
 *   - the pool the learner is actually SHOWN is the derived one,
 *   - the keyboard can complete a placement end to end,
 *   - a placed tile can be given back,
 *   - the gesture is narrated to a screen reader.
 *
 * WHAT THESE TESTS CANNOT PROVE, and no jsdom test could: drag physics, whether
 * a drop target's hit area is reachable with a real pointer, touch behaviour,
 * and anything positional. jsdom has no layout engine — every
 * `getBoundingClientRect` is a zero rect — so dnd-kit's collision detection
 * resolves to the single droppable in the tree by degenerate arithmetic, not by
 * geometry. That is exactly why the box count here is one, and why the meaning
 * of a drop was pushed into a pure module in the first place.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PoolItem, Slot } from '@/lib/exercisePayload';
import DropRenderer, { DROP_COPY } from './DropRenderer';

const slot: Slot = {
  id: 'olives_img',
  label: 'olives',
  input: 'drop',
  pool: 'food',
  answer: ['i_olives'],
};

const items: PoolItem[] = [
  { id: 'i_olives', text: 'olives' },
  { id: 'i_honey', text: 'honey' },
  { id: 'i_bread', text: 'bread' },
];

/** The tiles currently offered in the pool, by accessible name. */
function poolNames(): string[] {
  const pool = screen.getByTestId(`drop-pool-${slot.id}`);
  return Array.from(pool.querySelectorAll('button')).map(
    (button) => button.getAttribute('aria-label') ?? '',
  );
}

function tile(name: string): HTMLElement {
  const pool = screen.getByTestId(`drop-pool-${slot.id}`);
  const found = Array.from(pool.querySelectorAll('button')).find(
    (button) => button.getAttribute('aria-label') === name,
  );
  if (!found) throw new Error(`no tile named ${name} in the pool`);
  return found;
}

/**
 * Drive a full keyboard placement: pick the tile up, nudge it, drop it.
 *
 * The `await act` between the two key presses is load-bearing, not ceremony.
 * `KeyboardSensor.attach` registers its document-level keydown handler inside a
 * `setTimeout`, so a press dispatched in the same tick as the pick-up would land
 * before the sensor is listening and be silently ignored.
 */
async function placeWithKeyboard(name: string) {
  fireEvent.keyDown(tile(name), { code: 'Space' });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  fireEvent.keyDown(document, { code: 'ArrowRight' });
  fireEvent.keyDown(document, { code: 'Space' });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(cleanup);

describe('DropRenderer pool', () => {
  it('offers every pool item while nothing is placed', () => {
    render(
      <DropRenderer slot={slot} items={items} value={[]} onChange={vi.fn()} lang="en" />,
    );

    expect(poolNames()).toEqual(['olives', 'honey', 'bread']);
  });

  /**
   * THE CORE RULE, seen through the UI: a placed tile LEAVES the pool.
   *
   * Not a second assertion of `availableTiles` — this proves the renderer reads
   * the derived pool rather than mapping `items` straight onto the screen, which
   * is the mistake that would let a learner place the same tile twice.
   */
  it('stops offering a tile once it sits in the box', () => {
    render(
      <DropRenderer
        slot={slot}
        items={items}
        value={['i_honey']}
        onChange={vi.fn()}
        lang="en"
      />,
    );

    expect(poolNames()).toEqual(['olives', 'bread']);
  });

  it('stops offering a tile another slot already holds', () => {
    render(
      <DropRenderer
        slot={slot}
        items={items}
        value={[]}
        onChange={vi.fn()}
        claimed={['i_bread']}
        lang="en"
      />,
    );

    expect(poolNames()).toEqual(['olives', 'honey']);
  });
});

describe('DropRenderer placement', () => {
  it('reports the dropped tile id when the keyboard completes a placement', async () => {
    const onChange = vi.fn();
    render(
      <DropRenderer slot={slot} items={items} value={[]} onChange={onChange} lang="en" />,
    );

    await placeWithKeyboard('honey');

    // The ID, never the visible text: `['honey']` would be graded against an
    // answer of `['i_honey']` and fail a correct learner silently.
    expect(onChange).toHaveBeenCalledWith(['i_honey']);
  });

  /**
   * OCCUPIED-BOX RULE, end to end: the incoming tile wins.
   *
   * The eviction is not a second call — the box simply stops naming the old
   * tile, so it is unclaimed on the next render. Asserting the single reported
   * value is asserting exactly that.
   */
  it('replaces the resident tile instead of rejecting the drop', async () => {
    const onChange = vi.fn();
    render(
      <DropRenderer
        slot={slot}
        items={items}
        value={['i_olives']}
        onChange={onChange}
        lang="en"
      />,
    );

    await placeWithKeyboard('honey');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['i_honey']);
  });

  it('gives the displaced tile back to the pool on the next render', () => {
    const { rerender } = render(
      <DropRenderer
        slot={slot}
        items={items}
        value={['i_olives']}
        onChange={vi.fn()}
        lang="en"
      />,
    );
    expect(poolNames()).not.toContain('olives');

    // The state the handler above would have produced.
    rerender(
      <DropRenderer
        slot={slot}
        items={items}
        value={['i_honey']}
        onChange={vi.fn()}
        lang="en"
      />,
    );

    expect(poolNames()).toContain('olives');
    expect(poolNames()).not.toContain('honey');
  });
});

describe('DropRenderer removal', () => {
  it('empties the box when the placed tile is activated', () => {
    const onChange = vi.fn();
    render(
      <DropRenderer
        slot={slot}
        items={items}
        value={['i_honey']}
        onChange={onChange}
        lang="en"
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: DROP_COPY.en.remove('honey') }),
    );

    // `[]`, never `['']`: an empty-string id grades WRONG rather than unanswered.
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('exposes the placed tile as a control a keyboard can reach', () => {
    render(
      <DropRenderer
        slot={slot}
        items={items}
        value={['i_honey']}
        onChange={vi.fn()}
        lang="en"
      />,
    );

    const remove = screen.getByRole('button', { name: DROP_COPY.en.remove('honey') });
    // A real button: focusable and activatable without a pointer. The removal
    // path is the one gesture dnd-kit does NOT provide for the keyboard.
    expect(remove.tagName).toBe('BUTTON');
    remove.focus();
    expect(document.activeElement).toBe(remove);
  });
});

describe('DropRenderer announcements', () => {
  /**
   * The carried tile is narrated, so a blind learner knows what they are holding
   * and where it is — the two facts a sighted learner reads off the screen.
   *
   * NOT asserting the pick-up sentence, deliberately. A live region holds only
   * its LATEST message, and dnd-kit resolves a collision on the first frame of
   * the drag, so "picked up" is superseded by "over the box" inside the same
   * flush. Asserting the superseded line would be asserting a frame no screen
   * reader is guaranteed to have spoken.
   */
  it('narrates the carried tile and its target to a screen reader', async () => {
    render(
      <DropRenderer slot={slot} items={items} value={[]} onChange={vi.fn()} lang="en" />,
    );

    fireEvent.keyDown(tile('honey'), { code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // dnd-kit renders its live region into `document.body`, outside our subtree.
    expect(document.body.textContent).toContain(DROP_COPY.en.over('honey', 'olives'));
  });

  it('cancels the move on Escape, narrating it and placing nothing', async () => {
    const onChange = vi.fn();
    render(
      <DropRenderer slot={slot} items={items} value={[]} onChange={onChange} lang="en" />,
    );

    fireEvent.keyDown(tile('honey'), { code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.keyDown(document, { code: 'Escape' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // An abandoned drag must not answer on the learner's behalf.
    expect(onChange).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DROP_COPY.en.cancelled('honey'));
  });

  it('narrates the eviction, which is otherwise visible only to sighted learners', async () => {
    render(
      <DropRenderer
        slot={slot}
        items={items}
        value={['i_olives']}
        onChange={vi.fn()}
        lang="en"
      />,
    );

    await placeWithKeyboard('honey');

    expect(document.body.textContent).toContain(DROP_COPY.en.displaced('olives'));
  });

  it('publishes keyboard instructions rather than assuming a pointer', () => {
    render(
      <DropRenderer slot={slot} items={items} value={[]} onChange={vi.fn()} lang="en" />,
    );

    expect(document.body.textContent).toContain(DROP_COPY.en.instructions);
  });

  it('narrates in Spanish when the island is Spanish', () => {
    render(
      <DropRenderer slot={slot} items={items} value={[]} onChange={vi.fn()} lang="es" />,
    );

    expect(document.body.textContent).toContain(DROP_COPY.es.instructions);
  });
});

describe('DropRenderer wiring', () => {
  it('locks every control once the exercise has been graded', () => {
    render(
      <DropRenderer
        slot={slot}
        items={items}
        value={['i_honey']}
        onChange={vi.fn()}
        disabled
        lang="en"
      />,
    );

    for (const button of Array.from(document.querySelectorAll('button'))) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('points the focus entry at the first remaining tile', () => {
    const focusRef = vi.fn();
    render(
      <DropRenderer
        slot={slot}
        items={items}
        value={[]}
        onChange={vi.fn()}
        focusRef={focusRef}
        lang="en"
      />,
    );

    const first = focusRef.mock.calls.at(-1)?.[0] as HTMLElement;
    expect(first.getAttribute('aria-label')).toBe('olives');
  });

  it('registers no focus entry when every tile is spoken for', () => {
    const focusRef = vi.fn();
    render(
      <DropRenderer
        slot={slot}
        items={items}
        value={['i_olives']}
        onChange={vi.fn()}
        claimed={['i_honey', 'i_bread']}
        focusRef={focusRef}
        lang="en"
      />,
    );

    // Falling through is the honest outcome: there is nothing to focus, and the
    // island's effect already tolerates a slot that registers no control.
    expect(focusRef.mock.calls.every(([node]) => node === null)).toBe(true);
  });
});
